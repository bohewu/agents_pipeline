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
  canonicalizeReasoningDecision,
  canonicalizeReasoningObservation,
  canonicalizeRunStatus,
  canonicalizeTaskStatus
} = require("../tools/status-runtime/schema-lite");
const { StatusWriter } = require("../tools/status-runtime/status-writer");
const {
  loadProjectionRegistry,
  loadPolicy,
  resolveReasoning,
  validatePolicy
} = require("../tools/reasoning-policy");
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

function currentExecutorConfiguration({ modelTier = "strong", recovery = null } = {}) {
  const projection = loadProjectionRegistry().projections.find((entry) => entry.id === "lsa-efficiency-v1");
  const modelSet = projection.model_sets.find((entry) => entry.id === "openai-luna-sol-astra");
  return {
    schema_version: 1,
    model_set: {
      id: modelSet.id,
      version: modelSet.version,
      mapping_digest: modelSet.mapping_digest
    },
    reasoning_projection: {
      id: projection.id,
      version: projection.version,
      policy_version: projection.policy_version,
      digest: projection.digest
    },
    role_binding: {
      role: "executor",
      model_tier: recovery?.target_model_tier || modelTier,
      model: modelSet.tiers[recovery?.target_model_tier || modelTier],
      mapping_digest: modelSet.mapping_digest
    },
    provenance: {
      source: "workspace_profile",
      override: recovery
    }
  };
}

function currentRunConfiguration({ modelTier = "strong" } = {}) {
  const resolved = currentExecutorConfiguration({ modelTier });
  const registry = loadProjectionRegistry();
  const projection = registry.projections.find((entry) => entry.id === resolved.reasoning_projection.id);
  const modelSet = projection.model_sets.find((entry) => entry.id === resolved.model_set.id);
  return {
    profile: "balanced",
    configuration_compatibility: "current",
    model_mapping: {
      id: modelSet.id,
      version: modelSet.version,
      tiers: modelSet.tiers,
      role_overrides: modelSet.role_overrides,
      mapping_digest: modelSet.mapping_digest
    },
    configuration_identity: {
      schema_version: resolved.schema_version,
      model_set: resolved.model_set,
      reasoning_projection: resolved.reasoning_projection
    },
    resolved_configurations: { executor: resolved }
  };
}

function legacyRunConfiguration() {
  const projection = loadProjectionRegistry().projections.find((entry) => entry.id === "legacy-v2");
  const modelSet = projection.model_sets.find((entry) => entry.id === "openai-legacy");
  const resolved = {
    schema_version: 1,
    model_set: { id: modelSet.id, version: modelSet.version, mapping_digest: modelSet.mapping_digest },
    reasoning_projection: {
      id: projection.id,
      version: projection.version,
      policy_version: projection.policy_version,
      digest: projection.digest
    },
    role_binding: {
      role: "executor",
      model_tier: "standard",
      model: modelSet.tiers.standard,
      mapping_digest: modelSet.mapping_digest
    },
    provenance: { source: "pinned_legacy", override: null }
  };
  return {
    profile: "balanced",
    configuration_compatibility: "pinned_legacy",
    model_mapping: {
      id: modelSet.id,
      version: modelSet.version,
      tiers: modelSet.tiers,
      role_overrides: modelSet.role_overrides,
      mapping_digest: modelSet.mapping_digest
    },
    configuration_identity: {
      schema_version: 1,
      model_set: resolved.model_set,
      reasoning_projection: resolved.reasoning_projection
    },
    resolved_configurations: { executor: resolved }
  };
}

function matchingLowTrace(agentId) {
  return {
    schema_version: "1.4",
    runtime: "codex",
    agent_id: agentId,
    trace_found: true,
    agent_role: "executor",
    model: "gpt-6-astra",
    model_matches: true,
    effective_effort: "low",
    role_matches: true,
    effort_matches: true,
    parent_trace_found: false,
    parent_effective_effort: null,
    inheritance_consistent: null,
    selector_evidence: "indeterminate"
  };
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
  assert.throws(
    () => canonicalizeTaskStatus({
      run_id: "run-reasoning-dependency",
      task_id: "task-reasoning-dependency",
      summary: "Invalid reasoning tuple",
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      reasoning_class: "deep"
    }),
    /reasoning_class and reasoning_signals must be supplied together/
  );
  assert.throws(
    () => canonicalizeTaskStatus({
      run_id: "run-reasoning-empty",
      task_id: "task-reasoning-empty",
      summary: "Empty reasoning signals",
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      reasoning_class: "routine",
      reasoning_signals: []
    }),
    /reasoning_signals must contain at least one signal/
  );
  assert.throws(
    () => canonicalizeTaskStatus({
      run_id: "run-reasoning-floor",
      task_id: "task-reasoning-floor",
      summary: "Under-classified reasoning signals",
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      reasoning_class: "routine",
      reasoning_signals: ["security_boundary"]
    }),
    /reasoning_class routine is below signal minimum deep/
  );

  const legacyCrossModule = canonicalizeTaskStatus({
    run_id: "run-legacy-cross-module",
    task_id: "task-legacy-cross-module",
    summary: "Legacy cross-module analysis",
    status: "pending",
    created_at: timestamp,
    updated_at: timestamp,
    reasoning_class: "deliberative",
    reasoning_signals: ["cross_module"]
  });
  assert.equal(legacyCrossModule.reasoning_class, "deliberative");

  assert.throws(
    () => canonicalizeTaskStatus({
      run_id: "run-v2-cross-module",
      task_id: "task-v2-cross-module",
      summary: "Intent-bearing cross-module analysis",
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      task_intent: "inspect",
      intent_baseline_class: "routine",
      classification_source: "task_intent",
      reasoning_class: "deliberative",
      reasoning_signals: ["cross_module"]
    }),
    /reasoning_class deliberative is below signal minimum deep/
  );
});

