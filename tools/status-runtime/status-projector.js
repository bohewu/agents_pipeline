const crypto = require("crypto");
const path = require("path");
const { isDeepStrictEqual } = require("util");

const { PROTOCOL_VERSION, TASK_COUNT_ORDER } = require("./constants");
const {
  canonicalizeLsaRecoveryStage,
  canonicalizeRunConfiguration,
  canonicalizeTaskCounts
} = require("./schema-lite");
const { resolveLsaRecoveryStage } = require("../reasoning-policy");
const { assert, cloneJson, isObject, nowIso, toRelativeStatusPath } = require("./utils");

function mergeFlags(currentFlags, incomingFlags) {
  if (!isObject(incomingFlags)) {
    return isObject(currentFlags) ? currentFlags : {};
  }
  return {
    ...(isObject(currentFlags) ? currentFlags : {}),
    ...cloneJson(incomingFlags)
  };
}

function isTaskActive(status) {
  return status !== "done" && status !== "failed" && status !== "skipped";
}

function isAgentActive(status) {
  return status !== "done" && status !== "failed";
}

function defaultResourceStatus(resourceClass) {
  return resourceClass === "light" ? "not_required" : resourceClass ? "reserved" : undefined;
}

function defaultCleanupStatus(resourceClass) {
  return resourceClass === "light" ? "not_required" : resourceClass ? "pending" : undefined;
}

const ORDINARY_EXECUTION_ROLES = new Set(["executor", "generalist"]);

class StatusProjector {
  applyEvent(state, eventName, payload) {
    const timestamp = payload.timestamp || nowIso();
    switch (eventName) {
      case "run.started":
        return this.onRunStarted(state, payload, timestamp);
      case "run.resumed":
        return this.onRunResumed(state, payload, timestamp);
      case "checkpoint.updated":
        return this.onCheckpointUpdated(state, payload, timestamp);
      case "stage.completed":
        return this.onStageCompleted(state, payload, timestamp);
      case "tasks.registered":
        return this.onTasksRegistered(state, payload, timestamp);
      case "task.updated":
        return this.onTaskUpdated(state, payload, timestamp);
      case "agent.started":
        return this.onAgentStarted(state, payload, timestamp);
      case "agent.heartbeat":
        return this.onAgentHeartbeat(state, payload, timestamp);
      case "agent.finished":
        return this.onAgentFinished(state, payload, timestamp);
      case "run.finished":
        return this.onRunFinished(state, payload, timestamp);
      default:
        throw new Error(`Unsupported status runtime event: ${eventName}`);
    }
  }

  onRunStarted(state, payload, timestamp) {
    const runStatus = {
      protocol_version: PROTOCOL_VERSION,
      run_id: payload.run_id,
      orchestrator: payload.orchestrator,
      status: payload.status || "running",
      created_at: timestamp,
      updated_at: timestamp,
      output_dir: state.runDir,
      checkpoint_path: path.join(state.runDir, "checkpoint.json"),
      configuration: cloneJson(payload.configuration),
      user_prompt: payload.user_prompt,
      current_stage: -1,
      completed_stages: [],
      layout: "run-only",
      task_counts: this.emptyTaskCounts(),
      active_task_ids: [],
      active_agent_ids: [],
      waiting_on: payload.waiting_on || "none",
      resume_from_checkpoint: false,
      notes: Array.isArray(payload.notes) ? [...payload.notes] : undefined
    };

    const checkpoint = {
      protocol_version: PROTOCOL_VERSION,
      pipeline_id: payload.run_id,
      orchestrator: payload.orchestrator,
      user_prompt: payload.user_prompt,
      configuration: cloneJson(payload.configuration),
      flags: isObject(payload.flags) ? cloneJson(payload.flags) : {},
      current_stage: -1,
      completed_stages: [],
      stage_artifacts: {},
      created_at: timestamp,
      updated_at: timestamp
    };

    state.runStatus = runStatus;
    state.checkpoint = checkpoint;
    return this.recompute(state, timestamp);
  }

  onRunResumed(state, payload, timestamp) {
    assert(state.runStatus, "Cannot resume without an existing run-status.json");
    assert(state.checkpoint, "Cannot resume without an existing checkpoint.json");
    this.assertResumeConfiguration(state, payload.configuration);

    state.runStatus.resume_from_checkpoint = true;
    state.runStatus.status = payload.status || "running";
    state.runStatus.waiting_on = payload.waiting_on || "none";
    state.runStatus.updated_at = timestamp;
    if (payload.user_prompt) {
      state.runStatus.user_prompt = payload.user_prompt;
      state.checkpoint.user_prompt = payload.user_prompt;
    }

    for (const task of state.tasks.values()) {
      if (task.status === "in_progress") {
        task.status = "stale";
        task.updated_at = timestamp;
        task.resume_note = payload.resume_note || "Marked stale during resume reconciliation.";
        if (task.resource_class && task.resource_status !== "cleaned" && task.resource_status !== "not_required") {
          task.resource_status = "unknown";
        }
      }
    }

    for (const agent of state.agents.values()) {
      if (["assigned", "starting", "running"].includes(agent.status)) {
        agent.status = "stale";
        agent.updated_at = timestamp;
        if (agent.resource_class && agent.resource_status !== "cleaned" && agent.resource_status !== "not_required") {
          agent.resource_status = "unknown";
        }
        if (agent.resource_class && agent.cleanup_status !== "cleaned" && agent.cleanup_status !== "not_required") {
          agent.cleanup_status = "unknown";
        }
      }
    }

    state.checkpoint.flags = mergeFlags(state.checkpoint.flags, payload.flags);
    state.checkpoint.updated_at = timestamp;

    return this.recompute(state, timestamp);
  }

