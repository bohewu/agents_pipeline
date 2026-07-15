#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  EFFORTS,
  MODEL_TIERS,
  POLICY_MODES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  SAFE_POLICY_VERSION,
  SAFE_REASONING_IDENTIFIER,
  V1_CLASS_REQUIREMENT_MINIMUMS,
  V1_MODEL_FLOOR_MINIMUMS,
  V1_SIGNAL_MINIMUM_CLASSES,
  minimumReasoningClassForSignals
} = require("./reasoning-vocabulary");

const DEFAULT_POLICY_PATH = path.resolve(__dirname, "..", "protocols", "reasoning-policy.json");
const REASONING_SIGNAL_SET = new Set(REASONING_SIGNALS);

const EXIT_CODES = {
  ok: 0,
  invalid: 2,
  conflict: 3
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  return REASONING_CLASSES[Math.min(classIndex(value) + 1, REASONING_CLASSES.length - 1)];
}

function validateRolePolicy(value, label) {
  assert(isObject(value), `${label} must be an object`);
  assert(value.mode === "fixed" || value.mode === "adaptive", `${label}.mode must be fixed or adaptive`);
  assert(typeof value.strict === "boolean", `${label}.strict must be a boolean`);
  if (value.minimum_model_tier !== undefined) {
    ensureEnum(value.minimum_model_tier, MODEL_TIERS, `${label}.minimum_model_tier`);
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
  assert(policy.schema_version === "1.0", "Reasoning policy schema_version must be 1.0");
  assert(
    policy.policy_version === "1" && SAFE_POLICY_VERSION.test(policy.policy_version),
    "policy_version must be supported version 1"
  );
  assert(policy.default_mode === "adaptive", "default_mode must remain adaptive for policy version 1");
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
      classIndex(minimumClass) >= classIndex(V1_SIGNAL_MINIMUM_CLASSES[signal]),
      `signal_minimum_classes.${signal} must not be below version 1 floor ${V1_SIGNAL_MINIMUM_CLASSES[signal]}`
    );
  }
  assert(JSON.stringify(policy.effort_order) === JSON.stringify(EFFORTS), "effort_order must use the canonical order");
  assert(JSON.stringify(policy.model_tier_order) === JSON.stringify(MODEL_TIERS), "model_tier_order must use the canonical order");
  ensureEnum(policy.global_floor, EFFORTS, "global_floor");
  assert(effortIndex(policy.global_floor) >= effortIndex("medium"), "global_floor must not be below medium");
  assert(isObject(policy.model_floors), "model_floors must be an object");
  for (const tier of [...MODEL_TIERS, "unknown"]) {
    const floor = ensureEnum(policy.model_floors[tier], EFFORTS, `model_floors.${tier}`);
    assert(
      effortIndex(floor) >= effortIndex(V1_MODEL_FLOOR_MINIMUMS[tier]),
      `model_floors.${tier} must not be below version 1 floor ${V1_MODEL_FLOOR_MINIMUMS[tier]}`
    );
  }
  ensureEnum(policy.highest_single_agent, EFFORTS, "highest_single_agent");
  assert(policy.highest_single_agent === "max", "highest_single_agent must remain max");
  assert(policy.allow_ultra === false, "allow_ultra must remain false");
  assert(isObject(policy.class_requirements), "class_requirements must be an object");
  for (const reasoningClass of REASONING_CLASSES) {
    const requirement = policy.class_requirements[reasoningClass];
    const minimumRequirement = V1_CLASS_REQUIREMENT_MINIMUMS[reasoningClass];
    assert(isObject(requirement), `class_requirements.${reasoningClass} must be an object`);
    ensureEnum(requirement.minimum_model_tier, MODEL_TIERS, `class_requirements.${reasoningClass}.minimum_model_tier`);
    assert(
      modelTierIndex(requirement.minimum_model_tier) >= modelTierIndex(minimumRequirement.minimum_model_tier),
      `class_requirements.${reasoningClass}.minimum_model_tier must not be below version 1 floor ${minimumRequirement.minimum_model_tier}`
    );
    assert(isObject(requirement.effort_by_model_tier), `class_requirements.${reasoningClass}.effort_by_model_tier must be an object`);
    for (const tier of [...MODEL_TIERS, "unknown"]) {
      const effort = requirement.effort_by_model_tier[tier];
      assert(
        EFFORTS.includes(effort) || effort === "highest_single_agent",
        `class_requirements.${reasoningClass}.effort_by_model_tier.${tier} is invalid`
      );
      const projectedEffort = effort === "highest_single_agent" ? policy.highest_single_agent : effort;
      assert(
        effortIndex(projectedEffort) >= effortIndex(minimumRequirement.effort_by_model_tier[tier]),
        `class_requirements.${reasoningClass}.effort_by_model_tier.${tier} must not be below version 1 floor ${minimumRequirement.effort_by_model_tier[tier]}`
      );
    }
  }
  validateRolePolicy(policy.default_role_policy, "default_role_policy");
  assert(isObject(policy.role_policies), "role_policies must be an object");
  for (const [role, rolePolicy] of Object.entries(policy.role_policies)) {
    assert(SAFE_REASONING_IDENTIFIER.test(role), `Invalid role policy identifier: ${role}`);
    validateRolePolicy(rolePolicy, `role_policies.${role}`);
  }
  assert(isObject(policy.dispatch_contexts), "dispatch_contexts must be an object");
  for (const [context, contextPolicy] of Object.entries(policy.dispatch_contexts)) {
    assert(SAFE_REASONING_IDENTIFIER.test(context), `Invalid dispatch context identifier: ${context}`);
    validateRolePolicy(contextPolicy, `dispatch_contexts.${context}`);
  }
  const formalAssurance = policy.dispatch_contexts["formal-assurance"];
  assert(isObject(formalAssurance), "dispatch_contexts.formal-assurance is required");
  assert(
    formalAssurance.mode === "fixed"
      && formalAssurance.reasoning_class === "assurance"
      && formalAssurance.minimum_model_tier === "strong"
      && formalAssurance.strict === true,
    "dispatch_contexts.formal-assurance must remain fixed assurance with strong model tier and strict enforcement"
  );
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
  const reasoningClass = input.reasoning_class === undefined
    ? undefined
    : ensureEnum(input.reasoning_class, REASONING_CLASSES, "reasoning_class");
  const explicitClass = input.explicit_reasoning_class === undefined
    ? undefined
    : ensureEnum(input.explicit_reasoning_class, REASONING_CLASSES, "explicit_reasoning_class");
  const explicitEffort = input.explicit_effort === undefined
    ? undefined
    : ensureEnum(input.explicit_effort, EFFORTS, "explicit_effort");
  const modelTier = input.model_tier === undefined
    ? "unknown"
    : ensureEnum(input.model_tier, [...MODEL_TIERS, "unknown"], "model_tier");
  if (input.dispatch_context !== undefined) {
    assert(
      typeof input.dispatch_context === "string" && policy.dispatch_contexts[input.dispatch_context],
      `Unknown dispatch_context: ${input.dispatch_context}`
    );
  }
  if (input.prior_reasoning_failure !== undefined) {
    assert(typeof input.prior_reasoning_failure === "boolean", "prior_reasoning_failure must be a boolean");
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
    reasoningClass,
    reasoningSignals: ensureReasoningSignals(input.reasoning_signals),
    explicitClass,
    explicitEffort,
    modelTier,
    dispatchContext: input.dispatch_context,
    priorReasoningFailure: Boolean(input.prior_reasoning_failure),
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

function resolveSupportedEffort(requested, supported, minimumFloor, maximumCeiling, strict) {
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
  if (strict && effortIndex(fallback) < effortIndex(requested)) {
    return {
      effort: undefined,
      degraded: false,
      conflict: `Strict policy requires ${requested}, but runtime supports: ${supported.join(", ")}`
    };
  }
  return { effort: fallback, degraded: fallback !== requested, conflict: undefined };
}

function makeConflictDecision(base, conflict, reasons) {
  return {
    ...base,
    dispatch_effort: null,
    enforcement_status: "conflict",
    reasons: [...new Set(reasons)].sort(),
    conflict
  };
}

function resolveReasoning(rawInput, policy = loadPolicy()) {
  validatePolicy(policy);
  const input = normalizeInput(rawInput, policy);
  const base = {
    schema_version: "1.0",
    policy_version: policy.policy_version,
    mode: input.mode,
    role: input.role,
    dispatch_context: input.dispatchContext || null,
    requested_class: input.reasoningClass || null,
    effective_class: null,
    reasoning_signals: input.reasoningSignals,
    model_tier: input.modelTier,
    minimum_model_tier: null,
    requires_model_escalation: false,
    requested_effort: null,
    dispatch_effort: null,
    effective_effort: input.observedEffectiveEffort || null,
    capability_source: input.supportedEfforts || input.selectorAvailable !== undefined ? "runtime" : "policy",
    enforcement_status: input.mode === "inherit" ? "inherited" : "shadow",
    strict: false,
    reasons: [],
    conflict: null
  };

  const rolePolicy = policy.role_policies[input.role] || policy.default_role_policy;
  const role = roleBounds(rolePolicy);
  const contextPolicy = input.dispatchContext ? policy.dispatch_contexts[input.dispatchContext] : undefined;
  const context = contextPolicy ? roleBounds(contextPolicy) : undefined;
  const strict = Boolean(rolePolicy.strict || contextPolicy?.strict);
  const reasons = [`role:${input.role}`, `role_mode:${rolePolicy.mode}`];
  if (contextPolicy) {
    reasons.push(`context:${input.dispatchContext}`);
  }

  if (input.mode === "inherit") {
    if (strict) {
      return makeConflictDecision(
        { ...base, strict },
        `Strict reasoning policy cannot run in inherit mode${input.dispatchContext ? ` for context ${input.dispatchContext}` : ""}`,
        reasons
      );
    }
    if (input.explicitEffort) {
      if (input.selectorAvailable === false) {
        return makeConflictDecision(
          { ...base, requested_effort: input.explicitEffort },
          `Explicit effort ${input.explicitEffort} requires a per-spawn reasoning selector`,
          ["explicit_effort", "selector_unavailable"]
        );
      }
      const minimumFloor = maxEffort(policy.global_floor, policy.model_floors[input.modelTier]);
      if (effortIndex(input.explicitEffort) > effortIndex(input.workspaceCeiling)) {
        return makeConflictDecision(
          { ...base, requested_effort: input.explicitEffort },
          `Explicit effort ${input.explicitEffort} exceeds workspace ceiling ${input.workspaceCeiling}`,
          ["explicit_effort"]
        );
      }
      const supported = resolveSupportedEffort(
        input.explicitEffort,
        input.supportedEfforts,
        minimumFloor,
        input.workspaceCeiling,
        true
      );
      if (supported.conflict) {
        return makeConflictDecision(
          { ...base, requested_effort: input.explicitEffort },
          supported.conflict,
          ["explicit_effort"]
        );
      }
      if (
        input.observedEffectiveEffort
        && input.observedEffectiveEffort !== supported.effort
      ) {
        return makeConflictDecision(
          { ...base, requested_effort: input.explicitEffort },
          `Observed effort ${input.observedEffectiveEffort} does not match exact requested effort ${supported.effort}`,
          ["explicit_effort", `observed_effort:${input.observedEffectiveEffort}`]
        );
      }
      return {
        ...base,
        requested_effort: input.explicitEffort,
        dispatch_effort: supported.effort,
        enforcement_status: input.observedEffectiveEffort
          ? (input.observedEffectiveEffort === supported.effort ? "enforced" : "degraded")
          : "requested",
        reasons: ["explicit_effort"]
      };
    }
    return base;
  }

  let effectiveClass = input.reasoningClass || role.target;
  const signalFloor = minimumReasoningClassForSignals(
    input.reasoningSignals,
    policy.signal_minimum_classes
  );
  if (classIndex(signalFloor) > classIndex(effectiveClass)) {
    reasons.push(`signal_floor:${signalFloor}`);
  }
  effectiveClass = maxClass(effectiveClass, signalFloor);
  effectiveClass = maxClass(effectiveClass, role.floor);
  let ceilingClass = role.ceiling;

  if (contextPolicy) {
    effectiveClass = maxClass(effectiveClass, context.target, context.floor);
    if (rolePolicy.mode === "adaptive") {
      ceilingClass = maxClass(ceilingClass, context.ceiling);
    }
  }
  if (input.explicitClass) {
    effectiveClass = maxClass(effectiveClass, input.explicitClass);
    reasons.push("explicit_class");
  }
  if (input.priorReasoningFailure) {
    effectiveClass = bumpClass(effectiveClass);
    reasons.push("prior_reasoning_failure");
  }
  if (classIndex(effectiveClass) > classIndex(ceilingClass)) {
    return makeConflictDecision(
      { ...base, effective_class: effectiveClass, strict },
      `Required class ${effectiveClass} exceeds role/context ceiling ${ceilingClass}`,
      reasons
    );
  }

  const requirement = policy.class_requirements[effectiveClass];
  const minimumModelTier = maxModelTier(
    requirement.minimum_model_tier,
    rolePolicy.minimum_model_tier,
    contextPolicy?.minimum_model_tier
  );
  const tierKnown = input.modelTier !== "unknown";
  const modelSufficient = tierKnown
    ? modelTierIndex(input.modelTier) >= modelTierIndex(minimumModelTier)
    : minimumModelTier === "mini";
  const requiresModelEscalation = !modelSufficient;
  if (requiresModelEscalation) {
    reasons.push(`model_escalation:${minimumModelTier}`);
    if (strict) {
      return makeConflictDecision(
        {
          ...base,
          effective_class: effectiveClass,
          minimum_model_tier: minimumModelTier,
          requires_model_escalation: true,
          strict
        },
        `Strict ${effectiveClass} work requires model tier ${minimumModelTier}, selected tier is ${input.modelTier}`,
        reasons
      );
    }
  }

  let requestedEffort = requirement.effort_by_model_tier[input.modelTier];
  if (requestedEffort === "highest_single_agent") {
    const supported = input.supportedEfforts || EFFORTS;
    requestedEffort = supported
      .filter((effort) => effortIndex(effort) <= effortIndex(policy.highest_single_agent))
      .sort((left, right) => effortIndex(right) - effortIndex(left))[0];
    assert(requestedEffort, "No supported highest_single_agent effort is available");
    reasons.push("highest_single_agent");
  }
  if (input.explicitEffort) {
    requestedEffort = maxEffort(requestedEffort, input.explicitEffort);
    reasons.push("explicit_effort");
  }

  const minimumFloor = maxEffort(policy.global_floor, policy.model_floors[input.modelTier]);
  requestedEffort = maxEffort(requestedEffort, minimumFloor);
  if (effortIndex(input.workspaceCeiling) < effortIndex(minimumFloor)) {
    return makeConflictDecision(
      {
        ...base,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        requested_effort: requestedEffort,
        strict
      },
      `Workspace ceiling ${input.workspaceCeiling} is below required floor ${minimumFloor}`,
      reasons
    );
  }
  if (effortIndex(requestedEffort) > effortIndex(input.workspaceCeiling)) {
    return makeConflictDecision(
      {
        ...base,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        requested_effort: requestedEffort,
        strict
      },
      `Required effort ${requestedEffort} exceeds workspace ceiling ${input.workspaceCeiling}`,
      reasons
    );
  }

  const supported = resolveSupportedEffort(
    requestedEffort,
    input.supportedEfforts,
    minimumFloor,
    input.workspaceCeiling,
    strict || Boolean(input.explicitEffort)
  );
  if (supported.conflict) {
    return makeConflictDecision(
      {
        ...base,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        requested_effort: requestedEffort,
        strict
      },
      supported.conflict,
      reasons
    );
  }

  if (input.mode === "shadow" && (strict || input.explicitEffort)) {
    return makeConflictDecision(
      {
        ...base,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        requested_effort: requestedEffort,
        strict
      },
      `Shadow mode cannot satisfy ${strict ? "strict reasoning policy" : `exact effort ${requestedEffort}`}`,
      reasons
    );
  }

  if (input.mode === "adaptive" && input.selectorAvailable === false) {
    if (strict || input.explicitEffort) {
      return makeConflictDecision(
        {
          ...base,
          effective_class: effectiveClass,
          minimum_model_tier: minimumModelTier,
          requires_model_escalation: requiresModelEscalation,
          requested_effort: requestedEffort,
          strict
        },
        `Required effort ${requestedEffort} cannot be enforced without a per-spawn reasoning selector`,
        [...reasons, "selector_unavailable"]
      );
    }
    return {
      ...base,
      effective_class: effectiveClass,
      minimum_model_tier: minimumModelTier,
      requires_model_escalation: requiresModelEscalation,
      requested_effort: requestedEffort,
      dispatch_effort: null,
      enforcement_status: "degraded",
      strict,
      reasons: [...new Set([...reasons, "selector_unavailable"])].sort(),
      conflict: null
    };
  }

  let enforcementStatus = input.mode === "shadow" ? "shadow" : "requested";
  if (input.mode === "adaptive" && (requiresModelEscalation || supported.degraded)) {
    enforcementStatus = "degraded";
  }
  if (
    input.mode === "adaptive"
    && input.observedEffectiveEffort
    && input.observedEffectiveEffort !== supported.effort
    && (strict || input.explicitEffort)
  ) {
    return makeConflictDecision(
      {
        ...base,
        effective_class: effectiveClass,
        minimum_model_tier: minimumModelTier,
        requires_model_escalation: requiresModelEscalation,
        requested_effort: requestedEffort,
        strict
      },
      `Observed effort ${input.observedEffectiveEffort} does not satisfy ${strict ? "strict" : "exact"} requested effort ${supported.effort}`,
      [...reasons, `observed_effort:${input.observedEffectiveEffort}`]
    );
  }
  if (input.mode === "adaptive" && input.observedEffectiveEffort) {
    enforcementStatus = input.observedEffectiveEffort === supported.effort
      ? "enforced"
      : "degraded";
    if (input.observedEffectiveEffort !== supported.effort) {
      reasons.push(`observed_effort:${input.observedEffectiveEffort}`);
    }
  }

  return {
    ...base,
    effective_class: effectiveClass,
    minimum_model_tier: minimumModelTier,
    requires_model_escalation: requiresModelEscalation,
    requested_effort: requestedEffort,
    dispatch_effort: input.mode === "adaptive" ? supported.effort : null,
    effective_effort: input.observedEffectiveEffort || null,
    enforcement_status: enforcementStatus,
    strict,
    reasons: [...new Set(reasons)].sort(),
    conflict: null
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
  DEFAULT_POLICY_PATH,
  EFFORTS,
  EXIT_CODES,
  MODEL_TIERS,
  POLICY_MODES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  loadPolicy,
  parseArgs,
  resolveReasoning,
  runCli,
  validatePolicy
};