test("reasoning decisions and observations reject effective class below signal floor", () => {
  const underClassified = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deep",
    reasoning_signals: ["security_boundary"],
    model_tier: "standard"
  });
  underClassified.effective_class = "routine";
  underClassified.reasoning_class = "routine";

  assert.throws(
    () => canonicalizeReasoningDecision(underClassified),
    /reasoning\.effective_class routine is below signal minimum deep/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      protocol_version: "1.0",
      run_id: "run-reasoning-floor",
      agent_id: "executor-floor",
      agent: "executor",
      status: "starting",
      created_at: "2026-07-14T10:00:00.000Z",
      updated_at: "2026-07-14T10:00:00.000Z",
      reasoning: underClassified
    }),
    /reasoning\.effective_class routine is below signal minimum deep/
  );

  const summary = { ...underClassified };
  delete summary.reasons;
  delete summary.conflict;
  delete summary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "1.0",
      observed_at: "2026-07-14T10:00:01.000Z",
      run_id: "run-reasoning-floor",
      orchestrator: "orchestrator-flow",
      agent_id: "executor-floor",
      attempt: 1,
      outcome: "done",
      reasoning: summary
    }),
    /reasoning\.effective_class routine is below signal minimum deep/
  );

  const missingAdaptiveClass = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    model_tier: "standard"
  });
  missingAdaptiveClass.effective_class = null;
  assert.throws(
    () => canonicalizeReasoningDecision(missingAdaptiveClass),
    /reasoning\.effective_class must be non-null in adaptive mode/
  );

  const inherited = resolveReasoning({
    role: "executor",
    mode: "inherit",
    reasoning_class: "deep",
    model_tier: "standard"
  });
  const inheritedDecision = canonicalizeReasoningDecision(inherited);
  assert.equal(inheritedDecision.effective_class, "deep");
  assert.equal(inheritedDecision.requested_effort, null);
  assert.equal(inheritedDecision.dispatch_effort, null);
  assert.equal(inheritedDecision.enforcement_status, "inherited");

  const legacyCrossModule = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "deliberative",
    reasoning_signals: ["cross_module"],
    model_tier: "standard"
  });
  legacyCrossModule.schema_version = "1.0";
  legacyCrossModule.policy_version = "1";
  assert.equal(canonicalizeReasoningDecision(legacyCrossModule).effective_class, "deliberative");
});

test("status reasoning validation matches version 2 intent and role-policy invariants", () => {
  const valid = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    model_tier: "standard"
  });

  assert.throws(
    () => canonicalizeReasoningDecision({ ...valid, classification_source: "legacy_role_target" }),
    /legacy reasoning classification cannot include task intent metadata/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...valid,
      role_policy: {
        ...valid.role_policy,
        floor_class: "deep",
        target_class: "deliberative"
      }
    }),
    /floor_class must not exceed target_class/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...valid,
      enforcement_status: "conflict",
      dispatch_effort: null,
      conflict: null,
      conflict_reason: null
    }),
    /conflict status requires the canonical conflict token/
  );
});

test("version 2 status records cannot forge enforcement or assurance", () => {
  const enforced = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "standard",
    observed_effective_effort: "xhigh"
  });
  assert.throws(
    () => canonicalizeReasoningDecision({ ...enforced, effective_effort: null }),
    /enforced reasoning requires effective effort evidence/
  );

  const assurance = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    observed_effective_effort: "max"
  });
  const forged = {
    ...assurance,
    model_tier: "mini",
    selected_model_tier: "mini",
    requested_effort: "high",
    dispatch_effort: "high",
    effective_effort: "high",
    strict: false
  };
  assert.throws(
    () => canonicalizeReasoningDecision(forged),
    /assurance reasoning must be strict/
  );

  const summary = { ...forged };
  delete summary.reasons;
  delete summary.conflict;
  delete summary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T10:30:01.000Z",
      run_id: "run-forged-assurance",
      orchestrator: "orchestrator-pipeline",
      agent_id: "reviewer-01",
      attempt: 1,
      outcome: "done",
      reasoning: summary
    }),
    /assurance reasoning must be strict/
  );
});

test("version 2 artifacts reject forged capability, effort, and degradation tuples", () => {
  const deepStandard = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "standard",
    observed_effective_effort: "xhigh"
  });

  const deepMiniMinimumForgery = {
    ...deepStandard,
    model_tier: "mini",
    selected_model_tier: "mini",
    minimum_model_tier: "mini",
    requested_effort: "max",
    dispatch_effort: "max",
    effective_effort: "max"
  };
  assert.throws(
    () => canonicalizeReasoningDecision(deepMiniMinimumForgery),
    /minimum_model_tier is below required standard/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-forged-tier",
      agent_id: "executor-01",
      agent: "executor",
      status: "done",
      created_at: "2026-07-15T10:30:00.000Z",
      updated_at: "2026-07-15T10:30:01.000Z",
      reasoning: deepMiniMinimumForgery
    }),
    /minimum_model_tier is below required standard/
  );

  const subTableEffort = {
    ...deepStandard,
    requested_effort: "medium",
    dispatch_effort: "medium",
    effective_effort: "medium",
    explicit_override: null
  };
  assert.throws(
    () => canonicalizeReasoningDecision(subTableEffort),
    /requested_effort is below required xhigh/
  );
  const observationSummary = { ...subTableEffort };
  delete observationSummary.reasons;
  delete observationSummary.conflict;
  delete observationSummary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T10:30:01.000Z",
      run_id: "run-forged-effort",
      orchestrator: "orchestrator-pipeline",
      agent_id: "executor-01",
      attempt: 1,
      outcome: "done",
      reasoning: observationSummary
    }),
    /requested_effort is below required xhigh/
  );

  const missingDegradationMetadata = {
    ...deepStandard,
    enforcement_status: "degraded",
    effective_effort: null,
    degraded: false,
    degradation_reason: null
  };
  assert.throws(
    () => canonicalizeReasoningDecision(missingDegradationMetadata),
    /degraded reasoning status requires degraded metadata/
  );

  const compatible = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "mini",
    allow_degraded_deep: true
  });
  assert.equal(compatible.enforcement_status, "degraded");
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...compatible,
      enforcement_status: "requested"
    }),
    /requested reasoning cannot be degraded/
  );
});

test("version 2 records bind selector, class requests, role identity, and dispatch context", () => {
  const routine = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "execute",
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "medium"
  });
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...routine,
      selector_available: false
    }),
    /unavailable selector cannot dispatch effort/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...routine,
      requested_class: "assurance"
    }),
    /must not be below requested_class/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...routine,
      explicit_override: { reasoning_class: "deep" }
    }),
    /must not be below explicit_override\.reasoning_class/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...routine,
      role: "peon"
    }),
    /role_policy must match the canonical policy/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...routine,
      dispatch_context: "ad-hoc-review"
    }),
    /below dispatch context floor/
  );

  const highRequested = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "diagnose",
    model_tier: "standard",
    selector_available: true
  });
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...highRequested,
      effective_effort: "medium",
      enforcement_status: "degraded",
      degraded: true,
      degradation_reason: "effective_effort_mismatch"
    }),
    /requires effective effort above dispatch effort/
  );

  const deepStandard = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "xhigh"
  });
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...deepStandard,
      dispatch_context: "pipeline-review"
    }),
    /minimum_model_tier is below required strong/
  );

  const deepStrong = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "review",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    selector_available: true,
    observed_effective_effort: "xhigh"
  });
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...deepStrong,
      dispatch_context: "formal-assurance",
      minimum_model_tier: "strong"
    }),
    /must match fixed dispatch context/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...deepStrong,
      dispatch_context: null,
      reasoning_class: "assurance",
      effective_class: "assurance",
      strict: true,
      requested_effort: "max",
      dispatch_effort: "max",
      effective_effort: "max"
    }),
    /requires explicit formal assurance semantics/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...deepStrong,
      recovery_boost: true
    }),
    /deep recovery boost must request max effort/
  );

  const peon = resolveReasoning({
    role: "peon",
    mode: "adaptive",
    task_intent: "execute",
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "medium"
  });
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-role-mismatch",
      agent_id: "executor-01",
      agent: "executor",
      status: "done",
      created_at: "2026-07-15T10:30:00.000Z",
      updated_at: "2026-07-15T10:30:01.000Z",
      reasoning: peon
    }),
    /agent must match reasoning\.role/
  );

  const unavailableSummary = {
    ...routine,
    selector_available: false
  };
  delete unavailableSummary.reasons;
  delete unavailableSummary.conflict;
  delete unavailableSummary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T10:30:01.000Z",
      run_id: "run-selector-forgery",
      orchestrator: "orchestrator-pipeline",
      agent_id: "executor-01",
      attempt: 1,
      outcome: "done",
      reasoning: unavailableSummary
    }),
    /unavailable selector cannot dispatch effort/
  );
});

