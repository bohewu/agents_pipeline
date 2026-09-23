const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");

const {
  DEFAULT_POLICY_PATH,
  EXIT_CODES,
  loadPolicy,
  resolveCapabilityRecovery,
  runCli,
  validatePolicy
} = require("../tools/capability-recovery");
const { loadProjectionRegistry } = require("../tools/reasoning-policy");

const PROJECTION_REGISTRY = loadProjectionRegistry();

function versionedConfiguration({ modelTier, recovery = false }) {
  const projection = PROJECTION_REGISTRY.projections.find((entry) => entry.id === "openai-gpt6-v1");
  const modelSet = projection.model_sets.find((entry) => entry.id === "openai");
  return {
    schema_version: 1,
    model_set: {
      id: modelSet.id,
      version: modelSet.version,
      mapping_digest: modelSet.mapping_digest
    },
    reasoning_projection: {
      id: projection.id,
      version: projection.version,
      policy_version: projection.policy_version,
      digest: projection.digest
    },
    role_binding: {
      role: "executor",
      model_tier: modelTier,
      model: modelSet.tiers[modelTier],
      mapping_digest: modelSet.mapping_digest
    },
    provenance: {
      source: "workspace_profile",
      override: recovery ? {
        kind: "capability_recovery",
        version: "1",
        source_model_tier: "standard",
        target_model_tier: "strong"
      } : null
    }
  };
}

function lsaCapabilityInput(overrides = {}) {
  const source = versionedConfiguration({ modelTier: "standard" });
  const target = versionedConfiguration({ modelTier: "strong", recovery: true });
  return eligibleInput({
    lsa_recovery_context: {
      role: "executor",
      reasoning_mode: "adaptive",
      capability_recovery_mode: "auto",
      workflow_supports_capability_recovery: true,
      effective_class: "deep",
      prior_failure_type: "reasoning_failure",
      source_resolved_configuration: source,
      target_resolved_configuration: target,
      latest_verified_trace: {
        role: "executor",
        model_tier: "standard",
        model: source.role_binding.model,
        effective_effort: "high"
      },
      failure_history: [
        {
          attempt_id: "attempt-1",
          failure_signature: "criterion-a",
          failure_type: "reasoning_failure",
          material: true,
          meaningful_progress: false,
          model_tier: "standard",
          effective_effort: "medium"
        },
        {
          attempt_id: "attempt-2",
          failure_signature: "criterion-a",
          failure_type: "reasoning_failure",
          material: true,
          meaningful_progress: false,
          model_tier: "standard",
          effective_effort: "high"
        }
      ],
      model_uplift_used: false,
      retry_opportunities_used: 1,
      max_retry_rounds: 3,
      model_selector_available: true,
      effort_selector_available: true,
      runtime_supported_efforts: ["medium", "high", "max"],
      ...overrides
    }
  });
}

function eligibleInput(overrides = {}) {
  return {
    role: "executor",
    mode: "auto",
    requested: true,
    prior_failure_type: "reasoning_failure",
    same_failure: true,
    material_failure: true,
    no_meaningful_progress: true,
    recovery_used: false,
    selected_model_tier: "standard",
    recovery_ceiling_model_tier: "strong",
    model_selector_available: true,
    ...overrides
  };
}

function capture() {
  let value = "";
  return {
    stream: new Writable({
      write(chunk, encoding, callback) {
        value += chunk.toString();
        callback();
      }
    }),
    value: () => value
  };
}

test("bundled policy is bounded to one child uplift", () => {
  const policy = loadPolicy();
  assert.equal(policy.default_mode, "off");
  assert.deepEqual(policy.eligible_roles, ["executor", "generalist"]);
  assert.equal(policy.max_model_uplifts_per_task, 1);
});

test("off and unrequested decisions do not select a model", () => {
  const unrequested = resolveCapabilityRecovery({
    role: "executor",
    selected_model_tier: "standard"
  });
  assert.equal(unrequested.status, "not-requested");
  assert.equal(unrequested.dispatch_model_tier, null);

  const off = resolveCapabilityRecovery(eligibleInput({ mode: "off" }));
  assert.equal(off.status, "off");
  assert.equal(off.reason, "disabled");
  assert.equal(off.dispatch_model_tier, null);
  assert.equal(off.conflict, null);
});

test("shadow computes one tier uplift without dispatching it", () => {
  const decision = resolveCapabilityRecovery(eligibleInput({ mode: "shadow" }));
  assert.equal(decision.eligible, true);
  assert.equal(decision.requested_model_tier, "strong");
  assert.equal(decision.dispatch_model_tier, null);
  assert.equal(decision.status, "shadow");
});