  onStageCompleted(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before stage.completed");
    assert(state.checkpoint, "run.started must be emitted before stage.completed");

    const stageEntry = {
      stage: payload.stage,
      name: payload.name,
      status: payload.status,
      artifact_key: payload.artifact_key,
      timestamp
    };

    const withoutStage = (state.runStatus.completed_stages || []).filter((entry) => entry.stage !== payload.stage);
    withoutStage.push(stageEntry);
    state.runStatus.completed_stages = withoutStage;
    state.runStatus.current_stage = payload.stage;
    if (payload.next_stage !== undefined) {
      state.runStatus.next_stage = payload.next_stage;
    }
    if (payload.waiting_on !== undefined) {
      state.runStatus.waiting_on = payload.waiting_on;
    }
    if (payload.task_list_path !== undefined) {
      state.runStatus.task_list_path = payload.task_list_path;
    }
    if (payload.dispatch_plan_path !== undefined) {
      state.runStatus.dispatch_plan_path = payload.dispatch_plan_path;
    }
    state.runStatus.status = payload.run_status || state.runStatus.status || "running";

    const checkpointWithoutStage = (state.checkpoint.completed_stages || []).filter((entry) => entry.stage !== payload.stage);
    checkpointWithoutStage.push(stageEntry);
    state.checkpoint.completed_stages = checkpointWithoutStage;
    state.checkpoint.current_stage = payload.stage;
    if (payload.artifact_key && payload.stage_artifact !== undefined) {
      state.checkpoint.stage_artifacts = state.checkpoint.stage_artifacts || {};
      state.checkpoint.stage_artifacts[payload.artifact_key] = cloneJson(payload.stage_artifact);
    }
    if (payload.stage_artifacts && typeof payload.stage_artifacts === "object") {
      state.checkpoint.stage_artifacts = {
        ...(state.checkpoint.stage_artifacts || {}),
        ...cloneJson(payload.stage_artifacts)
      };
    }
    state.checkpoint.flags = mergeFlags(state.checkpoint.flags, payload.flags);
    state.checkpoint.updated_at = timestamp;

    return this.recompute(state, timestamp);
  }

  onCheckpointUpdated(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before checkpoint.updated");
    assert(state.checkpoint, "run.started must be emitted before checkpoint.updated");

    state.checkpoint.flags = mergeFlags(state.checkpoint.flags, payload.flags);
    state.checkpoint.updated_at = timestamp;
    state.runStatus.updated_at = timestamp;

    return this.recompute(state, timestamp);
  }

  onTasksRegistered(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before tasks.registered");
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

    for (const input of tasks) {
      const taskId = input.task_id || input.id;
      assert(taskId, "tasks.registered requires task_id or id");
      const existing = state.tasks.get(taskId);
      const createdAt = existing?.created_at || timestamp;
      if (
        existing?.capability_recovery_used === true
        && input.capability_recovery_used === false
      ) {
        throw new Error("capability_recovery_used cannot be reset");
      }
      if (
        input.retry_opportunities_used !== undefined
        && input.retry_opportunities_used < (existing?.retry_opportunities_used || 0)
      ) {
        throw new Error("retry_opportunities_used cannot decrease");
      }
      assert(input.failure_history === undefined, "failure_history is derived from canonical agent attempts");
      assert(input.recovery_stage === undefined, "recovery_stage must be claimed through task.updated");
      assert(input.recovery_claim_id === undefined, "recovery_claim_id must be claimed through task.updated");
      assert(input.recovery_agent_id === undefined, "recovery_agent_id is runtime-derived");
      assert(input.recovery_runtime_support === undefined, "recovery_runtime_support must be claimed through task.updated");
      const task = {
        protocol_version: PROTOCOL_VERSION,
        run_id: state.runStatus.run_id,
        task_id: taskId,
        summary: input.summary,
        status: input.status || existing?.status || "pending",
        created_at: createdAt,
        updated_at: timestamp,
        trace_ids: input.trace_ids,
        task_intent: input.task_intent,
        intent_baseline_class: input.intent_baseline_class,
        classification_source: input.classification_source,
        prior_failure_type: input.prior_failure_type,
        allow_degraded_deep: input.allow_degraded_deep,
        retry_opportunities_used:
          input.retry_opportunities_used ?? existing?.retry_opportunities_used,
        capability_recovery_used:
          input.capability_recovery_used ?? existing?.capability_recovery_used,
        failure_history: existing?.failure_history,
        recovery_stage: existing?.recovery_stage,
        recovery_claim_id: existing?.recovery_claim_id,
        recovery_agent_id: existing?.recovery_agent_id,
        recovery_runtime_support: existing?.recovery_runtime_support,
        reasoning_class: input.reasoning_class,
        reasoning_signals: input.reasoning_signals,
        configuration_identity: state.runStatus.configuration?.configuration_identity,
        batch_id: input.batch_id,
        depends_on: input.depends_on,
        assigned_agent_id: input.assigned_agent_id,
        assigned_executor: input.assigned_executor || input.executor,
        resource_class: input.resource_class,
        max_parallelism: input.max_parallelism,
        teardown_required: input.teardown_required,
        resource_status: input.resource_status || defaultResourceStatus(input.resource_class)
      };
      state.tasks.set(taskId, { ...existing, ...task });
    }

    state.runStatus.layout = state.tasks.size > 0 ? "expanded" : state.runStatus.layout;
    if (payload.task_list_path !== undefined) {
      state.runStatus.task_list_path = payload.task_list_path;
    }
    if (payload.dispatch_plan_path !== undefined) {
      state.runStatus.dispatch_plan_path = payload.dispatch_plan_path;
    }

    return this.recompute(state, timestamp);
  }