test("conflict records preserve selector, explicit effort, provenance, context, and recovery semantics", () => {
  const selectorConflict = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "certify",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    selector_available: false,
    observed_effective_effort: "max"
  });
  assert.equal(selectorConflict.enforcement_status, "conflict");
  assert.equal(selectorConflict.dispatch_effort, null);
  assert.equal(selectorConflict.effective_effort, null);
  assert.equal(selectorConflict.conflict, "conflict");
  assert.match(selectorConflict.conflict_reason, /cannot be enforced/);
  assert.deepEqual(canonicalizeReasoningDecision(selectorConflict), selectorConflict);

  const duplicateConflictText = {
    ...selectorConflict,
    conflict: selectorConflict.conflict_reason
  };
  assert.throws(
    () => canonicalizeReasoningDecision(duplicateConflictText),
    /canonical conflict token/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-conflict-representation-forgery",
      agent_id: "reviewer-01",
      agent: "reviewer",
      status: "blocked",
      created_at: "2026-07-15T10:59:00.000Z",
      updated_at: "2026-07-15T10:59:01.000Z",
      reasoning: duplicateConflictText
    }),
    /canonical conflict token/
  );

  const selectorConflictForgery = {
    ...selectorConflict,
    effective_effort: "max"
  };
  assert.throws(
    () => canonicalizeReasoningDecision(selectorConflictForgery),
    /unavailable selector cannot report effective effort/
  );
  const selectorConflictSummary = { ...selectorConflictForgery };
  delete selectorConflictSummary.reasons;
  delete selectorConflictSummary.conflict;
  delete selectorConflictSummary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T11:00:01.000Z",
      run_id: "run-selector-conflict-forgery",
      orchestrator: "orchestrator-pipeline",
      agent_id: "reviewer-01",
      attempt: 1,
      outcome: "blocked",
      reasoning: selectorConflictSummary
    }),
    /unavailable selector cannot report effective effort/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-selector-conflict-forgery",
      agent_id: "reviewer-01",
      agent: "reviewer",
      status: "blocked",
      created_at: "2026-07-15T11:00:00.000Z",
      updated_at: "2026-07-15T11:00:01.000Z",
      reasoning: selectorConflictForgery
    }),
    /unavailable selector cannot report effective effort/
  );

  const routine = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "execute",
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "medium"
  });
  const explicitEffortForgery = {
    ...routine,
    explicit_override: { effort: "xhigh" }
  };
  assert.throws(
    () => canonicalizeReasoningDecision(explicitEffortForgery),
    /requested_effort must not be below explicit_override\.effort/
  );
  const explicitSummary = { ...explicitEffortForgery };
  delete explicitSummary.reasons;
  delete explicitSummary.conflict;
  delete explicitSummary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T11:10:01.000Z",
      run_id: "run-explicit-effort-forgery",
      orchestrator: "orchestrator-pipeline",
      agent_id: "executor-01",
      attempt: 1,
      outcome: "done",
      reasoning: explicitSummary
    }),
    /requested_effort must not be below explicit_override\.effort/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-explicit-effort-forgery",
      agent_id: "executor-01",
      agent: "executor",
      status: "done",
      created_at: "2026-07-15T11:10:00.000Z",
      updated_at: "2026-07-15T11:10:01.000Z",
      reasoning: explicitEffortForgery
    }),
    /requested_effort must not be below explicit_override\.effort/
  );

  const legacyExplicit = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    reasoning_class: "routine",
    model_tier: "standard"
  });
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...legacyExplicit,
      requested_class: null
    }),
    /legacy_explicit_class classification requires requested_class/
  );
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...legacyExplicit,
      classification_source: "legacy_role_target"
    }),
    /legacy_role_target classification cannot include requested_class/
  );

  const legacyTarget = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    model_tier: "standard",
    observed_effective_effort: "high"
  });
  assert.equal(legacyTarget.classification_source, "legacy_role_target");
  const legacyTargetForgery = {
    ...legacyTarget,
    reasoning_class: "routine",
    effective_class: "routine",
    requested_effort: "medium",
    dispatch_effort: "medium",
    effective_effort: "medium"
  };
  assert.throws(
    () => canonicalizeReasoningDecision(legacyTargetForgery),
    /below legacy role target deliberative/
  );
  const legacyTargetSummary = { ...legacyTargetForgery };
  delete legacyTargetSummary.reasons;
  delete legacyTargetSummary.conflict;
  delete legacyTargetSummary.conflict_reason;
  assert.throws(
    () => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T11:20:01.000Z",
      run_id: "run-legacy-target-forgery",
      orchestrator: "orchestrator-pipeline",
      agent_id: "executor-01",
      attempt: 1,
      outcome: "done",
      reasoning: legacyTargetSummary
    }),
    /below legacy role target deliberative/
  );
  assert.throws(
    () => canonicalizeAgentStatus({
      run_id: "run-legacy-target-forgery",
      agent_id: "executor-01",
      agent: "executor",
      status: "done",
      created_at: "2026-07-15T11:20:00.000Z",
      updated_at: "2026-07-15T11:20:01.000Z",
      reasoning: legacyTargetForgery
    }),
    /below legacy role target deliberative/
  );

  const formalConflict = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    dispatch_context: "formal-assurance",
    model_tier: "strong",
    selector_available: true,
    observed_effective_effort: "high"
  });
  assert.equal(formalConflict.enforcement_status, "conflict");
  assert.deepEqual(canonicalizeReasoningDecision(formalConflict), formalConflict);
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...formalConflict,
      reasoning_class: "deep",
      effective_class: "deep",
      strict: false
    }),
    /must match fixed dispatch context/
  );

  const recoveryConflict = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "strong",
    prior_failure_type: "reasoning_failure",
    workspace_ceiling: "xhigh"
  });
  assert.equal(recoveryConflict.enforcement_status, "conflict");
  assert.equal(recoveryConflict.recovery_boost, true);
  assert.equal(recoveryConflict.requested_effort, "max");
  assert.deepEqual(canonicalizeReasoningDecision(recoveryConflict), recoveryConflict);
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...recoveryConflict,
      requested_effort: "xhigh"
    }),
    /deep recovery boost must request max effort/
  );
});

