const {
  AGENT_KEY_ORDER,
  AGENT_STATUSES,
  CHECKPOINT_KEY_ORDER,
  CLEANUP_STATUSES,
  ORCHESTRATORS,
  PROTOCOL_VERSION,
  REASONING_DECISION_KEY_ORDER,
  REASONING_OBSERVATION_DECISION_KEY_ORDER,
  REASONING_OBSERVATION_KEY_ORDER,
  RESOURCE_CLASSES,
  RESOURCE_STATUSES,
  RUN_KEY_ORDER,
  RUN_STATUSES,
  STAGE_STATUSES,
  TASK_COUNT_ORDER,
  TASK_KEY_ORDER,
  TASK_STATUSES,
  WAITING_ON
} = require("./constants");
const {
  CAPABILITY_SOURCES,
  CLASSIFICATION_SOURCES,
  DEGRADATION_REASONS,
  EFFORTS,
  ENFORCEMENT_STATUSES,
  LEGACY_SIGNAL_MINIMUM_CLASSES,
  MODEL_TIERS,
  POLICY_MODES,
  PRIOR_FAILURE_TYPES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  SAFE_POLICY_VERSION,
  SAFE_REASONING_IDENTIFIER,
  TASK_INTENTS,
  minimumReasoningClassForSignals
} = require("../reasoning-vocabulary");
const REASONING_POLICY = require("../../protocols/reasoning-policy.json");
const {
  assert,
  ensureEnum,
  ensureInteger,
  ensureSafeStatusId,
  ensureString,
  isIsoDateTime,
  orderedObject,
  sortObjectKeys,
  uniqueStrings
} = require("./utils");

function canonicalizeCompletedStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return undefined;
  }
  return stages
    .map((entry) => {
      assert(entry && typeof entry === "object", "completed stage entry must be an object");
      const stage = ensureInteger(entry.stage, "completed_stages[].stage");
      const name = ensureString(entry.name, "completed_stages[].name");
      const status = ensureEnum(entry.status, STAGE_STATUSES, "completed_stages[].status");
      const timestamp = ensureString(entry.timestamp, "completed_stages[].timestamp");
      assert(isIsoDateTime(timestamp), "completed_stages[].timestamp must be an ISO date-time");

      const result = { stage, name, status };
      if (entry.artifact_key !== undefined) {
        result.artifact_key = ensureString(entry.artifact_key, "completed_stages[].artifact_key");
      }
      result.timestamp = timestamp;
      return result;
    })
    .sort((a, b) => a.stage - b.stage);
}

function canonicalizeTaskCounts(taskCounts) {
  const source = taskCounts || {};
  const result = {};
  for (const key of TASK_COUNT_ORDER) {
    const value = source[key] === undefined ? 0 : source[key];
    result[key] = ensureInteger(value, `task_counts.${key}`, 0);
  }
  return result;
}

function canonicalizeTaskRefs(taskRefs) {
  if (!Array.isArray(taskRefs) || taskRefs.length === 0) {
    return undefined;
  }
  return taskRefs
    .map((entry) => ({
      task_id: ensureSafeStatusId(entry.task_id, "task_refs[].task_id"),
      path: ensureString(entry.path, "task_refs[].path")
    }))
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
}

function canonicalizeAgentRefs(agentRefs) {
  if (!Array.isArray(agentRefs) || agentRefs.length === 0) {
    return undefined;
  }
  return agentRefs
    .map((entry) => ({
      agent_id: ensureSafeStatusId(entry.agent_id, "agent_refs[].agent_id"),
      path: ensureString(entry.path, "agent_refs[].path")
    }))
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));
}

function canonicalizeReasoningSignals(signals, label = "reasoning_signals", allowEmpty = false) {
  assert(Array.isArray(signals), `${label} must be an array`);
  for (const signal of signals) {
    ensureEnum(signal, REASONING_SIGNALS, `${label}[]`);
  }
  const result = uniqueStrings(signals) || [];
  assert(allowEmpty || result.length > 0, `${label} must contain at least one signal`);
  return result;
}

function signalMinimumClassesForIntent(taskIntent) {
  return taskIntent
    ? REASONING_POLICY.signal_minimum_classes
    : LEGACY_SIGNAL_MINIMUM_CLASSES;
}

function canonicalizeRolePolicy(rolePolicy) {
  assert(rolePolicy && typeof rolePolicy === "object" && !Array.isArray(rolePolicy), "reasoning.role_policy must be an object");
  const allowed = new Set([
    "mode",
    "reasoning_class",
    "floor_class",
    "target_class",
    "ceiling_class",
    "minimum_model_tier",
    "required_model_tier",
    "strict"
  ]);
  assert(Object.keys(rolePolicy).every((key) => allowed.has(key)), "reasoning.role_policy contains an unsupported field");
  const result = {
    mode: ensureEnum(rolePolicy.mode, ["fixed", "adaptive"], "reasoning.role_policy.mode")
  };
  if (result.mode === "fixed") {
    result.reasoning_class = ensureEnum(rolePolicy.reasoning_class, REASONING_CLASSES, "reasoning.role_policy.reasoning_class");
    assert(
      rolePolicy.floor_class === undefined
        && rolePolicy.target_class === undefined
        && rolePolicy.ceiling_class === undefined,
      "fixed reasoning.role_policy cannot include adaptive class bounds"
    );
  } else {
    assert(rolePolicy.reasoning_class === undefined, "adaptive reasoning.role_policy cannot include reasoning_class");
    result.floor_class = ensureEnum(rolePolicy.floor_class, REASONING_CLASSES, "reasoning.role_policy.floor_class");
    result.target_class = ensureEnum(rolePolicy.target_class, REASONING_CLASSES, "reasoning.role_policy.target_class");
    result.ceiling_class = ensureEnum(rolePolicy.ceiling_class, REASONING_CLASSES, "reasoning.role_policy.ceiling_class");
    assert(
      REASONING_CLASSES.indexOf(result.floor_class) <= REASONING_CLASSES.indexOf(result.target_class),
      "reasoning.role_policy.floor_class must not exceed target_class"
    );
    assert(
      REASONING_CLASSES.indexOf(result.target_class) <= REASONING_CLASSES.indexOf(result.ceiling_class),
      "reasoning.role_policy.target_class must not exceed ceiling_class"
    );
  }
  if (rolePolicy.minimum_model_tier !== undefined) {
    result.minimum_model_tier = ensureEnum(rolePolicy.minimum_model_tier, MODEL_TIERS, "reasoning.role_policy.minimum_model_tier");
  }
  if (rolePolicy.required_model_tier !== undefined) {
    result.required_model_tier = ensureEnum(rolePolicy.required_model_tier, MODEL_TIERS, "reasoning.role_policy.required_model_tier");
  }
  if (result.minimum_model_tier !== undefined && result.required_model_tier !== undefined) {
    assert(
      MODEL_TIERS.indexOf(result.required_model_tier) >= MODEL_TIERS.indexOf(result.minimum_model_tier),
      "reasoning.role_policy.required_model_tier must not be below minimum_model_tier"
    );
  }
  assert(typeof rolePolicy.strict === "boolean", "reasoning.role_policy.strict must be a boolean");
  result.strict = rolePolicy.strict;
  return result;
}

