const path = require("path");

const { RunRegistry } = require("./run-registry");
const { StatusProjector } = require("./status-projector");
const { StatusWriter } = require("./status-writer");

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
    validateEventPayload(eventName, payload);

    let run;
    if (eventName === "run.started") {
      run = await this.registry.resolveFreshRun({ output_root: payload.output_root, run_id: payload.run_id });
    } else if (eventName === "run.resumed") {
      run = await this.registry.resolveResumeRun({
        output_root: payload.output_root,
        run_id: payload.run_id,
        orchestrator: payload.orchestrator
      });
    } else {
      run = await this.registry.resolveFreshRun({ output_root: payload.output_root, run_id: payload.run_id });
    }

    const state = await this.registry.loadState(run.runDir);
    state.runDir = run.runDir;

    this.projector.applyEvent(state, eventName, payload);
    await this.persistState(run, state);

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

  async persistState(run, state) {
    if (state.checkpoint) {
      await this.writer.writeCheckpoint(run.checkpointPath, state.checkpoint);
    }
    if (state.runStatus) {
      await this.writer.writeRunStatus(run.runStatusPath, state.runStatus);
    }

    for (const [taskId, task] of state.tasks.entries()) {
      await this.writer.writeTaskStatus(path.join(run.tasksDir, `${taskId}.json`), task);
    }
    for (const [agentId, agent] of state.agents.entries()) {
      await this.writer.writeAgentStatus(path.join(run.agentsDir, `${agentId}.json`), agent);
    }
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