test("exact effort and final recovery semantics survive every persisted reasoning artifact", () => {
  const createdAt = "2026-07-15T11:30:00.000Z";
  const updatedAt = "2026-07-15T11:30:01.000Z";

  for (const [explicitEffort, runtimeSupportedEfforts] of Object.entries({
    medium: ["high"],
    high: ["medium"],
    xhigh: ["max"],
    max: ["xhigh"]
  })) {
    const decision = resolveReasoning({
      role: "executor",
      mode: "adaptive",
      task_intent: "execute",
      model_tier: "standard",
      selector_available: true,
      explicit_effort: explicitEffort,
      runtime_supported_efforts: runtimeSupportedEfforts
    });
    assert.equal(decision.enforcement_status, "conflict", explicitEffort);
    assert.equal(decision.requested_effort, explicitEffort, explicitEffort);
    assert.equal(decision.dispatch_effort, null, explicitEffort);
    assert.deepEqual(canonicalizeReasoningDecision(decision), decision, explicitEffort);
    assert.doesNotThrow(() => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: updatedAt,
      run_id: `run-exact-${explicitEffort}`,
      orchestrator: "orchestrator-pipeline",
      agent_id: "executor-01",
      attempt: 1,
      outcome: "blocked",
      reasoning: decision
    }), explicitEffort);
    assert.doesNotThrow(() => canonicalizeAgentStatus({
      run_id: `run-exact-${explicitEffort}`,
      agent_id: "executor-01",
      agent: "executor",
      status: "blocked",
      created_at: createdAt,
      updated_at: updatedAt,
      reasoning: decision
    }), explicitEffort);
  }

  const shadowExact = resolveReasoning({
    role: "reviewer",
    mode: "shadow",
    dispatch_context: "ad-hoc-review",
    model_tier: "strong",
    explicit_effort: "max"
  });
  assert.equal(shadowExact.enforcement_status, "shadow");
  assert.throws(
    () => canonicalizeReasoningDecision({
      ...shadowExact,
      effective_effort: "xhigh"
    }),
    /exact effort override must observe requested effort/
  );

  const assurance = resolveReasoning({
    role: "reviewer",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_system"],
    model_tier: "strong",
    selector_available: true,
    prior_failure_type: "reasoning_failure",
    explicit_reasoning_class: "assurance",
    observed_effective_effort: "max"
  });
  assert.equal(assurance.reasoning_class, "assurance");
  assert.equal(assurance.recovery_boost, false);
  assert.deepEqual(canonicalizeReasoningDecision(assurance), assurance);
  assert.doesNotThrow(() => canonicalizeReasoningObservation({
    schema_version: "2.0",
    observed_at: updatedAt,
    run_id: "run-assurance-no-recovery",
    orchestrator: "orchestrator-pipeline",
    agent_id: "reviewer-01",
    attempt: 1,
    outcome: "done",
    reasoning: assurance
  }));
  assert.doesNotThrow(() => canonicalizeAgentStatus({
    run_id: "run-assurance-no-recovery",
    agent_id: "reviewer-01",
    agent: "reviewer",
    status: "done",
    created_at: createdAt,
    updated_at: updatedAt,
    reasoning: assurance
  }));
});

test("AgentStatus reasoning is managed-role only while resolver defaults remain available", () => {
  const decision = resolveReasoning({
    role: "custom-worker",
    mode: "adaptive",
    task_intent: "execute",
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "medium"
  });
  assert.deepEqual(decision.role_policy, {
    mode: "adaptive",
    floor_class: "routine",
    target_class: "deliberative",
    ceiling_class: "deep",
    strict: false
  });
  assert.deepEqual(canonicalizeReasoningDecision(decision), decision);
  assert.doesNotThrow(() => canonicalizeReasoningObservation({
    schema_version: "2.0",
    observed_at: "2026-07-15T11:40:01.000Z",
    run_id: "run-custom-worker",
    orchestrator: "orchestrator-pipeline",
    agent_id: "custom-worker-01",
    attempt: 1,
    outcome: "done",
    reasoning: decision
  }));
  assert.throws(() => canonicalizeAgentStatus({
    run_id: "run-custom-worker",
    agent_id: "custom-worker-01",
    agent: "custom-worker",
    status: "done",
    created_at: "2026-07-15T11:40:00.000Z",
    updated_at: "2026-07-15T11:40:01.000Z",
    reasoning: decision
  }), /managed policy role/);
});

test("TaskStatus legacy provenance requires the class and signals pair", () => {
  const base = {
    run_id: "run-legacy-task",
    task_id: "task-legacy",
    summary: "Validate legacy task provenance",
    status: "pending",
    created_at: "2026-07-15T11:50:00.000Z",
    updated_at: "2026-07-15T11:50:01.000Z",
    task_intent: null,
    intent_baseline_class: null,
    classification_source: "legacy_explicit_class"
  };
  assert.throws(
    () => canonicalizeTaskStatus(base),
    /legacy classification_source requires reasoning_class and reasoning_signals/
  );
  assert.doesNotThrow(() => canonicalizeTaskStatus({
    ...base,
    reasoning_class: "deliberative",
    reasoning_signals: ["multi_file"]
  }));
});

test("legacy non-inherit decisions require a non-null effective class in every artifact", () => {
  const legacyDecision = {
    schema_version: "1.0",
    policy_version: "1",
    mode: "adaptive",
    role: "executor",
    dispatch_context: null,
    requested_class: "deep",
    effective_class: null,
    reasoning_signals: ["cross_module", "non_local_invariant"],
    model_tier: "standard",
    minimum_model_tier: "standard",
    requires_model_escalation: false,
    requested_effort: "xhigh",
    dispatch_effort: "xhigh",
    effective_effort: "xhigh",
    capability_source: "runtime",
    enforcement_status: "enforced",
    strict: false,
    reasons: ["role:executor", "role_mode:adaptive"],
    conflict: null
  };
  assert.throws(
    () => canonicalizeReasoningDecision(legacyDecision),
    /effective_class must be non-null in adaptive mode/
  );
  const observationReasoning = { ...legacyDecision };
  delete observationReasoning.reasons;
  delete observationReasoning.conflict;
  assert.throws(() => canonicalizeReasoningObservation({
    schema_version: "1.0",
    observed_at: "2026-07-15T12:00:01.000Z",
    run_id: "run-legacy-null-class",
    orchestrator: "orchestrator-pipeline",
    agent_id: "executor-01",
    attempt: 1,
    outcome: "done",
    reasoning: observationReasoning
  }), /effective_class must be non-null in adaptive mode/);
  assert.throws(() => canonicalizeAgentStatus({
    run_id: "run-legacy-null-class",
    agent_id: "executor-01",
    agent: "executor",
    status: "done",
    created_at: "2026-07-15T12:00:00.000Z",
    updated_at: "2026-07-15T12:00:01.000Z",
    reasoning: legacyDecision
  }), /effective_class must be non-null in adaptive mode/);
});