function canonicalizeExplicitOverride(explicitOverride) {
  if (explicitOverride === null) return null;
  assert(
    explicitOverride && typeof explicitOverride === "object" && !Array.isArray(explicitOverride),
    "reasoning.explicit_override must be an object or null"
  );
  const keys = Object.keys(explicitOverride);
  assert(keys.length > 0 && keys.every((key) => key === "reasoning_class" || key === "effort"), "reasoning.explicit_override contains an unsupported field");
  const result = {};
  if (explicitOverride.reasoning_class !== undefined) {
    result.reasoning_class = ensureEnum(explicitOverride.reasoning_class, REASONING_CLASSES, "reasoning.explicit_override.reasoning_class");
  }
  if (explicitOverride.effort !== undefined) {
    result.effort = ensureEnum(explicitOverride.effort, EFFORTS, "reasoning.explicit_override.effort");
  }
  return result;
}

function selectedTierMeetsMinimum(selectedTier, minimumTier, reasoningClass) {
  if (selectedTier === "unknown") {
    return minimumTier === "mini" && (reasoningClass === "routine" || reasoningClass === "deliberative");
  }
  return MODEL_TIERS.indexOf(selectedTier) >= MODEL_TIERS.indexOf(minimumTier);
}

function effortIndex(effort) {
  return EFFORTS.indexOf(effort);
}

function modelTierIndex(modelTier) {
  return MODEL_TIERS.indexOf(modelTier);
}

function strongerModelTier(...tiers) {
  return tiers.filter(Boolean).reduce((current, tier) => (
    modelTierIndex(tier) > modelTierIndex(current) ? tier : current
  ), "mini");
}

function requiredModelTierForDecision(result) {
  const classRequirement = REASONING_POLICY.class_requirements[result.reasoning_class];
  const contextPolicy = result.dispatch_context === null
    ? null
    : REASONING_POLICY.dispatch_contexts[result.dispatch_context];
  return strongerModelTier(
    classRequirement.minimum_model_tier,
    result.role_policy.minimum_model_tier,
    result.role_policy.required_model_tier,
    contextPolicy?.minimum_model_tier,
    contextPolicy?.required_model_tier
  );
}

function requiredRequestedEffort(result) {
  const classRequirement = REASONING_POLICY.class_requirements[result.reasoning_class];
  const projection = classRequirement.effort_by_model_tier[result.selected_model_tier];
  const classEffort = projection === "highest_single_agent"
    ? REASONING_POLICY.highest_single_agent
    : projection;
  const modelFloor = REASONING_POLICY.model_floors[result.selected_model_tier];
  return [classEffort, REASONING_POLICY.global_floor, modelFloor]
    .reduce((current, effort) => (
      effortIndex(effort) > effortIndex(current) ? effort : current
    ), "medium");
}

