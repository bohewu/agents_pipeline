const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { StatusProjector, StatusRuntime } = require("../tools/status-runtime");
const { RunRegistry } = require("../tools/status-runtime/run-registry");
const { ORCHESTRATORS } = require("../tools/status-runtime/constants");
const {
  canonicalizeAgentStatus,
  canonicalizeCheckpoint,
  canonicalizeRunStatus,
  canonicalizeTaskStatus
} = require("../tools/status-runtime/schema-lite");
const { StatusWriter } = require("../tools/status-runtime/status-writer");
const {
  resolvePayloadPath,
  resolvePayloadPathAnchor
} = require("../tools/status-runtime/utils");
const {
  EXIT_CODES,
  normalizeBatchPayload,
  parseArgs,
  runCli
} = require("../tools/status-event");

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function setMtime(filePath, seconds) {
  await fs.utimes(filePath, seconds, seconds);
}

test("resolveResumeRun picks newest compatible checkpoint-backed run", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const olderRun = path.join(tempRoot, "run-compatible");
  const newerMismatch = path.join(tempRoot, "run-newer-mismatch");

  await writeJson(path.join(olderRun, "checkpoint.json"), {
    pipeline_id: "run-compatible",
    orchestrator: "orchestrator-pipeline"
  });
  await writeJson(path.join(olderRun, "status", "run-status.json"), {
    run_id: "run-compatible",
    orchestrator: "orchestrator-pipeline"
  });
  await fs.mkdir(path.join(olderRun, "status", "tasks"), { recursive: true });
  await fs.mkdir(path.join(olderRun, "status", "agents"), { recursive: true });
  await writeJson(path.join(newerMismatch, "checkpoint.json"), {
    pipeline_id: "run-mismatch",
    orchestrator: "orchestrator-flow"
  });
  await writeJson(path.join(newerMismatch, "status", "run-status.json"), {
    run_id: "run-mismatch",
    orchestrator: "orchestrator-pipeline"
  });
  await fs.mkdir(path.join(newerMismatch, "status", "tasks"), { recursive: true });
  await fs.mkdir(path.join(newerMismatch, "status", "agents"), { recursive: true });

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

test("resolveResumeRun ignores a newer checkpoint without matching run status", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-status-pair-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const compatibleRun = path.join(tempRoot, "run-compatible");
  const checkpointOnlyRun = path.join(tempRoot, "run-checkpoint-only");
  await writeJson(path.join(compatibleRun, "checkpoint.json"), {
    pipeline_id: "run-compatible",
    orchestrator: "orchestrator-flow"
  });
  await writeJson(path.join(compatibleRun, "status", "run-status.json"), {
    run_id: "run-compatible",
    orchestrator: "orchestrator-flow"
  });
  await fs.mkdir(path.join(compatibleRun, "status", "tasks"), { recursive: true });
  await fs.mkdir(path.join(compatibleRun, "status", "agents"), { recursive: true });
  await writeJson(path.join(checkpointOnlyRun, "checkpoint.json"), {
    pipeline_id: "run-checkpoint-only",
    orchestrator: "orchestrator-flow"
  });
  await setMtime(path.join(compatibleRun, "checkpoint.json"), 1710000000);
  await setMtime(path.join(checkpointOnlyRun, "checkpoint.json"), 1720000000);

  const run = await new RunRegistry().resolveResumeRun({
    output_root: tempRoot,
    orchestrator: "orchestrator-flow"
  });

  assert.equal(run.runDir, compatibleRun);
  assert.equal(run.runId, "run-compatible");
});

test("explicit resume rejects a symlinked run directory", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-run-link-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const realRun = path.join(tempRoot, "real-run");
  await writeJson(path.join(realRun, "checkpoint.json"), {
    pipeline_id: "run-link",
    orchestrator: "orchestrator-flow"
  });
  await writeJson(path.join(realRun, "status", "run-status.json"), {
    run_id: "run-link",
    orchestrator: "orchestrator-flow"
  });
  await fs.symlink(realRun, path.join(tempRoot, "run-link"), "dir");

  await assert.rejects(
    new RunRegistry().resolveResumeRun({
      output_root: tempRoot,
      run_id: "run-link",
      orchestrator: "orchestrator-flow"
    }),
    /Resume run not found/
  );
});

