const path = require("path");
const { isDeepStrictEqual } = require("util");

const { RunRegistry } = require("./run-registry");
const { StatusProjector } = require("./status-projector");
const { StatusWriter } = require("./status-writer");
const { assert, nowIso } = require("./utils");

const STATUS_RUNTIME_EVENTS = [
  "run.started",
  "run.resumed",
  "stage.completed",
  "tasks.registered",
  "task.updated",
  "agent.started",
  "agent.heartbeat",
  "agent.finished",
  "run.finished"
];
const STATUS_RUNTIME_BATCH_EVENT = "batch";
const HEARTBEAT_DEBOUNCE_MS = 15000;
const HEARTBEAT_IGNORED_FIELDS = new Set([
  "checkpoint_path",
  "last_heartbeat_at",
  "output_root",
  "run_id",
  "timestamp",
  "working_project_dir"
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function validateEventPayload(eventName, payload) {
  if (eventName !== "agent.started") {
    return;
  }

  const missingFields = [];
  if (!isNonEmptyString(payload.agent_id)) {
    missingFields.push("agent_id");
  }
  if (!isNonEmptyString(payload.agent)) {
    missingFields.push("agent");
  }

  if (missingFields.length) {
    throw new Error(`agent.started requires non-empty string field(s): ${missingFields.join(", ")}`);
  }
}

class StatusRuntime {
  constructor(options = {}) {
    this.writer = options.writer || new StatusWriter();
    this.registry = options.registry || new RunRegistry({ writer: this.writer });
    this.projector = options.projector || new StatusProjector();
  }

  async applyEvent(eventName, payload) {
    const eventPayload = payload && payload.timestamp ? payload : { ...payload, timestamp: nowIso() };
    validateEventPayload(eventName, eventPayload);

    const run = await this.resolveRun(eventName, eventPayload);

    const state = await this.registry.loadState(run.runDir);
    state.runDir = run.runDir;

    if (eventName === "agent.heartbeat" && this.shouldCoalesceHeartbeat(state, eventPayload)) {
      return this.buildResult(eventName, run, state, { coalesced: true });
    }

    this.projector.applyEvent(state, eventName, eventPayload);
    await this.persistState(run, state, this.captureDirtyState(state, eventPayload.timestamp));

    return this.buildResult(eventName, run, state);
  }

  async applyEvents(events) {
    assert(Array.isArray(events) && events.length > 0, "batch requires a non-empty events array");

    const normalizedEvents = events.map((entry, index) => {
      assert(entry && typeof entry === "object", `batch event #${index + 1} must be an object`);
      assert(isNonEmptyString(entry.event), `batch event #${index + 1} requires a non-empty string event`);
      assert(STATUS_RUNTIME_EVENTS.includes(entry.event), `Unsupported status runtime event in batch: ${entry.event}`);
      assert(
        entry.payload === undefined || (entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)),
        `batch event #${index + 1} payload must be an object when provided`
      );
      const payload = entry.payload && entry.payload.timestamp
        ? entry.payload
        : { ...(entry.payload || {}), timestamp: entry.payload?.timestamp || nowIso() };
      validateEventPayload(entry.event, payload);
      return { event: entry.event, payload };
    });

    const first = normalizedEvents[0];
    const run = await this.resolveRun(first.event, first.payload);
    for (const entry of normalizedEvents.slice(1)) {
      assert(
        entry.payload.output_root === first.payload.output_root,
        "batch events must share the same output_root"
      );
      assert(entry.payload.run_id === first.payload.run_id, "batch events must share the same run_id");
    }

    const state = await this.registry.loadState(run.runDir);
    state.runDir = run.runDir;

    const dirty = this.createDirtyState();
    let coalescedEvents = 0;
    for (const entry of normalizedEvents) {
      if (entry.event === "agent.heartbeat" && this.shouldCoalesceHeartbeat(state, entry.payload)) {
        coalescedEvents += 1;
        continue;
      }
      this.projector.applyEvent(state, entry.event, entry.payload);
      this.mergeDirtyState(dirty, this.captureDirtyState(state, entry.payload.timestamp));
    }

    await this.persistState(run, state, dirty);

    return this.buildResult(STATUS_RUNTIME_BATCH_EVENT, run, state, {
      event_count: normalizedEvents.length,
      events: normalizedEvents.map((entry) => entry.event),
      coalesced_events: coalescedEvents
    });
  }

  async resolveRun(eventName, payload) {
    if (eventName === "run.started") {
      return this.registry.resolveFreshRun({ output_root: payload.output_root, run_id: payload.run_id });
    }
    if (eventName === "run.resumed") {
      return this.registry.resolveResumeRun({
        output_root: payload.output_root,
        run_id: payload.run_id,
        orchestrator: payload.orchestrator
      });
    }
    return this.registry.resolveFreshRun({ output_root: payload.output_root, run_id: payload.run_id });
  }

  async persistState(run, state, dirty) {
    if (state.checkpoint && dirty.checkpoint) {
      await this.writer.writeCheckpoint(run.checkpointPath, state.checkpoint);
    }
    if (state.runStatus && dirty.runStatus) {
      await this.writer.writeRunStatus(run.runStatusPath, state.runStatus);
    }

    for (const [taskId, task] of state.tasks.entries()) {
      if (dirty.tasks.has(taskId)) {
        await this.writer.writeTaskStatus(path.join(run.tasksDir, `${taskId}.json`), task);
      }
    }
    for (const [agentId, agent] of state.agents.entries()) {
      if (dirty.agents.has(agentId)) {
        await this.writer.writeAgentStatus(path.join(run.agentsDir, `${agentId}.json`), agent);
      }
    }
  }

  createDirtyState() {
    return {
      checkpoint: false,
      runStatus: false,
      tasks: new Set(),
      agents: new Set()
    };
  }

  buildResult(eventName, run, state, extra = {}) {
    return {
      event: eventName,
      run_id: state.runStatus?.run_id,
      run_dir: run.runDir,
      checkpoint_path: run.checkpointPath,
      run_status_path: run.runStatusPath,
      task_count: state.tasks.size,
      agent_count: state.agents.size,
      layout: state.runStatus?.layout,
      ...extra
    };
  }

  captureDirtyState(state, timestamp) {
    const dirty = this.createDirtyState();
    if (state.checkpoint && this.wasEntityTouched(state.checkpoint, timestamp)) {
      dirty.checkpoint = true;
    }
    if (state.runStatus && this.wasEntityTouched(state.runStatus, timestamp)) {
      dirty.runStatus = true;
    }
    for (const [taskId, task] of state.tasks.entries()) {
      if (this.wasEntityTouched(task, timestamp)) {
        dirty.tasks.add(taskId);
      }
    }
    for (const [agentId, agent] of state.agents.entries()) {
      if (this.wasEntityTouched(agent, timestamp)) {
        dirty.agents.add(agentId);
      }
    }
    return dirty;
  }

  mergeDirtyState(target, source) {
    target.checkpoint = target.checkpoint || source.checkpoint;
    target.runStatus = target.runStatus || source.runStatus;
    for (const taskId of source.tasks) {
      target.tasks.add(taskId);
    }
    for (const agentId of source.agents) {
      target.agents.add(agentId);
    }
    return target;
  }

  shouldCoalesceHeartbeat(state, payload) {
    const entry = this.projector.resolveAgentEntry(state, payload);
    const agent = entry.agent;
    const previousAt = Date.parse(agent.last_heartbeat_at || agent.updated_at || agent.started_at || "");
    const nextAt = Date.parse(payload.last_heartbeat_at || payload.timestamp || "");

    if (!Number.isFinite(previousAt) || !Number.isFinite(nextAt) || nextAt < previousAt) {
      return false;
    }
    if (nextAt - previousAt >= HEARTBEAT_DEBOUNCE_MS) {
      return false;
    }

    for (const [key, value] of Object.entries(payload)) {
      if (HEARTBEAT_IGNORED_FIELDS.has(key)) {
        continue;
      }
      if (!isDeepStrictEqual(agent[key], value)) {
        return false;
      }
    }

    return true;
  }

  wasEntityTouched(entity, timestamp) {
    if (!entity || !timestamp) {
      return true;
    }
    return entity.updated_at === timestamp || entity.created_at === timestamp;
  }
}

function createStatusRuntime(options) {
  return new StatusRuntime(options);
}

module.exports = {
  STATUS_RUNTIME_BATCH_EVENT,
  RunRegistry,
  STATUS_RUNTIME_EVENTS,
  StatusProjector,
  StatusRuntime,
  StatusWriter,
  createStatusRuntime
};