function validateV2ReasoningState(result) {
  const conflict = result.enforcement_status === "conflict";

  for (const [label, requestedClass] of [
    ["requested_class", result.requested_class],
    ["explicit_override.reasoning_class", result.explicit_override?.reasoning_class]
  ]) {
    if (requestedClass !== null && requestedClass !== undefined) {
      assert(
        REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(requestedClass),
        `reasoning.reasoning_class must not be below ${label}`
      );
    }
  }

  if (result.reasoning_class === "assurance") {
    assert(result.strict === true, "assurance reasoning must be strict");
    assert(
      result.task_intent === "certify"
        || result.dispatch_context === "formal-assurance"
        || result.requested_class === "assurance"
        || result.explicit_override?.reasoning_class === "assurance"
        || result.reasoning_signals.includes("formal_accept_reject"),
      "assurance reasoning requires explicit formal assurance semantics"
    );
  }

  if (result.mode === "inherit") {
    assert(result.requested_effort === null, "inherit reasoning must not request effort");
    assert(result.dispatch_effort === null, "inherit reasoning must not dispatch effort");
    assert(
      result.enforcement_status === "inherited" || conflict,
      "inherit reasoning status must be inherited or conflict"
    );
  } else if (result.mode === "shadow") {
    assert(result.dispatch_effort === null, "shadow reasoning must not dispatch effort");
    assert(
      result.enforcement_status === "shadow" || conflict,
      "shadow reasoning status must be shadow or conflict"
    );
    if (!conflict) {
      assert(result.requested_effort !== null, "shadow reasoning must compute requested effort");
    }
  } else {
    assert(
      ["requested", "enforced", "degraded", "conflict"].includes(result.enforcement_status),
      "adaptive reasoning has an invalid enforcement status"
    );
    if (result.enforcement_status === "requested") {
      assert(result.requested_effort !== null, "requested adaptive reasoning requires requested effort");
      assert(result.dispatch_effort !== null, "requested adaptive reasoning requires dispatch effort");
      assert(result.requested_effort === result.dispatch_effort, "requested reasoning effort must match dispatch effort");
      assert(result.effective_effort === null, "requested adaptive reasoning cannot claim effective effort");
      assert(result.degraded === false, "requested reasoning cannot be degraded");
    } else if (result.enforcement_status === "enforced") {
      assert(result.requested_effort !== null, "enforced reasoning requires requested effort");
      assert(result.dispatch_effort !== null, "enforced reasoning requires dispatch effort");
      assert(result.effective_effort !== null, "enforced reasoning requires effective effort evidence");
      assert(result.requested_effort === result.dispatch_effort, "enforced requested effort must match dispatch effort");
      assert(result.effective_effort === result.dispatch_effort, "enforced reasoning effort must match dispatch effort");
      assert(result.degraded === false, "enforced reasoning cannot be degraded");
    } else if (result.enforcement_status === "degraded") {
      assert(result.requested_effort !== null, "degraded reasoning requires requested effort");
      assert(result.degraded === true, "degraded reasoning status requires degraded metadata");
      assert(result.degradation_reason !== null, "degraded reasoning status requires a degradation reason");
      assert(result.strict === false, "strict reasoning cannot produce a degraded result");
    } else {
      assert(result.dispatch_effort === null, "conflicting reasoning must not dispatch effort");
    }
  }

  if (result.mode === "adaptive" && result.selector_available === false) {
    assert(result.dispatch_effort === null, "unavailable selector cannot dispatch effort");
    assert(result.effective_effort === null, "unavailable selector cannot report effective effort");
    if (!conflict) {
      assert(result.enforcement_status === "degraded", "unavailable selector requires degraded adaptive status");
      assert(result.degraded === true, "unavailable selector requires degraded metadata");
      assert(result.degradation_reason === "selector_unavailable", "unavailable selector requires selector degradation reason");
      assert(result.strict === false, "strict reasoning cannot run without a selector");
    }
  }

  const contextPolicy = result.dispatch_context === null
    ? null
    : REASONING_POLICY.dispatch_contexts[result.dispatch_context];
  if (contextPolicy?.mode === "fixed") {
    assert(
      result.reasoning_class === contextPolicy.reasoning_class,
      "reasoning class must match fixed dispatch context"
    );
    assert(result.strict === contextPolicy.strict, "reasoning strictness must match fixed dispatch context");
  } else if (contextPolicy) {
    assert(
      REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(contextPolicy.floor_class),
      "reasoning class is below dispatch context floor"
    );
    assert(
      REASONING_CLASSES.indexOf(result.reasoning_class) <= REASONING_CLASSES.indexOf(contextPolicy.ceiling_class),
      "reasoning class exceeds dispatch context ceiling"
    );
    if (result.reasoning_class !== "assurance") {
      assert(result.strict === contextPolicy.strict, "reasoning strictness must match adaptive dispatch context");
    }
  }

  if (result.recovery_boost) {
    assert(result.reasoning_class === "deep", "recovery boost is available only for deep reasoning");
    if (result.requested_effort !== null) {
      assert(result.requested_effort === "max", "deep recovery boost must request max effort");
    }
  }

  if (result.explicit_override?.effort) {
    if (result.requested_effort !== null) {
      assert(
        effortIndex(result.requested_effort) >= effortIndex(result.explicit_override.effort),
        "reasoning.requested_effort must not be below explicit_override.effort"
      );
    }
    if (result.mode === "inherit") {
      assert(conflict, "exact effort override cannot run in inherit mode");
    }
    if (!conflict && result.effective_effort !== null) {
      assert(result.effective_effort === result.requested_effort, "exact effort override must observe requested effort");
    }
    if (result.mode === "adaptive" && !conflict) {
      assert(result.selector_available !== false, "exact effort override requires an available selector");
      assert(
        result.degradation_reason === null
          || result.degradation_reason === "model_tier_below_deep_requirement",
        "exact effort override cannot use a runtime effort fallback"
      );
      assert(result.dispatch_effort === result.requested_effort, "exact effort override must dispatch requested effort");
    }
  }

  if (conflict) {
    assert(result.dispatch_effort === null, "conflicting reasoning must not dispatch effort");
    assert(result.degraded === false, "conflicting reasoning cannot be degraded");
    assert(result.degradation_reason === null, "conflicting reasoning cannot carry a degradation reason");
    return;
  }

  assert(result.minimum_model_tier !== null, "non-conflict reasoning requires a minimum model tier");
  const requiredModelTier = requiredModelTierForDecision(result);
  assert(
    modelTierIndex(result.minimum_model_tier) >= modelTierIndex(requiredModelTier),
    `reasoning.minimum_model_tier is below required ${requiredModelTier} for ${result.reasoning_class}`
  );

  if (result.role_policy.mode === "fixed") {
    assert(
      result.reasoning_class === result.role_policy.reasoning_class,
      "non-conflict reasoning class must match fixed role policy"
    );
  } else {
    assert(
      REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(result.role_policy.floor_class),
      "non-conflict reasoning class is below role policy floor"
    );
    assert(
      REASONING_CLASSES.indexOf(result.reasoning_class) <= REASONING_CLASSES.indexOf(result.role_policy.ceiling_class),
      "non-conflict reasoning class exceeds role policy ceiling"
    );
  }

  if (result.requested_effort !== null) {
    const requiredEffort = requiredRequestedEffort(result);
    assert(
      effortIndex(result.requested_effort) >= effortIndex(requiredEffort),
      `reasoning.requested_effort is below required ${requiredEffort} for ${result.reasoning_class}/${result.selected_model_tier}`
    );
  }
  if (result.requires_model_escalation) {
    assert(result.reasoning_class === "deep", "only deep compatibility may retain model escalation");
    assert(result.minimum_model_tier === "standard", "degraded deep compatibility requires standard minimum tier");
    assert(
      result.selected_model_tier === "mini" || result.selected_model_tier === "unknown",
      "degraded deep compatibility requires mini or unknown selected tier"
    );
    assert(result.degraded === true, "degraded deep compatibility must be marked degraded");
    assert(
      result.degradation_reason === "model_tier_below_deep_requirement",
      "degraded deep compatibility requires its bounded degradation reason"
    );
    assert(result.requested_effort === "max", "degraded deep compatibility must request max");
    assert(result.mode !== "inherit", "degraded deep compatibility is unavailable in inherit mode");
    if (result.mode === "adaptive") {
      assert(result.enforcement_status === "degraded", "adaptive degraded deep compatibility must remain degraded");
      assert(result.dispatch_effort === "max", "adaptive degraded deep compatibility must dispatch max");
      assert(
        result.effective_effort === null || result.effective_effort === "max",
        "adaptive degraded deep compatibility effective effort must be max when observed"
      );
    } else {
      assert(result.enforcement_status === "shadow", "shadow degraded deep compatibility must remain shadow-only");
    }
  } else {
    assert(
      selectedTierMeetsMinimum(result.selected_model_tier, result.minimum_model_tier, result.reasoning_class),
      "selected model tier does not satisfy the non-conflict minimum"
    );
  }

  if (result.reasoning_class === "assurance") {
    assert(result.mode === "adaptive", "non-conflict assurance requires adaptive mode");
    assert(result.selected_model_tier === "strong", "non-conflict assurance requires strong selected tier");
    assert(result.minimum_model_tier === "strong", "assurance requires strong minimum tier");
    assert(result.requested_effort === "max", "assurance must request max effort");
    assert(result.dispatch_effort === "max", "assurance must dispatch max effort");
    assert(result.degraded === false, "assurance cannot be degraded");
    assert(
      result.effective_effort === null || result.effective_effort === "max",
      "assurance effective effort must be max when observed"
    );
  }

  if (result.degradation_reason === "selector_unavailable") {
    assert(result.mode === "adaptive", "selector degradation requires adaptive mode");
    assert(result.enforcement_status === "degraded", "selector degradation requires degraded status");
    assert(result.degraded === true, "selector degradation requires degraded metadata");
    assert(result.selector_available === false, "selector degradation requires unavailable-selector evidence");
    assert(result.dispatch_effort === null, "selector degradation cannot dispatch effort");
    assert(result.effective_effort === null, "selector degradation cannot report effective effort");
  } else if (result.degradation_reason === "effective_effort_mismatch") {
    assert(result.mode === "adaptive", "effective-effort degradation requires adaptive mode");
    assert(result.enforcement_status === "degraded", "effective-effort mismatch requires degraded status");
    assert(result.degraded === true, "effective-effort mismatch requires degraded metadata");
    assert(
      result.dispatch_effort !== null
        && result.effective_effort !== null
        && effortIndex(result.effective_effort) > effortIndex(result.dispatch_effort),
      "effective-effort mismatch degradation requires effective effort above dispatch effort"
    );
  } else if (result.degradation_reason === "runtime_effort_unavailable") {
    assert(result.mode === "adaptive", "runtime-effort degradation requires adaptive mode");
    assert(result.enforcement_status === "degraded", "runtime-effort degradation requires degraded status");
    assert(result.degraded === true, "runtime-effort degradation requires degraded metadata");
    assert(result.dispatch_effort !== null, "runtime-effort degradation requires a fallback dispatch effort");
    assert(result.requested_effort !== result.dispatch_effort, "runtime-effort degradation requires a distinct fallback effort");
    assert(
      result.effective_effort === null || result.effective_effort === result.dispatch_effort,
      "runtime-effort degradation evidence must be absent or match the fallback dispatch effort"
    );
  } else if (result.degradation_reason === "model_tier_below_deep_requirement") {
    assert(result.requires_model_escalation === true, "model-tier degradation requires deep compatibility escalation metadata");
  }

  if (result.degraded) {
    assert(
      result.enforcement_status === "degraded"
        || (
          result.mode === "shadow"
          && result.enforcement_status === "shadow"
          && result.degradation_reason === "model_tier_below_deep_requirement"
        ),
      "degraded metadata requires degraded adaptive status or shadow deep compatibility"
    );
  } else {
    assert(result.enforcement_status !== "degraded", "degraded status requires degraded metadata");
  }
}