  onTaskUpdated(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before task.updated");
    const task = state.tasks.get(payload.task_id);
    assert(task, `Unknown task_id: ${payload.task_id}`);
    assert(payload.failure_history === undefined, "failure_history is derived from canonical agent attempts");

    assert(payload.recovery_agent_id === undefined, "recovery_agent_id is runtime-derived");
    if (payload.recovery_stage !== undefined || payload.recovery_claim_id !== undefined || payload.recovery_runtime_support !== undefined) {
      this.assertRecoveryClaim(state, task, payload);
    }

    const currentRetryCount = task.retry_opportunities_used || 0;
    if (payload.retry_opportunities_used !== undefined) {
      assert(
        Number.isInteger(payload.retry_opportunities_used),
        "retry_opportunities_used must be an integer"
      );
      assert(
        payload.retry_opportunities_used === currentRetryCount + 1,
        "retry_opportunities_used must increase by exactly one"
      );
      const retryLimit = state.checkpoint?.flags?.max_retry_rounds;
      if (state.runStatus.orchestrator === "orchestrator-pipeline") {
        assert(
          Number.isInteger(retryLimit),
          "Pipeline retry accounting requires persisted max_retry_rounds"
        );
        assert(
          payload.retry_opportunities_used <= retryLimit,
          "retry_opportunities_used exceeds max_retry_rounds"
        );
      }
    }
    if (payload.capability_recovery_used !== undefined) {
      assert(
        typeof payload.capability_recovery_used === "boolean",
        "capability_recovery_used must be a boolean"
      );
      assert(
        task.capability_recovery_used !== true,
        "capability recovery has already been used for this task"
      );
      if (payload.capability_recovery_used === true) {
        assert(
          payload.retry_opportunities_used === currentRetryCount + 1,
          "capability recovery must atomically consume one retry opportunity"
        );
      }
    }

    const patch = { ...payload };
    delete patch.run_id;
    delete patch.task_id;
    delete patch.timestamp;
    Object.assign(task, patch);
    if (payload.recovery_stage !== undefined) {
      delete task.recovery_agent_id;
    }
    task.updated_at = timestamp;
    if (payload.status === "in_progress" && !task.started_at) {
      task.started_at = timestamp;
    }
    if (["done", "blocked", "failed", "skipped", "stale"].includes(task.status)) {
      task.completed_at = payload.completed_at || task.completed_at || (["done", "failed", "skipped"].includes(task.status) ? timestamp : task.completed_at);
    }

    return this.recompute(state, timestamp);
  }

