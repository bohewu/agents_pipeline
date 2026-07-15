"use strict";

const REASONING_CLASSES = Object.freeze(["routine", "deliberative", "deep", "assurance"]);
const EFFORTS = Object.freeze(["medium", "high", "xhigh", "max"]);
const MODEL_TIERS = Object.freeze(["mini", "standard", "strong"]);
const POLICY_MODES = Object.freeze(["inherit", "shadow", "adaptive"]);
const REASONING_SIGNALS = Object.freeze([
  "fully_specified",
  "local_scope",
  "multi_step",
  "cross_module",
  "cross_system",
  "ambiguous_root_cause",
  "architecture_tradeoff",
  "non_local_invariant",
  "adversarial_input",
  "numerical_sensitivity",
  "security_boundary",
  "data_integrity",
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
const V1_SIGNAL_MINIMUM_CLASSES = Object.freeze({
  fully_specified: "routine",
  local_scope: "routine",
  multi_step: "deliberative",
  cross_module: "deliberative",
  cross_system: "deep",
  ambiguous_root_cause: "deep",
  architecture_tradeoff: "deep",
  non_local_invariant: "deep",
  adversarial_input: "deep",
  numerical_sensitivity: "deep",
  security_boundary: "deep",
  data_integrity: "deep",
  formal_accept_reject: "assurance",
  prior_reasoning_failure: "routine",
  explicit_user_override: "routine"
});
const V1_MODEL_FLOOR_MINIMUMS = Object.freeze({
  mini: "high",
  standard: "medium",
  strong: "medium",
  unknown: "high"
});
const V1_CLASS_REQUIREMENT_MINIMUMS = Object.freeze({
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
  EFFORTS,
  ENFORCEMENT_STATUSES,
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
};
