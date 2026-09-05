"use strict";

const REASONING_CLASSES = Object.freeze(["routine", "deliberative", "deep", "assurance"]);
const TASK_INTENTS = Object.freeze(["execute", "inspect", "diagnose", "design", "review", "certify"]);
// Version 2 decisions deliberately retain their original vocabulary. Versioned
// projections opt into the broader v3 vocabulary through V3_EFFORTS instead
// of making `low` silently valid for old snapshots.
const EFFORTS = Object.freeze(["medium", "high", "xhigh", "max"]);
const V3_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const MODEL_TIERS = Object.freeze(["mini", "standard", "strong"]);
const POLICY_MODES = Object.freeze(["inherit", "shadow", "adaptive"]);
const CLASSIFICATION_SOURCES = Object.freeze([
  "task_intent",
  "legacy_explicit_class",
  "legacy_role_target"
]);
const PRIOR_FAILURE_TYPES = Object.freeze([
  "reasoning_failure",
  "timeout",
  "permission_denied",
  "network_error",
  "dependency_unavailable",
  "browser_startup_failure",
  "cli_format_error",
  "tool_failure"
]);
const OPERATIONAL_FAILURE_TYPES = Object.freeze(PRIOR_FAILURE_TYPES.filter(
  (value) => value !== "reasoning_failure"
));
const DEGRADATION_REASONS = Object.freeze([
  "model_tier_below_deep_requirement",
  "runtime_effort_unavailable",
  "selector_unavailable",
  "effective_effort_mismatch"
]);
const REASONING_SIGNALS = Object.freeze([
  "fully_specified",
  "local_scope",
  "multi_step",
  "multi_file",
  "bounded_tradeoff",
  "ordinary_diagnosis",
  "implementation_choice",
  "partial_ambiguity",
  "cross_module",
  "cross_system",
  "ambiguous_root_cause",
  "architectural_tradeoff",
  "architecture_tradeoff",
  "non_local_invariant",
  "adversarial_input",
  "numerical_sensitivity",
  "security_boundary",
  "data_integrity",
  "concurrency_or_ordering",
  "migration_compatibility",
  "formal_accept_reject",
  "prior_reasoning_failure",
  "explicit_user_override"
]);
const CAPABILITY_SOURCES = Object.freeze(["policy", "runtime"]);
const ENFORCEMENT_STATUSES = Object.freeze([
  "inherited",
  "shadow",
  "requested",
  "enforced",
  "degraded",
  "conflict"
]);
const SAFE_REASONING_IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const V2_INTENT_BASELINE_CLASSES = Object.freeze({
  execute: "routine",
  inspect: "routine",
  diagnose: "deliberative",
  design: "deliberative",
  review: "deliberative",
  certify: "assurance"
});
const V2_SIGNAL_MINIMUM_CLASSES = Object.freeze({
  fully_specified: "routine",
  local_scope: "routine",
  multi_step: "deliberative",
  multi_file: "deliberative",
  bounded_tradeoff: "deliberative",
  ordinary_diagnosis: "deliberative",
  implementation_choice: "deliberative",
  partial_ambiguity: "deliberative",
  cross_module: "deep",
  cross_system: "deep",
  ambiguous_root_cause: "deep",
  architectural_tradeoff: "deep",
  architecture_tradeoff: "deep",
  non_local_invariant: "deep",
  adversarial_input: "deep",
  numerical_sensitivity: "deep",
  security_boundary: "deep",
  data_integrity: "deep",
  concurrency_or_ordering: "deep",
  migration_compatibility: "deep",
  formal_accept_reject: "assurance",
  prior_reasoning_failure: "routine",
  explicit_user_override: "routine"
});
const LEGACY_SIGNAL_MINIMUM_CLASSES = Object.freeze({
  ...V2_SIGNAL_MINIMUM_CLASSES,
  cross_module: "deliberative"
});
const V2_MODEL_FLOOR_MINIMUMS = Object.freeze({
  mini: "high",
  standard: "medium",
  strong: "medium",
  unknown: "high"
});
const V2_CLASS_REQUIREMENT_MINIMUMS = Object.freeze({
  routine: Object.freeze({
    minimum_model_tier: "mini",
    effort_by_model_tier: Object.freeze({
      mini: "high",
      standard: "medium",
      strong: "medium",
      unknown: "high"
    })
  }),
  deliberative: Object.freeze({
    minimum_model_tier: "mini",
    effort_by_model_tier: Object.freeze({
      mini: "xhigh",
      standard: "high",
      strong: "high",
      unknown: "xhigh"
    })
  }),
  deep: Object.freeze({
    minimum_model_tier: "standard",
    effort_by_model_tier: Object.freeze({
      mini: "max",
      standard: "xhigh",
      strong: "xhigh",
      unknown: "max"
    })
  }),
  assurance: Object.freeze({
    minimum_model_tier: "strong",
    effort_by_model_tier: Object.freeze({
      mini: "max",
      standard: "max",
      strong: "max",
      unknown: "max"
    })
  })
});

function minimumReasoningClassForSignals(signals, signalMinimumClasses) {
  let minimumClass = "routine";
  for (const signal of signals) {
    const candidate = signalMinimumClasses[signal];
    if (REASONING_CLASSES.indexOf(candidate) > REASONING_CLASSES.indexOf(minimumClass)) {
      minimumClass = candidate;
    }
  }
  return minimumClass;
}

module.exports = {
  CAPABILITY_SOURCES,
  CLASSIFICATION_SOURCES,
  DEGRADATION_REASONS,
  EFFORTS,
  V3_EFFORTS,
  ENFORCEMENT_STATUSES,
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
};
