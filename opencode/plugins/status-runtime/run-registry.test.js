const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { StatusProjector, StatusRuntime } = require("./index");
const { RunRegistry } = require("./run-registry");
const { ORCHESTRATORS } = require("./constants");
const {
  canonicalizeAgentStatus,
  canonicalizeCheckpoint,
  canonicalizeRunStatus,
  canonicalizeTaskStatus
} = require("./schema-lite");
const { StatusWriter } = require("./status-writer");
const { resolvePayloadPath, resolvePayloadPathAnchor } = require("./utils");

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function setMtime(filePath, seconds) {
  await fs.utimes(filePath, seconds, seconds);
}

test("resolveResumeRun picks newest compatible checkpoint-backed run", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const olderRun = path.join(tempRoot, "run-older");
  const newerMismatch = path.join(tempRoot, "run-newer-mismatch");

  await writeJson(path.join(olderRun, "checkpoint.json"), {
    pipeline_id: "pipeline-compatible",
    orchestrator: "orchestrator-pipeline"
  });
  await writeJson(path.join(olderRun, "status", "run-status.json"), {
    run_id: "run-compatible",
    orchestrator: "orchestrator-pipeline"
  });
  await writeJson(path.join(newerMismatch, "checkpoint.json"), {
    pipeline_id: "pipeline-mismatch",
    orchestrator: "orchestrator-flow"
  });
  await writeJson(path.join(newerMismatch, "status", "run-status.json"), {
    run_id: "run-mismatch",
    orchestrator: "orchestrator-pipeline"
  });

  await setMtime(path.join(olderRun, "checkpoint.json"), 1710000000);
  await setMtime(path.join(newerMismatch, "checkpoint.json"), 1720000000);

  const registry = new RunRegistry();
  const run = await registry.resolveResumeRun({
    output_root: tempRoot,
    orchestrator: "orchestrator-pipeline"
  });

  assert.equal(run.runDir, olderRun);
  assert.equal(run.runId, "run-compatible");
});

test("resolveResumeRun breaks mtime ties by newest run name", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runA = path.join(tempRoot, "run-20260320-101500");
  const runB = path.join(tempRoot, "run-20260320-101530");

  for (const runDir of [runA, runB]) {
    await writeJson(path.join(runDir, "checkpoint.json"), {
      pipeline_id: path.basename(runDir),
      orchestrator: "orchestrator-pipeline"
    });
    await writeJson(path.join(runDir, "status", "run-status.json"), {
      run_id: path.basename(runDir),
      orchestrator: "orchestrator-pipeline"
    });
    await setMtime(path.join(runDir, "checkpoint.json"), 1710000000);
  }

  const registry = new RunRegistry();
  const run = await registry.resolveResumeRun({
    output_root: tempRoot,
    orchestrator: "orchestrator-pipeline"
  });

  assert.equal(run.runDir, runB);
  assert.equal(run.runId, path.basename(runB));
});

test("status projector preserves distinct agent records when base agent_id is reused", () => {
  const projector = new StatusProjector();
  const state = {
    runDir: "/tmp/run-duplicate-agents",
    runStatus: null,
    checkpoint: null,
    tasks: new Map(),
    agents: new Map()
  };

  projector.applyEvent(state, "run.started", {
    run_id: "run-duplicate-agents",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Investigate agent reuse",
    timestamp: "2026-03-25T10:00:00.000Z"
  });

  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-a",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T10:01:00.000Z"
  });

  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-b",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T10:02:00.000Z"
  });

  assert.equal(state.agents.size, 2);
  assert.deepEqual(
    Array.from(state.agents.keys()).sort(),
    ["executor", "executor--attempt-1--task-task-b"]
  );
  assert.deepEqual(
    state.runStatus.agent_refs,
    [
      { agent_id: "executor", path: "status/agents/executor.json" },
      {
        agent_id: "executor--attempt-1--task-task-b",
        path: "status/agents/executor--attempt-1--task-task-b.json"
      }
    ]
  );
  assert.deepEqual(state.runStatus.active_agent_ids, ["executor", "executor--attempt-1--task-task-b"]);
});