function canonicalizeReasoningDecisionCore(decision) {
  assert(decision && typeof decision === "object" && !Array.isArray(decision), "reasoning must be an object");
  const schemaVersion = ensureString(decision.schema_version, "reasoning.schema_version");
  assert(schemaVersion === "1.0" || schemaVersion === "2.0", "reasoning.schema_version must be 1.0 or 2.0");
  const result = {
    schema_version: schemaVersion,
    policy_version: ensureString(decision.policy_version, "reasoning.policy_version"),
    mode: ensureEnum(decision.mode, POLICY_MODES, "reasoning.mode"),
    role: ensureString(decision.role, "reasoning.role"),
    dispatch_context: decision.dispatch_context === null
      ? null
      : ensureString(decision.dispatch_context, "reasoning.dispatch_context"),
    requested_class: decision.requested_class === null
      ? null
      : ensureEnum(decision.requested_class, REASONING_CLASSES, "reasoning.requested_class"),
    effective_class: decision.effective_class === null
      ? null
      : ensureEnum(decision.effective_class, REASONING_CLASSES, "reasoning.effective_class"),
    reasoning_signals: canonicalizeReasoningSignals(decision.reasoning_signals, "reasoning.reasoning_signals", true),
    model_tier: ensureEnum(decision.model_tier, [...MODEL_TIERS, "unknown"], "reasoning.model_tier"),
    minimum_model_tier: decision.minimum_model_tier === null
      ? null
      : ensureEnum(decision.minimum_model_tier, MODEL_TIERS, "reasoning.minimum_model_tier"),
    requested_effort: decision.requested_effort === null
      ? null
      : ensureEnum(decision.requested_effort, EFFORTS, "reasoning.requested_effort"),
    dispatch_effort: decision.dispatch_effort === null
      ? null
      : ensureEnum(decision.dispatch_effort, EFFORTS, "reasoning.dispatch_effort"),
    effective_effort: decision.effective_effort === null
      ? null
      : ensureEnum(decision.effective_effort, EFFORTS, "reasoning.effective_effort"),
    capability_source: ensureEnum(decision.capability_source, CAPABILITY_SOURCES, "reasoning.capability_source"),
    enforcement_status: ensureEnum(decision.enforcement_status, ENFORCEMENT_STATUSES, "reasoning.enforcement_status")
  };

  assert(SAFE_POLICY_VERSION.test(result.policy_version), "reasoning.policy_version must be a bounded identifier");
  assert(SAFE_REASONING_IDENTIFIER.test(result.role), "reasoning.role must be a bounded lowercase identifier");
  if (result.dispatch_context !== null) {
    assert(
      SAFE_REASONING_IDENTIFIER.test(result.dispatch_context),
      "reasoning.dispatch_context must be a bounded lowercase identifier"
    );
  }
  assert(typeof decision.requires_model_escalation === "boolean", "reasoning.requires_model_escalation must be a boolean");
  assert(typeof decision.strict === "boolean", "reasoning.strict must be a boolean");
  result.requires_model_escalation = decision.requires_model_escalation;
  result.strict = decision.strict;
  if (result.schema_version === "1.0" && result.mode === "inherit") {
    assert(result.effective_class === null, "reasoning.effective_class must be null in legacy inherit mode");
  } else {
    assert(result.effective_class !== null, `reasoning.effective_class must be non-null in ${result.mode} mode`);
  }
  if (result.schema_version === "2.0") {
    assert(result.policy_version === "2", "reasoning.policy_version must be 2 for schema version 2.0");
    assert(
      result.dispatch_context === null
        || REASONING_POLICY.dispatch_contexts[result.dispatch_context] !== undefined,
      "reasoning.dispatch_context must be a managed version 2 context"
    );
    result.task_intent = decision.task_intent === null
      ? null
      : ensureEnum(decision.task_intent, TASK_INTENTS, "reasoning.task_intent");
    result.intent_baseline_class = decision.intent_baseline_class === null
      ? null
      : ensureEnum(decision.intent_baseline_class, REASONING_CLASSES, "reasoning.intent_baseline_class");
    result.classification_source = ensureEnum(
      decision.classification_source,
      CLASSIFICATION_SOURCES,
      "reasoning.classification_source"
    );
    result.role_policy = canonicalizeRolePolicy(decision.role_policy);
    const expectedRolePolicy = canonicalizeRolePolicy(
      REASONING_POLICY.role_policies[result.role] || REASONING_POLICY.default_role_policy
    );
    assert(
      JSON.stringify(result.role_policy) === JSON.stringify(expectedRolePolicy),
      "reasoning.role_policy must match the canonical policy for reasoning.role"
    );
    result.reasoning_class = ensureEnum(decision.reasoning_class, REASONING_CLASSES, "reasoning.reasoning_class");
    assert(result.reasoning_class === result.effective_class, "reasoning.reasoning_class must match effective_class");
    result.selected_model_tier = ensureEnum(
      decision.selected_model_tier,
      [...MODEL_TIERS, "unknown"],
      "reasoning.selected_model_tier"
    );
    assert(result.selected_model_tier === result.model_tier, "reasoning.selected_model_tier must match model_tier");
    if (decision.selector_available === null) {
      result.selector_available = null;
    } else {
      assert(typeof decision.selector_available === "boolean", "reasoning.selector_available must be a boolean or null");
      result.selector_available = decision.selector_available;
    }
    assert(typeof decision.degraded === "boolean", "reasoning.degraded must be a boolean");
    result.degraded = decision.degraded;
    result.degradation_reason = decision.degradation_reason === null
      ? null
      : ensureEnum(decision.degradation_reason, DEGRADATION_REASONS, "reasoning.degradation_reason");
    assert(result.degraded === (result.degradation_reason !== null), "reasoning.degraded must match degradation_reason presence");
    assert(typeof decision.recovery_boost === "boolean", "reasoning.recovery_boost must be a boolean");
    result.recovery_boost = decision.recovery_boost;
    result.explicit_override = canonicalizeExplicitOverride(decision.explicit_override);
    if (result.task_intent === null) {
      assert(result.intent_baseline_class === null, "reasoning.intent_baseline_class must be null without task_intent");
    } else {
      assert(
        result.intent_baseline_class === REASONING_POLICY.intent_baseline_classes[result.task_intent],
        "reasoning.intent_baseline_class must match task_intent policy baseline"
      );
    }
    if (result.classification_source === "task_intent") {
      assert(result.task_intent !== null, "reasoning.task_intent classification requires task_intent");
    } else if (result.classification_source === "legacy_explicit_class") {
      assert(
        result.task_intent === null && result.intent_baseline_class === null,
        "legacy reasoning classification cannot include task intent metadata"
      );
      assert(
        result.requested_class !== null,
        "legacy_explicit_class classification requires requested_class"
      );
    } else {
      assert(
        result.task_intent === null && result.intent_baseline_class === null,
        "legacy reasoning classification cannot include task intent metadata"
      );
      assert(
        result.requested_class === null,
        "legacy_role_target classification cannot include requested_class"
      );
      const roleTargetClass = result.role_policy.mode === "fixed"
        ? result.role_policy.reasoning_class
        : result.role_policy.target_class;
      assert(
        REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(roleTargetClass),
        `reasoning.reasoning_class is below legacy role target ${roleTargetClass}`
      );
    }
    if (result.intent_baseline_class !== null) {
      assert(
        REASONING_CLASSES.indexOf(result.effective_class) >= REASONING_CLASSES.indexOf(result.intent_baseline_class),
        `reasoning.effective_class ${result.effective_class} is below intent baseline ${result.intent_baseline_class}`
      );
    }
  }

  if (result.effective_class !== null) {
    const signalFloor = minimumReasoningClassForSignals(
      result.reasoning_signals,
      signalMinimumClassesForIntent(result.task_intent || null)
    );
    assert(
      REASONING_CLASSES.indexOf(result.effective_class) >= REASONING_CLASSES.indexOf(signalFloor),
      `reasoning.effective_class ${result.effective_class} is below signal minimum ${signalFloor}`
    );
  }
  if (result.schema_version === "2.0") {
    validateV2ReasoningState(result);
  }

  return result;
}

