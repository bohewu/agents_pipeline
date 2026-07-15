const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");

const {
  DEFAULT_POLICY_PATH,
  EXIT_CODES,
  loadPolicy,
  resolveReasoning,
  runCli,
  validatePolicy
} = require("../tools/reasoning-policy");

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

test("bundled reasoning policy loads and preserves the quality floors", () => {
  const policy = loadPolicy();
  assert.equal(policy.schema_version, "2.0");
  assert.equal(policy.policy_version, "2");
  assert.equal(policy.global_floor, "medium");
  assert.equal(policy.model_floors.mini, "high");
  assert.equal(policy.allow_ultra, false);
  assert.equal(policy.default_mode, "adaptive");
  assert.equal(policy.compatibility.allow_degraded_deep, false);
});

test("task intents resolve through class, model capability, and effort deterministically", () => {
  const cases = [
    {
      name: "executor execute standard",
      input: { role: "executor", task_intent: "execute", model_tier: "standard" },
      expectedClass: "routine",
      expectedEffort: "medium"
    },
    {
      name: "repo scout inspect mini",
      input: { role: "repo-scout", task_intent: "inspect", model_tier: "mini" },
      expectedClass: "routine",
      expectedEffort: "high"
    },
    {
      name: "executor diagnose standard",
      input: { role: "executor", task_intent: "diagnose", model_tier: "standard" },
      expectedClass: "deliberative",
      expectedEffort: "high"
    },
    {
      name: "executor architectural design strong",
      input: {
        role: "executor",
        task_intent: "design",
        reasoning_signals: ["architectural_tradeoff"],
        model_tier: "strong"
      },
      expectedClass: "deep",
      expectedEffort: "xhigh"
    },
    {
      name: "ad hoc reviewer strong",
      input: {
        role: "reviewer",
        task_intent: "review",
        dispatch_context: "ad-hoc-review",
        model_tier: "strong"
      },
      expectedClass: "deep",
      expectedEffort: "xhigh"
    },
    {
      name: "pipeline reviewer strong",
      input: {
        role: "reviewer",
        task_intent: "review",
        dispatch_context: "pipeline-review",
        model_tier: "strong"
      },
      expectedClass: "deep",
      expectedEffort: "xhigh"
    }
  ];

  for (const entry of cases) {
    const first = resolveReasoning({ mode: "adaptive", selector_available: true, ...entry.input });
    const second = resolveReasoning({ mode: "adaptive", selector_available: true, ...entry.input });
    assert.equal(first.reasoning_class, entry.expectedClass, entry.name);
    assert.equal(first.effective_class, entry.expectedClass, entry.name);
    assert.equal(first.requested_effort, entry.expectedEffort, entry.name);
    assert.equal(first.dispatch_effort, entry.expectedEffort, entry.name);
    assert.equal(first.classification_source, "task_intent", entry.name);
    assert.deepEqual(first, second, entry.name);
  }
});

test("formal assurance requires and records strong max runtime evidence", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    selector_available: true,
    observed_effective_effort: "max"
  });
  assert.equal(decision.reasoning_class, "assurance");
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.dispatch_effort, "max");
  assert.equal(decision.effective_effort, "max");
  assert.equal(decision.strict, true);
  assert.equal(decision.enforcement_status, "enforced");
  assert.equal(decision.conflict, null);

  const intentOnly = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    model_tier: "strong",
    selector_available: true,
    observed_effective_effort: "max"
  });
  assert.equal(intentOnly.reasoning_class, "assurance");
  assert.equal(intentOnly.strict, true);
  assert.equal(intentOnly.effective_effort, "max");
});

test("the version 2 decision fixture is an exact resolver projection", () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "protocols", "examples", "reasoning-decision.valid.json"),
    "utf8"
  ));
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_class: "deep",
    reasoning_signals: ["architectural_tradeoff", "migration_compatibility"],
    model_tier: "standard",
    selector_available: true,
    explicit_effort: "xhigh",
    observed_effective_effort: "xhigh"
  });
  assert.deepEqual(decision, fixture);
});

test("the assurance capability-conflict fixture is an exact resolver projection", () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "protocols", "examples", "reasoning-decision.assurance-conflict.valid.json"),
    "utf8"
  ));
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    dispatch_context: "formal-assurance",
    model_tier: "mini",
    selector_available: true
  });
  assert.deepEqual(decision, fixture);
});