test("status projector updates the matching reused agent record when attempt metadata is provided", () => {
  const projector = new StatusProjector();
  const state = {
    runDir: "/tmp/run-duplicate-agents-finish",
    runStatus: null,
    checkpoint: null,
    tasks: new Map(),
    agents: new Map()
  };

  projector.applyEvent(state, "run.started", {
    run_id: "run-duplicate-agents-finish",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Investigate agent reuse",
    timestamp: "2026-03-25T11:00:00.000Z"
  });

  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents-finish",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-a",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T11:01:00.000Z"
  });
  projector.applyEvent(state, "agent.finished", {
    run_id: "run-duplicate-agents-finish",
    agent_id: "executor",
    task_id: "task-a",
    attempt: 1,
    status: "done",
    timestamp: "2026-03-25T11:02:00.000Z"
  });

  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents-finish",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-b",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T11:03:00.000Z"
  });
  projector.applyEvent(state, "agent.finished", {
    run_id: "run-duplicate-agents-finish",
    agent_id: "executor",
    task_id: "task-b",
    attempt: 1,
    status: "blocked",
    error: "teardown failed",
    timestamp: "2026-03-25T11:04:00.000Z"
  });

  assert.equal(state.agents.get("executor").status, "done");
  assert.equal(state.agents.get("executor").task_id, "task-a");
  const reusedAgent = state.agents.get("executor--attempt-1--task-task-b");
  assert.ok(reusedAgent);
  assert.equal(reusedAgent.status, "blocked");
  assert.equal(reusedAgent.task_id, "task-b");
  assert.equal(reusedAgent.error, "teardown failed");
});

test("status projector rejects ambiguous heartbeat updates when reused agent ids are not disambiguated", () => {
  const projector = new StatusProjector();
  const state = {
    runDir: "/tmp/run-duplicate-agents-ambiguous",
    runStatus: null,
    checkpoint: null,
    tasks: new Map(),
    agents: new Map()
  };

  projector.applyEvent(state, "run.started", {
    run_id: "run-duplicate-agents-ambiguous",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Investigate ambiguous reuse",
    timestamp: "2026-03-25T12:00:00.000Z"
  });

  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents-ambiguous",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-a",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T12:01:00.000Z"
  });
  projector.applyEvent(state, "agent.started", {
    run_id: "run-duplicate-agents-ambiguous",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-b",
    attempt: 1,
    status: "running",
    timestamp: "2026-03-25T12:02:00.000Z"
  });

  assert.throws(
    () =>
      projector.applyEvent(state, "agent.heartbeat", {
        run_id: "run-duplicate-agents-ambiguous",
        agent_id: "executor",
        status: "running",
        timestamp: "2026-03-25T12:03:00.000Z"
      }),
    /Ambiguous agent_id: executor/
  );
});

test("status runtime rejects agent.started without agent_id and agent before registry work", async () => {
  let registryTouched = false;
  const runtime = new StatusRuntime({
    registry: {
      async resolveFreshRun() {
        registryTouched = true;
        throw new Error("registry should not be called");
      }
    }
  });

  await assert.rejects(
    runtime.applyEvent("agent.started", {
      output_root: "/tmp/status-runtime-validation",
      run_id: "run-validation"
    }),
    /agent\.started requires non-empty string field\(s\): agent_id, agent/
  );
  assert.equal(registryTouched, false);
});

test("status runtime rejects agent.started without agent using a clear message", async () => {
  let registryTouched = false;
  const runtime = new StatusRuntime({
    registry: {
      async resolveFreshRun() {
        registryTouched = true;
        throw new Error("registry should not be called");
      }
    }
  });

  await assert.rejects(
    runtime.applyEvent("agent.started", {
      output_root: "/tmp/status-runtime-validation",
      run_id: "run-validation",
      agent_id: "repo-scout-stage0"
    }),
    /agent\.started requires non-empty string field\(s\): agent/
  );
  assert.equal(registryTouched, false);
});