  onAgentStarted(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before agent.started");
    assert(
      (payload.recovery_stage === undefined) === (payload.recovery_claim_id === undefined),
      "Recovery agent start requires both recovery_stage and recovery_claim_id"
    );
    if (payload.agent === "executor-strong") {
      assert(
        payload.task_id && state.tasks.has(payload.task_id),
        "executor-strong requires canonical task history"
      );
      const priorOrdinaryExecution = Array.from(state.agents.values()).find((agent) => (
        agent.task_id === payload.task_id && ORDINARY_EXECUTION_ROLES.has(agent.agent)
      ));
      assert(
        priorOrdinaryExecution === undefined,
        "executor-strong cannot replace a prior executor or generalist execution attempt for the same task"
      );
    }
    const existingEntry = this.findMatchingAgentEntry(state, payload, { allowAmbiguousActive: false });
    if (payload.recovery_stage !== undefined) {
      assert(!existingEntry, "A claimed recovery attempt cannot be started more than once");
      this.assertRecoveryAgentStart(state, payload);
    }
    const agentId = existingEntry?.agent.agent_id || this.allocateAgentId(state, payload);
    const existing = existingEntry?.agent;
    const agent = {
      protocol_version: PROTOCOL_VERSION,
      run_id: state.runStatus.run_id,
      agent_id: agentId,
      agent: payload.agent,
      status: payload.status || "starting",
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp,
      task_id: payload.task_id,
      batch_id: payload.batch_id,
      attempt: payload.attempt || existing?.attempt || 1,
      started_at: payload.started_at || existing?.started_at || timestamp,
      resource_class: payload.resource_class,
      resource_status: payload.resource_status || defaultResourceStatus(payload.resource_class),
      teardown_required: payload.teardown_required,
      resource_handles: cloneJson(payload.resource_handles),
      cleanup_status: payload.cleanup_status || defaultCleanupStatus(payload.resource_class),
      resolved_configuration: cloneJson(payload.resolved_configuration),
      reasoning: cloneJson(payload.reasoning),
      recovery_stage: cloneJson(payload.recovery_stage),
      recovery_claim_id: payload.recovery_claim_id,
      recovery_runtime_support: cloneJson(payload.recovery_runtime_support)
    };
    state.agents.set(agentId, { ...existing, ...agent });
    state.runStatus.layout = "expanded";

    if (payload.task_id && state.tasks.has(payload.task_id)) {
      const task = state.tasks.get(payload.task_id);
      task.assigned_agent_id = agentId;
      task.agent_ref = { agent_id: agentId, path: toRelativeStatusPath("agents", agentId) };
      if (payload.resource_class && !task.resource_class) {
        task.resource_class = payload.resource_class;
      }
      if (payload.resource_status) {
        task.resource_status = payload.resource_status;
      }
      task.updated_at = timestamp;
      if (payload.recovery_stage !== undefined) {
        task.recovery_agent_id = agentId;
      }
    }

    return this.recompute(state, timestamp);
  }

  onAgentHeartbeat(state, payload, timestamp) {
    const entry = this.resolveAgentEntry(state, payload);
    const agent = entry.agent;
    assert(payload.recovery_stage === undefined, "recovery_stage is runtime-derived after agent.started");
    assert(payload.recovery_claim_id === undefined, "recovery_claim_id is immutable after agent.started");
    assert(payload.recovery_runtime_support === undefined, "recovery_runtime_support is immutable after agent.started");
    assert(payload.failure_evidence === undefined, "failure_evidence is accepted only on agent.finished");
    if (agent.recovery_stage && ["done", "blocked", "failed", "stale"].includes(agent.status)) {
      throw new Error("A terminal recovery attempt cannot receive another heartbeat");
    }

    const patch = { ...payload };
    delete patch.run_id;
    delete patch.agent_id;
    delete patch.timestamp;
    Object.assign(agent, patch);
    agent.updated_at = timestamp;
    agent.last_heartbeat_at = payload.last_heartbeat_at || timestamp;
    this.verifyRecoveryObservation(state, agent);

    if (agent.task_id && state.tasks.has(agent.task_id)) {
      const task = state.tasks.get(agent.task_id);
      task.last_heartbeat_at = agent.last_heartbeat_at;
      task.updated_at = timestamp;
      if (payload.resource_status) {
        task.resource_status = payload.resource_status;
      }
    }

    return this.recompute(state, timestamp);
  }

  onAgentFinished(state, payload, timestamp) {
    const entry = this.resolveAgentEntry(state, payload);
    const agent = entry.agent;
    assert(payload.recovery_stage === undefined, "recovery_stage is runtime-derived after agent.started");
    assert(payload.recovery_claim_id === undefined, "recovery_claim_id is immutable after agent.started");
    assert(payload.recovery_runtime_support === undefined, "recovery_runtime_support is immutable after agent.started");
    if (agent.recovery_stage && ["done", "blocked", "failed"].includes(agent.status)) {
      throw new Error("A terminal recovery attempt cannot be completed more than once");
    }
    if (agent.failure_evidence && payload.failure_evidence !== undefined) {
      assert(
        isDeepStrictEqual(agent.failure_evidence, payload.failure_evidence),
        "A terminal attempt cannot replace its canonical failure evidence"
      );
    }

    const patch = { ...payload };
    delete patch.run_id;
    delete patch.agent_id;
    delete patch.timestamp;
    Object.assign(agent, patch);
    agent.updated_at = timestamp;
    agent.completed_at = payload.completed_at || timestamp;
    if (!agent.last_heartbeat_at) {
      agent.last_heartbeat_at = timestamp;
    }
    this.verifyRecoveryObservation(state, agent);

    if (agent.task_id && state.tasks.has(agent.task_id)) {
      const task = state.tasks.get(agent.task_id);
      task.assigned_agent_id = agent.agent_id;
      task.agent_ref = { agent_id: agent.agent_id, path: toRelativeStatusPath("agents", agent.agent_id) };
      task.last_heartbeat_at = agent.last_heartbeat_at;
      if (payload.resource_status) {
        task.resource_status = payload.resource_status;
      }
      task.updated_at = timestamp;
      this.recordFailureEvidence(state, task, agent);
    }

    return this.recompute(state, timestamp);
  }