test("the degraded-deep fixture is an exact resolver projection", () => {
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "protocols", "examples", "reasoning-decision.degraded-deep.valid.json"),
    "utf8"
  ));
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "mini",
    selector_available: true,
    observed_effective_effort: "max",
    allow_degraded_deep: true
  });
  assert.deepEqual(decision, fixture);
});

test("routine work resolves to medium on standard and high on mini", () => {
  const standard = resolveReasoning({
    role: "test-runner",
    mode: "adaptive",
    model_tier: "standard"
  });
  const mini = resolveReasoning({
    role: "test-runner",
    mode: "adaptive",
    model_tier: "mini"
  });

  assert.equal(standard.effective_class, "routine");
  assert.equal(standard.dispatch_effort, "medium");
  assert.equal(mini.dispatch_effort, "high");
});

test("mini deliberative work starts at xhigh", () => {
  const decision = resolveReasoning({
    role: "planner",
    mode: "adaptive",
    model_tier: "mini"
  });
  assert.equal(decision.effective_class, "deliberative");
  assert.equal(decision.dispatch_effort, "xhigh");
});

test("unknown model tier is bounded for routine and deliberative but conflicts for deep", () => {
  const routine = resolveReasoning({ role: "executor", task_intent: "execute" });
  const deliberative = resolveReasoning({ role: "executor", task_intent: "diagnose" });
  const deep = resolveReasoning({
    role: "executor",
    task_intent: "design",
    reasoning_signals: ["cross_system"]
  });
  assert.equal(routine.dispatch_effort, "high");
  assert.equal(deliberative.dispatch_effort, "xhigh");
  assert.equal(deep.enforcement_status, "conflict");
  assert.match(deep.conflict_reason, /selected tier is unknown/);
});

test("deep mini work conflicts by default and has an explicit degraded compatibility mode", () => {
  const denied = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    model_tier: "mini",
    reasoning_signals: ["cross_module"]
  });
  assert.equal(denied.minimum_model_tier, "standard");
  assert.equal(denied.requires_model_escalation, true);
  assert.equal(denied.dispatch_effort, null);
  assert.equal(denied.enforcement_status, "conflict");

  const compatible = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    model_tier: "mini",
    reasoning_signals: ["cross_module"],
    allow_degraded_deep: true
  });
  assert.equal(compatible.reasoning_class, "deep");
  assert.equal(compatible.requested_effort, "max");
  assert.equal(compatible.dispatch_effort, "max");
  assert.equal(compatible.degraded, true);
  assert.equal(compatible.degradation_reason, "model_tier_below_deep_requirement");
  assert.equal(compatible.enforcement_status, "degraded");
});

test("unknown-tier deep work uses the same explicit degraded compatibility contract", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    model_tier: "unknown",
    reasoning_signals: ["cross_system"],
    allow_degraded_deep: true,
    selector_available: true,
    observed_effective_effort: "max"
  });
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.minimum_model_tier, "standard");
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.effective_effort, "max");
  assert.equal(decision.degraded, true);
  assert.equal(decision.degradation_reason, "model_tier_below_deep_requirement");
  assert.notEqual(decision.reasoning_class, "assurance");
});

test("degraded deep compatibility requires exact max runtime enforcement", () => {
  const base = {
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    model_tier: "mini",
    reasoning_signals: ["cross_module"],
    allow_degraded_deep: true
  };

  const unsupported = resolveReasoning({
    ...base,
    runtime_supported_efforts: ["medium", "high", "xhigh"]
  });
  assert.equal(unsupported.requested_effort, "max");
  assert.equal(unsupported.dispatch_effort, null);
  assert.equal(unsupported.enforcement_status, "conflict");
  assert.match(unsupported.conflict_reason, /requires max/);

  const unavailable = resolveReasoning({ ...base, selector_available: false });
  assert.equal(unavailable.requested_effort, "max");
  assert.equal(unavailable.dispatch_effort, null);
  assert.equal(unavailable.enforcement_status, "conflict");
  assert.match(unavailable.conflict_reason, /cannot be enforced/);

  const mismatched = resolveReasoning({
    ...base,
    selector_available: true,
    observed_effective_effort: "xhigh"
  });
  assert.equal(mismatched.requested_effort, "max");
  assert.equal(mismatched.dispatch_effort, null);
  assert.equal(mismatched.enforcement_status, "conflict");
  assert.match(mismatched.conflict_reason, /does not satisfy exact requested effort max/);

  const observed = resolveReasoning({
    ...base,
    selector_available: true,
    observed_effective_effort: "max"
  });
  assert.equal(observed.requested_effort, "max");
  assert.equal(observed.dispatch_effort, "max");
  assert.equal(observed.effective_effort, "max");
  assert.equal(observed.enforcement_status, "degraded");
  assert.equal(observed.degradation_reason, "model_tier_below_deep_requirement");
});