function canonicalizeReasoningDecision(decision) {
  const result = canonicalizeReasoningDecisionCore(decision);
  assert(Array.isArray(decision.reasons), "reasoning.reasons must be an array");
  result.reasons = uniqueStrings(decision.reasons) || [];
  assert(result.reasons.length === decision.reasons.length, "reasoning.reasons must contain unique non-empty strings");
  result.conflict = decision.conflict === null
    ? null
    : ensureString(decision.conflict, "reasoning.conflict");
  if (result.schema_version === "2.0") {
    result.conflict_reason = decision.conflict_reason === null
      ? null
      : ensureString(decision.conflict_reason, "reasoning.conflict_reason");
    if (result.enforcement_status === "conflict") {
      assert(result.conflict === "conflict", "reasoning conflict status requires the canonical conflict token");
      assert(result.conflict_reason !== null, "reasoning conflict status requires conflict_reason text");
      assert(result.degraded === false, "reasoning conflict status cannot be degraded");
    } else {
      assert(result.conflict === null, "non-conflict reasoning status cannot include conflict text");
      assert(result.conflict_reason === null, "non-conflict reasoning status cannot include conflict_reason text");
    }
  }

  return orderedObject(result, REASONING_DECISION_KEY_ORDER);
}

function canonicalizeReasoningObservationDecision(decision) {
  const canonical = canonicalizeReasoningDecisionCore(decision);
  return orderedObject(canonical, REASONING_OBSERVATION_DECISION_KEY_ORDER);
}

function canonicalizeReasoningObservation(observation) {
  assert(observation && typeof observation === "object" && !Array.isArray(observation), "reasoning observation must be an object");
  const result = {
    schema_version: ensureString(observation.schema_version, "schema_version"),
    observed_at: ensureString(observation.observed_at, "observed_at"),
    run_id: ensureSafeStatusId(observation.run_id, "run_id"),
    orchestrator: ensureEnum(observation.orchestrator, ORCHESTRATORS, "orchestrator"),
    agent_id: ensureSafeStatusId(observation.agent_id, "agent_id"),
    attempt: ensureInteger(observation.attempt, "attempt", 1),
    outcome: ensureEnum(observation.outcome, ["done", "blocked", "failed", "stale"], "outcome"),
    reasoning: canonicalizeReasoningObservationDecision(observation.reasoning)
  };

  assert(result.schema_version === "1.0" || result.schema_version === "2.0", "schema_version must be 1.0 or 2.0");
  assert(
    result.reasoning.schema_version === result.schema_version,
    "reasoning observation schema_version must match reasoning.schema_version"
  );
  assert(isIsoDateTime(result.observed_at), "observed_at must be an ISO date-time");
  if (observation.task_id !== undefined) {
    result.task_id = ensureSafeStatusId(observation.task_id, "task_id");
  }
  if (observation.wall_time_ms !== undefined) {
    result.wall_time_ms = ensureInteger(observation.wall_time_ms, "wall_time_ms", 0);
  }

  return orderedObject(result, REASONING_OBSERVATION_KEY_ORDER);
}

function validateResourceDependencies(resourceClass, dependentFields) {
  if (resourceClass !== undefined) {
    return;
  }
  for (const [fieldName, value] of Object.entries(dependentFields)) {
    assert(value === undefined, `${fieldName} requires resource_class`);
  }
}

function validateResourceTuple(resourceClass, resourceStatus, teardownRequired, cleanupStatus) {
  ensureEnum(resourceClass, RESOURCE_CLASSES, "resource_class");
  if (resourceStatus !== undefined) {
    ensureEnum(resourceStatus, RESOURCE_STATUSES, "resource_status");
  }
  if (teardownRequired !== undefined) {
    assert(typeof teardownRequired === "boolean", "teardown_required must be a boolean");
  }
  if (cleanupStatus !== undefined) {
    ensureEnum(cleanupStatus, CLEANUP_STATUSES, "cleanup_status");
  }

  if (resourceClass === "light") {
    if (teardownRequired !== undefined) {
      assert(teardownRequired === false, "light resources must set teardown_required=false");
    }
    if (resourceStatus !== undefined) {
      ensureEnum(resourceStatus, ["not_required", "unknown"], "resource_status");
    }
    if (cleanupStatus !== undefined) {
      ensureEnum(cleanupStatus, ["not_required", "unknown"], "cleanup_status");
    }
  } else if (resourceStatus !== undefined) {
    ensureEnum(
      resourceStatus,
      RESOURCE_STATUSES.filter((status) => status !== "not_required"),
      "resource_status"
    );
  }
}

