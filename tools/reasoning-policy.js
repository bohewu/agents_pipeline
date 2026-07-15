#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  CLASSIFICATION_SOURCES,
  DEGRADATION_REASONS,
  EFFORTS,
  LEGACY_SIGNAL_MINIMUM_CLASSES,
  MODEL_TIERS,
  OPERATIONAL_FAILURE_TYPES,
  POLICY_MODES,
  PRIOR_FAILURE_TYPES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  SAFE_POLICY_VERSION,
  SAFE_REASONING_IDENTIFIER,
  TASK_INTENTS,
  V2_CLASS_REQUIREMENT_MINIMUMS,
  V2_INTENT_BASELINE_CLASSES,
  V2_MODEL_FLOOR_MINIMUMS,
  V2_SIGNAL_MINIMUM_CLASSES,
  minimumReasoningClassForSignals
} = require("./reasoning-vocabulary");

const DEFAULT_POLICY_PATH = path.resolve(__dirname, "..", "protocols", "reasoning-policy.json");
const REASONING_SIGNAL_SET = new Set(REASONING_SIGNALS);

const EXIT_CODES = {
  ok: 0,
  invalid: 2,
  conflict: 3
};

const FIXED_ROLE_GROUPS = Object.freeze({
  routine: Object.freeze([
    "compressor",
    "handoff-writer",
    "kanban-manager",
    "peon",
    "repo-scout",
    "session-guide-writer",
    "summarizer",
    "test-runner"
  ]),
  deliberative: Object.freeze([
    "art-director",
    "atomizer",
    "committee-kiss",
    "committee-product",
    "flow-splitter",
    "market-researcher",
    "planner",
    "router",
    "specifier",
    "ux-copy-trust",
    "ux-novice",
    "ux-visual-hierarchy"
  ]),
  deep: Object.freeze([
    "analysis-complexity",
    "analysis-correctness",
    "analysis-numerics",
    "analysis-robustness",
    "committee-architect",
    "committee-judge",
    "committee-qa",
    "committee-security",
    "ux-judge",
    "ux-task-flow"
  ])
});

const CANONICAL_DEFAULT_ROLE_POLICY = Object.freeze({
  mode: "adaptive",
  floor_class: "routine",
  target_class: "deliberative",
  ceiling_class: "deep",
  strict: false
});

const CANONICAL_ROLE_POLICIES = Object.freeze({
  ...Object.fromEntries(FIXED_ROLE_GROUPS.routine.map((role) => [role, {
    mode: "fixed",
    reasoning_class: "routine",
    strict: false
  }])),
  ...Object.fromEntries(FIXED_ROLE_GROUPS.deliberative.map((role) => [role, {
    mode: "fixed",
    reasoning_class: "deliberative",
    strict: false
  }])),
  ...Object.fromEntries(FIXED_ROLE_GROUPS.deep.map((role) => [role, {
    mode: "fixed",
    reasoning_class: "deep",
    strict: false
  }])),
  "committee-security": {
    mode: "fixed",
    reasoning_class: "deep",
    minimum_model_tier: "strong",
    strict: false
  },
  ...Object.fromEntries(["doc-writer", "executor", "generalist"].map((role) => [role, {
    ...CANONICAL_DEFAULT_ROLE_POLICY
  }])),
  "ui-ux-designer": {
    mode: "adaptive",
    floor_class: "deliberative",
    target_class: "deep",
    ceiling_class: "deep",
    strict: false
  },
  reviewer: {
    mode: "adaptive",
    floor_class: "deliberative",
    target_class: "deep",
    ceiling_class: "assurance",
    strict: false
  }
});

const CANONICAL_DISPATCH_CONTEXTS = Object.freeze({
  "ad-hoc-review": {
    mode: "adaptive",
    floor_class: "deep",
    target_class: "deep",
    ceiling_class: "assurance",
    strict: false
  },
  "pipeline-review": {
    mode: "adaptive",
    floor_class: "deep",
    target_class: "deep",
    ceiling_class: "assurance",
    minimum_model_tier: "strong",
    strict: false
  },
  "formal-assurance": {
    mode: "fixed",
    reasoning_class: "assurance",
    required_model_tier: "strong",
    strict: true
  }
});

const POLICY_KEYS = Object.freeze([
  "schema_version",
  "policy_version",
  "default_mode",
  "task_intents",
  "intent_baseline_classes",
  "reasoning_classes",
  "signal_minimum_classes",
  "effort_order",
  "global_floor",
  "model_floors",
  "highest_single_agent",
  "allow_ultra",
  "compatibility",
  "model_tier_order",
  "class_requirements",
  "default_role_policy",
  "role_policies",
  "dispatch_contexts"
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expectedKeys, label) {
  assert(isObject(value), `${label} must be an object`);
  assert(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort()),
    `${label} must contain exactly the supported keys`
  );
}