test("resolveResumeRun ignores candidates whose declared run ID differs from the directory basename", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-identity-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const validRun = path.join(tempRoot, "run-valid");
  const mismatchedRun = path.join(tempRoot, "wrong-directory");
  for (const [runDir, declaredRunId] of [
    [validRun, "run-valid"],
    [mismatchedRun, "claimed-run"]
  ]) {
    await writeJson(path.join(runDir, "checkpoint.json"), {
      pipeline_id: declaredRunId,
      orchestrator: "orchestrator-flow"
    });
    await writeJson(path.join(runDir, "status", "run-status.json"), {
      run_id: declaredRunId,
      orchestrator: "orchestrator-flow"
    });
    await fs.mkdir(path.join(runDir, "status", "tasks"), { recursive: true });
    await fs.mkdir(path.join(runDir, "status", "agents"), { recursive: true });
  }
  await setMtime(path.join(validRun, "checkpoint.json"), 1710000000);
  await setMtime(path.join(mismatchedRun, "checkpoint.json"), 1720000000);

  const run = await new RunRegistry().resolveResumeRun({
    output_root: tempRoot,
    orchestrator: "orchestrator-flow"
  });

  assert.equal(run.runDir, validRun);
  assert.equal(run.runId, "run-valid");
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
    await fs.mkdir(path.join(runDir, "status", "tasks"), { recursive: true });
    await fs.mkdir(path.join(runDir, "status", "agents"), { recursive: true });
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

test("explicit resume rejects an orchestrator-incompatible run", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "run-registry-explicit-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-explicit",
    orchestrator: "orchestrator-flow",
    user_prompt: "Start a Flow run"
  });

  await assert.rejects(
    runtime.applyEvent("run.resumed", {
      output_root: tempRoot,
      run_id: "run-explicit",
      orchestrator: "orchestrator-pipeline"
    }),
    /not compatible for resume/
  );

  const checkpointPath = path.join(tempRoot, "run-explicit", "checkpoint.json");
  const checkpoint = await readJson(checkpointPath);
  checkpoint.pipeline_id = "different-run";
  await writeJson(checkpointPath, checkpoint);
  await assert.rejects(
    runtime.applyEvent("run.resumed", {
      output_root: tempRoot,
      run_id: "run-explicit",
      orchestrator: "orchestrator-flow"
    }),
    /not compatible for resume/
  );
});

test("status runtime rejects traversal IDs before filesystem writes", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-id-safety-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await assert.rejects(
    runtime.applyEvent("run.started", {
      output_root: tempRoot,
      run_id: "../escaped-run",
      orchestrator: "orchestrator-flow",
      user_prompt: "Must not escape"
    }),
    /run_id must be a safe/
  );
  await assert.rejects(fs.access(path.join(tempRoot, "..", "escaped-run")));

  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-safe",
    orchestrator: "orchestrator-flow",
    user_prompt: "Validate entity IDs"
  });
  await assert.rejects(
    runtime.applyEvent("tasks.registered", {
      output_root: tempRoot,
      run_id: "run-safe",
      tasks: [{ task_id: "../../../escaped-task", summary: "Must not escape" }]
    }),
    /tasks\[0\]\.task_id must be a safe/
  );
  await assert.rejects(
    runtime.applyEvent("agent.started", {
      output_root: tempRoot,
      run_id: "run-safe",
      agent_id: "../../../escaped-agent",
      agent: "executor"
    }),
    /agent_id must be a safe/
  );
});

test("run.started refuses an existing run ID without clearing entities", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-restart-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-no-restart",
    orchestrator: "orchestrator-flow",
    user_prompt: "Original run"
  });
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: "run-no-restart",
    tasks: [{ task_id: "task-original", summary: "Original task" }]
  });

  await assert.rejects(
    runtime.applyEvent("run.started", {
      output_root: tempRoot,
      run_id: "run-no-restart",
      orchestrator: "orchestrator-flow",
      user_prompt: "Accidental restart"
    }),
    /refuses to reuse existing run_id/
  );
  assert.equal(
    (await readJson(path.join(tempRoot, "run-no-restart", "status", "tasks", "task-original.json"))).task_id,
    "task-original"
  );
});

test("non-lifecycle events reject an unstarted run without leaving a directory", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-unstarted-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runDir = path.join(tempRoot, "run-not-started");
  await assert.rejects(
    runtime.applyEvent("stage.completed", {
      output_root: tempRoot,
      run_id: "run-not-started",
      stage: 0,
      name: "Must not create a run",
      status: "completed"
    }),
    /must be started before status updates/
  );
  await assert.rejects(fs.access(runDir));

  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-not-started",
    orchestrator: "orchestrator-flow",
    user_prompt: "A valid start remains possible"
  });
  await fs.access(path.join(runDir, "status", "run-status.json"));
});

