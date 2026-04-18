const path = require("path");

const { PROTOCOL_VERSION, TASK_COUNT_ORDER } = require("./constants");
const { canonicalizeTaskCounts } = require("./schema-lite");
const { assert, cloneJson, nowIso, toRelativeStatusPath } = require("./utils");

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

class StatusProjector {
  applyEvent(state, eventName, payload) {
    const timestamp = payload.timestamp || nowIso();
    switch (eventName) {
      case "run.started":
        return this.onRunStarted(state, payload, timestamp);
      case "run.resumed":
        return this.onRunResumed(state, payload, timestamp);
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
      flags: payload.flags || {},
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

    if (payload.flags && typeof payload.flags === "object") {
      state.checkpoint.flags = cloneJson(payload.flags);
    }
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
    state.checkpoint.updated_at = timestamp;

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
      const task = {
        protocol_version: PROTOCOL_VERSION,
        run_id: state.runStatus.run_id,
        task_id: taskId,
        summary: input.summary,
        status: input.status || existing?.status || "pending",
        created_at: createdAt,
        updated_at: timestamp,
        trace_ids: input.trace_ids,
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

    const patch = { ...payload };
    delete patch.run_id;
    delete patch.task_id;
    delete patch.timestamp;
    Object.assign(task, patch);
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
    const existingEntry = this.findMatchingAgentEntry(state, payload, { allowAmbiguousActive: false });
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
      cleanup_status: payload.cleanup_status || defaultCleanupStatus(payload.resource_class)
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
    }

    return this.recompute(state, timestamp);
  }

  onAgentHeartbeat(state, payload, timestamp) {
    const entry = this.resolveAgentEntry(state, payload);
    const agent = entry.agent;

    const patch = { ...payload };
    delete patch.run_id;
    delete patch.agent_id;
    delete patch.timestamp;
    Object.assign(agent, patch);
    agent.updated_at = timestamp;
    agent.last_heartbeat_at = payload.last_heartbeat_at || timestamp;

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

    if (agent.task_id && state.tasks.has(agent.task_id)) {
      const task = state.tasks.get(agent.task_id);
      task.assigned_agent_id = agent.agent_id;
      task.agent_ref = { agent_id: agent.agent_id, path: toRelativeStatusPath("agents", agent.agent_id) };
      task.last_heartbeat_at = agent.last_heartbeat_at;
      if (payload.resource_status) {
        task.resource_status = payload.resource_status;
      }
      task.updated_at = timestamp;
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
      const candidate = `${requestedId}--${suffix}`;
      if (!state.agents.has(candidate)) {
        return candidate;
      }
    }

    let sequence = 2;
    while (state.agents.has(`${requestedId}--instance-${sequence}`)) {
      sequence += 1;
    }
    return `${requestedId}--instance-${sequence}`;
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

module.exports = { StatusProjector };