test("formal assurance conflicts when a strong model cannot be verified", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    dispatch_context: "formal-assurance",
    model_tier: "unknown"
  });

  assert.equal(decision.strict, true);
  assert.equal(decision.requires_model_escalation, true);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /requires model tier strong/);
});

test("pipeline review conflicts when the profile-selected tier is below strong", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "review",
    dispatch_context: "pipeline-review",
    model_tier: "standard"
  });
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.minimum_model_tier, "strong");
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /requires model tier strong/);
});

test("shadow computes a decision without applying a dispatch override", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "shadow",
    reasoning_class: "deep",
    model_tier: "strong"
  });
  assert.equal(decision.requested_effort, "xhigh");
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "shadow");
});

test("inherit mode preserves classification metadata without requesting a selector", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "inherit",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "standard",
    selector_available: false
  });
  assert.equal(decision.task_intent, "design");
  assert.equal(decision.effective_class, "deep");
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.requested_effort, null);
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "inherited");
  assert.equal(decision.conflict, null);
});

test("review max conflicts in inherit mode because inherit never applies a selector", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "inherit",
    model_tier: "strong",
    explicit_effort: "max"
  });
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.requested_effort, null);
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /cannot run in inherit mode/);
});

test("inherit review max does not accept lower observed effort as enforcement", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "inherit",
    model_tier: "strong",
    explicit_effort: "max",
    observed_effective_effort: "high"
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.effective_effort, "high");
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /cannot run in inherit mode/);
});

test("an explicit max override never silently downgrades to a supported lower effort", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    model_tier: "strong",
    explicit_effort: "max",
    runtime_supported_efforts: ["medium", "high", "xhigh"]
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /requires max/);
});

test("every explicit effort is an exact upward floor", () => {
  for (const explicitEffort of ["high", "xhigh"]) {
    const requested = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      task_intent: "execute",
      model_tier: "standard",
      selector_available: true,
      explicit_effort: explicitEffort
    });
    assert.equal(requested.requested_effort, explicitEffort);
    assert.equal(requested.dispatch_effort, explicitEffort);
    assert.equal(requested.enforcement_status, "requested");

    const mismatch = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      task_intent: "execute",
      model_tier: "standard",
      selector_available: true,
      explicit_effort: explicitEffort,
      observed_effective_effort: "medium"
    });
    assert.equal(mismatch.requested_effort, explicitEffort);
    assert.equal(mismatch.dispatch_effort, null);
    assert.equal(mismatch.enforcement_status, "conflict");
    assert.match(mismatch.conflict_reason, new RegExp(`does not satisfy exact requested effort ${explicitEffort}`));
  }

  for (const [explicitEffort, runtimeSupportedEfforts] of Object.entries({
    medium: ["high"],
    high: ["medium"],
    xhigh: ["max"],
    max: ["xhigh"]
  })) {
    const unsupported = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      task_intent: "execute",
      model_tier: "standard",
      selector_available: true,
      explicit_effort: explicitEffort,
      runtime_supported_efforts: runtimeSupportedEfforts
    });
    assert.equal(unsupported.requested_effort, explicitEffort);
    assert.equal(unsupported.dispatch_effort, null);
    assert.equal(unsupported.enforcement_status, "conflict");
    assert.match(unsupported.conflict_reason, new RegExp(`Exact policy requires ${explicitEffort}`));
  }
});

test("review max remains an exact effort request without changing the model tier", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "review",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max"
  });
  assert.equal(decision.model_tier, "strong");
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.dispatch_effort, "max");
  assert.equal(decision.strict, false);
  assert.ok(decision.reasons.includes("explicit_effort"));
});

test("adaptive review max conflicts when trace evidence reports a lower effort", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max",
    observed_effective_effort: "xhigh"
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /does not satisfy exact requested effort max/);
});

test("formal assurance conflicts when observed effort misses its strict target", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    observed_effective_effort: "high"
  });
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /does not satisfy strict requested effort max/);
});