function validateTaskResources(taskStatus) {
  validateResourceDependencies(taskStatus.resource_class, {
    max_parallelism: taskStatus.max_parallelism,
    teardown_required: taskStatus.teardown_required,
    resource_status: taskStatus.resource_status
  });
  if (taskStatus.resource_class === undefined) {
    return;
  }

  validateResourceTuple(
    taskStatus.resource_class,
    taskStatus.resource_status,
    taskStatus.teardown_required
  );
  if (taskStatus.resource_class === "process" && taskStatus.max_parallelism !== undefined) {
    assert(taskStatus.max_parallelism <= 2, "process resources must set max_parallelism <= 2");
  }
  if (["server", "browser"].includes(taskStatus.resource_class)) {
    if (taskStatus.max_parallelism !== undefined) {
      assert(taskStatus.max_parallelism === 1, `${taskStatus.resource_class} resources must set max_parallelism=1`);
    }
    if (taskStatus.teardown_required !== undefined) {
      assert(taskStatus.teardown_required === true, `${taskStatus.resource_class} resources must set teardown_required=true`);
    }
  }
  if (taskStatus.status === "done" && taskStatus.resource_status !== undefined) {
    ensureEnum(
      taskStatus.resource_status,
      ["not_required", "cleaned"],
      "done task resource_status"
    );
  }
}

function validateAgentResources(agentStatus) {
  validateResourceDependencies(agentStatus.resource_class, {
    resource_status: agentStatus.resource_status,
    teardown_required: agentStatus.teardown_required,
    resource_handles: agentStatus.resource_handles,
    cleanup_status: agentStatus.cleanup_status
  });
  if (agentStatus.resource_class === undefined) {
    return;
  }

  validateResourceTuple(
    agentStatus.resource_class,
    agentStatus.resource_status,
    agentStatus.teardown_required,
    agentStatus.cleanup_status
  );
  if (["server", "browser"].includes(agentStatus.resource_class) && agentStatus.teardown_required !== undefined) {
    assert(agentStatus.teardown_required === true, `${agentStatus.resource_class} resources must set teardown_required=true`);
  }
  if (agentStatus.status === "done") {
    if (agentStatus.resource_status !== undefined) {
      ensureEnum(
        agentStatus.resource_status,
        ["not_required", "cleaned"],
        "done agent resource_status"
      );
    }
    if (agentStatus.cleanup_status !== undefined) {
      ensureEnum(
        agentStatus.cleanup_status,
        ["not_required", "cleaned"],
        "done agent cleanup_status"
      );
    }
  }
}

function canonicalizeRunStatus(runStatus) {
  const result = {
    protocol_version: runStatus.protocol_version || PROTOCOL_VERSION,
    run_id: ensureSafeStatusId(runStatus.run_id, "run_id"),
    orchestrator: ensureEnum(runStatus.orchestrator, ORCHESTRATORS, "orchestrator"),
    status: ensureEnum(runStatus.status, RUN_STATUSES, "status"),
    created_at: ensureString(runStatus.created_at, "created_at"),
    updated_at: ensureString(runStatus.updated_at, "updated_at"),
    output_dir: ensureString(runStatus.output_dir, "output_dir"),
    checkpoint_path: ensureString(runStatus.checkpoint_path, "checkpoint_path")
  };

  assert(isIsoDateTime(result.created_at), "created_at must be an ISO date-time");
  assert(isIsoDateTime(result.updated_at), "updated_at must be an ISO date-time");

  if (runStatus.user_prompt !== undefined) result.user_prompt = ensureString(runStatus.user_prompt, "user_prompt");
  if (runStatus.current_stage !== undefined) result.current_stage = ensureInteger(runStatus.current_stage, "current_stage", -1);
  if (runStatus.completed_stages !== undefined) result.completed_stages = canonicalizeCompletedStages(runStatus.completed_stages);
  if (runStatus.next_stage !== undefined) result.next_stage = ensureInteger(runStatus.next_stage, "next_stage", 0);
  if (runStatus.task_list_path !== undefined) result.task_list_path = ensureString(runStatus.task_list_path, "task_list_path");
  if (runStatus.dispatch_plan_path !== undefined) result.dispatch_plan_path = ensureString(runStatus.dispatch_plan_path, "dispatch_plan_path");
  if (runStatus.layout !== undefined) result.layout = ensureEnum(runStatus.layout, ["run-only", "expanded"], "layout");
  if (runStatus.task_counts !== undefined) result.task_counts = canonicalizeTaskCounts(runStatus.task_counts);
  if (runStatus.active_task_ids !== undefined) result.active_task_ids = uniqueStrings(runStatus.active_task_ids);
  if (runStatus.active_agent_ids !== undefined) result.active_agent_ids = uniqueStrings(runStatus.active_agent_ids);
  if (runStatus.waiting_on !== undefined) result.waiting_on = ensureEnum(runStatus.waiting_on, WAITING_ON, "waiting_on");
  if (runStatus.resume_from_checkpoint !== undefined) result.resume_from_checkpoint = Boolean(runStatus.resume_from_checkpoint);
  if (runStatus.last_heartbeat_at !== undefined) {
    result.last_heartbeat_at = ensureString(runStatus.last_heartbeat_at, "last_heartbeat_at");
    assert(isIsoDateTime(result.last_heartbeat_at), "last_heartbeat_at must be an ISO date-time");
  }
  if (runStatus.last_error !== undefined) result.last_error = ensureString(runStatus.last_error, "last_error");
  if (runStatus.notes !== undefined) result.notes = (runStatus.notes || []).map((note) => ensureString(note, "notes[]"));
  if (runStatus.task_refs !== undefined) result.task_refs = canonicalizeTaskRefs(runStatus.task_refs);
  if (runStatus.agent_refs !== undefined) result.agent_refs = canonicalizeAgentRefs(runStatus.agent_refs);

  return orderedObject(result, RUN_KEY_ORDER);
}