function assertExactFlatObject(value, expected, message) {
  assert(isObject(value), message);
  const keysMatch = JSON.stringify(Object.keys(value).sort())
    === JSON.stringify(Object.keys(expected).sort());
  const valuesMatch = keysMatch && Object.keys(expected).every((key) => value[key] === expected[key]);
  assert(valuesMatch, message);
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read: ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}: ${error.message}`);
  }
}

function ensureEnum(value, allowed, label) {
  assert(allowed.includes(value), `${label} must be one of: ${allowed.join(", ")}`);
  return value;
}

function ensureReasoningSignals(value) {
  if (value === undefined) {
    return [];
  }
  assert(Array.isArray(value), "reasoning_signals must be an array");
  const result = [];
  for (const signal of value) {
    assert(typeof signal === "string" && REASONING_SIGNAL_SET.has(signal), `Unsupported reasoning signal: ${signal}`);
    if (!result.includes(signal)) {
      result.push(signal);
    }
  }
  return result.sort();
}

function classIndex(value) {
  return REASONING_CLASSES.indexOf(value);
}

function effortIndex(value) {
  return EFFORTS.indexOf(value);
}

function modelTierIndex(value) {
  return MODEL_TIERS.indexOf(value);
}

function maxClass(...values) {
  return values.filter(Boolean).reduce((current, value) => (
    classIndex(value) > classIndex(current) ? value : current
  ), "routine");
}

function maxEffort(...values) {
  return values.filter(Boolean).reduce((current, value) => (
    effortIndex(value) > effortIndex(current) ? value : current
  ), "medium");
}

function maxModelTier(...values) {
  return values.filter(Boolean).reduce((current, value) => (
    modelTierIndex(value) > modelTierIndex(current) ? value : current
  ), "mini");
}

function bumpClass(value) {
  if (value === "routine") return "deliberative";
  if (value === "deliberative") return "deep";
  return value;
}

function validateRolePolicy(value, label) {
  assert(isObject(value), `${label} must be an object`);
  assert(value.mode === "fixed" || value.mode === "adaptive", `${label}.mode must be fixed or adaptive`);
  assert(typeof value.strict === "boolean", `${label}.strict must be a boolean`);
  if (value.minimum_model_tier !== undefined) {
    ensureEnum(value.minimum_model_tier, MODEL_TIERS, `${label}.minimum_model_tier`);
  }
  if (value.required_model_tier !== undefined) {
    ensureEnum(value.required_model_tier, MODEL_TIERS, `${label}.required_model_tier`);
    if (value.minimum_model_tier !== undefined) {
      assert(
        modelTierIndex(value.required_model_tier) >= modelTierIndex(value.minimum_model_tier),
        `${label}.required_model_tier must not be below minimum_model_tier`
      );
    }
  }
  if (value.mode === "fixed") {
    ensureEnum(value.reasoning_class, REASONING_CLASSES, `${label}.reasoning_class`);
    return;
  }
  const floorClass = ensureEnum(value.floor_class, REASONING_CLASSES, `${label}.floor_class`);
  const targetClass = ensureEnum(value.target_class, REASONING_CLASSES, `${label}.target_class`);
  const ceilingClass = ensureEnum(value.ceiling_class, REASONING_CLASSES, `${label}.ceiling_class`);
  assert(classIndex(floorClass) <= classIndex(targetClass), `${label} floor_class must not exceed target_class`);
  assert(classIndex(targetClass) <= classIndex(ceilingClass), `${label} target_class must not exceed ceiling_class`);
}

function validatePolicy(policy) {
  assert(isObject(policy), "Reasoning policy must be an object");
  assertExactKeys(policy, POLICY_KEYS, "Reasoning policy");
  assert(policy.schema_version === "2.0", "Reasoning policy schema_version must be 2.0");
  assert(
    policy.policy_version === "2" && SAFE_POLICY_VERSION.test(policy.policy_version),
    "policy_version must be supported version 2"
  );
  assert(policy.default_mode === "adaptive", "default_mode must remain adaptive for policy version 2");
  assert(JSON.stringify(policy.task_intents) === JSON.stringify(TASK_INTENTS), "task_intents must use the canonical order");
  assert(isObject(policy.intent_baseline_classes), "intent_baseline_classes must be an object");
  assert(
    JSON.stringify(Object.keys(policy.intent_baseline_classes).sort()) === JSON.stringify([...TASK_INTENTS].sort()),
    "intent_baseline_classes must define every canonical task intent exactly once"
  );
  for (const intent of TASK_INTENTS) {
    const baseline = ensureEnum(
      policy.intent_baseline_classes[intent],
      REASONING_CLASSES,
      `intent_baseline_classes.${intent}`
    );
    assert(
      baseline === V2_INTENT_BASELINE_CLASSES[intent],
      `intent_baseline_classes.${intent} must remain ${V2_INTENT_BASELINE_CLASSES[intent]}`
    );
  }
  assert(JSON.stringify(policy.reasoning_classes) === JSON.stringify(REASONING_CLASSES), "reasoning_classes must use the canonical order");
  assert(isObject(policy.signal_minimum_classes), "signal_minimum_classes must be an object");
  assert(
    JSON.stringify(Object.keys(policy.signal_minimum_classes).sort()) === JSON.stringify([...REASONING_SIGNALS].sort()),
    "signal_minimum_classes must define every canonical reasoning signal exactly once"
  );
  for (const signal of REASONING_SIGNALS) {
    const minimumClass = ensureEnum(
      policy.signal_minimum_classes[signal],
      REASONING_CLASSES,
      `signal_minimum_classes.${signal}`
    );
    assert(
      classIndex(minimumClass) >= classIndex(V2_SIGNAL_MINIMUM_CLASSES[signal]),
      `signal_minimum_classes.${signal} must not be below version 2 floor ${V2_SIGNAL_MINIMUM_CLASSES[signal]}`
    );
    assert(
      signal === "formal_accept_reject" ? minimumClass === "assurance" : minimumClass !== "assurance",
      signal === "formal_accept_reject"
        ? "signal_minimum_classes.formal_accept_reject must remain assurance"
        : `signal_minimum_classes.${signal} cannot produce assurance`
    );
  }
  assert(JSON.stringify(policy.effort_order) === JSON.stringify(EFFORTS), "effort_order must use the canonical order");
  assert(JSON.stringify(policy.model_tier_order) === JSON.stringify(MODEL_TIERS), "model_tier_order must use the canonical order");
  ensureEnum(policy.global_floor, EFFORTS, "global_floor");
  assert(effortIndex(policy.global_floor) >= effortIndex("medium"), "global_floor must not be below medium");
  assert(isObject(policy.model_floors), "model_floors must be an object");
  assertExactKeys(policy.model_floors, [...MODEL_TIERS, "unknown"], "model_floors");
  for (const tier of [...MODEL_TIERS, "unknown"]) {
    const floor = ensureEnum(policy.model_floors[tier], EFFORTS, `model_floors.${tier}`);
    assert(
      effortIndex(floor) >= effortIndex(V2_MODEL_FLOOR_MINIMUMS[tier]),
      `model_floors.${tier} must not be below version 2 floor ${V2_MODEL_FLOOR_MINIMUMS[tier]}`
    );
  }
  ensureEnum(policy.highest_single_agent, EFFORTS, "highest_single_agent");
  assert(policy.highest_single_agent === "max", "highest_single_agent must remain max");
  assert(policy.allow_ultra === false, "allow_ultra must remain false");
  assert(isObject(policy.compatibility), "compatibility must be an object");
  assertExactKeys(policy.compatibility, ["allow_degraded_deep"], "compatibility");
  assert(
    policy.compatibility.allow_degraded_deep === false,
    "compatibility.allow_degraded_deep must default to false"
  );
  assert(isObject(policy.class_requirements), "class_requirements must be an object");
  assertExactKeys(policy.class_requirements, REASONING_CLASSES, "class_requirements");
  for (const reasoningClass of REASONING_CLASSES) {
    const requirement = policy.class_requirements[reasoningClass];
    const minimumRequirement = V2_CLASS_REQUIREMENT_MINIMUMS[reasoningClass];
    assert(isObject(requirement), `class_requirements.${reasoningClass} must be an object`);
    assertExactKeys(
      requirement,
      ["minimum_model_tier", "effort_by_model_tier"],
      `class_requirements.${reasoningClass}`
    );
    ensureEnum(requirement.minimum_model_tier, MODEL_TIERS, `class_requirements.${reasoningClass}.minimum_model_tier`);
    assert(
      modelTierIndex(requirement.minimum_model_tier) >= modelTierIndex(minimumRequirement.minimum_model_tier),
      `class_requirements.${reasoningClass}.minimum_model_tier must not be below version 2 floor ${minimumRequirement.minimum_model_tier}`
    );
    assert(isObject(requirement.effort_by_model_tier), `class_requirements.${reasoningClass}.effort_by_model_tier must be an object`);
    assertExactKeys(
      requirement.effort_by_model_tier,
      [...MODEL_TIERS, "unknown"],
      `class_requirements.${reasoningClass}.effort_by_model_tier`
    );
    for (const tier of [...MODEL_TIERS, "unknown"]) {
      const effort = requirement.effort_by_model_tier[tier];
      assert(
        EFFORTS.includes(effort) || effort === "highest_single_agent",
        `class_requirements.${reasoningClass}.effort_by_model_tier.${tier} is invalid`
      );
      const projectedEffort = effort === "highest_single_agent" ? policy.highest_single_agent : effort;
      assert(
        effortIndex(projectedEffort) >= effortIndex(minimumRequirement.effort_by_model_tier[tier]),
        `class_requirements.${reasoningClass}.effort_by_model_tier.${tier} must not be below version 2 floor ${minimumRequirement.effort_by_model_tier[tier]}`
      );
    }
  }
  validateRolePolicy(policy.default_role_policy, "default_role_policy");
  assert(isObject(policy.role_policies), "role_policies must be an object");
  for (const [role, rolePolicy] of Object.entries(policy.role_policies)) {
    assert(SAFE_REASONING_IDENTIFIER.test(role), `Invalid role policy identifier: ${role}`);
    validateRolePolicy(rolePolicy, `role_policies.${role}`);
  }
  for (const [reasoningClass, roles] of Object.entries(FIXED_ROLE_GROUPS)) {
    for (const role of roles) {
      const rolePolicy = policy.role_policies[role];
      assert(
        isObject(rolePolicy)
          && rolePolicy.mode === "fixed"
          && rolePolicy.reasoning_class === reasoningClass,
        `role_policies.${role} must remain fixed ${reasoningClass}`
      );
    }
  }
  assert(
    policy.role_policies["committee-security"].minimum_model_tier === "strong",
    "role_policies.committee-security must require minimum model tier strong"
  );
  for (const role of ["doc-writer", "executor", "generalist"]) {
    const rolePolicy = policy.role_policies[role];
    assert(
      rolePolicy.mode === "adaptive"
        && rolePolicy.floor_class === "routine"
        && rolePolicy.target_class === "deliberative"
        && rolePolicy.ceiling_class === "deep",
      `role_policies.${role} must remain adaptive routine/deliberative/deep`
    );
  }
  const uiUxDesigner = policy.role_policies["ui-ux-designer"];
  assert(
    uiUxDesigner.mode === "adaptive"
      && uiUxDesigner.floor_class === "deliberative"
      && uiUxDesigner.target_class === "deep"
      && uiUxDesigner.ceiling_class === "deep",
    "role_policies.ui-ux-designer must remain adaptive deliberative/deep/deep"
  );
  const reviewer = policy.role_policies.reviewer;
  assert(
    reviewer.mode === "adaptive"
      && reviewer.floor_class === "deliberative"
      && reviewer.target_class === "deep"
      && reviewer.ceiling_class === "assurance",
    "role_policies.reviewer must remain adaptive deliberative/deep/assurance"
  );
  assert(isObject(policy.dispatch_contexts), "dispatch_contexts must be an object");
  for (const [context, contextPolicy] of Object.entries(policy.dispatch_contexts)) {
    assert(SAFE_REASONING_IDENTIFIER.test(context), `Invalid dispatch context identifier: ${context}`);
    validateRolePolicy(contextPolicy, `dispatch_contexts.${context}`);
  }
  const defaultRole = policy.default_role_policy;
  assert(
    defaultRole.mode === "adaptive"
      && defaultRole.floor_class === "routine"
      && defaultRole.target_class === "deliberative"
      && defaultRole.ceiling_class === "deep",
    "default_role_policy must remain adaptive routine/deliberative/deep"
  );
  const adHocReview = policy.dispatch_contexts["ad-hoc-review"];
  assert(
    isObject(adHocReview)
      && adHocReview.mode === "adaptive"
      && adHocReview.floor_class === "deep"
      && adHocReview.strict === false,
    "dispatch_contexts.ad-hoc-review must keep a non-strict deep floor"
  );
  const pipelineReview = policy.dispatch_contexts["pipeline-review"];
  assert(
    isObject(pipelineReview)
      && pipelineReview.mode === "adaptive"
      && pipelineReview.floor_class === "deep"
      && pipelineReview.minimum_model_tier === "strong"
      && pipelineReview.strict === false,
    "dispatch_contexts.pipeline-review must keep a non-strict deep floor and strong model minimum"
  );
  const formalAssurance = policy.dispatch_contexts["formal-assurance"];
  assert(isObject(formalAssurance), "dispatch_contexts.formal-assurance is required");
  assert(
    formalAssurance.mode === "fixed"
      && formalAssurance.reasoning_class === "assurance"
      && formalAssurance.required_model_tier === "strong"
      && formalAssurance.strict === true,
    "dispatch_contexts.formal-assurance must remain fixed assurance with strong model tier and strict enforcement"
  );
  assertExactFlatObject(
    policy.default_role_policy,
    CANONICAL_DEFAULT_ROLE_POLICY,
    "default_role_policy must match the canonical version 2 snapshot"
  );
  assert(
    JSON.stringify(Object.keys(policy.role_policies).sort())
      === JSON.stringify(Object.keys(CANONICAL_ROLE_POLICIES).sort()),
    "role_policies must contain exactly the canonical managed role set"
  );
  for (const [role, expectedRolePolicy] of Object.entries(CANONICAL_ROLE_POLICIES)) {
    assertExactFlatObject(
      policy.role_policies[role],
      expectedRolePolicy,
      `role_policies.${role} must match the canonical version 2 snapshot`
    );
  }
  assert(
    JSON.stringify(Object.keys(policy.dispatch_contexts).sort())
      === JSON.stringify(Object.keys(CANONICAL_DISPATCH_CONTEXTS).sort()),
    "dispatch_contexts must contain exactly the canonical version 2 context set"
  );
  for (const [context, expectedContextPolicy] of Object.entries(CANONICAL_DISPATCH_CONTEXTS)) {
    assertExactFlatObject(
      policy.dispatch_contexts[context],
      expectedContextPolicy,
      `dispatch_contexts.${context} must match the canonical version 2 snapshot`
    );
  }
  return policy;
}

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  return validatePolicy(readJson(path.resolve(policyPath), "Reasoning policy"));
}

function normalizeInput(input, policy) {
  assert(isObject(input), "Resolver input must be an object");
  assert(
    typeof input.role === "string" && SAFE_REASONING_IDENTIFIER.test(input.role),
    "role must be a bounded lowercase reasoning identifier"
  );
  const mode = input.mode === undefined ? policy.default_mode : ensureEnum(input.mode, POLICY_MODES, "mode");
  const taskIntent = input.task_intent === undefined || input.task_intent === null
    ? null
    : ensureEnum(input.task_intent, TASK_INTENTS, "task_intent");
  const reasoningClass = input.reasoning_class === undefined
    ? undefined
    : ensureEnum(input.reasoning_class, REASONING_CLASSES, "reasoning_class");
  const explicitClass = input.explicit_reasoning_class === undefined
    ? undefined
    : ensureEnum(input.explicit_reasoning_class, REASONING_CLASSES, "explicit_reasoning_class");
  const explicitEffort = input.explicit_effort === undefined
    ? undefined
    : ensureEnum(input.explicit_effort, EFFORTS, "explicit_effort");
  if (input.model_tier !== undefined && input.selected_model_tier !== undefined) {
    assert(input.model_tier === input.selected_model_tier, "model_tier and selected_model_tier must match");
  }
  const modelTierInput = input.selected_model_tier === undefined
    ? input.model_tier
    : input.selected_model_tier;
  const modelTier = modelTierInput === undefined
    ? "unknown"
    : ensureEnum(modelTierInput, [...MODEL_TIERS, "unknown"], "selected_model_tier");
  if (input.dispatch_context !== undefined) {
    assert(
      typeof input.dispatch_context === "string" && policy.dispatch_contexts[input.dispatch_context],
      `Unknown dispatch_context: ${input.dispatch_context}`
    );
  }
  if (input.prior_reasoning_failure !== undefined) {
    assert(typeof input.prior_reasoning_failure === "boolean", "prior_reasoning_failure must be a boolean");
  }
  const priorFailureType = input.prior_failure_type === undefined
    ? (input.prior_reasoning_failure ? "reasoning_failure" : null)
    : ensureEnum(input.prior_failure_type, PRIOR_FAILURE_TYPES, "prior_failure_type");
  if (input.prior_reasoning_failure === true && priorFailureType !== "reasoning_failure") {
    throw new Error("prior_reasoning_failure=true conflicts with an operational prior_failure_type");
  }
  if (input.allow_degraded_deep !== undefined) {
    assert(typeof input.allow_degraded_deep === "boolean", "allow_degraded_deep must be a boolean");
  }
  if (input.selector_available !== undefined) {
    assert(typeof input.selector_available === "boolean", "selector_available must be a boolean");
  }
  let supportedEfforts;
  if (input.runtime_supported_efforts !== undefined) {
    assert(Array.isArray(input.runtime_supported_efforts), "runtime_supported_efforts must be an array");
    supportedEfforts = [...new Set(input.runtime_supported_efforts.filter((value) => EFFORTS.includes(value)))];
    assert(supportedEfforts.length > 0, "runtime_supported_efforts must include at least one supported non-ultra effort");
  }
  const observedEffectiveEffort = input.observed_effective_effort === undefined
    ? undefined
    : ensureEnum(input.observed_effective_effort, EFFORTS, "observed_effective_effort");
  const workspaceCeiling = input.workspace_ceiling === undefined
    ? "max"
    : ensureEnum(input.workspace_ceiling, EFFORTS, "workspace_ceiling");

  return {
    role: input.role,
    mode,
    taskIntent,
    reasoningClass,
    reasoningSignals: ensureReasoningSignals(input.reasoning_signals),
    explicitClass,
    explicitEffort,
    modelTier,
    dispatchContext: input.dispatch_context,
    priorFailureType,
    allowDegradedDeep: Boolean(input.allow_degraded_deep),
    selectorAvailable: input.selector_available,
    supportedEfforts,
    observedEffectiveEffort,
    workspaceCeiling
  };
}

function roleBounds(rolePolicy) {
  if (rolePolicy.mode === "fixed") {
    return {
      floor: rolePolicy.reasoning_class,
      target: rolePolicy.reasoning_class,
      ceiling: rolePolicy.reasoning_class
    };
  }
  return {
    floor: rolePolicy.floor_class,
    target: rolePolicy.target_class,
    ceiling: rolePolicy.ceiling_class
  };
}

function rolePolicySnapshot(rolePolicy) {
  const result = { mode: rolePolicy.mode };
  if (rolePolicy.mode === "fixed") {
    result.reasoning_class = rolePolicy.reasoning_class;
  } else {
    result.floor_class = rolePolicy.floor_class;
    result.target_class = rolePolicy.target_class;
    result.ceiling_class = rolePolicy.ceiling_class;
  }
  if (rolePolicy.minimum_model_tier !== undefined) {
    result.minimum_model_tier = rolePolicy.minimum_model_tier;
  }
  if (rolePolicy.required_model_tier !== undefined) {
    result.required_model_tier = rolePolicy.required_model_tier;
  }
  result.strict = rolePolicy.strict;
  return result;
}

function explicitOverrideSnapshot(input) {
  if (!input.explicitClass && !input.explicitEffort) return null;
  const result = {};
  if (input.explicitClass) result.reasoning_class = input.explicitClass;
  if (input.explicitEffort) result.effort = input.explicitEffort;
  return result;
}

function selectedTierMeetsRequirement(selected, required, reasoningClass) {
  if (selected === "unknown") {
    return required === "mini" && (reasoningClass === "routine" || reasoningClass === "deliberative");
  }
  return modelTierIndex(selected) >= modelTierIndex(required);
}

function resolveSupportedEffort(requested, supported, minimumFloor, maximumCeiling, exact) {
  if (!supported || supported.includes(requested)) {
    return { effort: requested, degraded: false, conflict: undefined };
  }
  const candidates = supported
    .filter((effort) => (
      effortIndex(effort) >= effortIndex(minimumFloor)
      && effortIndex(effort) <= effortIndex(maximumCeiling)
    ))
    .sort((left, right) => effortIndex(right) - effortIndex(left));
  if (!candidates.length) {
    return {
      effort: undefined,
      degraded: false,
      conflict: `Runtime does not support an effort between required floor ${minimumFloor} and ceiling ${maximumCeiling}`
    };
  }
  const fallback = candidates.find((effort) => effortIndex(effort) <= effortIndex(requested)) || candidates[0];
  if (exact && fallback !== requested) {
    return {
      effort: undefined,
      degraded: false,
      conflict: `Exact policy requires ${requested}, but runtime supports: ${supported.join(", ")}`
    };
  }
  return { effort: fallback, degraded: fallback !== requested, conflict: undefined };
}

function makeConflictDecision(base, conflictReason, reasons) {
  return {
    ...base,
    dispatch_effort: null,
    effective_effort: base.mode === "adaptive" && base.selector_available === false
      ? null
      : base.effective_effort,
    enforcement_status: "conflict",
    degraded: false,
    degradation_reason: null,
    reasons: [...new Set(reasons)].sort(),
    conflict: "conflict",
    conflict_reason: conflictReason
  };
}

function resolveReasoning(rawInput, policy = loadPolicy()) {
  validatePolicy(policy);
  const input = normalizeInput(rawInput, policy);
  const rolePolicy = policy.role_policies[input.role] || policy.default_role_policy;
  const role = roleBounds(rolePolicy);
  const contextPolicy = input.dispatchContext ? policy.dispatch_contexts[input.dispatchContext] : undefined;
  const context = contextPolicy ? roleBounds(contextPolicy) : undefined;
  const intentBaselineClass = input.taskIntent
    ? policy.intent_baseline_classes[input.taskIntent]
    : null;
  const classificationSource = input.taskIntent
    ? "task_intent"
    : (input.reasoningClass ? "legacy_explicit_class" : "legacy_role_target");
  assert(CLASSIFICATION_SOURCES.includes(classificationSource), "Unsupported classification source");
  const base = {
    schema_version: "2.0",
    policy_version: policy.policy_version,
    mode: input.mode,
    role: input.role,
    task_intent: input.taskIntent,
    intent_baseline_class: intentBaselineClass,
    classification_source: classificationSource,
    role_policy: rolePolicySnapshot(rolePolicy),
    dispatch_context: input.dispatchContext || null,
    requested_class: input.reasoningClass || null,
    reasoning_class: null,
    effective_class: null,
    reasoning_signals: input.reasoningSignals,
    model_tier: input.modelTier,
    selected_model_tier: input.modelTier,
    minimum_model_tier: null,
    requires_model_escalation: false,
    requested_effort: null,
    dispatch_effort: null,
    effective_effort: input.observedEffectiveEffort || null,
    selector_available: input.selectorAvailable === undefined ? null : input.selectorAvailable,
    capability_source: input.supportedEfforts || input.selectorAvailable !== undefined ? "runtime" : "policy",
    enforcement_status: input.mode === "inherit" ? "inherited" : "shadow",
    strict: false,
    degraded: false,
    degradation_reason: null,
    recovery_boost: false,
    explicit_override: explicitOverrideSnapshot(input),
    reasons: [],
    conflict: null,
    conflict_reason: null
  };

  let strict = Boolean(rolePolicy.strict || contextPolicy?.strict);
  const reasons = [`role:${input.role}`, `role_mode:${rolePolicy.mode}`];
  if (contextPolicy) {
    reasons.push(`context:${input.dispatchContext}`);
  }

  let effectiveClass = intentBaselineClass || input.reasoningClass || role.target;
  if (intentBaselineClass) {
    reasons.push(`intent:${input.taskIntent}`, `intent_baseline:${intentBaselineClass}`);
  } else if (input.reasoningClass) {
    reasons.push("legacy_explicit_class");
  } else {
    reasons.push("legacy_role_target");
  }
  if (input.reasoningClass) {
    effectiveClass = maxClass(effectiveClass, input.reasoningClass);
  }
  const signalFloor = minimumReasoningClassForSignals(
    input.reasoningSignals,
    input.taskIntent
      ? policy.signal_minimum_classes
      : LEGACY_SIGNAL_MINIMUM_CLASSES
  );
  if (classIndex(signalFloor) > classIndex(effectiveClass)) {
    reasons.push(`signal_floor:${signalFloor}`);
  }
  effectiveClass = maxClass(effectiveClass, signalFloor);
  effectiveClass = maxClass(effectiveClass, role.floor);

  if (contextPolicy) {
    effectiveClass = maxClass(effectiveClass, context.floor);
  }
  let recoveryBoost = false;
  if (input.priorFailureType === "reasoning_failure") {
    const priorClass = effectiveClass;
    effectiveClass = bumpClass(effectiveClass);
    recoveryBoost = priorClass === "deep";
    reasons.push("prior_reasoning_failure");
  } else if (input.priorFailureType) {
    assert(OPERATIONAL_FAILURE_TYPES.includes(input.priorFailureType), "Unsupported operational failure type");
    reasons.push(`operational_failure:${input.priorFailureType}`);
  }
  if (input.explicitClass) {
    effectiveClass = maxClass(effectiveClass, input.explicitClass);
    reasons.push("explicit_class");
  }
  recoveryBoost = recoveryBoost && effectiveClass === "deep";
  if (recoveryBoost) reasons.push("recovery_boost");
  if (effectiveClass === "assurance") {
    strict = true;
  }

  const assuranceAuthorized = input.taskIntent === "certify"
    || input.dispatchContext === "formal-assurance"
    || input.reasoningClass === "assurance"
    || input.explicitClass === "assurance"
    || input.reasoningSignals.includes("formal_accept_reject");
  if (effectiveClass === "assurance" && !assuranceAuthorized) {
    return makeConflictDecision(
      { ...base, reasoning_class: effectiveClass, effective_class: effectiveClass, strict, recovery_boost: recoveryBoost },
      "Assurance requires certify intent, formal-assurance context, or an explicit formal assurance request",
      reasons
    );
  }
  if (classIndex(effectiveClass) > classIndex(role.ceiling)) {
    return makeConflictDecision(
      { ...base, reasoning_class: effectiveClass, effective_class: effectiveClass, strict, recovery_boost: recoveryBoost },
      `Required class ${effectiveClass} exceeds role ceiling ${role.ceiling}`,
      reasons
    );
  }
  if (context && classIndex(effectiveClass) > classIndex(context.ceiling)) {
    return makeConflictDecision(
      { ...base, reasoning_class: effectiveClass, effective_class: effectiveClass, strict, recovery_boost: recoveryBoost },
      `Required class ${effectiveClass} exceeds dispatch context ceiling ${context.ceiling}`,
      reasons
    );
  }

  const requirement = policy.class_requirements[effectiveClass];
  const minimumModelTier = maxModelTier(
    requirement.minimum_model_tier,
    rolePolicy.minimum_model_tier,
    rolePolicy.required_model_tier,
    contextPolicy?.minimum_model_tier,
    contextPolicy?.required_model_tier
  );
  const modelSufficient = selectedTierMeetsRequirement(
    input.modelTier,
    minimumModelTier,
    effectiveClass
  );
  const requiresModelEscalation = !modelSufficient;
  const canRunDegradedDeep = requiresModelEscalation
    && effectiveClass === "deep"
    && minimumModelTier === "standard"
    && input.allowDegradedDeep
    && input.mode !== "inherit";
  if (requiresModelEscalation) {
    reasons.push(`model_escalation:${minimumModelTier}`);
    if (!canRunDegradedDeep) {
      return makeConflictDecision(
        {
          ...base,
          reasoning_class: effectiveClass,
          effective_class: effectiveClass,
          minimum_model_tier: minimumModelTier,
          requires_model_escalation: true,
          strict,
          recovery_boost: recoveryBoost
        },
        `Capability conflict: ${effectiveClass} work requires model tier ${minimumModelTier}, selected tier is ${input.modelTier}`,
        reasons
      );
    }
    reasons.push("degraded_deep_compatibility");
  }

  if (
    input.mode === "inherit"
    && input.observedEffectiveEffort
    && effortIndex(input.observedEffectiveEffort) > effortIndex(input.workspaceCeiling)
  ) {
    return makeConflictDecision(
      {
        ...base,
        reasoning_class: effectiveClass,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        strict,
        recovery_boost: recoveryBoost
      },
      `Observed effort ${input.observedEffectiveEffort} exceeds workspace ceiling ${input.workspaceCeiling}`,
      [...reasons, `observed_effort:${input.observedEffectiveEffort}`, "observed_effort_above_workspace_ceiling"]
    );
  }

  if (input.mode === "inherit") {
    if (strict || input.explicitEffort) {
      return makeConflictDecision(
        {
          ...base,
          reasoning_class: effectiveClass,
          effective_class: effectiveClass,
          minimum_model_tier: minimumModelTier,
          requires_model_escalation: requiresModelEscalation,
          strict,
          recovery_boost: recoveryBoost
        },
        strict
          ? `Strict reasoning policy cannot run in inherit mode${input.dispatchContext ? ` for context ${input.dispatchContext}` : ""}`
          : `Exact effort ${input.explicitEffort} cannot run in inherit mode`,
        reasons
      );
    }
    return {
      ...base,
      reasoning_class: effectiveClass,
      effective_class: effectiveClass,
      minimum_model_tier: minimumModelTier,
      requires_model_escalation: false,
      strict,
      recovery_boost: recoveryBoost,
      enforcement_status: "inherited",
      reasons: [...new Set(reasons)].sort()
    };
  }

  let requestedEffort = requirement.effort_by_model_tier[input.modelTier];
  if (canRunDegradedDeep || recoveryBoost) {
    requestedEffort = policy.highest_single_agent;
  }
  if (requestedEffort === "highest_single_agent") {
    requestedEffort = policy.highest_single_agent;
    reasons.push("highest_single_agent");
  }
  if (input.explicitEffort) {
    requestedEffort = maxEffort(requestedEffort, input.explicitEffort);
    reasons.push("explicit_effort");
  }

  const minimumFloor = maxEffort(policy.global_floor, policy.model_floors[input.modelTier]);
  requestedEffort = maxEffort(requestedEffort, minimumFloor);
  const resolvedBase = {
    ...base,
    reasoning_class: effectiveClass,
    effective_class: effectiveClass,
    minimum_model_tier: minimumModelTier,
    requires_model_escalation: requiresModelEscalation,
    requested_effort: requestedEffort,
    strict,
    recovery_boost: recoveryBoost,
    degraded: canRunDegradedDeep,
    degradation_reason: canRunDegradedDeep ? "model_tier_below_deep_requirement" : null
  };
  if (effortIndex(input.workspaceCeiling) < effortIndex(minimumFloor)) {
    return makeConflictDecision(
      resolvedBase,
      `Workspace ceiling ${input.workspaceCeiling} is below required floor ${minimumFloor}`,
      reasons
    );
  }
  if (effortIndex(requestedEffort) > effortIndex(input.workspaceCeiling)) {
    return makeConflictDecision(
      resolvedBase,
      `Required effort ${requestedEffort} exceeds workspace ceiling ${input.workspaceCeiling}`,
      reasons
    );
  }
  if (
    input.observedEffectiveEffort
    && effortIndex(input.observedEffectiveEffort) > effortIndex(input.workspaceCeiling)
  ) {
    return makeConflictDecision(
      resolvedBase,
      `Observed effort ${input.observedEffectiveEffort} exceeds workspace ceiling ${input.workspaceCeiling}`,
      [...reasons, `observed_effort:${input.observedEffectiveEffort}`, "observed_effort_above_workspace_ceiling"]
    );
  }

  const supported = resolveSupportedEffort(
    requestedEffort,
    input.supportedEfforts,
    minimumFloor,
    input.workspaceCeiling,
    strict || Boolean(input.explicitEffort) || canRunDegradedDeep
  );
  if (supported.conflict) {
    return makeConflictDecision(
      resolvedBase,
      supported.conflict,
      reasons
    );
  }

  if (
    input.observedEffectiveEffort
    && input.observedEffectiveEffort !== supported.effort
    && (strict || input.explicitEffort || canRunDegradedDeep)
  ) {
    return makeConflictDecision(
      resolvedBase,
      `Observed effort ${input.observedEffectiveEffort} does not satisfy ${strict ? "strict" : "exact"} requested effort ${supported.effort}`,
      [...reasons, `observed_effort:${input.observedEffectiveEffort}`]
    );
  }

  if (input.mode === "shadow" && strict) {
    return makeConflictDecision(
      resolvedBase,
      "Shadow mode cannot satisfy strict reasoning policy",
      reasons
    );
  }

  if (input.mode === "adaptive" && input.selectorAvailable === false) {
    if (strict || input.explicitEffort || canRunDegradedDeep) {
      return makeConflictDecision(
        resolvedBase,
        `Required effort ${requestedEffort} cannot be enforced without a per-spawn reasoning selector`,
        [...reasons, "selector_unavailable"]
      );
    }
    return {
      ...resolvedBase,
      dispatch_effort: null,
      effective_effort: null,
      enforcement_status: "degraded",
      degraded: true,
      degradation_reason: resolvedBase.degradation_reason || "selector_unavailable",
      reasons: [...new Set([...reasons, "selector_unavailable"])].sort(),
      conflict: null,
      conflict_reason: null
    };
  }

  let enforcementStatus = input.mode === "shadow" ? "shadow" : "requested";
  let degradationReason = resolvedBase.degradation_reason;
  if (input.mode === "adaptive" && (requiresModelEscalation || supported.degraded)) {
    enforcementStatus = "degraded";
    if (!degradationReason && supported.degraded) {
      degradationReason = "runtime_effort_unavailable";
    }
  }
  if (
    input.mode === "adaptive"
    && input.observedEffectiveEffort
    && effortIndex(input.observedEffectiveEffort) < effortIndex(supported.effort)
  ) {
    return makeConflictDecision(
      resolvedBase,
      `Observed effort ${input.observedEffectiveEffort} is below dispatched effort ${supported.effort}`,
      [...reasons, `observed_effort:${input.observedEffectiveEffort}`, "observed_effort_below_dispatch"]
    );
  }
  if (input.mode === "adaptive" && input.observedEffectiveEffort) {
    if (input.observedEffectiveEffort !== supported.effort) {
      reasons.push(`observed_effort:${input.observedEffectiveEffort}`);
      degradationReason = "effective_effort_mismatch";
      enforcementStatus = "degraded";
    } else if (degradationReason) {
      enforcementStatus = "degraded";
    } else {
      enforcementStatus = "enforced";
    }
  }
  const degraded = Boolean(degradationReason);
  if (degradationReason) {
    assert(DEGRADATION_REASONS.includes(degradationReason), "Unsupported degradation reason");
  }

  return {
    ...resolvedBase,
    dispatch_effort: input.mode === "adaptive" ? supported.effort : null,
    effective_effort: input.observedEffectiveEffort || null,
    enforcement_status: enforcementStatus,
    degraded,
    degradation_reason: degradationReason,
    reasons: [...new Set(reasons)].sort(),
    conflict: null,
    conflict_reason: null
  };
}

function parseArgs(argv) {
  const args = { compact: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input-json") {
      args.inputJson = argv[++index];
    } else if (value === "--input-file") {
      args.inputFile = argv[++index];
    } else if (value === "--policy") {
      args.policyPath = argv[++index];
    } else if (value === "--compact") {
      args.compact = true;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  assert(!(args.inputJson && args.inputFile), "Use only one of --input-json or --input-file");
  return args;
}

function usage() {
  return [
    "Usage: node tools/reasoning-policy.js (--input-json <json> | --input-file <path>) [options]",
    "",
    "Options:",
    "  --policy <path>   Override the default protocols/reasoning-policy.json",
    "  --compact         Emit compact JSON",
    "  -h, --help        Show this help"
  ].join("\n");
}

function runCli(argv = process.argv.slice(2), streams = process) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      streams.stdout.write(`${usage()}\n`);
      return EXIT_CODES.ok;
    }
    assert(args.inputJson || args.inputFile, "One of --input-json or --input-file is required");
    const input = args.inputJson
      ? JSON.parse(args.inputJson)
      : readJson(path.resolve(args.inputFile), "Resolver input");
    const policy = loadPolicy(args.policyPath || DEFAULT_POLICY_PATH);
    const decision = resolveReasoning(input, policy);
    streams.stdout.write(`${JSON.stringify(decision, null, args.compact ? 0 : 2)}\n`);
    return decision.conflict ? EXIT_CODES.conflict : EXIT_CODES.ok;
  } catch (error) {
    streams.stderr.write(`reasoning-policy: ${error.message}\n`);
    return EXIT_CODES.invalid;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  CLASSIFICATION_SOURCES,
  DEFAULT_POLICY_PATH,
  DEGRADATION_REASONS,
  EFFORTS,
  EXIT_CODES,
  MODEL_TIERS,
  POLICY_MODES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  TASK_INTENTS,
  loadPolicy,
  parseArgs,
  resolveReasoning,
  runCli,
  validatePolicy
};