test("shadow mode rejects formal assurance instead of silently observing it", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "shadow",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    observed_effective_effort: "high"
  });
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.effective_effort, "high");
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /Shadow mode cannot satisfy strict reasoning policy/);
});

test("shadow mode computes an exact review max request without applying it", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "shadow",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max",
    observed_effective_effort: "xhigh"
  });
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "shadow");
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.conflict, null);
});

test("inherit mode rejects formal assurance because it cannot enforce strict policy", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "inherit",
    dispatch_context: "formal-assurance",
    model_tier: "strong"
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /cannot run in inherit mode/);
});

test("a prior reasoning failure raises adaptive work by one class", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    model_tier: "strong",
    prior_reasoning_failure: true
  });
  assert.equal(decision.effective_class, "deep");
  assert.equal(decision.dispatch_effort, "xhigh");
});

test("reasoning failures escalate routine and deliberative but deep only receives a max recovery boost", () => {
  const routine = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "execute",
    model_tier: "standard",
    prior_failure_type: "reasoning_failure"
  });
  assert.equal(routine.reasoning_class, "deliberative");
  assert.equal(routine.requested_effort, "high");

  const deliberative = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "diagnose",
    model_tier: "strong",
    prior_failure_type: "reasoning_failure"
  });
  assert.equal(deliberative.reasoning_class, "deep");
  assert.equal(deliberative.requested_effort, "xhigh");

  const deep = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "strong",
    prior_failure_type: "reasoning_failure"
  });
  assert.equal(deep.reasoning_class, "deep");
  assert.equal(deep.recovery_boost, true);
  assert.equal(deep.requested_effort, "max");
  assert.notEqual(deep.reasoning_class, "assurance");
});

test("an explicit assurance override clears a provisional deep recovery boost", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "strong",
    selector_available: true,
    prior_failure_type: "reasoning_failure",
    explicit_reasoning_class: "assurance",
    observed_effective_effort: "max"
  });
  assert.equal(decision.reasoning_class, "assurance");
  assert.equal(decision.recovery_boost, false);
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.enforcement_status, "enforced");
  assert.equal(decision.reasons.includes("recovery_boost"), false);
});

test("operational failures never raise reasoning class or effort", () => {
  for (const priorFailureType of [
    "timeout",
    "permission_denied",
    "network_error",
    "dependency_unavailable",
    "browser_startup_failure",
    "cli_format_error",
    "tool_failure"
  ]) {
    const decision = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      task_intent: "execute",
      model_tier: "standard",
      prior_failure_type: priorFailureType
    });
    assert.equal(decision.reasoning_class, "routine", priorFailureType);
    assert.equal(decision.requested_effort, "medium", priorFailureType);
    assert.equal(decision.recovery_boost, false, priorFailureType);
  }
});

test("assurance conflicts for mini, standard, and unknown model tiers", () => {
  for (const modelTier of ["mini", "standard", "unknown"]) {
    const decision = resolveReasoning({
      role: "reviewer",
      mode: "adaptive",
      task_intent: "certify",
      dispatch_context: "formal-assurance",
      model_tier: modelTier,
      selector_available: true
    });
    assert.equal(decision.reasoning_class, "assurance", modelTier);
    assert.equal(decision.enforcement_status, "conflict", modelTier);
    assert.match(decision.conflict_reason, /requires model tier strong/, modelTier);
  }
});

test("strict assurance conflicts when the selector is unavailable", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    selector_available: false
  });
  assert.equal(decision.strict, true);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /cannot be enforced without a per-spawn reasoning selector/);
});

test("legacy explicit class and role-target fallback remain distinguishable", () => {
  const explicit = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deep",
    model_tier: "standard"
  });
  assert.equal(explicit.task_intent, null);
  assert.equal(explicit.reasoning_class, "deep");
  assert.equal(explicit.classification_source, "legacy_explicit_class");

  const fallback = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    model_tier: "standard"
  });
  assert.equal(fallback.task_intent, null);
  assert.equal(fallback.reasoning_class, "deliberative");
  assert.equal(fallback.classification_source, "legacy_role_target");
});