test("status runtime only rewrites entities touched by the current event", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-dirty-writes-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  class CountingWriter extends StatusWriter {
    constructor() {
      super();
      this.calls = [];
    }

    async writeCheckpoint(filePath, value) {
      this.calls.push(["checkpoint", path.basename(filePath), canonicalizeCheckpoint(value)]);
      return super.writeCheckpoint(filePath, value);
    }

    async writeRunStatus(filePath, value) {
      this.calls.push(["run-status", path.basename(filePath), canonicalizeRunStatus(value)]);
      return super.writeRunStatus(filePath, value);
    }

    async writeTaskStatus(filePath, value) {
      this.calls.push(["task", path.basename(filePath), canonicalizeTaskStatus(value)]);
      return super.writeTaskStatus(filePath, value);
    }

    async writeAgentStatus(filePath, value) {
      this.calls.push(["agent", path.basename(filePath), canonicalizeAgentStatus(value)]);
      return super.writeAgentStatus(filePath, value);
    }
  }

  const writer = new CountingWriter();
  const runtime = new StatusRuntime({ writer, registry: new RunRegistry({ writer }) });

  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-dirty-writes",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Exercise dirty writes",
    timestamp: "2026-04-18T02:00:00.000Z"
  });

  writer.calls = [];
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: "run-dirty-writes",
    timestamp: "2026-04-18T02:01:00.000Z",
    tasks: [
      { task_id: "task-a", summary: "Task A" },
      { task_id: "task-b", summary: "Task B" }
    ]
  });

  assert.deepEqual(
    writer.calls.map(([kind, name]) => [kind, name]),
    [
      ["run-status", "run-status.json"],
      ["task", "task-a.json"],
      ["task", "task-b.json"]
    ]
  );

  writer.calls = [];
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot,
    run_id: "run-dirty-writes",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-a",
    status: "running",
    timestamp: "2026-04-18T02:02:00.000Z"
  });

  assert.deepEqual(
    writer.calls.map(([kind, name]) => [kind, name]),
    [
      ["run-status", "run-status.json"],
      ["task", "task-a.json"],
      ["agent", "executor.json"]
    ]
  );
});

test("status runtime coalesces redundant heartbeats inside the debounce window", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-heartbeat-coalesce-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  class CountingWriter extends StatusWriter {
    constructor() {
      super();
      this.calls = [];
    }

    async writeCheckpoint(filePath, value) {
      this.calls.push(["checkpoint", path.basename(filePath), canonicalizeCheckpoint(value)]);
      return super.writeCheckpoint(filePath, value);
    }

    async writeRunStatus(filePath, value) {
      this.calls.push(["run-status", path.basename(filePath), canonicalizeRunStatus(value)]);
      return super.writeRunStatus(filePath, value);
    }

    async writeTaskStatus(filePath, value) {
      this.calls.push(["task", path.basename(filePath), canonicalizeTaskStatus(value)]);
      return super.writeTaskStatus(filePath, value);
    }

    async writeAgentStatus(filePath, value) {
      this.calls.push(["agent", path.basename(filePath), canonicalizeAgentStatus(value)]);
      return super.writeAgentStatus(filePath, value);
    }
  }

  const writer = new CountingWriter();
  const runtime = new StatusRuntime({ writer, registry: new RunRegistry({ writer }) });

  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-heartbeat-coalesce",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Exercise heartbeat coalescing",
    timestamp: "2026-04-18T04:00:00.000Z"
  });
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: "run-heartbeat-coalesce",
    timestamp: "2026-04-18T04:00:01.000Z",
    tasks: [{ task_id: "task-a", summary: "Task A" }]
  });
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot,
    run_id: "run-heartbeat-coalesce",
    agent_id: "executor",
    agent: "executor",
    task_id: "task-a",
    status: "running",
    resource_status: "running",
    timestamp: "2026-04-18T04:00:02.000Z"
  });

  writer.calls = [];
  const coalesced = await runtime.applyEvent("agent.heartbeat", {
    output_root: tempRoot,
    run_id: "run-heartbeat-coalesce",
    agent_id: "executor",
    status: "running",
    resource_status: "running",
    last_heartbeat_at: "2026-04-18T04:00:10.000Z",
    timestamp: "2026-04-18T04:00:10.000Z"
  });

  assert.equal(coalesced.coalesced, true);
  assert.deepEqual(writer.calls, []);

  const flushed = await runtime.applyEvent("agent.heartbeat", {
    output_root: tempRoot,
    run_id: "run-heartbeat-coalesce",
    agent_id: "executor",
    status: "running",
    resource_status: "running",
    last_heartbeat_at: "2026-04-18T04:00:18.000Z",
    timestamp: "2026-04-18T04:00:18.000Z"
  });

  assert.equal(flushed.coalesced, undefined);
  assert.deepEqual(
    writer.calls.map(([kind, name]) => [kind, name]),
    [
      ["run-status", "run-status.json"],
      ["task", "task-a.json"],
      ["agent", "executor.json"]
    ]
  );
});