test("batch allows run lifecycle events only at index zero", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-batch-lifecycle-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-batch-lifecycle",
    orchestrator: "orchestrator-flow",
    user_prompt: "Original batch lifecycle"
  });

  for (const lifecycleEvent of [
    {
      event: "run.resumed",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-lifecycle",
        orchestrator: "orchestrator-pipeline"
      }
    },
    {
      event: "run.started",
      payload: {
        output_root: tempRoot,
        run_id: "run-batch-lifecycle",
        orchestrator: "orchestrator-pipeline",
        user_prompt: "Must not restart inside a batch"
      }
    }
  ]) {
    await assert.rejects(
      runtime.applyEvents([
        {
          event: "stage.completed",
          payload: {
            output_root: tempRoot,
            run_id: "run-batch-lifecycle",
            stage: 0,
            name: "First event",
            status: "completed"
          }
        },
        lifecycleEvent
      ]),
      /only allowed as batch event #1/
    );
  }

  const checkpoint = await readJson(
    path.join(tempRoot, "run-batch-lifecycle", "checkpoint.json")
  );
  assert.equal(checkpoint.orchestrator, "orchestrator-flow");
  assert.equal(checkpoint.user_prompt, "Original batch lifecycle");
});

test("status runtime rejects symlinked status directories and canonical files", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-symlink-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-symlink-safe",
    orchestrator: "orchestrator-flow",
    user_prompt: "Reject symlinked status paths"
  });

  const runDir = path.join(tempRoot, "run-symlink-safe");
  const tasksDir = path.join(runDir, "status", "tasks");
  const outsideTasks = path.join(tempRoot, "outside-tasks");
  await fs.mkdir(outsideTasks);
  await fs.rm(tasksDir, { recursive: true });
  try {
    await fs.symlink(outsideTasks, tasksDir, "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
      t.skip("symbolic links are unavailable");
      return;
    }
    throw error;
  }

  await assert.rejects(
    runtime.applyEvent("tasks.registered", {
      output_root: tempRoot,
      run_id: "run-symlink-safe",
      tasks: [{ task_id: "escaped", summary: "Must stay contained" }]
    }),
    /status\/tasks must be a real directory/
  );
  await assert.rejects(fs.access(path.join(outsideTasks, "escaped.json")));

  await fs.unlink(tasksDir);
  await fs.mkdir(tasksDir);
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const outsideCheckpoint = path.join(tempRoot, "outside-checkpoint.json");
  await fs.rename(checkpointPath, outsideCheckpoint);
  await fs.symlink(outsideCheckpoint, checkpointPath);
  await assert.rejects(
    runtime.applyEvent("stage.completed", {
      output_root: tempRoot,
      run_id: "run-symlink-safe",
      stage: 0,
      name: "Must not follow checkpoint link",
      status: "completed"
    }),
    /Canonical status path must be a regular file/
  );
});

test("status runtime rejects non-RFC3339 timestamps before creating a run", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-timestamp-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await assert.rejects(
    runtime.applyEvent("run.started", {
      output_root: tempRoot,
      run_id: "run-bad-time",
      orchestrator: "orchestrator-flow",
      user_prompt: "Reject permissive dates",
      timestamp: "January 1, 2026"
    }),
    /timestamp must be an RFC 3339 date-time/
  );
  await assert.rejects(fs.access(path.join(tempRoot, "run-bad-time")));

  for (const [index, timestamp] of [
    "",
    null,
    0,
    "0000-01-01T00:00:00Z"
  ].entries()) {
    await assert.rejects(
      runtime.applyEvent("run.started", {
        output_root: tempRoot,
        run_id: `run-falsy-time-${index}`,
        orchestrator: "orchestrator-flow",
        user_prompt: "Reject falsy timestamps",
        timestamp
      }),
      /timestamp must be an RFC 3339 date-time/
    );
  }
});

test("status runtime rejects caller-supplied checkpoint paths", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-checkpoint-path-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    new StatusRuntime().applyEvent("run.started", {
      output_root: tempRoot,
      run_id: "run-derived-checkpoint",
      orchestrator: "orchestrator-flow",
      user_prompt: "Derive checkpoint path",
      checkpoint_path: path.join(tempRoot, "elsewhere.json")
    }),
    /checkpoint_path is runtime-derived/
  );
});