test("version 2 artifacts reject dispatch contexts the resolver cannot emit", () => {
  const decision = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module"],
    model_tier: "standard",
    selector_available: true,
    observed_effective_effort: "xhigh"
  });
  const forged = { ...decision, dispatch_context: "custom-review" };
  assert.throws(
    () => canonicalizeReasoningDecision(forged),
    /dispatch_context must be a managed version 2 context/
  );
  assert.throws(() => canonicalizeReasoningObservation({
    schema_version: "2.0",
    observed_at: "2026-07-15T12:10:01.000Z",
    run_id: "run-custom-context",
    orchestrator: "orchestrator-pipeline",
    agent_id: "executor-01",
    attempt: 1,
    outcome: "done",
    reasoning: forged
  }), /dispatch_context must be a managed version 2 context/);
  assert.throws(() => canonicalizeAgentStatus({
    run_id: "run-custom-context",
    agent_id: "executor-01",
    agent: "executor",
    status: "done",
    created_at: "2026-07-15T12:10:00.000Z",
    updated_at: "2026-07-15T12:10:01.000Z",
    reasoning: forged
  }), /dispatch_context must be a managed version 2 context/);
});

test("schema version 1 artifacts retain bounded custom dispatch contexts", () => {
  const decision = JSON.parse(JSON.stringify(require(
    "../protocols/examples/reasoning-decision.legacy.valid.json"
  )));
  decision.dispatch_context = "legacy-review";
  assert.deepEqual(canonicalizeReasoningDecision(decision), decision);

  const observation = JSON.parse(JSON.stringify(require(
    "../protocols/examples/reasoning-observation.legacy.valid.json"
  )));
  observation.reasoning.dispatch_context = "legacy-review";
  assert.doesNotThrow(() => canonicalizeReasoningObservation(observation));
  assert.doesNotThrow(() => canonicalizeAgentStatus({
    run_id: "run-legacy-custom-context",
    agent_id: "executor-01",
    agent: "executor",
    status: "done",
    created_at: "2026-07-15T12:15:00.000Z",
    updated_at: "2026-07-15T12:15:01.000Z",
    reasoning: decision
  }));
});

test("every accepted strengthened signal policy emits canonical reasoning artifacts", () => {
  const basePolicy = loadPolicy();
  let index = 0;
  for (const signal of Object.keys(basePolicy.signal_minimum_classes)) {
    const policy = JSON.parse(JSON.stringify(basePolicy));
    const formal = signal === "formal_accept_reject";
    policy.signal_minimum_classes[signal] = formal ? "assurance" : "deep";
    validatePolicy(policy);
    const decision = resolveReasoning({
      role: "reviewer",
      mode: "adaptive",
      task_intent: "execute",
      reasoning_signals: [signal],
      model_tier: "strong",
      selector_available: true,
      observed_effective_effort: formal ? "max" : "xhigh"
    }, policy);
    assert.equal(decision.reasoning_class, formal ? "assurance" : "deep", signal);
    assert.equal(decision.conflict, null, signal);
    assert.deepEqual(canonicalizeReasoningDecision(decision), decision, signal);
    assert.doesNotThrow(() => canonicalizeReasoningObservation({
      schema_version: "2.0",
      observed_at: "2026-07-15T12:20:01.000Z",
      run_id: `run-strengthened-signal-${index}`,
      orchestrator: "orchestrator-pipeline",
      agent_id: "reviewer-01",
      attempt: 1,
      outcome: "done",
      reasoning: decision
    }), signal);
    assert.doesNotThrow(() => canonicalizeAgentStatus({
      run_id: `run-strengthened-signal-${index}`,
      agent_id: "reviewer-01",
      agent: "reviewer",
      status: "done",
      created_at: "2026-07-15T12:20:00.000Z",
      updated_at: "2026-07-15T12:20:01.000Z",
      reasoning: decision
    }), signal);
    index += 1;
  }
});

test("invalid task reasoning hints do not mutate canonical run files", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-invalid-reasoning-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const started = await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-invalid-reasoning",
    orchestrator: "orchestrator-flow",
    user_prompt: "Reject invalid reasoning hints",
    timestamp: "2026-07-14T10:20:00.000Z"
  });
  const runBefore = await fs.readFile(started.run_status_path, "utf8");
  const checkpointBefore = await fs.readFile(started.checkpoint_path, "utf8");

  for (const task of [
    {
      task_id: "task-empty-signals",
      summary: "Empty signals",
      reasoning_class: "routine",
      reasoning_signals: []
    },
    {
      task_id: "task-low-class",
      summary: "Low class",
      reasoning_class: "routine",
      reasoning_signals: ["security_boundary"]
    },
    {
      task_id: "task-bad-intent-baseline",
      summary: "Mismatched intent metadata",
      task_intent: "design",
      intent_baseline_class: "routine",
      classification_source: "task_intent",
      reasoning_class: "deliberative",
      reasoning_signals: ["multi_step"]
    },
    {
      task_id: "task-orphan-intent-baseline",
      summary: "Intent baseline without intent",
      intent_baseline_class: "deliberative",
      reasoning_class: "deliberative",
      reasoning_signals: ["multi_step"]
    }
  ]) {
    await assert.rejects(runtime.applyEvent("tasks.registered", {
      output_root: tempRoot,
      run_id: "run-invalid-reasoning",
      tasks: [task],
      timestamp: "2026-07-14T10:20:01.000Z"
    }), /reasoning_signals must contain|below signal minimum|intent_baseline_class must match|non-null intent_baseline_class requires/);
  }

  assert.equal(await fs.readFile(started.run_status_path, "utf8"), runBefore);
  assert.equal(await fs.readFile(started.checkpoint_path, "utf8"), checkpointBefore);
  assert.deepEqual(
    await fs.readdir(path.join(tempRoot, "run-invalid-reasoning", "status", "tasks")),
    []
  );
});