test("intent-less legacy cross_module keeps the version 1 deliberative floor", () => {
  const explicit = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    reasoning_signals: ["cross_module"],
    model_tier: "standard"
  });
  assert.equal(explicit.classification_source, "legacy_explicit_class");
  assert.equal(explicit.reasoning_class, "deliberative");
  assert.equal(explicit.requested_effort, "high");

  const fallback = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_signals: ["cross_module"],
    model_tier: "standard"
  });
  assert.equal(fallback.classification_source, "legacy_role_target");
  assert.equal(fallback.reasoning_class, "deliberative");

  const explicitNull = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: null,
    reasoning_class: "deliberative",
    reasoning_signals: ["cross_module"],
    model_tier: "standard"
  });
  assert.equal(explicitNull.task_intent, null);
  assert.equal(explicitNull.classification_source, "legacy_explicit_class");
  assert.equal(explicitNull.reasoning_class, "deliberative");
  assert.equal(explicitNull.requested_effort, "high");

  const v2 = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "inspect",
    reasoning_signals: ["cross_module"],
    model_tier: "standard"
  });
  assert.equal(v2.classification_source, "task_intent");
  assert.equal(v2.reasoning_class, "deep");
  assert.equal(v2.requested_effort, "xhigh");
});

test("resolver rejects unsupported task intent values", () => {
  assert.throws(
    () => resolveReasoning({ role: "executor", task_intent: "research" }),
    /task_intent must be one of/
  );
});

test("reasoning signals enforce their policy minimum class", () => {
  const cases = [
    { role: "executor", signal: "fully_specified", expectedClass: "routine", expectedEffort: "medium" },
    { role: "executor", signal: "multi_step", expectedClass: "deliberative", expectedEffort: "high" },
    { role: "executor", signal: "security_boundary", expectedClass: "deep", expectedEffort: "xhigh" },
    { role: "reviewer", signal: "formal_accept_reject", expectedClass: "assurance", expectedEffort: "max" }
  ];
  for (const entry of cases) {
    const decision = resolveReasoning({
      role: entry.role,
      mode: "adaptive",
      reasoning_class: "routine",
      reasoning_signals: [entry.signal],
      model_tier: "strong"
    });
    assert.equal(decision.effective_class, entry.expectedClass, entry.signal);
    assert.equal(decision.dispatch_effort, entry.expectedEffort, entry.signal);
  }
});

test("deep signals cannot be under-allocated by a routine task label", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "routine",
    reasoning_signals: ["security_boundary"],
    model_tier: "standard"
  });
  assert.equal(decision.requested_class, "routine");
  assert.equal(decision.effective_class, "deep");
  assert.equal(decision.dispatch_effort, "xhigh");
  assert.ok(decision.reasons.includes("signal_floor:deep"));
});

test("fixed routine roles reject deep work instead of silently weakening it", () => {
  const decision = resolveReasoning({
    role: "test-runner",
    mode: "adaptive",
    reasoning_class: "deep",
    model_tier: "strong"
  });
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /exceeds role ceiling routine/);
});

test("fixed deliberative roles reject deep work and require reassignment", () => {
  const decision = resolveReasoning({
    role: "planner",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "strong"
  });
  assert.equal(decision.reasoning_class, "deep");
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /exceeds role ceiling deliberative/);
});

test("dispatch contexts cannot widen a fixed routine role ceiling", () => {
  const decision = resolveReasoning({
    role: "peon",
    mode: "adaptive",
    dispatch_context: "ad-hoc-review",
    reasoning_class: "deep",
    reasoning_signals: ["security_boundary"],
    model_tier: "strong"
  });
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /exceeds role ceiling routine/);
});

test("runtime capability mismatch degrades a non-strict request without crossing its floor", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deep",
    model_tier: "strong",
    runtime_supported_efforts: ["medium", "high"]
  });
  assert.equal(decision.requested_effort, "xhigh");
  assert.equal(decision.dispatch_effort, "high");
  assert.equal(decision.enforcement_status, "degraded");
  assert.equal(decision.capability_source, "runtime");

  const observed = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deep",
    model_tier: "strong",
    runtime_supported_efforts: ["medium", "high"],
    observed_effective_effort: "high"
  });
  assert.equal(observed.requested_effort, "xhigh");
  assert.equal(observed.dispatch_effort, "high");
  assert.equal(observed.effective_effort, "high");
  assert.equal(observed.enforcement_status, "degraded");
  assert.equal(observed.degradation_reason, "runtime_effort_unavailable");
});