test("status schema-lite requires resource_class for dependent task and agent fields", () => {
  const timestamp = "2026-04-18T00:00:00.000Z";
  assert.throws(
    () => canonicalizeTaskStatus({
      run_id: "run-resource-dependency",
      task_id: "task-resource-dependency",
      summary: "Invalid task resource tuple",
      status: "in_progress",
      created_at: timestamp,
      updated_at: timestamp,
      resource_status: "running"
    }),
    /resource_status requires resource_class/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-resource-dependency",
      agent_id: "agent-resource-dependency",
      agent: "executor",
      status: "running",
      created_at: timestamp,
      updated_at: timestamp,
      resource_handles: { pid: 123 }
    }),
    /resource_handles requires resource_class/
  );
});

test("terminal task and agent events require clean resource state", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-cleanup-gate-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-cleanup-gate",
    orchestrator: "orchestrator-flow",
    user_prompt: "Verify cleanup gating",
    timestamp: "2026-04-18T00:00:00.000Z"
  });
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: "run-cleanup-gate",
    tasks: [{
      task_id: "task-server",
      summary: "Run a local server",
      resource_class: "server",
      max_parallelism: 1,
      teardown_required: true
    }],
    timestamp: "2026-04-18T00:01:00.000Z"
  });
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot,
    run_id: "run-cleanup-gate",
    agent_id: "executor-server",
    agent: "executor",
    task_id: "task-server",
    status: "running",
    resource_class: "server",
    teardown_required: true,
    timestamp: "2026-04-18T00:02:00.000Z"
  });

  const runDir = path.join(tempRoot, "run-cleanup-gate");
  const taskPath = path.join(runDir, "status", "tasks", "task-server.json");
  const agentPath = path.join(runDir, "status", "agents", "executor-server.json");
  const taskBefore = await fs.readFile(taskPath, "utf8");
  const agentBefore = await fs.readFile(agentPath, "utf8");

  await assert.rejects(
    runtime.applyEvent("task.updated", {
      output_root: tempRoot,
      run_id: "run-cleanup-gate",
      task_id: "task-server",
      status: "done",
      timestamp: "2026-04-18T00:03:00.000Z"
    }),
    /done task resource_status/
  );
  await assert.rejects(
    runtime.applyEvent("agent.finished", {
      output_root: tempRoot,
      run_id: "run-cleanup-gate",
      agent_id: "executor-server",
      status: "done",
      timestamp: "2026-04-18T00:04:00.000Z"
    }),
    /done agent resource_status/
  );

  assert.equal(await fs.readFile(taskPath, "utf8"), taskBefore);
  assert.equal(await fs.readFile(agentPath, "utf8"), agentBefore);
});

test("rejected semantic events do not mutate any canonical file", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-rejected-write-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-rejected-write",
    orchestrator: "orchestrator-flow",
    user_prompt: "Reject partial persistence",
    timestamp: "2026-04-18T00:00:00.000Z"
  });

  const runDir = path.join(tempRoot, "run-rejected-write");
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const runStatusPath = path.join(runDir, "status", "run-status.json");
  const checkpointBefore = await fs.readFile(checkpointPath, "utf8");
  const runStatusBefore = await fs.readFile(runStatusPath, "utf8");

  await assert.rejects(
    runtime.applyEvent("run.finished", {
      output_root: tempRoot,
      run_id: "run-rejected-write",
      timestamp: "2026-04-18T01:00:00.000Z"
    }),
    /status must be one of/
  );

  assert.equal(await fs.readFile(checkpointPath, "utf8"), checkpointBefore);
  assert.equal(await fs.readFile(runStatusPath, "utf8"), runStatusBefore);
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

test("stage.completed persists derived flags without dropping existing checkpoint flags", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-stage-flags-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-stage-flags",
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Persist derived retry policy",
    flags: {
      full_auto_mode: false,
      scout_mode: "auto"
    },
    timestamp: "2026-04-18T01:00:00.000Z"
  });

  const result = await runtime.applyEvent("stage.completed", {
    output_root: tempRoot,
    run_id: "run-stage-flags",
    stage: 3,
    name: "Atomicization",
    status: "completed",
    flags: {
      max_retry_rounds: 3
    },
    timestamp: "2026-04-18T01:01:00.000Z"
  });

  const checkpoint = await readJson(result.checkpoint_path);
  assert.deepEqual(checkpoint.flags, {
    full_auto_mode: false,
    max_retry_rounds: 3,
    scout_mode: "auto"
  });
});