test("configured adaptive dispatch persists its exact low-effort decision and matching local trace", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-configured-low-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-configured-low";
  const agentId = "123e4567-e89b-42d3-a456-426614174111";
  const configuration = currentRunConfiguration();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    user_prompt: "Persist the saved dispatch configuration",
    configuration,
    flags: {
      reasoning_mode: "adaptive",
      reasoning_policy_version: "3",
      reasoning_ceiling: "max"
    },
    timestamp: "2026-09-05T01:00:00.000Z"
  });
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: runId,
    tasks: [{ task_id: "t3", summary: "Persist configured dispatch", status: "ready" }],
    timestamp: "2026-09-05T01:00:01.000Z"
  });
  const requested = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "execute",
    selector_available: true,
    resolved_configuration: configuration.resolved_configurations.executor
  });
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot,
    run_id: runId,
    agent_id: agentId,
    agent: "executor",
    task_id: "t3",
    reasoning: requested,
    resolved_configuration: configuration.resolved_configurations.executor,
    timestamp: "2026-09-05T01:00:02.000Z"
  });
  const enforced = resolveReasoning({
    role: "executor",
    mode: "adaptive",
    task_intent: "execute",
    selector_available: true,
    observed_effective_effort: "low",
    resolved_configuration: configuration.resolved_configurations.executor
  });
  const finished = await runtime.applyEvent("agent.finished", {
    output_root: tempRoot,
    run_id: runId,
    agent_id: agentId,
    status: "done",
    reasoning: enforced,
    trace_evidence: matchingLowTrace(agentId),
    timestamp: "2026-09-05T01:00:03.000Z"
  });

  const runStatus = await readJson(finished.run_status_path);
  const checkpoint = await readJson(finished.checkpoint_path);
  const task = await readJson(path.join(tempRoot, runId, "status", "tasks", "t3.json"));
  const agent = await readJson(path.join(tempRoot, runId, "status", "agents", `${agentId}.json`));
  const observation = await readJson(path.join(tempRoot, runId, "observations", "reasoning", `${agentId}.json`));
  assert.deepEqual(runStatus.configuration, checkpoint.configuration);
  assert.deepEqual(task.configuration_identity, configuration.configuration_identity);
  assert.deepEqual(agent.resolved_configuration, configuration.resolved_configurations.executor);
  assert.equal(agent.reasoning.dispatch_effort, "low");
  assert.equal(agent.trace_evidence.effort_matches, true);
  assert.equal(observation.reasoning.model_set.id, "openai-luna-sol-astra");
  assert.equal(observation.trace_evidence.effective_effort, "low");

  const changed = JSON.parse(JSON.stringify(configuration));
  changed.profile = "careful";
  await assert.rejects(runtime.applyEvent("run.resumed", {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    configuration: changed,
    timestamp: "2026-09-05T01:00:04.000Z"
  }), /incompatible with the saved run configuration/);
});

test("configured adaptive dispatch rejects a low-to-medium trace mismatch without rewriting the agent", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-configured-mismatch-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-configured-mismatch";
  const agentId = "123e4567-e89b-42d3-a456-426614174112";
  const configuration = currentRunConfiguration();
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    user_prompt: "Reject mismatched adaptive evidence",
    configuration,
    flags: { reasoning_mode: "adaptive", reasoning_policy_version: "3", reasoning_ceiling: "max" },
    timestamp: "2026-09-05T01:01:00.000Z"
  });
  const requested = resolveReasoning({
    role: "executor", mode: "adaptive", task_intent: "execute", selector_available: true,
    resolved_configuration: configuration.resolved_configurations.executor
  });
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot, run_id: runId, agent_id: agentId, agent: "executor",
    reasoning: requested, resolved_configuration: configuration.resolved_configurations.executor,
    timestamp: "2026-09-05T01:01:01.000Z"
  });
  const before = await fs.readFile(path.join(tempRoot, runId, "status", "agents", `${agentId}.json`), "utf8");
  const enforced = resolveReasoning({
    role: "executor", mode: "adaptive", task_intent: "execute", selector_available: true,
    observed_effective_effort: "low", resolved_configuration: configuration.resolved_configurations.executor
  });
  const mismatch = { ...matchingLowTrace(agentId), effective_effort: "medium", effort_matches: false, selector_evidence: "mismatch" };
  await assert.rejects(runtime.applyEvent("agent.finished", {
    output_root: tempRoot, run_id: runId, agent_id: agentId, status: "done",
    reasoning: enforced, trace_evidence: mismatch, timestamp: "2026-09-05T01:01:02.000Z"
  }), /matching adaptive trace evidence/);
  assert.equal(await fs.readFile(path.join(tempRoot, runId, "status", "agents", `${agentId}.json`), "utf8"), before);
});

test("configured legacy decisions and approved recovery envelopes retain their saved compatibility boundary", () => {
  const legacyConfiguration = legacyRunConfiguration();
  const legacyDecision = resolveReasoning({
    role: "executor", mode: "adaptive", task_intent: "execute", selector_available: true,
    resolved_configuration: legacyConfiguration.resolved_configurations.executor
  });
  assert.equal(legacyDecision.schema_version, "2.0");
  assert.doesNotThrow(() => canonicalizeAgentStatus({
    run_id: "run-legacy-config", agent_id: "legacy-executor", agent: "executor", status: "done",
    created_at: "2026-09-05T01:02:00.000Z", updated_at: "2026-09-05T01:02:01.000Z",
    resolved_configuration: legacyConfiguration.resolved_configurations.executor,
    reasoning: legacyDecision
  }, legacyConfiguration));

  const runConfiguration = currentRunConfiguration({ modelTier: "standard" });
  const recovery = {
    kind: "capability_recovery", version: "1", source_model_tier: "standard", target_model_tier: "strong"
  };
  const recovered = currentExecutorConfiguration({ modelTier: "standard", recovery });
  const recoveryDecision = resolveReasoning({
    role: "executor", mode: "shadow", task_intent: "execute", selector_available: true,
    resolved_configuration: recovered
  });
  const canonical = canonicalizeAgentStatus({
    run_id: "run-recovery-config", agent_id: "recovery-executor", agent: "executor", status: "starting",
    created_at: "2026-09-05T01:02:00.000Z", updated_at: "2026-09-05T01:02:01.000Z",
    resolved_configuration: recovered, reasoning: recoveryDecision
  }, runConfiguration);
  assert.equal(canonical.resolved_configuration.provenance.override.target_model_tier, "strong");
  assert.equal(canonical.reasoning.enforcement_status, "shadow");
  assert.equal(canonical.trace_evidence, undefined);
});