test("a workspace ceiling below the mini floor is a policy conflict", () => {
  const decision = resolveReasoning({
    role: "test-runner",
    mode: "adaptive",
    model_tier: "mini",
    workspace_ceiling: "medium"
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /below required floor high/);
});

test("workspace ceilings never clip deliberative or deep class projections", () => {
  const cases = [
    {
      reasoningClass: "deliberative",
      ceiling: "medium",
      requestedEffort: "high"
    },
    {
      reasoningClass: "deep",
      ceiling: "high",
      requestedEffort: "xhigh"
    }
  ];
  for (const entry of cases) {
    const decision = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      reasoning_class: entry.reasoningClass,
      model_tier: "standard",
      workspace_ceiling: entry.ceiling
    });
    assert.equal(decision.requested_effort, entry.requestedEffort);
    assert.equal(decision.dispatch_effort, null);
    assert.equal(decision.enforcement_status, "conflict");
    assert.match(
      decision.conflict_reason,
      new RegExp(`Required effort ${entry.requestedEffort} exceeds workspace ceiling ${entry.ceiling}`)
    );
  }
});

test("runtime capability fallback never crosses the workspace ceiling", () => {
  const decision = resolveReasoning({
    role: "test-runner",
    mode: "adaptive",
    model_tier: "standard",
    workspace_ceiling: "high",
    runtime_supported_efforts: ["max"]
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /floor medium and ceiling high/);
});

test("shadow mode still reports model capability conflicts unless compatibility is explicit", () => {
  const denied = resolveReasoning({
    role: "executor",
    mode: "shadow",
    reasoning_class: "deep",
    model_tier: "mini"
  });
  assert.equal(denied.requires_model_escalation, true);
  assert.equal(denied.enforcement_status, "conflict");

  const compatible = resolveReasoning({
    role: "executor",
    mode: "shadow",
    reasoning_class: "deep",
    model_tier: "mini",
    allow_degraded_deep: true
  });
  assert.equal(compatible.requested_effort, "max");
  assert.equal(compatible.dispatch_effort, null);
  assert.equal(compatible.enforcement_status, "shadow");
  assert.equal(compatible.degraded, true);
});

test("shadow mode never relabels an observed inherited effort as policy enforcement", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "shadow",
    reasoning_class: "deliberative",
    model_tier: "standard",
    observed_effective_effort: "high"
  });
  assert.equal(decision.enforcement_status, "shadow");
  assert.equal(decision.effective_effort, "high");
  assert.equal(decision.dispatch_effort, null);
});

test("observed effective effort marks a matching selector as enforced", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    model_tier: "standard",
    observed_effective_effort: "high"
  });
  assert.equal(decision.enforcement_status, "enforced");
  assert.equal(decision.effective_effort, "high");
});

test("adaptive mode reports an unavailable selector without claiming enforcement", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    model_tier: "standard",
    selector_available: false
  });
  assert.equal(decision.requested_effort, "high");
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "degraded");
  assert.ok(decision.reasons.includes("selector_unavailable"));
});

test("an unavailable selector conflicts with an exact review max request", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "review",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max",
    selector_available: false
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict_reason, /per-spawn reasoning selector/);
});

test("policy validation rejects an inverted adaptive class range", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.default_role_policy.floor_class = "deep";
  policy.default_role_policy.target_class = "deliberative";
  assert.throws(() => validatePolicy(policy), /floor_class must not exceed target_class/);
});

test("policy validation supports only schema version 2.0", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.schema_version = "1.0";
  assert.throws(() => validatePolicy(policy), /schema_version must be 2\.0/);
});

test("policy validation supports only policy version 2 with adaptive default", () => {
  const versionPolicy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  versionPolicy.policy_version = "1";
  assert.throws(() => validatePolicy(versionPolicy), /policy_version must be supported version 2/);

  const modePolicy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  modePolicy.default_mode = "inherit";
  assert.throws(() => validatePolicy(modePolicy), /default_mode must remain adaptive/);
});

test("policy validation requires a minimum class for every signal", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  delete policy.signal_minimum_classes.security_boundary;
  assert.throws(
    () => validatePolicy(policy),
    /signal_minimum_classes must define every canonical reasoning signal exactly once/
  );
});

test("policy validation rejects weakened version 2 signal floors", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.signal_minimum_classes.security_boundary = "routine";
  assert.throws(
    () => validatePolicy(policy),
    /security_boundary must not be below version 2 floor deep/
  );
});

