const path = require("path");

const { RunRegistry } = require("./run-registry");
const { StatusProjector } = require("./status-projector");
const { StatusWriter } = require("./status-writer");
const { nowIso } = require("./utils");

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

    let run;
    if (eventName === "run.started") {
      run = await this.registry.resolveFreshRun({ output_root: eventPayload.output_root, run_id: eventPayload.run_id });
    } else if (eventName === "run.resumed") {
      run = await this.registry.resolveResumeRun({
        output_root: eventPayload.output_root,
        run_id: eventPayload.run_id,
        orchestrator: eventPayload.orchestrator
      });
    } else {
      run = await this.registry.resolveFreshRun({ output_root: eventPayload.output_root, run_id: eventPayload.run_id });
    }

    const state = await this.registry.loadState(run.runDir);
    state.runDir = run.runDir;

    this.projector.applyEvent(state, eventName, eventPayload);
    await this.persistState(run, state, eventPayload.timestamp);

    return {
      event: eventName,
      run_id: state.runStatus?.run_id,
      run_dir: run.runDir,
      checkpoint_path: run.checkpointPath,
      run_status_path: run.runStatusPath,
      task_count: state.tasks.size,
      agent_count: state.agents.size,
      layout: state.runStatus?.layout
    };
  }

  async persistState(run, state, timestamp) {
    if (state.checkpoint && this.wasEntityTouched(state.checkpoint, timestamp)) {
      await this.writer.writeCheckpoint(run.checkpointPath, state.checkpoint);
    }
    if (state.runStatus && this.wasEntityTouched(state.runStatus, timestamp)) {
      await this.writer.writeRunStatus(run.runStatusPath, state.runStatus);
    }

    for (const [taskId, task] of state.tasks.entries()) {
      if (this.wasEntityTouched(task, timestamp)) {
        await this.writer.writeTaskStatus(path.join(run.tasksDir, `${taskId}.json`), task);
      }
    }
    for (const [agentId, agent] of state.agents.entries()) {
      if (this.wasEntityTouched(agent, timestamp)) {
        await this.writer.writeAgentStatus(path.join(run.agentsDir, `${agentId}.json`), agent);
      }
    }
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
  RunRegistry,
  STATUS_RUNTIME_EVENTS,
  StatusProjector,
  StatusRuntime,
  StatusWriter,
  createStatusRuntime
};