test("terminal agent attempts emit content-free local reasoning observations", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-reasoning-observation-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-reasoning-observation";
  const reasoningInput = {
    role: "executor",
    mode: "adaptive",
    task_intent: "design",
    reasoning_signals: ["cross_module", "non_local_invariant"],
    model_tier: "standard"
  };
  await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "PRIVATE PROMPT MUST NOT ENTER OBSERVATIONS",
    flags: {
      reasoning_mode: "adaptive",
      reasoning_policy_version: "2",
      reasoning_ceiling: "max"
    },
    timestamp: "2026-07-14T10:30:00.000Z"
  });
  await runtime.applyEvent("tasks.registered", {
    output_root: tempRoot,
    run_id: runId,
    tasks: [{
      task_id: "task-reasoning",
      summary: "Exercise the reasoning observation contract",
      task_intent: "design",
      intent_baseline_class: "deliberative",
      classification_source: "task_intent",
      reasoning_class: "deep",
      reasoning_signals: ["cross_module", "non_local_invariant"]
    }],
    timestamp: "2026-07-14T10:30:00.100Z"
  });
  await runtime.applyEvent("agent.started", {
    output_root: tempRoot,
    run_id: runId,
    agent_id: "executor-reasoning",
    agent: "executor",
    task_id: "task-reasoning",
    reasoning: resolveReasoning(reasoningInput),
    timestamp: "2026-07-14T10:30:00.200Z"
  });

  const observationDir = path.join(tempRoot, runId, "observations", "reasoning");
  assert.deepEqual(await fs.readdir(observationDir), []);

  await runtime.applyEvent("agent.finished", {
    output_root: tempRoot,
    run_id: runId,
    agent_id: "executor-reasoning",
    status: "done",
    result_summary: "PRIVATE RESULT MUST NOT ENTER OBSERVATIONS",
    evidence_refs: ["/private/workspace/path/test.log"],
    reasoning: resolveReasoning({
      ...reasoningInput,
      observed_effective_effort: "xhigh",
      runtime_supported_efforts: ["medium", "high", "xhigh", "max"]
    }),
    timestamp: "2026-07-14T10:30:01.200Z"
  });

  const taskStatus = await readJson(path.join(tempRoot, runId, "status", "tasks", "task-reasoning.json"));
  assert.equal(taskStatus.task_intent, "design");
  assert.equal(taskStatus.intent_baseline_class, "deliberative");
  assert.equal(taskStatus.classification_source, "task_intent");
  assert.equal(taskStatus.reasoning_class, "deep");
  assert.deepEqual(taskStatus.reasoning_signals, ["cross_module", "non_local_invariant"]);

  const observationPath = path.join(observationDir, "executor-reasoning.json");
  const observation = await readJson(observationPath);
  assert.equal(observation.schema_version, "2.0");
  assert.equal(observation.outcome, "done");
  assert.equal(observation.wall_time_ms, 1000);
  assert.equal(observation.reasoning.enforcement_status, "enforced");
  assert.equal(observation.reasoning.task_intent, "design");
  assert.equal(observation.reasoning.reasoning_class, "deep");
  assert.equal(observation.reasoning.selected_model_tier, "standard");
  assert.equal(observation.reasoning.effective_effort, "xhigh");
  assert.equal("agent" in observation, false);
  assert.equal("reasons" in observation.reasoning, false);
  assert.equal("conflict" in observation.reasoning, false);
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, /PRIVATE PROMPT/);
  assert.doesNotMatch(serialized, /PRIVATE RESULT/);
  assert.doesNotMatch(serialized, /private\/workspace/);
  assert.doesNotMatch(serialized, /PRIVATE AGENT/);
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
      capability_recovery_mode: "shadow",
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
      review_mode: "on",
      review_reasoning_effort: "max"
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
    capability_recovery_mode: "shadow",
    confirm_mode: true,
    flow_recovery_limit: 1,
    flow_recovery_used: 1,
    operational_retry_limit: 2,
    preset_mode: "delivery",
    review_mode: "on",
    review_reasoning_effort: "max",
    scout_mode: "skip"
  });
  assert.equal(checkpoint.current_stage, 2);
});

test("capability recovery mode rejects invalid lifecycle values without persistence", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-capability-recovery-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-capability-recovery";
  const basePayload = {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    timestamp: "2026-07-14T11:30:00.000Z"
  };

  await assert.rejects(
    runtime.applyEvent("run.started", {
      ...basePayload,
      user_prompt: "Reject unsupported recovery mode before layout creation",
      flags: { capability_recovery_mode: "enabled" }
    }),
    /flags\.capability_recovery_mode must be one of/
  );
  await assert.rejects(
    fs.lstat(path.join(tempRoot, runId)),
    (error) => error && error.code === "ENOENT"
  );

  const started = await runtime.applyEvent("run.started", {
    ...basePayload,
    user_prompt: "Persist a supported recovery mode",
    flags: { capability_recovery_mode: "auto" }
  });
  const before = await fs.readFile(started.checkpoint_path, "utf8");

  for (const capability_recovery_mode of ["enabled", true]) {
    await assert.rejects(
      runtime.applyEvent("checkpoint.updated", {
        ...basePayload,
        flags: { capability_recovery_mode },
        timestamp: "2026-07-14T11:31:00.000Z"
      }),
      /flags\.capability_recovery_mode must be one of/
    );
  }
  assert.equal(await fs.readFile(started.checkpoint_path, "utf8"), before);

  await assert.rejects(
    runtime.applyEvent("run.resumed", {
      ...basePayload,
      flags: { capability_recovery_mode: false },
      timestamp: "2026-07-14T11:32:00.000Z"
    }),
    /flags\.capability_recovery_mode must be one of/
  );
  assert.equal(await fs.readFile(started.checkpoint_path, "utf8"), before);
});