test("run.resumed overlays invocation flags and preserves Flow recovery usage", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-resume-flags-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-resume-flags",
    orchestrator: "orchestrator-flow",
    user_prompt: "Persist derived review policy",
    flags: {
      confirm_mode: false,
      flow_recovery_limit: 1,
      flow_recovery_used: 0,
      operational_retry_limit: 2,
      preset_mode: "delivery",
      scout_mode: "skip"
    },
    timestamp: "2026-04-18T01:10:00.000Z"
  });
  await runtime.applyEvent("stage.completed", {
    output_root: tempRoot,
    run_id: "run-resume-flags",
    stage: 2,
    name: "Flow Task Split",
    status: "completed",
    flags: {
      review_mode: "on"
    },
    timestamp: "2026-04-18T01:11:00.000Z"
  });
  const recoveryUpdate = await runtime.applyEvent("checkpoint.updated", {
    output_root: tempRoot,
    run_id: "run-resume-flags",
    flags: {
      flow_recovery_used: 1
    },
    timestamp: "2026-04-18T01:11:30.000Z"
  });
  const checkpointBeforeResume = await readJson(recoveryUpdate.checkpoint_path);
  assert.equal(checkpointBeforeResume.current_stage, 2);
  assert.deepEqual(
    checkpointBeforeResume.completed_stages.map((entry) => entry.stage),
    [2]
  );

  const result = await runtime.applyEvent("run.resumed", {
    output_root: tempRoot,
    run_id: "run-resume-flags",
    orchestrator: "orchestrator-flow",
    flags: {
      confirm_mode: true
    },
    timestamp: "2026-04-18T01:12:00.000Z"
  });

  const checkpoint = await readJson(result.checkpoint_path);
  assert.deepEqual(checkpoint.flags, {
    confirm_mode: true,
    flow_recovery_limit: 1,
    flow_recovery_used: 1,
    operational_retry_limit: 2,
    preset_mode: "delivery",
    review_mode: "on",
    scout_mode: "skip"
  });
  assert.equal(checkpoint.current_stage, 2);
});

test("checkpoint.updated requires a non-empty flags delta", async () => {
  const runtime = new StatusRuntime();
  await assert.rejects(
    runtime.applyEvent("checkpoint.updated", {
      output_root: "/tmp/status-runtime-validation",
      run_id: "run-checkpoint-update",
      flags: {}
    }),
    /checkpoint\.updated requires non-empty flags/
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
    resource_class: "process",
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

test("status CLI parses the canonical --event and --payload-json interface", () => {
  const options = parseArgs([
    "--event",
    "run.started",
    "--payload-json",
    '{"run_id":"run-cli"}',
    "--base-dir",
    "."
  ]);

  assert.equal(options.event, "run.started");
  assert.equal(options.payloadJson, '{"run_id":"run-cli"}');
  assert.equal(options.baseDir, process.cwd());
});

test("status CLI normalizes shared batch paths against working_project_dir", () => {
  const baseDir = path.resolve("/tmp/session-worktree");
  const events = normalizeBatchPayload(
    {
      shared_payload: {
        working_project_dir: "../target-project",
        output_root: ".pipeline-output",
        run_id: "run-batch"
      },
      events: [{ event: "run.started", payload: { orchestrator: "orchestrator-flow" } }]
    },
    baseDir
  );

  const expectedProject = path.resolve(baseDir, "../target-project");
  assert.equal(events[0].payload.working_project_dir, expectedProject);
  assert.equal(events[0].payload.output_root, path.join(expectedProject, ".pipeline-output"));
  assert.equal(events[0].payload.run_id, "run-batch");
});

test("status CLI applies a payload-json event and writes only JSON to stdout", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-cli-test-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  let stdout = "";
  let stderr = "";
  const code = await runCli(
    [
      "--event",
      "run.started",
      "--payload-json",
      JSON.stringify({
        output_root: tempRoot,
        run_id: "run-cli",
        orchestrator: "orchestrator-flow",
        user_prompt: "Exercise CLI output"
      })
    ],
    {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } }
    }
  );

  assert.equal(code, EXIT_CODES.OK);
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.event, "run.started");
  assert.equal(result.run_id, "run-cli");
  assert.equal((await readJson(result.checkpoint_path)).pipeline_id, "run-cli");
});

test("status CLI returns a stable input-error envelope for malformed stdin JSON", async () => {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["--event", "run.started", "--stdin"], {
    stdin: Readable.from(["{not-json"]),
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });

  assert.equal(code, EXIT_CODES.INPUT_ERROR);
  assert.equal(stdout, "");
  const error = JSON.parse(stderr);
  assert.equal(error.error, "input_error");
  assert.match(error.message, /stdin must contain valid JSON/);
});
