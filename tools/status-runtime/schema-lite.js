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
  EFFORTS,
  ENFORCEMENT_STATUSES,
  MODEL_TIERS,
  POLICY_MODES,
  REASONING_CLASSES,
  REASONING_SIGNALS,
  SAFE_POLICY_VERSION,
  SAFE_REASONING_IDENTIFIER,
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

function canonicalizeReasoningDecisionCore(decision) {
  assert(decision && typeof decision === "object" && !Array.isArray(decision), "reasoning must be an object");
  const result = {
    schema_version: ensureString(decision.schema_version, "reasoning.schema_version"),
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

  assert(result.schema_version === "1.0", "reasoning.schema_version must be 1.0");
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
  if (result.mode === "inherit") {
    assert(result.effective_class === null, "reasoning.effective_class must be null in inherit mode");
  } else {
    assert(result.effective_class !== null, `reasoning.effective_class must be non-null in ${result.mode} mode`);
  }
  if (result.effective_class !== null) {
    const signalFloor = minimumReasoningClassForSignals(
      result.reasoning_signals,
      REASONING_POLICY.signal_minimum_classes
    );
    assert(
      REASONING_CLASSES.indexOf(result.effective_class) >= REASONING_CLASSES.indexOf(signalFloor),
      `reasoning.effective_class ${result.effective_class} is below signal minimum ${signalFloor}`
    );
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

  assert(result.schema_version === "1.0", "schema_version must be 1.0");
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
  if (result.reasoning_class !== undefined) {
    const signalFloor = minimumReasoningClassForSignals(
      result.reasoning_signals,
      REASONING_POLICY.signal_minimum_classes
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
  if (agentStatus.reasoning !== undefined) result.reasoning = canonicalizeReasoningDecision(agentStatus.reasoning);
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