test("policy validation rejects weakened mini and class projection floors", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.model_floors.mini = "medium";
  assert.throws(() => validatePolicy(policy), /model_floors\.mini must not be below version 2 floor high/);

  const projectionPolicy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  projectionPolicy.class_requirements.deep.effort_by_model_tier.standard = "high";
  assert.throws(
    () => validatePolicy(projectionPolicy),
    /class_requirements\.deep\.effort_by_model_tier\.standard must not be below version 2 floor xhigh/
  );
});

test("policy validation keeps formal assurance context strict and strong", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.dispatch_contexts["formal-assurance"] = {
    mode: "fixed",
    reasoning_class: "routine",
    strict: false
  };
  assert.throws(
    () => validatePolicy(policy),
    /formal-assurance must remain fixed assurance with strong model tier and strict enforcement/
  );
});

test("policy validation locks task intents, role groups, review contexts, and compatibility default", () => {
  const mutations = [
    ["intent", (policy) => { policy.intent_baseline_classes.review = "routine"; }, /intent_baseline_classes\.review must remain deliberative/],
    ["fixed routine", (policy) => { policy.role_policies.peon.reasoning_class = "deliberative"; }, /peon must remain fixed routine/],
    ["fixed deliberative", (policy) => { policy.role_policies.planner.reasoning_class = "deep"; }, /planner must remain fixed deliberative/],
    ["fixed deep", (policy) => { policy.role_policies["committee-qa"].reasoning_class = "deliberative"; }, /committee-qa must remain fixed deep/],
    ["security tier", (policy) => { policy.role_policies["committee-security"].minimum_model_tier = "standard"; }, /committee-security must require minimum model tier strong/],
    ["review floor", (policy) => { policy.dispatch_contexts["ad-hoc-review"].floor_class = "deliberative"; }, /ad-hoc-review must keep a non-strict deep floor/],
    ["pipeline tier", (policy) => { policy.dispatch_contexts["pipeline-review"].minimum_model_tier = "standard"; }, /pipeline-review must keep a non-strict deep floor and strong model minimum/],
    ["compatibility", (policy) => { policy.compatibility.allow_degraded_deep = true; }, /allow_degraded_deep must default to false/]
  ];
  for (const [label, mutate, expected] of mutations) {
    const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
    mutate(policy);
    assert.throws(() => validatePolicy(policy), expected, label);
  }
});

test("policy validation accepts only the managed version 2 role and context snapshots", () => {
  const mutations = [
    ["default strictness", (policy) => { policy.default_role_policy.strict = true; }],
    ["role strictness", (policy) => { policy.role_policies.peon.strict = true; }],
    ["role model tier", (policy) => { policy.role_policies.peon.minimum_model_tier = "strong"; }],
    ["extra role", (policy) => {
      policy.role_policies["custom-worker"] = { ...policy.default_role_policy };
    }],
    ["extra context", (policy) => {
      policy.dispatch_contexts["custom-review"] = {
        mode: "adaptive",
        floor_class: "deep",
        target_class: "deep",
        ceiling_class: "assurance",
        strict: false
      };
    }],
    ["top-level key", (policy) => { policy.private_extension = true; }],
    ["default role key", (policy) => { policy.default_role_policy.note = "private"; }],
    ["managed role key", (policy) => { policy.role_policies.peon.note = "private"; }],
    ["managed context key", (policy) => {
      policy.dispatch_contexts["ad-hoc-review"].note = "private";
    }],
    ["compatibility key", (policy) => { policy.compatibility.note = "private"; }],
    ["model floor key", (policy) => { policy.model_floors.private = "max"; }],
    ["class requirement key", (policy) => {
      policy.class_requirements.deep.note = "private";
    }],
    ["effort projection key", (policy) => {
      policy.class_requirements.deep.effort_by_model_tier.private = "max";
    }]
  ];

  for (const [label, mutate] of mutations) {
    const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
    mutate(policy);
    assert.throws(
      () => validatePolicy(policy),
      /must match the canonical version 2|canonical managed role set|canonical version 2 context set|supported keys/,
      label
    );
  }
});

test("only formal_accept_reject may set an assurance signal floor", () => {
  const base = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  for (const signal of Object.keys(base.signal_minimum_classes)) {
    const policy = JSON.parse(JSON.stringify(base));
    policy.signal_minimum_classes[signal] = "assurance";
    if (signal === "formal_accept_reject") {
      assert.doesNotThrow(() => validatePolicy(policy));
    } else {
      assert.throws(
        () => validatePolicy(policy),
        new RegExp(`signal_minimum_classes\\.${signal} cannot produce assurance`),
        signal
      );
    }
  }
});