  onRunFinished(state, payload, timestamp) {
    assert(state.runStatus, "run.started must be emitted before run.finished");
    state.runStatus.status = payload.status;
    state.runStatus.updated_at = timestamp;
    if (state.checkpoint) {
      state.checkpoint.updated_at = timestamp;
    }
    if (payload.waiting_on !== undefined) {
      state.runStatus.waiting_on = payload.waiting_on;
    }
    if (payload.notes !== undefined) {
      state.runStatus.notes = [...payload.notes];
    }
    if (payload.last_error !== undefined) {
      state.runStatus.last_error = payload.last_error;
    }

    return this.recompute(state, timestamp);
  }

  assertResumeConfiguration(state, incomingConfiguration) {
    this.assertCanonicalRecoveryState(state);
    const savedRunConfiguration = state.runStatus.configuration;
    const savedCheckpointConfiguration = state.checkpoint.configuration;
    if (savedRunConfiguration === undefined && savedCheckpointConfiguration === undefined) {
      assert(
        incomingConfiguration === undefined,
        "Legacy run cannot resume with a newly selected configuration; start a new run"
      );
      return;
    }
    assert(
      savedRunConfiguration !== undefined && savedCheckpointConfiguration !== undefined,
      "Run and checkpoint configuration must be present together"
    );
    const savedRun = canonicalizeRunConfiguration(savedRunConfiguration);
    const savedCheckpoint = canonicalizeRunConfiguration(savedCheckpointConfiguration);
    assert(
      isDeepStrictEqual(savedRun, savedCheckpoint),
      "Run and checkpoint configuration do not match"
    );
    assert(
      incomingConfiguration !== undefined,
      "Configured run resume requires the current preflight configuration"
    );
    const incoming = canonicalizeRunConfiguration(incomingConfiguration);
    assert(
      isDeepStrictEqual(configurationLock(savedRun), configurationLock(incoming)),
      "Current workspace configuration is incompatible with the saved run configuration"
    );
  }

  assertRecoveryClaim(state, task, payload) {
    this.assertCanonicalRecoveryState(state);
    assert(
      ["orchestrator-flow", "orchestrator-pipeline"].includes(state.runStatus.orchestrator),
      "LSA recovery claims are limited to Flow and Pipeline"
    );
    assert(state.checkpoint?.flags?.reasoning_mode === "adaptive", "LSA recovery claim requires adaptive reasoning mode");
    assert(state.checkpoint?.flags?.capability_recovery_mode === "auto", "LSA recovery claim requires capability recovery auto mode");
    assert(typeof payload.recovery_claim_id === "string", "LSA recovery claim requires recovery_claim_id");
    assert(
      !Array.from(state.agents.values()).some((agent) => (
        agent.recovery_claim_id === payload.recovery_claim_id
      )),
      "A recovery claim id cannot be reused after it has started"
    );
    const stage = canonicalizeLsaRecoveryStage(payload.recovery_stage, ["requested"]);
    const runtimeSupport = payload.recovery_runtime_support;
    assert(isObject(runtimeSupport), "LSA recovery claim requires recovery_runtime_support evidence");
    assert(runtimeSupport.model_selector_available === true, "LSA recovery claim requires model selector support");
    assert(runtimeSupport.effort_selector_available === true, "LSA recovery claim requires effort selector support");
    assert(Array.isArray(runtimeSupport.supported_efforts), "LSA recovery claim requires supported effort evidence");
    assert(typeof runtimeSupport.evidence_ref === "string" && runtimeSupport.evidence_ref.length > 0, "LSA recovery claim requires a runtime support evidence_ref");
    this.assertFailureHistoryMatchesAgents(state, task);
    assert(Array.isArray(task.failure_history) && task.failure_history.length >= 2, "LSA recovery requires repeated canonical failure history");
    const latestFailure = task.failure_history.at(-1);
    const latestAgent = state.agents.get(latestFailure.attempt_id);
    assert(latestAgent, "Latest recovery failure attempt is missing");
    const sourceConfiguration = state.runStatus.configuration?.resolved_configurations?.[stage.source.role_binding.role];
    assert(sourceConfiguration, "Saved run configuration has no LSA recovery source role binding");
    const maxRetryRounds = state.runStatus.orchestrator === "orchestrator-pipeline"
      ? state.checkpoint?.flags?.max_retry_rounds
      : state.checkpoint?.flags?.flow_recovery_limit;
    assert(Number.isInteger(maxRetryRounds), "LSA recovery claim requires a persisted workflow retry limit");
    const expected = resolveLsaRecoveryStage({
      role: stage.source.role_binding.role,
      reasoning_mode: state.checkpoint.flags.reasoning_mode,
      capability_recovery_mode: state.checkpoint.flags.capability_recovery_mode,
      workflow_supports_capability_recovery: true,
      source_resolved_configuration: sourceConfiguration,
      target_resolved_configuration: { schema_version: 1, ...stage.target },
      effective_class: latestAgent.reasoning?.effective_class,
      prior_failure_type: latestFailure.failure_type,
      explicit_effort: latestAgent.reasoning?.explicit_override?.effort || null,
      strict: latestAgent.reasoning?.strict === true,
      retry_opportunities_used: task.retry_opportunities_used || 0,
      max_retry_rounds: maxRetryRounds,
      effort_selector_available: runtimeSupport.effort_selector_available,
      model_selector_available: runtimeSupport.model_selector_available,
      runtime_supported_efforts: runtimeSupport.supported_efforts,
      latest_verified_trace: {
        role: latestAgent.agent,
        model_tier: latestAgent.resolved_configuration.role_binding.model_tier,
        model: latestAgent.resolved_configuration.role_binding.model,
        effective_effort: latestAgent.trace_evidence.effective_effort
      },
      failure_history: cloneJson(task.failure_history),
      model_uplift_used: task.capability_recovery_used === true,
      prior_recovery_stage: task.capability_recovery_used === true
        ? cloneJson(task.recovery_stage)
        : null
    });
    assert(
      isDeepStrictEqual(stage, canonicalizeLsaRecoveryStage(expected, ["requested"])),
      "Recovery claim does not match the shared canonical LSA recovery decision"
    );
    assert(payload.retry_opportunities_used === stage.retry_claim.next_used, "Recovery claim must atomically persist its retry count");
    if (stage.uses_model_uplift) {
      assert(payload.capability_recovery_used === true, "Initial LSA recovery claim must atomically persist its model uplift");
    } else {
      assert(payload.capability_recovery_used === undefined, "LSA continuation cannot consume a second model uplift");
    }
  }