function canonicalizeTaskStatus(taskStatus) {
  const result = {
    protocol_version: taskStatus.protocol_version || PROTOCOL_VERSION,
    run_id: ensureSafeStatusId(taskStatus.run_id, "run_id"),
    task_id: ensureSafeStatusId(taskStatus.task_id, "task_id"),
    summary: ensureString(taskStatus.summary, "summary"),
    status: ensureEnum(taskStatus.status, TASK_STATUSES, "status"),
    created_at: ensureString(taskStatus.created_at, "created_at"),
    updated_at: ensureString(taskStatus.updated_at, "updated_at")
  };

  assert(isIsoDateTime(result.created_at), "created_at must be an ISO date-time");
  assert(isIsoDateTime(result.updated_at), "updated_at must be an ISO date-time");

  if (taskStatus.trace_ids !== undefined) result.trace_ids = uniqueStrings(taskStatus.trace_ids);
  if (taskStatus.task_intent !== undefined) {
    result.task_intent = taskStatus.task_intent === null
      ? null
      : ensureEnum(taskStatus.task_intent, TASK_INTENTS, "task_intent");
  }
  if (taskStatus.intent_baseline_class !== undefined) {
    result.intent_baseline_class = taskStatus.intent_baseline_class === null
      ? null
      : ensureEnum(taskStatus.intent_baseline_class, REASONING_CLASSES, "intent_baseline_class");
  }
  if (taskStatus.classification_source !== undefined) {
    result.classification_source = ensureEnum(
      taskStatus.classification_source,
      CLASSIFICATION_SOURCES,
      "classification_source"
    );
  }
  if (taskStatus.prior_failure_type !== undefined) {
    result.prior_failure_type = ensureEnum(
      taskStatus.prior_failure_type,
      PRIOR_FAILURE_TYPES,
      "prior_failure_type"
    );
  }
  if (taskStatus.allow_degraded_deep !== undefined) {
    assert(typeof taskStatus.allow_degraded_deep === "boolean", "allow_degraded_deep must be a boolean");
    result.allow_degraded_deep = taskStatus.allow_degraded_deep;
  }
  if (taskStatus.retry_opportunities_used !== undefined) {
    result.retry_opportunities_used = ensureInteger(
      taskStatus.retry_opportunities_used,
      "retry_opportunities_used",
      0
    );
    assert(result.retry_opportunities_used <= 5, "retry_opportunities_used must be <= 5");
  }
  if (taskStatus.capability_recovery_used !== undefined) {
    assert(
      typeof taskStatus.capability_recovery_used === "boolean",
      "capability_recovery_used must be a boolean"
    );
    result.capability_recovery_used = taskStatus.capability_recovery_used;
  }
  if (result.capability_recovery_used === true) {
    assert(
      result.retry_opportunities_used !== undefined
        && result.retry_opportunities_used >= 1,
      "capability_recovery_used requires retry_opportunities_used >= 1"
    );
  }
  if (result.task_intent !== undefined && result.task_intent !== null) {
    assert(
      result.intent_baseline_class === REASONING_POLICY.intent_baseline_classes[result.task_intent],
      `intent_baseline_class must match task_intent ${result.task_intent}`
    );
    assert(result.classification_source === "task_intent", "classification_source must be task_intent when task_intent is set");
  }
  if (result.intent_baseline_class !== undefined && result.intent_baseline_class !== null) {
    assert(
      result.task_intent !== undefined
        && result.task_intent !== null
        && result.classification_source === "task_intent",
      "non-null intent_baseline_class requires task_intent classification"
    );
  }
  if (result.classification_source === "task_intent") {
    assert(result.task_intent !== undefined && result.task_intent !== null, "task_intent classification requires task_intent");
  }
  if (
    result.classification_source === "legacy_explicit_class"
    || result.classification_source === "legacy_role_target"
  ) {
    assert(
      (result.task_intent === undefined || result.task_intent === null)
        && (result.intent_baseline_class === undefined || result.intent_baseline_class === null),
      "legacy classification metadata cannot include a task intent baseline"
    );
  }
  if (taskStatus.reasoning_class !== undefined) {
    result.reasoning_class = ensureEnum(taskStatus.reasoning_class, REASONING_CLASSES, "reasoning_class");
  }
  if (taskStatus.reasoning_signals !== undefined) {
    result.reasoning_signals = canonicalizeReasoningSignals(taskStatus.reasoning_signals);
  }
  assert(
    (result.reasoning_class === undefined) === (result.reasoning_signals === undefined),
    "reasoning_class and reasoning_signals must be supplied together"
  );
  if (
    result.classification_source === "legacy_explicit_class"
    || result.classification_source === "legacy_role_target"
  ) {
    assert(
      result.reasoning_class !== undefined,
      "legacy classification_source requires reasoning_class and reasoning_signals"
    );
  }
  if (result.reasoning_class !== undefined) {
    if (result.intent_baseline_class !== undefined && result.intent_baseline_class !== null) {
      assert(
        REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(result.intent_baseline_class),
        `reasoning_class ${result.reasoning_class} is below intent baseline ${result.intent_baseline_class}`
      );
    }
    const signalFloor = minimumReasoningClassForSignals(
      result.reasoning_signals,
      signalMinimumClassesForIntent(result.task_intent || null)
    );
    assert(
      REASONING_CLASSES.indexOf(result.reasoning_class) >= REASONING_CLASSES.indexOf(signalFloor),
      `reasoning_class ${result.reasoning_class} is below signal minimum ${signalFloor}`
    );
  }
  if (taskStatus.batch_id !== undefined) result.batch_id = ensureString(taskStatus.batch_id, "batch_id");
  if (taskStatus.depends_on !== undefined) result.depends_on = uniqueStrings(taskStatus.depends_on);
  if (taskStatus.assigned_agent_id !== undefined) result.assigned_agent_id = ensureSafeStatusId(taskStatus.assigned_agent_id, "assigned_agent_id");
  if (taskStatus.assigned_executor !== undefined) result.assigned_executor = ensureString(taskStatus.assigned_executor, "assigned_executor");
  if (taskStatus.resource_class !== undefined) result.resource_class = taskStatus.resource_class;
  if (taskStatus.max_parallelism !== undefined) result.max_parallelism = ensureInteger(taskStatus.max_parallelism, "max_parallelism", 1);
  if (taskStatus.teardown_required !== undefined) {
    assert(typeof taskStatus.teardown_required === "boolean", "teardown_required must be a boolean");
    result.teardown_required = taskStatus.teardown_required;
  }
  if (taskStatus.resource_status !== undefined) result.resource_status = taskStatus.resource_status;
  if (taskStatus.started_at !== undefined) {
    result.started_at = ensureString(taskStatus.started_at, "started_at");
    assert(isIsoDateTime(result.started_at), "started_at must be an ISO date-time");
  }
  if (taskStatus.completed_at !== undefined) {
    result.completed_at = ensureString(taskStatus.completed_at, "completed_at");
    assert(isIsoDateTime(result.completed_at), "completed_at must be an ISO date-time");
  }
  if (taskStatus.last_heartbeat_at !== undefined) {
    result.last_heartbeat_at = ensureString(taskStatus.last_heartbeat_at, "last_heartbeat_at");
    assert(isIsoDateTime(result.last_heartbeat_at), "last_heartbeat_at must be an ISO date-time");
  }
  if (taskStatus.result_summary !== undefined) result.result_summary = ensureString(taskStatus.result_summary, "result_summary");
  if (taskStatus.evidence_refs !== undefined) result.evidence_refs = uniqueStrings(taskStatus.evidence_refs);
  if (taskStatus.error !== undefined) result.error = ensureString(taskStatus.error, "error");
  if (taskStatus.resume_note !== undefined) result.resume_note = ensureString(taskStatus.resume_note, "resume_note");
  if (taskStatus.agent_ref !== undefined) {
    result.agent_ref = {
      agent_id: ensureSafeStatusId(taskStatus.agent_ref.agent_id, "agent_ref.agent_id"),
      path: ensureString(taskStatus.agent_ref.path, "agent_ref.path")
    };
  }

  validateTaskResources(result);
  return orderedObject(result, TASK_KEY_ORDER);
}

