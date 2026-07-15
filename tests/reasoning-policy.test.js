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
  assert.equal(policy.global_floor, "medium");
  assert.equal(policy.model_floors.mini, "high");
  assert.equal(policy.allow_ultra, false);
  assert.equal(policy.default_mode, "adaptive");
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

test("deep mini work requests model escalation and uses a non-strict max fallback", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deep",
    model_tier: "mini",
    reasoning_signals: ["cross_module", "ambiguous_root_cause"]
  });

  assert.equal(decision.minimum_model_tier, "standard");
  assert.equal(decision.requires_model_escalation, true);
  assert.equal(decision.dispatch_effort, "max");
  assert.equal(decision.enforcement_status, "degraded");
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
  assert.match(decision.conflict, /requires model tier strong/);
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

test("inherit mode leaves model and effort selection untouched", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "inherit",
    reasoning_class: "deep",
    model_tier: "mini"
  });
  assert.equal(decision.effective_class, null);
  assert.equal(decision.requested_effort, null);
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "inherited");
});

test("review max remains an exact explicit override in inherit mode", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "inherit",
    model_tier: "strong",
    explicit_effort: "max"
  });
  assert.equal(decision.effective_class, null);
  assert.equal(decision.requested_effort, "max");
  assert.equal(decision.dispatch_effort, "max");
  assert.equal(decision.enforcement_status, "requested");
});

test("inherit review max conflicts when the observed effort is lower", () => {
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
  assert.match(decision.conflict, /does not match exact requested effort max/);
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
  assert.match(decision.conflict, /requires max/);
});

test("review max remains an exact effort request without changing the model tier", () => {
  const decision = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max"
  });
  assert.equal(decision.model_tier, "strong");
  assert.equal(decision.dispatch_effort, "max");
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
  assert.match(decision.conflict, /does not satisfy exact requested effort max/);
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
  assert.match(decision.conflict, /does not satisfy strict requested effort max/);
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
  assert.match(decision.conflict, /Shadow mode cannot satisfy strict reasoning policy/);
});

test("shadow mode rejects an exact review max request", () => {
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
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict, /Shadow mode cannot satisfy exact effort max/);
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
  assert.match(decision.conflict, /cannot run in inherit mode/);
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
  assert.match(decision.conflict, /exceeds role\/context ceiling routine/);
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
  assert.match(decision.conflict, /exceeds role\/context ceiling routine/);
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
  assert.match(decision.conflict, /below required floor high/);
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
      decision.conflict,
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
  assert.match(decision.conflict, /floor medium and ceiling high/);
});

test("shadow mode reports an escalation candidate without claiming degradation", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "shadow",
    reasoning_class: "deep",
    model_tier: "mini"
  });
  assert.equal(decision.requires_model_escalation, true);
  assert.equal(decision.enforcement_status, "shadow");
  assert.equal(decision.dispatch_effort, null);
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
    mode: "inherit",
    explicit_effort: "max",
    selector_available: false
  });
  assert.equal(decision.dispatch_effort, null);
  assert.equal(decision.enforcement_status, "conflict");
  assert.match(decision.conflict, /requires a per-spawn reasoning selector/);
});

test("policy validation rejects an inverted adaptive class range", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.default_role_policy.floor_class = "deep";
  policy.default_role_policy.target_class = "deliberative";
  assert.throws(() => validatePolicy(policy), /floor_class must not exceed target_class/);
});

test("policy validation supports only schema version 1.0", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.schema_version = "2.0";
  assert.throws(() => validatePolicy(policy), /schema_version must be 1\.0/);
});

test("policy validation supports only policy version 1 with adaptive default", () => {
  const versionPolicy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  versionPolicy.policy_version = "2";
  assert.throws(() => validatePolicy(versionPolicy), /policy_version must be supported version 1/);

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

test("policy validation rejects weakened version 1 signal floors", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.signal_minimum_classes.security_boundary = "routine";
  assert.throws(
    () => validatePolicy(policy),
    /security_boundary must not be below version 1 floor deep/
  );
});

test("policy validation rejects weakened mini and class projection floors", () => {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  policy.model_floors.mini = "medium";
  assert.throws(() => validatePolicy(policy), /model_floors\.mini must not be below version 1 floor high/);

  const projectionPolicy = JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8"));
  projectionPolicy.class_requirements.deep.effort_by_model_tier.standard = "high";
  assert.throws(
    () => validatePolicy(projectionPolicy),
    /class_requirements\.deep\.effort_by_model_tier\.standard must not be below version 1 floor xhigh/
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

test("policy validation rejects every mutable version 1 floor one step lower", () => {
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