test("auto requests and verifies a one-tier child uplift", () => {
  const requested = resolveCapabilityRecovery(eligibleInput());
  assert.equal(requested.requested_model_tier, "strong");
  assert.equal(requested.dispatch_model_tier, "strong");
  assert.equal(requested.effective_model_tier, null);
  assert.equal(requested.status, "requested");

  const verified = resolveCapabilityRecovery(eligibleInput({
    model_matches: true,
    observed_effective_model_tier: "strong"
  }));
  assert.equal(verified.status, "verified");
  assert.equal(verified.effective_model_tier, "strong");
  assert.equal(verified.conflict, null);
});

test("the valid fixture is an exact resolver projection", () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(
      __dirname,
      "..",
      "protocols",
      "examples",
      "capability-recovery-decision.valid.json"
    ),
    "utf8"
  ));
  assert.deepEqual(
    resolveCapabilityRecovery(eligibleInput({
      model_matches: true,
      observed_effective_model_tier: "strong"
    })),
    fixture
  );
});

test("only executor and generalist can receive model recovery", () => {
  for (const role of ["reviewer", "orchestrator-pipeline", "test-runner"]) {
    const decision = resolveCapabilityRecovery(eligibleInput({ role }));
    assert.equal(decision.status, "conflict", role);
    assert.equal(decision.reason, "role_not_eligible", role);
  }
});

test("material repeated reasoning evidence is mandatory", () => {
  const cases = [
    ["timeout", { prior_failure_type: "timeout" }, "failure_not_reasoning"],
    ["not repeated", { same_failure: false }, "failure_not_repeated"],
    ["not material", { material_failure: false }, "failure_not_material"],
    ["progress", { no_meaningful_progress: false }, "meaningful_progress_present"]
  ];
  for (const [label, overrides, reason] of cases) {
    const decision = resolveCapabilityRecovery(eligibleInput(overrides));
    assert.equal(decision.status, "conflict", label);
    assert.equal(decision.reason, reason, label);
    assert.equal(decision.dispatch_model_tier, null, label);
  }
});

test("operational failures never trigger model recovery", () => {
  for (const priorFailureType of [
    "timeout",
    "permission_denied",
    "network_error",
    "dependency_unavailable",
    "browser_startup_failure",
    "cli_format_error",
    "tool_failure"
  ]) {
    const decision = resolveCapabilityRecovery(eligibleInput({
      prior_failure_type: priorFailureType
    }));
    assert.equal(decision.status, "conflict", priorFailureType);
    assert.equal(decision.reason, "failure_not_reasoning", priorFailureType);
  }
});

test("used, unknown, missing, and exhausted recovery inputs fail closed", () => {
  const cases = [
    ["used", { recovery_used: true }, "recovery_already_used"],
    ["unknown tier", { selected_model_tier: "unknown" }, "tier_unknown"],
    ["missing ceiling", { recovery_ceiling_model_tier: null }, "ceiling_missing"],
    [
      "at ceiling",
      {
        selected_model_tier: "strong",
        recovery_ceiling_model_tier: "strong"
      },
      "no_higher_tier_available"
    ]
  ];
  for (const [label, overrides, reason] of cases) {
    const decision = resolveCapabilityRecovery(eligibleInput(overrides));
    assert.equal(decision.status, "conflict", label);
    assert.equal(decision.reason, reason, label);
  }
});

test("auto requires selector availability and matching trace evidence", () => {
  for (const modelSelectorAvailable of [false, null]) {
    const decision = resolveCapabilityRecovery(eligibleInput({
      model_selector_available: modelSelectorAvailable
    }));
    assert.equal(decision.status, "conflict");
    assert.equal(decision.reason, "model_selector_unavailable");
  }

  const rawMismatch = resolveCapabilityRecovery(eligibleInput({
    model_matches: false
  }));
  assert.equal(rawMismatch.status, "conflict");
  assert.equal(rawMismatch.reason, "effective_model_mismatch");

  const missingTier = resolveCapabilityRecovery(eligibleInput({
    model_matches: true
  }));
  assert.equal(missingTier.status, "conflict");
  assert.equal(missingTier.reason, "effective_model_tier_missing");

  const mismatch = resolveCapabilityRecovery(eligibleInput({
    model_matches: true,
    observed_effective_model_tier: "standard"
  }));
  assert.equal(mismatch.status, "conflict");
  assert.equal(mismatch.reason, "effective_model_tier_mismatch");
  assert.equal(mismatch.dispatch_model_tier, null);
});