test("status runtime can apply a batch of events with one final flush", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-batch-events-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  class CountingWriter extends StatusWriter {
    constructor() {
      super();
      this.calls = [];
    }

    async writeCheckpoint(filePath, value) {
      this.calls.push(["checkpoint", path.basename(filePath), canonicalizeCheckpoint(value)]);
      return super.writeCheckpoint(filePath, value);
    }

    async writeRunStatus(filePath, value) {
      this.calls.push(["run-status", path.basename(filePath), canonicalizeRunStatus(value)]);
      return super.writeRunStatus(filePath, value);
    }

    async writeTaskStatus(filePath, value) {
      this.calls.push(["task", path.basename(filePath), canonicalizeTaskStatus(value)]);
      return super.writeTaskStatus(filePath, value);
    }

    async writeAgentStatus(filePath, value) {
      this.calls.push(["agent", path.basename(filePath), canonicalizeAgentStatus(value)]);
      return super.writeAgentStatus(filePath, value);
    }
  }

  const writer = new CountingWriter();
  const runtime = new StatusRuntime({ writer, registry: new RunRegistry({ writer }) });

  const result = await runtime.applyEvents([
    {
      event: "run.started",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-events",
        orchestrator: "orchestrator-pipeline",
        user_prompt: "Exercise batched writes",
        timestamp: "2026-04-18T03:00:00.000Z"
      }
    },
    {
      event: "tasks.registered",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-events",
        timestamp: "2026-04-18T03:01:00.000Z",
        tasks: [{ task_id: "task-a", summary: "Task A" }]
      }
    },
    {
      event: "agent.started",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-events",
        agent_id: "executor",
        agent: "executor",
        task_id: "task-a",
        status: "running",
        timestamp: "2026-04-18T03:02:00.000Z"
      }
    },
    {
      event: "agent.finished",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-events",
        agent_id: "executor",
        status: "done",
        completed_at: "2026-04-18T03:03:00.000Z",
        timestamp: "2026-04-18T03:03:00.000Z"
      }
    },
    {
      event: "task.updated",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-events",
        task_id: "task-a",
        status: "done",
        completed_at: "2026-04-18T03:04:00.000Z",
        timestamp: "2026-04-18T03:04:00.000Z"
      }
    }
  ]);

  assert.equal(result.event, "batch");
  assert.equal(result.event_count, 5);
  assert.deepEqual(result.events, [
    "run.started",
    "tasks.registered",
    "agent.started",
    "agent.finished",
    "task.updated"
  ]);
  assert.equal(result.task_count, 1);
  assert.equal(result.agent_count, 1);

  assert.deepEqual(
    writer.calls.map(([kind, name]) => [kind, name]),
    [
      ["checkpoint", "checkpoint.json"],
      ["run-status", "run-status.json"],
      ["task", "task-a.json"],
      ["agent", "executor.json"]
    ]
  );
});

test("status schema-lite accepts every supported orchestrator", () => {
  for (const orchestrator of ORCHESTRATORS) {
    const runStatus = canonicalizeRunStatus({
      run_id: `run-${orchestrator}`,
      orchestrator,
      status: "running",
      created_at: "2026-03-25T12:00:00.000Z",
      updated_at: "2026-03-25T12:00:00.000Z",
      output_dir: `/tmp/${orchestrator}`,
      checkpoint_path: `/tmp/${orchestrator}/checkpoint.json`
    });
    assert.equal(runStatus.orchestrator, orchestrator);

    const checkpoint = canonicalizeCheckpoint({
      pipeline_id: `pipeline-${orchestrator}`,
      orchestrator,
      user_prompt: `Validate ${orchestrator}`,
      flags: {},
      current_stage: -1,
      completed_stages: [],
      stage_artifacts: {},
      created_at: "2026-03-25T12:00:00.000Z",
      updated_at: "2026-03-25T12:00:00.000Z"
    });
    assert.equal(checkpoint.orchestrator, orchestrator);
  }
});

test("status runtime path helpers anchor relative output roots to working_project_dir", () => {
  const currentWorktree = path.join(os.tmpdir(), "status-runtime-source");
  const payload = { working_project_dir: path.join("..", "status-runtime-target") };

  assert.equal(resolvePayloadPathAnchor(currentWorktree, payload), path.resolve(currentWorktree, "..", "status-runtime-target"));
  assert.equal(
    resolvePayloadPath(currentWorktree, payload, ".pipeline-output"),
    path.resolve(currentWorktree, "..", "status-runtime-target", ".pipeline-output")
  );
});

test("status runtime path helpers preserve explicit absolute output roots", () => {
  const currentWorktree = path.join(os.tmpdir(), "status-runtime-source");
  const absoluteOutputRoot = path.join(os.tmpdir(), "explicit-output-root");
  const payload = { working_project_dir: path.join("..", "status-runtime-target") };

  assert.equal(resolvePayloadPath(currentWorktree, payload, absoluteOutputRoot), absoluteOutputRoot);
});