  assertRecoveryAgentStart(state, payload) {
    const task = state.tasks.get(payload.task_id);
    assert(task, "A recovery attempt must belong to a canonical task");
    assert(typeof payload.recovery_claim_id === "string", "Recovery agent start requires recovery_claim_id");
    assert(task.recovery_claim_id === payload.recovery_claim_id, "Recovery agent start must match the pre-spawn claim id");
    assert(task.recovery_agent_id === undefined, "A recovery claim cannot bind more than one native agent id");
    assert(
      !Array.from(state.agents.values()).some((agent) => agent.recovery_claim_id === payload.recovery_claim_id),
      "A recovery claim cannot start more than one agent"
    );
    assert(task.recovery_stage?.status === "requested", "Recovery agent requires a requested canonical task stage");
    assert(isDeepStrictEqual(task.recovery_stage, payload.recovery_stage), "Recovery agent stage must match the claimed task stage");
    assert(
      isDeepStrictEqual(task.recovery_runtime_support, payload.recovery_runtime_support),
      "Recovery agent runtime support must match the claimed preflight evidence"
    );
    assert(payload.agent === task.recovery_stage.target.role_binding.role, "Recovery agent role must match the approved target binding");
    assert(
      isDeepStrictEqual(payload.resolved_configuration, { schema_version: 1, ...task.recovery_stage.target }),
      "Recovery agent resolved_configuration must match the approved target binding"
    );
    assert(
      isDeepStrictEqual(payload.reasoning?.recovery_stage, task.recovery_stage),
      "Recovery agent reasoning must carry the claimed requested stage"
    );
    assert(
      payload.reasoning?.dispatch_effort === task.recovery_stage.dispatch_effort,
      "Recovery agent reasoning effort must match the claimed stage"
    );
  }

  verifyRecoveryObservation(state, agent) {
    if (!agent.recovery_stage || !agent.trace_evidence) return;
    const task = state.tasks.get(agent.task_id);
    assert(task?.recovery_claim_id === agent.recovery_claim_id, "Recovery observation does not match the claimed recovery id");
    assert(task?.recovery_agent_id === agent.agent_id, "Recovery observation does not match the bound native agent id");
    assert(agent.reasoning?.enforcement_status === "enforced", "Recovery observation requires enforced reasoning evidence");
    const trace = agent.trace_evidence;
    assert(
      trace.trace_found
        && trace.agent_role === agent.agent
        && trace.model === agent.resolved_configuration?.role_binding?.model
        && trace.effective_effort === agent.recovery_stage.dispatch_effort
        && trace.role_matches === true
        && trace.model_matches === true
        && trace.effort_matches === true,
      "Recovery observation requires exact role, model, and effective-effort trace evidence"
    );
    agent.recovery_stage = {
      ...agent.recovery_stage,
      status: "verified",
      reason: "verified"
    };
    task.recovery_stage = cloneJson(agent.recovery_stage);
  }

  recordFailureEvidence(state, task, agent) {
    if (!agent.failure_evidence) return;
    assert(agent.trace_evidence, "Canonical failure evidence requires trace evidence");
    const evidence = agent.failure_evidence;
    if (evidence.failure_classification !== "product_failure") return;
    const entry = {
      attempt_id: agent.agent_id,
      failure_signature: evidence.failure_signature,
      failure_type: evidence.failure_type,
      material: evidence.material,
      meaningful_progress: evidence.meaningful_progress,
      model_tier: agent.resolved_configuration.role_binding.model_tier,
      effective_effort: agent.trace_evidence.effective_effort
    };
    const history = Array.isArray(task.failure_history) ? task.failure_history : [];
    const existing = history.find((failure) => failure.attempt_id === agent.agent_id);
    if (existing) {
      assert(isDeepStrictEqual(existing, entry), "Canonical failure history cannot replace an existing attempt");
      return;
    }
    task.failure_history = [...history, entry];
    task.prior_failure_type = entry.failure_type;
  }