test("one step is selected even when the ceiling is farther away", () => {
  const decision = resolveCapabilityRecovery(eligibleInput({
    selected_model_tier: "mini",
    recovery_ceiling_model_tier: "strong"
  }));
  assert.equal(decision.requested_model_tier, "standard");
});

test("resolver output is deterministic", () => {
  const input = eligibleInput();
  assert.deepEqual(
    resolveCapabilityRecovery(input),
    resolveCapabilityRecovery(input)
  );
});

test("qualified LSA v2 capability recovery reuses the shared Astra medium stage", () => {
  const requested = resolveCapabilityRecovery(lsaCapabilityInput());
  assert.equal(requested.status, "requested");
  assert.equal(requested.requested_model_tier, "strong");
  assert.equal(requested.dispatch_model_tier, "strong");
  assert.equal(requested.recovery_stage.stage, "strong-medium");
  assert.equal(requested.recovery_stage.dispatch_effort, "medium");
  assert.equal(requested.recovery_stage.target.role_binding.model, "gpt-6-astra");
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "protocols", "examples", "capability-recovery-decision.lsa-v2.valid.json"),
    "utf8"
  ));
  assert.deepEqual(requested, fixture);

  const verified = resolveCapabilityRecovery({
    ...lsaCapabilityInput(),
    model_matches: true,
    observed_effective_model_tier: "strong"
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.recovery_stage.stage, "strong-medium");
});

test("LSA v2 capability recovery cannot exceed or bypass the profile ceiling", () => {
  const cases = [
    ["unavailable ceiling", null, "ceiling_missing"],
    ["standard ceiling", "standard", "no_higher_tier_available"]
  ];
  for (const [label, ceiling, reason] of cases) {
    const input = lsaCapabilityInput();
    input.recovery_ceiling_model_tier = ceiling;
    const decision = resolveCapabilityRecovery(input);
    assert.equal(decision.status, "conflict", label);
    assert.equal(decision.reason, reason, label);
    assert.equal(decision.requested_model_tier, null, label);
    assert.equal(decision.dispatch_model_tier, null, label);
  }
});

test("LSA v2 capability shadow reports a candidate without claiming budget or uplift", () => {
  const input = lsaCapabilityInput({ capability_recovery_mode: "shadow" });
  input.mode = "shadow";
  const decision = resolveCapabilityRecovery(input);
  assert.equal(decision.status, "shadow");
  assert.equal(decision.dispatch_model_tier, null);
  assert.equal(decision.recovery_stage.stage, "strong-medium");
  assert.deepEqual(decision.recovery_stage.retry_claim, { expected_used: 1, next_used: 1, max: 3 });
  assert.deepEqual(decision.recovery_stage.uplift_claim, { expected_used: false, next_used: false });
});

test("LSA v2 capability recovery fails closed on incomplete provenance and first-failure evidence", () => {
  const missing = lsaCapabilityInput();
  delete missing.lsa_recovery_context.target_resolved_configuration;
  assert.throws(() => resolveCapabilityRecovery(missing), /target_resolved_configuration/);

  const first = lsaCapabilityInput({
    failure_history: [lsaCapabilityInput().lsa_recovery_context.failure_history[1]]
  });
  const denied = resolveCapabilityRecovery(first);
  assert.equal(denied.status, "conflict");
  assert.equal(denied.reason, "failure_not_repeated");
  assert.equal(denied.dispatch_model_tier, null);
});

test("policy validation rejects broader roles, modes, or budgets", () => {
  const mutations = [
    (policy) => policy.eligible_roles.push("reviewer"),
    (policy) => policy.modes.push("unbounded"),
    (policy) => { policy.max_model_uplifts_per_task = 2; },
    (policy) => { policy.default_mode = "auto"; }
  ];
  for (const mutate of mutations) {
    const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
    mutate(policy);
    assert.throws(() => validatePolicy(policy));
  }
});

test("CLI returns a distinct conflict exit code", () => {
  const stdout = capture();
  const stderr = capture();
  const code = runCli([
    "--input-json",
    JSON.stringify(eligibleInput({ role: "reviewer" })),
    "--compact"
  ], { stdout: stdout.stream, stderr: stderr.stream });
  assert.equal(code, EXIT_CODES.conflict);
  assert.equal(JSON.parse(stdout.value()).status, "conflict");
  assert.equal(stderr.value(), "");
});
