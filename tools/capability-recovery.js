#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  MODEL_TIERS,
  PRIOR_FAILURE_TYPES,
  SAFE_POLICY_VERSION,
  SAFE_REASONING_IDENTIFIER
} = require("./reasoning-vocabulary");

const DEFAULT_POLICY_PATH = path.resolve(
  __dirname,
  "..",
  "protocols",
  "capability-recovery-policy.json"
);
const MODES = Object.freeze(["off", "shadow", "auto"]);
const STATUSES = Object.freeze([
  "not-requested",
  "off",
  "shadow",
  "requested",
  "verified",
  "conflict"
]);

const EXIT_CODES = Object.freeze({
  ok: 0,
  invalid: 2,
  conflict: 3
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function ensureOptionalBoolean(value, label) {
  if (value === undefined) return false;
  assert(typeof value === "boolean", `${label} must be a boolean`);
  return value;
}

function validatePolicy(policy) {
  assert(isObject(policy), "Capability recovery policy must be an object");
  const expectedKeys = [
    "schema_version",
    "policy_version",
    "default_mode",
    "modes",
    "eligible_roles",
    "max_model_uplifts_per_task"
  ];
  assert(
    JSON.stringify(Object.keys(policy).sort()) === JSON.stringify(expectedKeys.sort()),
    "Capability recovery policy must contain exactly the supported keys"
  );
  assert(policy.schema_version === "1.0", "Capability recovery policy schema_version must be 1.0");
  assert(
    policy.policy_version === "1" && SAFE_POLICY_VERSION.test(policy.policy_version),
    "Capability recovery policy_version must be supported version 1"
  );
  assert(policy.default_mode === "off", "Capability recovery must default to off");
  assert(JSON.stringify(policy.modes) === JSON.stringify(MODES), "Capability recovery modes must be off, shadow, auto");
  assert(
    JSON.stringify(policy.eligible_roles) === JSON.stringify(["executor", "generalist"]),
    "Capability recovery eligible roles must be executor and generalist"
  );
  assert(
    policy.max_model_uplifts_per_task === 1,
    "Capability recovery must allow exactly one model uplift per task"
  );
  return policy;
}

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  return validatePolicy(readJson(path.resolve(policyPath), "Capability recovery policy"));
}

function normalizeInput(input, policy) {
  assert(isObject(input), "Resolver input must be an object");
  assert(
    typeof input.role === "string" && SAFE_REASONING_IDENTIFIER.test(input.role),
    "role must be a bounded lowercase reasoning identifier"
  );
  const mode = input.mode === undefined
    ? policy.default_mode
    : ensureEnum(input.mode, MODES, "mode");
  const failureType = input.prior_failure_type === undefined
    ? null
    : ensureEnum(input.prior_failure_type, PRIOR_FAILURE_TYPES, "prior_failure_type");
  const selectedModelTier = input.selected_model_tier === undefined
    ? "unknown"
    : ensureEnum(input.selected_model_tier, [...MODEL_TIERS, "unknown"], "selected_model_tier");
  const recoveryCeilingModelTier = input.recovery_ceiling_model_tier === undefined
    || input.recovery_ceiling_model_tier === null
    ? null
    : ensureEnum(
      input.recovery_ceiling_model_tier,
      MODEL_TIERS,
      "recovery_ceiling_model_tier"
    );
  const observedEffectiveModelTier = input.observed_effective_model_tier === undefined
    || input.observed_effective_model_tier === null
    ? null
    : ensureEnum(
      input.observed_effective_model_tier,
      MODEL_TIERS,
      "observed_effective_model_tier"
    );
  if (
    input.model_selector_available !== undefined
    && input.model_selector_available !== null
  ) {
    assert(
      typeof input.model_selector_available === "boolean",
      "model_selector_available must be a boolean"
    );
  }
  if (input.model_matches !== undefined && input.model_matches !== null) {
    assert(typeof input.model_matches === "boolean", "model_matches must be a boolean");
  }
  return {
    role: input.role,
    mode,
    requested: ensureOptionalBoolean(input.requested, "requested"),
    failureType,
    sameFailure: ensureOptionalBoolean(input.same_failure, "same_failure"),
    materialFailure: ensureOptionalBoolean(input.material_failure, "material_failure"),
    noMeaningfulProgress: ensureOptionalBoolean(
      input.no_meaningful_progress,
      "no_meaningful_progress"
    ),
    recoveryUsed: ensureOptionalBoolean(input.recovery_used, "recovery_used"),
    selectedModelTier,
    recoveryCeilingModelTier,
    observedEffectiveModelTier,
    modelMatches: input.model_matches === undefined ? null : input.model_matches,
    modelSelectorAvailable: input.model_selector_available === undefined
      || input.model_selector_available === null
      ? null
      : input.model_selector_available
  };
}

function nextTier(selected, ceiling) {
  const selectedIndex = MODEL_TIERS.indexOf(selected);
  const ceilingIndex = MODEL_TIERS.indexOf(ceiling);
  if (selectedIndex < 0 || ceilingIndex <= selectedIndex) return null;
  return MODEL_TIERS[Math.min(selectedIndex + 1, ceilingIndex)];
}

function baseDecision(input, policy) {
  return {
    schema_version: "1.0",
    policy_version: policy.policy_version,
    mode: input.mode,
    role: input.role,
    requested: input.requested,
    eligible: false,
    failure_type: input.failureType,
    same_failure: input.sameFailure,
    material_failure: input.materialFailure,
    no_meaningful_progress: input.noMeaningfulProgress,
    recovery_used: input.recoveryUsed,
    selected_model_tier: input.selectedModelTier,
    recovery_ceiling_model_tier: input.recoveryCeilingModelTier,
    requested_model_tier: null,
    dispatch_model_tier: null,
    effective_model_tier: input.observedEffectiveModelTier,
    model_matches: input.modelMatches,
    model_selector_available: input.modelSelectorAvailable,
    status: "not-requested",
    reason: "not_requested",
    conflict: null,
    conflict_reason: null
  };
}

function conflict(base, reason, message, extra = {}) {
  return {
    ...base,
    ...extra,
    eligible: false,
    dispatch_model_tier: null,
    status: "conflict",
    reason,
    conflict: "conflict",
    conflict_reason: message
  };
}

function resolveCapabilityRecovery(rawInput, policy = loadPolicy()) {
  validatePolicy(policy);
  const input = normalizeInput(rawInput, policy);
  const base = baseDecision(input, policy);
  if (!input.requested) return base;
  if (input.mode === "off") {
    return {
      ...base,
      status: "off",
      reason: "disabled"
    };
  }
  if (!policy.eligible_roles.includes(input.role)) {
    return conflict(
      base,
      "role_not_eligible",
      `Role ${input.role} is not eligible for model capability recovery`
    );
  }
  if (input.failureType !== "reasoning_failure") {
    return conflict(
      base,
      "failure_not_reasoning",
      "Model capability recovery requires a concrete reasoning failure"
    );
  }
  if (!input.sameFailure) {
    return conflict(
      base,
      "failure_not_repeated",
      "Model capability recovery requires the same concrete failure to repeat"
    );
  }
  if (!input.materialFailure) {
    return conflict(
      base,
      "failure_not_material",
      "Model capability recovery requires a material failure"
    );
  }
  if (!input.noMeaningfulProgress) {
    return conflict(
      base,
      "meaningful_progress_present",
      "Model capability recovery requires evidence that the prior retry made no meaningful progress"
    );
  }
  if (input.recoveryUsed) {
    return conflict(
      base,
      "recovery_already_used",
      "The task has already consumed its single model capability recovery"
    );
  }
  if (input.selectedModelTier === "unknown") {
    return conflict(
      base,
      "tier_unknown",
      "The selected child model tier must be proven before capability recovery"
    );
  }
  if (!input.recoveryCeilingModelTier) {
    return conflict(
      base,
      "ceiling_missing",
      "The active workspace profile did not provide a recovery ceiling for this role"
    );
  }
  const requestedModelTier = nextTier(
    input.selectedModelTier,
    input.recoveryCeilingModelTier
  );
  if (!requestedModelTier) {
    return conflict(
      base,
      "no_higher_tier_available",
      `No higher model tier is available between selected tier ${input.selectedModelTier} and recovery ceiling ${input.recoveryCeilingModelTier}`
    );
  }
  const eligible = {
    ...base,
    eligible: true,
    requested_model_tier: requestedModelTier,
    effective_model_tier: null,
    reason: "eligible"
  };
  if (input.mode === "shadow") {
    return {
      ...eligible,
      status: "shadow"
    };
  }
  if (input.modelSelectorAvailable !== true) {
    return conflict(
      eligible,
      "model_selector_unavailable",
      "Automatic model capability recovery requires a native per-spawn model selector"
    );
  }
  const requested = {
    ...eligible,
    dispatch_model_tier: requestedModelTier,
    status: "requested",
    reason: "awaiting_trace"
  };
  if (input.modelMatches === null) return requested;
  if (!input.modelMatches) {
    return conflict(
      requested,
      "effective_model_mismatch",
      "The child trace did not match the profile-approved recovery model"
    );
  }
  if (!input.observedEffectiveModelTier) {
    return conflict(
      requested,
      "effective_model_tier_missing",
      "A matching child trace must identify the profile-approved recovery tier"
    );
  }
  if (input.observedEffectiveModelTier !== requestedModelTier) {
    return conflict(
      requested,
      "effective_model_tier_mismatch",
      `Observed model tier ${input.observedEffectiveModelTier} does not match requested recovery tier ${requestedModelTier}`,
      { effective_model_tier: input.observedEffectiveModelTier }
    );
  }
  return {
    ...requested,
    effective_model_tier: input.observedEffectiveModelTier,
    status: "verified",
    reason: "verified"
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
    "Usage: node tools/capability-recovery.js (--input-json <json> | --input-file <path>) [options]",
    "",
    "Options:",
    "  --policy <path>   Override the default capability recovery policy",
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
    const decision = resolveCapabilityRecovery(input, policy);
    streams.stdout.write(`${JSON.stringify(decision, null, args.compact ? 0 : 2)}\n`);
    return decision.conflict ? EXIT_CODES.conflict : EXIT_CODES.ok;
  } catch (error) {
    streams.stderr.write(`capability-recovery: ${error.message}\n`);
    return EXIT_CODES.invalid;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_POLICY_PATH,
  EXIT_CODES,
  MODES,
  STATUSES,
  loadPolicy,
  resolveCapabilityRecovery,
  runCli,
  validatePolicy
};