test("Pipeline capability recovery atomically consumes one persisted task retry", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-pipeline-recovery-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-pipeline-recovery";
  const taskId = "task-recovery";
  const envelope = {
    output_root: tempRoot,
    run_id: runId
  };

  await runtime.applyEvent("run.started", {
    ...envelope,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Persist bounded task capability recovery",
    flags: {
      capability_recovery_mode: "auto",
      max_retry_rounds: 3
    },
    timestamp: "2026-07-14T11:40:00.000Z"
  });
  const registered = await runtime.applyEvent("tasks.registered", {
    ...envelope,
    tasks: [{
      task_id: taskId,
      summary: "Exercise one promoted retry",
      status: "ready"
    }],
    timestamp: "2026-07-14T11:40:01.000Z"
  });
  const taskPath = path.join(
    path.dirname(registered.run_status_path),
    "tasks",
    `${taskId}.json`
  );
  const beforeInvalidClaim = await fs.readFile(taskPath, "utf8");

  await assert.rejects(
    runtime.applyEvent("task.updated", {
      ...envelope,
      task_id: taskId,
      capability_recovery_used: true,
      timestamp: "2026-07-14T11:40:02.000Z"
    }),
    /atomically consume one retry opportunity/
  );
  assert.equal(await fs.readFile(taskPath, "utf8"), beforeInvalidClaim);

  await runtime.applyEvent("task.updated", {
    ...envelope,
    task_id: taskId,
    retry_opportunities_used: 1,
    timestamp: "2026-07-14T11:40:03.000Z"
  });
  await runtime.applyEvent("task.updated", {
    ...envelope,
    task_id: taskId,
    retry_opportunities_used: 2,
    capability_recovery_used: true,
    timestamp: "2026-07-14T11:40:04.000Z"
  });

  let taskStatus = await readJson(taskPath);
  assert.equal(taskStatus.retry_opportunities_used, 2);
  assert.equal(taskStatus.capability_recovery_used, true);

  await runtime.applyEvent("run.resumed", {
    ...envelope,
    orchestrator: "orchestrator-pipeline",
    timestamp: "2026-07-14T11:41:00.000Z"
  });
  taskStatus = await readJson(taskPath);
  assert.equal(taskStatus.retry_opportunities_used, 2);
  assert.equal(taskStatus.capability_recovery_used, true);

  const beforeDuplicateClaim = await fs.readFile(taskPath, "utf8");
  await assert.rejects(
    runtime.applyEvent("task.updated", {
      ...envelope,
      task_id: taskId,
      retry_opportunities_used: 3,
      capability_recovery_used: true,
      timestamp: "2026-07-14T11:41:01.000Z"
    }),
    /capability recovery has already been used/
  );
  assert.equal(await fs.readFile(taskPath, "utf8"), beforeDuplicateClaim);

  await runtime.applyEvent("task.updated", {
    ...envelope,
    task_id: taskId,
    retry_opportunities_used: 3,
    timestamp: "2026-07-14T11:41:02.000Z"
  });
  const exhausted = await fs.readFile(taskPath, "utf8");
  await assert.rejects(
    runtime.applyEvent("task.updated", {
      ...envelope,
      task_id: taskId,
      retry_opportunities_used: 4,
      timestamp: "2026-07-14T11:41:03.000Z"
    }),
    /exceeds max_retry_rounds/
  );
  assert.equal(await fs.readFile(taskPath, "utf8"), exhausted);
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

test("checkpoint reasoning policy flags are atomic", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-reasoning-flags-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const started = await runtime.applyEvent("run.started", {
    output_root: tempRoot,
    run_id: "run-reasoning-flags",
    orchestrator: "orchestrator-flow",
    user_prompt: "Reject partial reasoning flags",
    flags: {},
    timestamp: "2026-04-18T01:20:00.000Z"
  });
  const before = await fs.readFile(started.checkpoint_path, "utf8");

  await assert.rejects(
    runtime.applyEvent("checkpoint.updated", {
      output_root: tempRoot,
      run_id: "run-reasoning-flags",
      flags: { reasoning_mode: "adaptive" },
      timestamp: "2026-04-18T01:21:00.000Z"
    }),
    /reasoning_mode, reasoning_policy_version, and reasoning_ceiling must be supplied together/
  );
  await assert.rejects(
    runtime.applyEvent("checkpoint.updated", {
      output_root: tempRoot,
      run_id: "run-reasoning-flags",
      flags: { allow_degraded_deep: true },
      timestamp: "2026-04-18T01:21:10.000Z"
    }),
    /allow_degraded_deep requires the complete reasoning policy flag set/
  );
  await assert.rejects(
    runtime.applyEvent("checkpoint.updated", {
      output_root: tempRoot,
      run_id: "run-reasoning-flags",
      flags: {
        reasoning_mode: "adaptive",
        reasoning_policy_version: "2",
        reasoning_ceiling: "max",
        allow_degraded_deep: "yes"
      },
      timestamp: "2026-04-18T01:21:20.000Z"
    }),
    /allow_degraded_deep must be a boolean/
  );
  for (const flags of [
    {
      reasoning_mode: "bogus",
      reasoning_policy_version: "1",
      reasoning_ceiling: "max"
    },
    {
      reasoning_mode: "adaptive",
      reasoning_policy_version: "1",
      reasoning_ceiling: "ultra"
    }
  ]) {
    await assert.rejects(runtime.applyEvent("checkpoint.updated", {
      output_root: tempRoot,
      run_id: "run-reasoning-flags",
      flags,
      timestamp: "2026-04-18T01:21:30.000Z"
    }), /flags\.reasoning_(?:mode|ceiling) must be one of/);
  }
  assert.equal(await fs.readFile(started.checkpoint_path, "utf8"), before);
});

test("run.started validates reasoning flags before creating a run layout", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-start-preflight-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-start-preflight";
  const basePayload = {
    output_root: tempRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    user_prompt: "Validate before filesystem mutation",
    timestamp: "2026-07-14T11:00:00.000Z"
  };

  await assert.rejects(
    runtime.applyEvent("run.started", {
      ...basePayload,
      flags: { reasoning_mode: "adaptive" }
    }),
    /reasoning_mode, reasoning_policy_version, and reasoning_ceiling must be supplied together/
  );
  await assert.rejects(
    fs.lstat(path.join(tempRoot, runId)),
    (error) => error && error.code === "ENOENT"
  );

  const started = await runtime.applyEvent("run.started", {
    ...basePayload,
    flags: {
      reasoning_mode: "adaptive",
      reasoning_policy_version: "1",
      reasoning_ceiling: "max"
    }
  });
  assert.equal((await readJson(started.checkpoint_path)).pipeline_id, runId);
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

test("fresh batches validate later projections before creating a run layout", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-batch-preflight-"));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const runtime = new StatusRuntime();
  const runId = "run-batch-preflight";
  const buildEvents = (reasoningClass) => [
    {
      event: "run.started",
      payload: {
        output_root: tempRoot,
        run_id: runId,
        orchestrator: "orchestrator-flow",
        user_prompt: "Validate a fresh batch before filesystem mutation",
        flags: {
          reasoning_mode: "adaptive",
          reasoning_policy_version: "1",
          reasoning_ceiling: "max"
        },
        timestamp: "2026-07-14T12:00:00.000Z"
      }
    },
    {
      event: "tasks.registered",
      payload: {
        output_root: tempRoot,
        run_id: runId,
        tasks: [{
          task_id: "task-batch-preflight",
          summary: "Exercise fresh batch projection validation",
          reasoning_class: reasoningClass,
          reasoning_signals: ["security_boundary"]
        }],
        timestamp: "2026-07-14T12:00:01.000Z"
      }
    }
  ];

  await assert.rejects(
    runtime.applyEvents(buildEvents("routine")),
    /reasoning_class routine is below signal minimum deep/
  );
  await assert.rejects(
    fs.lstat(path.join(tempRoot, runId)),
    (error) => error && error.code === "ENOENT"
  );

  const corrected = await runtime.applyEvents(buildEvents("deep"));
  assert.equal(corrected.run_id, runId);
  assert.equal(corrected.task_count, 1);
  assert.equal((await readJson(corrected.checkpoint_path)).pipeline_id, runId);
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