test("policy validation rejects every mutable version 2 floor one step lower", () => {
  const base = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  const classOrder = base.reasoning_classes;
  const effortOrder = base.effort_order;
  const modelOrder = base.model_tier_order;
  const mutations = [];

  for (const [signal, minimumClass] of Object.entries(base.signal_minimum_classes)) {
    const index = classOrder.indexOf(minimumClass);
    if (index > 0) {
      mutations.push([`signal:${signal}`, (policy) => {
        policy.signal_minimum_classes[signal] = classOrder[index - 1];
      }]);
    }
  }
  for (const [tier, floor] of Object.entries(base.model_floors)) {
    const index = effortOrder.indexOf(floor);
    if (index > 0) {
      mutations.push([`model_floor:${tier}`, (policy) => {
        policy.model_floors[tier] = effortOrder[index - 1];
      }]);
    }
  }
  for (const [reasoningClass, requirement] of Object.entries(base.class_requirements)) {
    const modelIndex = modelOrder.indexOf(requirement.minimum_model_tier);
    if (modelIndex > 0) {
      mutations.push([`model_requirement:${reasoningClass}`, (policy) => {
        policy.class_requirements[reasoningClass].minimum_model_tier = modelOrder[modelIndex - 1];
      }]);
    }
    for (const [tier, projected] of Object.entries(requirement.effort_by_model_tier)) {
      const actual = projected === "highest_single_agent" ? base.highest_single_agent : projected;
      const effortIndexValue = effortOrder.indexOf(actual);
      if (effortIndexValue > 0) {
        mutations.push([`projection:${reasoningClass}:${tier}`, (policy) => {
          policy.class_requirements[reasoningClass].effort_by_model_tier[tier] = effortOrder[effortIndexValue - 1];
        }]);
      }
    }
  }
  mutations.push(["highest_single_agent", (policy) => {
    policy.highest_single_agent = "xhigh";
  }]);

  for (const [label, mutate] of mutations) {
    const policy = JSON.parse(JSON.stringify(base));
    mutate(policy);
    assert.throws(() => validatePolicy(policy), undefined, label);
  }
});

test("resolver rejects free-form role identifiers before they can reach observations", () => {
  assert.throws(
    () => resolveReasoning({ role: "executor /private/path", mode: "adaptive" }),
    /role must be a bounded lowercase reasoning identifier/
  );
});

test("CLI emits a decision and uses a distinct conflict exit code in every mode", () => {
  const stdout = capture();
  const stderr = capture();
  const ok = runCli([
    "--input-json",
    JSON.stringify({ role: "test-runner", mode: "adaptive", model_tier: "standard" }),
    "--compact"
  ], { stdout: stdout.stream, stderr: stderr.stream });
  assert.equal(ok, EXIT_CODES.ok);
  assert.equal(JSON.parse(stdout.value()).dispatch_effort, "medium");
  assert.equal(stderr.value(), "");

  const conflictOut = capture();
  const conflictErr = capture();
  const conflict = runCli([
    "--input-json",
    JSON.stringify({
      role: "reviewer",
      mode: "adaptive",
      dispatch_context: "formal-assurance",
      model_tier: "mini"
    })
  ], { stdout: conflictOut.stream, stderr: conflictErr.stream });
  assert.equal(conflict, EXIT_CODES.conflict);
  assert.equal(JSON.parse(conflictOut.value()).enforcement_status, "conflict");
  assert.equal(conflictErr.value(), "");

  const inheritConflict = runCli([
    "--input-json",
    JSON.stringify({
      role: "reviewer",
      mode: "inherit",
      explicit_effort: "max",
      selector_available: false
    })
  ], { stdout: capture().stream, stderr: capture().stream });
  assert.equal(inheritConflict, EXIT_CODES.conflict);

  const shadowConflict = runCli([
    "--input-json",
    JSON.stringify({
      role: "reviewer",
      mode: "shadow",
      dispatch_context: "formal-assurance",
      model_tier: "strong",
      observed_effective_effort: "high"
    })
  ], { stdout: capture().stream, stderr: capture().stream });
  assert.equal(shadowConflict, EXIT_CODES.conflict);
});

test("default policy path remains inside the repository protocol tree", () => {
  assert.equal(path.basename(DEFAULT_POLICY_PATH), "reasoning-policy.json");
  assert.equal(path.basename(path.dirname(DEFAULT_POLICY_PATH)), "protocols");
});
