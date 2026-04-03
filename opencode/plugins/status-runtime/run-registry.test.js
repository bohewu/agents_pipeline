const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { StatusProjector, StatusRuntime } = require("./index");
const { RunRegistry } = require("./run-registry");

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