  assertFailureHistoryMatchesAgents(state, task) {
    if (task.failure_history === undefined) return;
    const seen = new Set();
    for (const failure of task.failure_history) {
      assert(!seen.has(failure.attempt_id), "Canonical failure history cannot repeat an attempt id");
      seen.add(failure.attempt_id);
      const agent = state.agents.get(failure.attempt_id);
      assert(agent, `Canonical failure attempt is missing: ${failure.attempt_id}`);
      assert(agent.task_id === task.task_id, "Canonical failure attempt belongs to a different task");
      assert(agent.failure_evidence?.failure_classification === "product_failure", "Recovery history requires a product failure attempt");
      assert(["blocked", "failed"].includes(agent.status), "Recovery history requires a terminal failed attempt");
      const expected = {
        attempt_id: agent.agent_id,
        failure_signature: agent.failure_evidence.failure_signature,
        failure_type: agent.failure_evidence.failure_type,
        material: agent.failure_evidence.material,
        meaningful_progress: agent.failure_evidence.meaningful_progress,
        model_tier: agent.resolved_configuration?.role_binding?.model_tier,
        effective_effort: agent.trace_evidence?.effective_effort
      };
      assert(isDeepStrictEqual(failure, expected), "Recovery history does not match its canonical agent attempt");
      assert(
        agent.trace_evidence?.trace_found
          && agent.trace_evidence.agent_role === agent.agent
          && agent.trace_evidence.model === agent.resolved_configuration?.role_binding?.model
          && agent.trace_evidence.role_matches === true
          && agent.trace_evidence.model_matches === true
          && agent.trace_evidence.effort_matches === true,
        "Recovery history requires exact role, model, and effort trace evidence"
      );
    }
  }

  assertCanonicalRecoveryState(state) {
    for (const task of state.tasks.values()) {
      this.assertFailureHistoryMatchesAgents(state, task);
      if (!task.recovery_stage) continue;
      assert(task.capability_recovery_used === true, "Persisted recovery stage lost its model uplift accounting");
      assert(task.retry_opportunities_used >= task.recovery_stage.retry_claim.next_used, "Persisted recovery stage exceeds its cumulative retry accounting");
      const agent = task.recovery_agent_id === undefined ? undefined : state.agents.get(task.recovery_agent_id);
      if (task.recovery_stage.status === "verified") {
        assert(agent?.recovery_stage?.status === "verified", "Verified task recovery stage is missing its verified attempt");
        assert(isDeepStrictEqual(agent.recovery_stage, task.recovery_stage), "Task and agent recovery stages do not match");
      } else if (agent) {
        assert(agent.recovery_stage?.status === "requested", "Requested task recovery stage has conflicting attempt state");
        assert(!["done", "blocked", "failed"].includes(agent.status), "Terminal recovery attempt is missing verified trace evidence");
      } else {
        assert(task.recovery_agent_id === undefined, "Claimed recovery agent id is missing its canonical attempt");
      }
    }
  }

  allocateAgentId(state, payload) {
    const requestedId = payload.agent_id;
    assert(requestedId, "agent.started requires agent_id");
    if (!state.agents.has(requestedId)) {
      return requestedId;
    }

    const attemptSuffix = payload.attempt !== undefined ? `attempt-${payload.attempt}` : undefined;
    const taskSuffix = payload.task_id ? `task-${this.sanitizeAgentIdPart(payload.task_id)}` : undefined;
    const batchSuffix = payload.batch_id ? `batch-${this.sanitizeAgentIdPart(payload.batch_id)}` : undefined;
    const candidateParts = [
      [attemptSuffix, taskSuffix, batchSuffix],
      [attemptSuffix, taskSuffix],
      [attemptSuffix, batchSuffix],
      [attemptSuffix],
      [taskSuffix, batchSuffix],
      [taskSuffix],
      [batchSuffix]
    ];

    for (const parts of candidateParts) {
      const suffix = parts.filter(Boolean).join("--");
      if (!suffix) {
        continue;
      }
      const candidate = this.fitAgentId(`${requestedId}--${suffix}`);
      if (!state.agents.has(candidate)) {
        return candidate;
      }
    }

    let sequence = 2;
    while (state.agents.has(this.fitAgentId(`${requestedId}--instance-${sequence}`))) {
      sequence += 1;
    }
    return this.fitAgentId(`${requestedId}--instance-${sequence}`);
  }

  fitAgentId(value) {
    if (value.length <= 128) {
      return value;
    }
    const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
    const prefix = value.slice(0, 114).replace(/[._-]+$/g, "") || "agent";
    return `${prefix}--${digest}`;
  }

  sanitizeAgentIdPart(value) {
    return String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  }