function canonicalizeAgentStatus(agentStatus) {
  const result = {
    protocol_version: agentStatus.protocol_version || PROTOCOL_VERSION,
    run_id: ensureSafeStatusId(agentStatus.run_id, "run_id"),
    agent_id: ensureSafeStatusId(agentStatus.agent_id, "agent_id"),
    agent: ensureString(agentStatus.agent, "agent"),
    status: ensureEnum(agentStatus.status, AGENT_STATUSES, "status"),
    created_at: ensureString(agentStatus.created_at, "created_at"),
    updated_at: ensureString(agentStatus.updated_at, "updated_at")
  };

  assert(isIsoDateTime(result.created_at), "created_at must be an ISO date-time");
  assert(isIsoDateTime(result.updated_at), "updated_at must be an ISO date-time");

  if (agentStatus.task_id !== undefined) result.task_id = ensureSafeStatusId(agentStatus.task_id, "task_id");
  if (agentStatus.batch_id !== undefined) result.batch_id = ensureString(agentStatus.batch_id, "batch_id");
  if (agentStatus.attempt !== undefined) result.attempt = ensureInteger(agentStatus.attempt, "attempt", 1);
  if (agentStatus.started_at !== undefined) {
    result.started_at = ensureString(agentStatus.started_at, "started_at");
    assert(isIsoDateTime(result.started_at), "started_at must be an ISO date-time");
  }
  if (agentStatus.completed_at !== undefined) {
    result.completed_at = ensureString(agentStatus.completed_at, "completed_at");
    assert(isIsoDateTime(result.completed_at), "completed_at must be an ISO date-time");
  }
  if (agentStatus.last_heartbeat_at !== undefined) {
    result.last_heartbeat_at = ensureString(agentStatus.last_heartbeat_at, "last_heartbeat_at");
    assert(isIsoDateTime(result.last_heartbeat_at), "last_heartbeat_at must be an ISO date-time");
  }
  if (agentStatus.resource_class !== undefined) result.resource_class = agentStatus.resource_class;
  if (agentStatus.resource_status !== undefined) result.resource_status = agentStatus.resource_status;
  if (agentStatus.teardown_required !== undefined) {
    assert(typeof agentStatus.teardown_required === "boolean", "teardown_required must be a boolean");
    result.teardown_required = agentStatus.teardown_required;
  }
  if (agentStatus.resource_handles !== undefined) {
    assert(
      agentStatus.resource_handles &&
        typeof agentStatus.resource_handles === "object" &&
        !Array.isArray(agentStatus.resource_handles),
      "resource_handles must be an object"
    );
    result.resource_handles = sortObjectKeys(agentStatus.resource_handles);
  }
  if (agentStatus.cleanup_status !== undefined) result.cleanup_status = agentStatus.cleanup_status;
  if (agentStatus.reasoning !== undefined) {
    result.reasoning = canonicalizeReasoningDecision(agentStatus.reasoning);
    assert(
      REASONING_POLICY.role_policies[result.reasoning.role] !== undefined,
      "AgentStatus reasoning.role must be a managed policy role"
    );
    assert(result.agent === result.reasoning.role, "agent must match reasoning.role");
  }
  if (agentStatus.result_summary !== undefined) result.result_summary = ensureString(agentStatus.result_summary, "result_summary");
  if (agentStatus.evidence_refs !== undefined) result.evidence_refs = uniqueStrings(agentStatus.evidence_refs);
  if (agentStatus.error !== undefined) result.error = ensureString(agentStatus.error, "error");

  validateAgentResources(result);
  return orderedObject(result, AGENT_KEY_ORDER);
}

function canonicalizeCheckpoint(checkpoint) {
  const result = {
    protocol_version: checkpoint.protocol_version || PROTOCOL_VERSION,
    pipeline_id: ensureSafeStatusId(checkpoint.pipeline_id, "pipeline_id"),
    orchestrator: ensureEnum(checkpoint.orchestrator, ORCHESTRATORS, "orchestrator"),
    user_prompt: ensureString(checkpoint.user_prompt, "user_prompt"),
    flags: checkpoint.flags && typeof checkpoint.flags === "object" ? sortObjectKeys(checkpoint.flags) : {},
    current_stage: ensureInteger(checkpoint.current_stage, "current_stage", -1),
    completed_stages: canonicalizeCompletedStages(checkpoint.completed_stages) || [],
    stage_artifacts: sortObjectKeys(checkpoint.stage_artifacts || {}),
    created_at: ensureString(checkpoint.created_at, "created_at"),
    updated_at: ensureString(checkpoint.updated_at, "updated_at")
  };

  const reasoningFlagNames = [
    "reasoning_mode",
    "reasoning_policy_version",
    "reasoning_ceiling"
  ];
  const reasoningFlagCount = reasoningFlagNames.filter((name) => result.flags[name] !== undefined).length;
  assert(
    reasoningFlagCount === 0 || reasoningFlagCount === reasoningFlagNames.length,
    "checkpoint reasoning_mode, reasoning_policy_version, and reasoning_ceiling must be supplied together"
  );
  if (reasoningFlagCount === reasoningFlagNames.length) {
    ensureEnum(result.flags.reasoning_mode, POLICY_MODES, "flags.reasoning_mode");
    const policyVersion = ensureString(result.flags.reasoning_policy_version, "flags.reasoning_policy_version");
    assert(SAFE_POLICY_VERSION.test(policyVersion), "flags.reasoning_policy_version must be a bounded identifier");
    ensureEnum(result.flags.reasoning_ceiling, EFFORTS, "flags.reasoning_ceiling");
  }
  if (result.flags.allow_degraded_deep !== undefined) {
    assert(typeof result.flags.allow_degraded_deep === "boolean", "flags.allow_degraded_deep must be a boolean");
    assert(
      reasoningFlagCount === reasoningFlagNames.length,
      "flags.allow_degraded_deep requires the complete reasoning policy flag set"
    );
  }
  if (result.flags.capability_recovery_mode !== undefined) {
    ensureEnum(
      result.flags.capability_recovery_mode,
      ["off", "shadow", "auto"],
      "flags.capability_recovery_mode"
    );
  }
  if (result.flags.max_retry_rounds !== undefined) {
    const maxRetryRounds = ensureInteger(
      result.flags.max_retry_rounds,
      "flags.max_retry_rounds",
      0
    );
    assert(maxRetryRounds <= 5, "flags.max_retry_rounds must be <= 5");
  }
  assert(isIsoDateTime(result.created_at), "created_at must be an ISO date-time");
  assert(isIsoDateTime(result.updated_at), "updated_at must be an ISO date-time");
  return orderedObject(result, CHECKPOINT_KEY_ORDER);
}

module.exports = {
  canonicalizeAgentStatus,
  canonicalizeCheckpoint,
  canonicalizeReasoningDecision,
  canonicalizeReasoningObservation,
  canonicalizeRunStatus,
  canonicalizeTaskCounts,
  canonicalizeTaskStatus
};