  findMatchingAgentEntry(state, payload, options = {}) {
    const requestedId = payload.agent_id;
    const exact = [];
    const derived = [];
    for (const [key, agent] of state.agents.entries()) {
      if (agent.agent_id === requestedId) {
        exact.push({ key, agent });
      } else if (typeof requestedId === "string" && agent.agent_id.startsWith(`${requestedId}--`)) {
        derived.push({ key, agent });
      }
    }

    let candidates = exact.concat(derived);
    if (payload.attempt !== undefined) {
      candidates = candidates.filter(({ agent }) => agent.attempt === payload.attempt);
    }
    if (payload.task_id !== undefined) {
      candidates = candidates.filter(({ agent }) => agent.task_id === payload.task_id);
    }
    if (payload.batch_id !== undefined) {
      candidates = candidates.filter(({ agent }) => agent.batch_id === payload.batch_id);
    }

    if (candidates.length <= 1) {
      return candidates[0];
    }

    const activeCandidates = candidates.filter(({ agent }) => isAgentActive(agent.status));
    if (options.allowAmbiguousActive !== false && activeCandidates.length === 1) {
      return activeCandidates[0];
    }

    return undefined;
  }

  resolveAgentEntry(state, payload) {
    const entry = this.findMatchingAgentEntry(state, payload, { allowAmbiguousActive: true });
    if (entry) {
      return entry;
    }

    const candidates = [];
    for (const [key, agent] of state.agents.entries()) {
      if (agent.agent_id === payload.agent_id || agent.agent_id.startsWith(`${payload.agent_id}--`)) {
        candidates.push({ key, agent });
      }
    }

    if (!candidates.length) {
      throw new Error(`Unknown agent_id: ${payload.agent_id}`);
    }

    throw new Error(
      `Ambiguous agent_id: ${payload.agent_id}. Include attempt, task_id, batch_id, or the disambiguated runtime agent_id when reusing base agent ids.`
    );
  }

  recompute(state, timestamp) {
    assert(state.runStatus, "run status is required");

    const taskRefs = [];
    const agentRefs = [];
    const taskCounts = this.emptyTaskCounts();
    const activeTaskIds = [];
    const activeAgentIds = [];
    let lastHeartbeatAt = state.runStatus.last_heartbeat_at;

    for (const task of state.tasks.values()) {
      task.protocol_version = PROTOCOL_VERSION;
      task.run_id = state.runStatus.run_id;
      taskRefs.push({ task_id: task.task_id, path: toRelativeStatusPath("tasks", task.task_id) });
      taskCounts[task.status] += 1;
      if (isTaskActive(task.status)) {
        activeTaskIds.push(task.task_id);
      }
      if (task.last_heartbeat_at && (!lastHeartbeatAt || task.last_heartbeat_at > lastHeartbeatAt)) {
        lastHeartbeatAt = task.last_heartbeat_at;
      }
    }

    for (const agent of state.agents.values()) {
      agent.protocol_version = PROTOCOL_VERSION;
      agent.run_id = state.runStatus.run_id;
      agentRefs.push({ agent_id: agent.agent_id, path: toRelativeStatusPath("agents", agent.agent_id) });
      if (isAgentActive(agent.status)) {
        activeAgentIds.push(agent.agent_id);
      }
      if (agent.last_heartbeat_at && (!lastHeartbeatAt || agent.last_heartbeat_at > lastHeartbeatAt)) {
        lastHeartbeatAt = agent.last_heartbeat_at;
      }
    }

    state.runStatus.protocol_version = PROTOCOL_VERSION;
    state.runStatus.updated_at = timestamp;
    state.runStatus.task_counts = canonicalizeTaskCounts(taskCounts);
    state.runStatus.active_task_ids = activeTaskIds.sort();
    state.runStatus.active_agent_ids = activeAgentIds.sort();
    state.runStatus.task_refs = taskRefs.length ? taskRefs.sort((a, b) => a.task_id.localeCompare(b.task_id)) : undefined;
    state.runStatus.agent_refs = agentRefs.length ? agentRefs.sort((a, b) => a.agent_id.localeCompare(b.agent_id)) : undefined;
    state.runStatus.layout = taskRefs.length || agentRefs.length ? "expanded" : (state.runStatus.layout || "run-only");
    if (lastHeartbeatAt) {
      state.runStatus.last_heartbeat_at = lastHeartbeatAt;
    }

    for (const key of TASK_COUNT_ORDER) {
      if (state.runStatus.task_counts[key] === undefined) {
        state.runStatus.task_counts[key] = 0;
      }
    }

    if (state.checkpoint) {
      state.checkpoint.protocol_version = PROTOCOL_VERSION;
    }

    return state;
  }

  emptyTaskCounts() {
    return canonicalizeTaskCounts({});
  }
}

function configurationLock(configuration) {
  return {
    profile: configuration.profile,
    model_mapping: configuration.model_mapping,
    configuration_identity: configuration.configuration_identity,
    resolved_configurations: configuration.resolved_configurations
  };
}

module.exports = { StatusProjector };
