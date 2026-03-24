#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { createStatusRuntime } = require("../opencode/plugins/status-runtime/index.js");
const {
  canonicalizeAgentStatus,
  canonicalizeCheckpoint,
  canonicalizeRunStatus,
  canonicalizeTaskStatus
} = require("../opencode/plugins/status-runtime/schema-lite.js");
const { stableJson } = require("../opencode/plugins/status-runtime/utils.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const PYTHON_CANDIDATES = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

function joinRun(outputRoot, runId, ...segments) {
  return path.join(path.resolve(outputRoot), runId, ...segments);
}

function expectEqual(actual, expected, label) {
  assert.equal(actual, expected, `${label} did not match expected canonical output.`);
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function expectCanonicalJson(filePath, expectedValue, canonicalize, label) {
  const actual = await readText(filePath);
  const expected = stableJson(canonicalize(expectedValue));
  expectEqual(actual, expected, label);
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status}.\nSTDOUT:\n${result.stdout || ""}\nSTDERR:\n${result.stderr || ""}`
    );
  }
  return result;
}

function resolvePythonCommand() {
  for (const [command, prefix] of PYTHON_CANDIDATES) {
    const probe = spawnSync(command, [...prefix, "--version"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    if (!probe.error && probe.status === 0) {
      return { command, prefix };
    }
  }
  throw new Error("Could not find python3/python runtime required for schema validation.");
}

function validateSchema(python, schemaRelPath, inputPath) {
  const schemaPath = path.join(REPO_ROOT, schemaRelPath);
  const scriptPath = path.join(REPO_ROOT, "opencode", "tools", "validate-schema.py");
  const strict = spawnSync(
    python.command,
    [...python.prefix, scriptPath, "--schema", schemaPath, "--input", inputPath, "--require-jsonschema"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }
  );

  if (!strict.error && strict.status === 0) {
    return;
  }

  const missingJsonschema =
    !strict.error &&
    strict.status === 2 &&
    typeof strict.stderr === "string" &&
    strict.stderr.includes("jsonschema");

  if (!missingJsonschema) {
    throw new Error(
      `Schema validation for ${path.basename(inputPath)} failed with exit code ${strict.status}.\nSTDOUT:\n${strict.stdout || ""}\nSTDERR:\n${strict.stderr || ""}`
    );
  }

  runCommand(
    python.command,
    [...python.prefix, scriptPath, "--schema", schemaPath, "--input", inputPath],
    `Fallback schema validation for ${path.basename(inputPath)}`
  );
}

async function apply(runtime, eventName, payload) {
  return runtime.applyEvent(eventName, payload);
}

async function scenarioRunOnly(runtime, tempRoot, python) {
  const outputRoot = path.join(tempRoot, "run-only-output");
  const runId = "status-runtime-smoke-run-only";
  const runDir = joinRun(outputRoot, runId);
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const runStatusPath = path.join(runDir, "status", "run-status.json");

  await apply(runtime, "run.started", {
    output_root: outputRoot,
    run_id: runId,
    orchestrator: "orchestrator-flow",
    user_prompt: "Replay deterministic run-only lifecycle smoke coverage.",
    flags: { mode: "smoke", scope: "run-only" },
    timestamp: "2026-03-24T10:00:00.000Z"
  });

  await apply(runtime, "stage.completed", {
    output_root: outputRoot,
    run_id: runId,
    stage: 0,
    name: "specify",
    status: "completed",
    artifact_key: "problem_spec",
    stage_artifact: { path: "artifacts/problem-spec.json" },
    next_stage: 1,
    timestamp: "2026-03-24T10:01:00.000Z"
  });

  await apply(runtime, "stage.completed", {
    output_root: outputRoot,
    run_id: runId,
    stage: 1,
    name: "plan",
    status: "completed",
    artifact_key: "plan_outline",
    stage_artifact: { path: "artifacts/plan-outline.json" },
    next_stage: 2,
    timestamp: "2026-03-24T10:02:00.000Z"
  });

  const finishResult = await apply(runtime, "run.finished", {
    output_root: outputRoot,
    run_id: runId,
    status: "completed",
    waiting_on: "none",
    notes: ["Run-only replay smoke completed deterministically."],
    timestamp: "2026-03-24T10:03:00.000Z"
  });

  assert.equal(finishResult.run_id, runId);
  assert.equal(finishResult.run_dir, runDir);
  assert.equal(finishResult.layout, "run-only");
  assert.equal(finishResult.task_count, 0);
  assert.equal(finishResult.agent_count, 0);

  const expectedRunStatus = {
    run_id: runId,
    orchestrator: "orchestrator-flow",
    status: "completed",
    created_at: "2026-03-24T10:00:00.000Z",
    updated_at: "2026-03-24T10:03:00.000Z",
    output_dir: runDir,
    checkpoint_path: checkpointPath,
    user_prompt: "Replay deterministic run-only lifecycle smoke coverage.",
    current_stage: 1,
    completed_stages: [
      {
        stage: 0,
        name: "specify",
        status: "completed",
        artifact_key: "problem_spec",
        timestamp: "2026-03-24T10:01:00.000Z"
      },
      {
        stage: 1,
        name: "plan",
        status: "completed",
        artifact_key: "plan_outline",
        timestamp: "2026-03-24T10:02:00.000Z"
      }
    ],
    next_stage: 2,
    layout: "run-only",
    task_counts: {
      pending: 0,
      ready: 0,
      in_progress: 0,
      waiting_for_user: 0,
      done: 0,
      blocked: 0,
      failed: 0,
      skipped: 0,
      stale: 0
    },
    active_task_ids: [],
    active_agent_ids: [],
    waiting_on: "none",
    resume_from_checkpoint: false,
    notes: ["Run-only replay smoke completed deterministically."]
  };

  const expectedCheckpoint = {
    pipeline_id: runId,
    orchestrator: "orchestrator-flow",
    user_prompt: "Replay deterministic run-only lifecycle smoke coverage.",
    flags: { mode: "smoke", scope: "run-only" },
    current_stage: 1,
    completed_stages: expectedRunStatus.completed_stages,
    stage_artifacts: {
      problem_spec: { path: "artifacts/problem-spec.json" },
      plan_outline: { path: "artifacts/plan-outline.json" }
    },
    created_at: "2026-03-24T10:00:00.000Z",
    updated_at: "2026-03-24T10:03:00.000Z"
  };

  await expectCanonicalJson(runStatusPath, expectedRunStatus, canonicalizeRunStatus, "run-only run-status.json");
  await expectCanonicalJson(checkpointPath, expectedCheckpoint, canonicalizeCheckpoint, "run-only checkpoint.json");
  validateSchema(python, path.join("opencode", "protocols", "schemas", "run-status.schema.json"), runStatusPath);
  console.log("OK scenario: run-only lifecycle");
}

async function scenarioExpanded(runtime, tempRoot, python) {
  const outputRoot = path.join(tempRoot, "expanded-output");
  const runId = "status-runtime-smoke-expanded";
  const runDir = joinRun(outputRoot, runId);
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const runStatusPath = path.join(runDir, "status", "run-status.json");
  const taskDocPath = path.join(runDir, "status", "tasks", "task-doc-summary.json");
  const taskProcessPath = path.join(runDir, "status", "tasks", "task-process-smoke.json");
  const agentPath = path.join(runDir, "status", "agents", "agent-process-01.json");
  const taskListPath = path.join(runDir, "task-list.json");
  const dispatchPlanPath = path.join(runDir, "dispatch-plan.json");

  await apply(runtime, "run.started", {
    output_root: outputRoot,
    run_id: runId,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Replay deterministic expanded task and agent lifecycle smoke coverage.",
    flags: { mode: "smoke", scope: "expanded" },
    timestamp: "2026-03-24T11:00:00.000Z"
  });

  await apply(runtime, "tasks.registered", {
    output_root: outputRoot,
    run_id: runId,
    task_list_path: taskListPath,
    tasks: [
      {
        task_id: "task-doc-summary",
        summary: "Summarize replay smoke evidence.",
        status: "ready",
        trace_ids: ["story-runtime-smoke", "ac-runtime-smoke"],
        assigned_executor: "executor-core",
        resource_class: "light",
        teardown_required: false
      },
      {
        task_id: "task-process-smoke",
        summary: "Replay process-backed smoke lifecycle.",
        status: "pending",
        trace_ids: ["tc-runtime-smoke", "sc-runtime-smoke"],
        depends_on: ["task-doc-summary"],
        assigned_executor: "executor-advanced",
        resource_class: "process",
        max_parallelism: 2,
        teardown_required: true
      }
    ],
    timestamp: "2026-03-24T11:01:00.000Z"
  });

  await apply(runtime, "task.updated", {
    output_root: outputRoot,
    run_id: runId,
    task_id: "task-doc-summary",
    status: "done",
    result_summary: "Smoke summary written.",
    evidence_refs: ["logs/doc-summary.log", "artifacts/doc-summary.md"],
    completed_at: "2026-03-24T11:02:00.000Z",
    timestamp: "2026-03-24T11:02:00.000Z"
  });

  await apply(runtime, "stage.completed", {
    output_root: outputRoot,
    run_id: runId,
    stage: 3,
    name: "atomize",
    status: "completed",
    artifact_key: "task_list",
    stage_artifact: { path: taskListPath },
    task_list_path: taskListPath,
    next_stage: 4,
    timestamp: "2026-03-24T11:03:00.000Z"
  });

  await apply(runtime, "stage.completed", {
    output_root: outputRoot,
    run_id: runId,
    stage: 4,
    name: "route",
    status: "completed",
    artifact_key: "dispatch_plan",
    stage_artifact: { path: dispatchPlanPath },
    dispatch_plan_path: dispatchPlanPath,
    next_stage: 5,
    timestamp: "2026-03-24T11:04:00.000Z"
  });

  await apply(runtime, "task.updated", {
    output_root: outputRoot,
    run_id: runId,
    task_id: "task-process-smoke",
    status: "in_progress",
    resource_status: "starting",
    timestamp: "2026-03-24T11:05:00.000Z"
  });

  await apply(runtime, "agent.started", {
    output_root: outputRoot,
    run_id: runId,
    agent_id: "agent-process-01",
    agent: "executor-advanced",
    task_id: "task-process-smoke",
    batch_id: "batch-process",
    attempt: 1,
    status: "running",
    resource_class: "process",
    resource_status: "starting",
    teardown_required: true,
    resource_handles: { process_label: "smoke-worker", pid: 4321 },
    cleanup_status: "pending",
    timestamp: "2026-03-24T11:06:00.000Z"
  });

  await apply(runtime, "agent.heartbeat", {
    output_root: outputRoot,
    run_id: runId,
    agent_id: "agent-process-01",
    status: "running",
    resource_status: "running",
    last_heartbeat_at: "2026-03-24T11:07:00.000Z",
    timestamp: "2026-03-24T11:07:00.000Z"
  });

  await apply(runtime, "agent.finished", {
    output_root: outputRoot,
    run_id: runId,
    agent_id: "agent-process-01",
    status: "done",
    resource_status: "cleaned",
    cleanup_status: "cleaned",
    result_summary: "Process worker exited cleanly.",
    evidence_refs: ["logs/process.log", "artifacts/process-report.json"],
    completed_at: "2026-03-24T11:08:00.000Z",
    timestamp: "2026-03-24T11:08:00.000Z"
  });

  await apply(runtime, "task.updated", {
    output_root: outputRoot,
    run_id: runId,
    task_id: "task-process-smoke",
    status: "done",
    result_summary: "Process-backed smoke completed.",
    evidence_refs: ["logs/process.log", "artifacts/process-report.json"],
    completed_at: "2026-03-24T11:09:00.000Z",
    timestamp: "2026-03-24T11:09:00.000Z"
  });

  const finishResult = await apply(runtime, "run.finished", {
    output_root: outputRoot,
    run_id: runId,
    status: "completed",
    waiting_on: "none",
    notes: ["Expanded replay smoke completed deterministically."],
    timestamp: "2026-03-24T11:10:00.000Z"
  });

  assert.equal(finishResult.run_id, runId);
  assert.equal(finishResult.run_dir, runDir);
  assert.equal(finishResult.layout, "expanded");
  assert.equal(finishResult.task_count, 2);
  assert.equal(finishResult.agent_count, 1);

  const expectedRunStatus = {
    run_id: runId,
    orchestrator: "orchestrator-pipeline",
    status: "completed",
    created_at: "2026-03-24T11:00:00.000Z",
    updated_at: "2026-03-24T11:10:00.000Z",
    output_dir: runDir,
    checkpoint_path: checkpointPath,
    user_prompt: "Replay deterministic expanded task and agent lifecycle smoke coverage.",
    current_stage: 4,
    completed_stages: [
      {
        stage: 3,
        name: "atomize",
        status: "completed",
        artifact_key: "task_list",
        timestamp: "2026-03-24T11:03:00.000Z"
      },
      {
        stage: 4,
        name: "route",
        status: "completed",
        artifact_key: "dispatch_plan",
        timestamp: "2026-03-24T11:04:00.000Z"
      }
    ],
    next_stage: 5,
    task_list_path: taskListPath,
    dispatch_plan_path: dispatchPlanPath,
    layout: "expanded",
    task_counts: {
      pending: 0,
      ready: 0,
      in_progress: 0,
      waiting_for_user: 0,
      done: 2,
      blocked: 0,
      failed: 0,
      skipped: 0,
      stale: 0
    },
    active_task_ids: [],
    active_agent_ids: [],
    waiting_on: "none",
    resume_from_checkpoint: false,
    last_heartbeat_at: "2026-03-24T11:07:00.000Z",
    notes: ["Expanded replay smoke completed deterministically."],
    task_refs: [
      { task_id: "task-doc-summary", path: "status/tasks/task-doc-summary.json" },
      { task_id: "task-process-smoke", path: "status/tasks/task-process-smoke.json" }
    ],
    agent_refs: [{ agent_id: "agent-process-01", path: "status/agents/agent-process-01.json" }]
  };

  const expectedTaskDoc = {
    run_id: runId,
    task_id: "task-doc-summary",
    summary: "Summarize replay smoke evidence.",
    status: "done",
    created_at: "2026-03-24T11:01:00.000Z",
    updated_at: "2026-03-24T11:02:00.000Z",
    trace_ids: ["story-runtime-smoke", "ac-runtime-smoke"],
    assigned_executor: "executor-core",
    resource_class: "light",
    teardown_required: false,
    resource_status: "not_required",
    completed_at: "2026-03-24T11:02:00.000Z",
    result_summary: "Smoke summary written.",
    evidence_refs: ["logs/doc-summary.log", "artifacts/doc-summary.md"]
  };

  const expectedTaskProcess = {
    run_id: runId,
    task_id: "task-process-smoke",
    summary: "Replay process-backed smoke lifecycle.",
    status: "done",
    created_at: "2026-03-24T11:01:00.000Z",
    updated_at: "2026-03-24T11:09:00.000Z",
    trace_ids: ["tc-runtime-smoke", "sc-runtime-smoke"],
    depends_on: ["task-doc-summary"],
    assigned_agent_id: "agent-process-01",
    assigned_executor: "executor-advanced",
    resource_class: "process",
    max_parallelism: 2,
    teardown_required: true,
    resource_status: "cleaned",
    started_at: "2026-03-24T11:05:00.000Z",
    completed_at: "2026-03-24T11:09:00.000Z",
    last_heartbeat_at: "2026-03-24T11:07:00.000Z",
    result_summary: "Process-backed smoke completed.",
    evidence_refs: ["logs/process.log", "artifacts/process-report.json"],
    agent_ref: { agent_id: "agent-process-01", path: "status/agents/agent-process-01.json" }
  };

  const expectedAgent = {
    run_id: runId,
    agent_id: "agent-process-01",
    agent: "executor-advanced",
    status: "done",
    created_at: "2026-03-24T11:06:00.000Z",
    updated_at: "2026-03-24T11:08:00.000Z",
    task_id: "task-process-smoke",
    batch_id: "batch-process",
    attempt: 1,
    started_at: "2026-03-24T11:06:00.000Z",
    completed_at: "2026-03-24T11:08:00.000Z",
    last_heartbeat_at: "2026-03-24T11:07:00.000Z",
    resource_class: "process",
    resource_status: "cleaned",
    teardown_required: true,
    resource_handles: { process_label: "smoke-worker", pid: 4321 },
    cleanup_status: "cleaned",
    result_summary: "Process worker exited cleanly.",
    evidence_refs: ["logs/process.log", "artifacts/process-report.json"]
  };

  const expectedCheckpoint = {
    pipeline_id: runId,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Replay deterministic expanded task and agent lifecycle smoke coverage.",
    flags: { mode: "smoke", scope: "expanded" },
    current_stage: 4,
    completed_stages: expectedRunStatus.completed_stages,
    stage_artifacts: {
      dispatch_plan: { path: dispatchPlanPath },
      task_list: { path: taskListPath }
    },
    created_at: "2026-03-24T11:00:00.000Z",
    updated_at: "2026-03-24T11:10:00.000Z"
  };

  await expectCanonicalJson(runStatusPath, expectedRunStatus, canonicalizeRunStatus, "expanded run-status.json");
  await expectCanonicalJson(taskDocPath, expectedTaskDoc, canonicalizeTaskStatus, "expanded task-doc-summary.json");
  await expectCanonicalJson(taskProcessPath, expectedTaskProcess, canonicalizeTaskStatus, "expanded task-process-smoke.json");
  await expectCanonicalJson(agentPath, expectedAgent, canonicalizeAgentStatus, "expanded agent-process-01.json");
  await expectCanonicalJson(checkpointPath, expectedCheckpoint, canonicalizeCheckpoint, "expanded checkpoint.json");

  validateSchema(python, path.join("opencode", "protocols", "schemas", "run-status.schema.json"), runStatusPath);
  validateSchema(python, path.join("opencode", "protocols", "schemas", "task-status.schema.json"), taskDocPath);
  validateSchema(python, path.join("opencode", "protocols", "schemas", "task-status.schema.json"), taskProcessPath);
  validateSchema(python, path.join("opencode", "protocols", "schemas", "agent-status.schema.json"), agentPath);
  console.log("OK scenario: expanded lifecycle");
}

async function scenarioResumeStale(runtime, tempRoot, python) {
  const outputRoot = path.join(tempRoot, "resume-output");
  const runId = "status-runtime-smoke-resume-stale";
  const runDir = joinRun(outputRoot, runId);
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const runStatusPath = path.join(runDir, "status", "run-status.json");
  const taskPath = path.join(runDir, "status", "tasks", "task-browser-resume.json");
  const agentPath = path.join(runDir, "status", "agents", "agent-browser-02.json");
  const taskListPath = path.join(runDir, "task-list.json");

  await apply(runtime, "run.started", {
    output_root: outputRoot,
    run_id: runId,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Replay deterministic resume-to-stale smoke coverage.",
    flags: { recovered: false, scope: "resume-stale" },
    timestamp: "2026-03-24T12:00:00.000Z"
  });

  await apply(runtime, "tasks.registered", {
    output_root: outputRoot,
    run_id: runId,
    task_list_path: taskListPath,
    tasks: [
      {
        task_id: "task-browser-resume",
        summary: "Replay browser resume reconciliation.",
        status: "ready",
        trace_ids: ["ac-resume-stale", "story-resume-stale"],
        assigned_executor: "executor-advanced",
        resource_class: "browser",
        max_parallelism: 1,
        teardown_required: true
      }
    ],
    timestamp: "2026-03-24T12:01:00.000Z"
  });

  await apply(runtime, "task.updated", {
    output_root: outputRoot,
    run_id: runId,
    task_id: "task-browser-resume",
    status: "in_progress",
    resource_status: "starting",
    timestamp: "2026-03-24T12:02:00.000Z"
  });

  await apply(runtime, "agent.started", {
    output_root: outputRoot,
    run_id: runId,
    agent_id: "agent-browser-02",
    agent: "executor-advanced",
    task_id: "task-browser-resume",
    batch_id: "batch-browser",
    attempt: 2,
    status: "running",
    resource_class: "browser",
    resource_status: "running",
    teardown_required: true,
    resource_handles: {
      url: "http://127.0.0.1:4173/preview",
      profile_dir: ".tmp/playwright/status-runtime-smoke-resume-stale-agent-browser-02",
      process_label: "chromium-smoke",
      pid: 6123
    },
    cleanup_status: "pending",
    timestamp: "2026-03-24T12:03:00.000Z"
  });

  await apply(runtime, "agent.heartbeat", {
    output_root: outputRoot,
    run_id: runId,
    agent_id: "agent-browser-02",
    status: "running",
    resource_status: "running",
    last_heartbeat_at: "2026-03-24T12:04:00.000Z",
    timestamp: "2026-03-24T12:04:00.000Z"
  });

  const resumeResult = await apply(runtime, "run.resumed", {
    output_root: outputRoot,
    orchestrator: "orchestrator-pipeline",
    status: "running",
    waiting_on: "resume",
    user_prompt: "Replay deterministic resume-to-stale smoke coverage after restart.",
    flags: { recovered: true, scope: "resume-stale" },
    resume_note: "Marked stale during deterministic smoke resume.",
    timestamp: "2026-03-24T12:05:00.000Z"
  });

  assert.equal(resumeResult.run_id, runId);
  assert.equal(resumeResult.run_dir, runDir);
  assert.equal(resumeResult.layout, "expanded");
  assert.equal(resumeResult.task_count, 1);
  assert.equal(resumeResult.agent_count, 1);

  const expectedRunStatus = {
    run_id: runId,
    orchestrator: "orchestrator-pipeline",
    status: "running",
    created_at: "2026-03-24T12:00:00.000Z",
    updated_at: "2026-03-24T12:05:00.000Z",
    output_dir: runDir,
    checkpoint_path: checkpointPath,
    user_prompt: "Replay deterministic resume-to-stale smoke coverage after restart.",
    current_stage: -1,
    completed_stages: [],
    task_list_path: taskListPath,
    layout: "expanded",
    task_counts: {
      pending: 0,
      ready: 0,
      in_progress: 0,
      waiting_for_user: 0,
      done: 0,
      blocked: 0,
      failed: 0,
      skipped: 0,
      stale: 1
    },
    active_task_ids: ["task-browser-resume"],
    active_agent_ids: ["agent-browser-02"],
    waiting_on: "resume",
    resume_from_checkpoint: true,
    last_heartbeat_at: "2026-03-24T12:04:00.000Z",
    task_refs: [{ task_id: "task-browser-resume", path: "status/tasks/task-browser-resume.json" }],
    agent_refs: [{ agent_id: "agent-browser-02", path: "status/agents/agent-browser-02.json" }]
  };

  const expectedTask = {
    run_id: runId,
    task_id: "task-browser-resume",
    summary: "Replay browser resume reconciliation.",
    status: "stale",
    created_at: "2026-03-24T12:01:00.000Z",
    updated_at: "2026-03-24T12:05:00.000Z",
    trace_ids: ["ac-resume-stale", "story-resume-stale"],
    assigned_agent_id: "agent-browser-02",
    assigned_executor: "executor-advanced",
    resource_class: "browser",
    max_parallelism: 1,
    teardown_required: true,
    resource_status: "unknown",
    started_at: "2026-03-24T12:02:00.000Z",
    last_heartbeat_at: "2026-03-24T12:04:00.000Z",
    resume_note: "Marked stale during deterministic smoke resume.",
    agent_ref: { agent_id: "agent-browser-02", path: "status/agents/agent-browser-02.json" }
  };

  const expectedAgent = {
    run_id: runId,
    agent_id: "agent-browser-02",
    agent: "executor-advanced",
    status: "stale",
    created_at: "2026-03-24T12:03:00.000Z",
    updated_at: "2026-03-24T12:05:00.000Z",
    task_id: "task-browser-resume",
    batch_id: "batch-browser",
    attempt: 2,
    started_at: "2026-03-24T12:03:00.000Z",
    last_heartbeat_at: "2026-03-24T12:04:00.000Z",
    resource_class: "browser",
    resource_status: "unknown",
    teardown_required: true,
    resource_handles: {
      pid: 6123,
      process_label: "chromium-smoke",
      profile_dir: ".tmp/playwright/status-runtime-smoke-resume-stale-agent-browser-02",
      url: "http://127.0.0.1:4173/preview"
    },
    cleanup_status: "unknown"
  };

  const expectedCheckpoint = {
    pipeline_id: runId,
    orchestrator: "orchestrator-pipeline",
    user_prompt: "Replay deterministic resume-to-stale smoke coverage after restart.",
    flags: { recovered: true, scope: "resume-stale" },
    current_stage: -1,
    completed_stages: [],
    stage_artifacts: {},
    created_at: "2026-03-24T12:00:00.000Z",
    updated_at: "2026-03-24T12:05:00.000Z"
  };

  await expectCanonicalJson(runStatusPath, expectedRunStatus, canonicalizeRunStatus, "resume stale run-status.json");
  await expectCanonicalJson(taskPath, expectedTask, canonicalizeTaskStatus, "resume stale task-browser-resume.json");
  await expectCanonicalJson(agentPath, expectedAgent, canonicalizeAgentStatus, "resume stale agent-browser-02.json");
  await expectCanonicalJson(checkpointPath, expectedCheckpoint, canonicalizeCheckpoint, "resume stale checkpoint.json");

  validateSchema(python, path.join("opencode", "protocols", "schemas", "run-status.schema.json"), runStatusPath);
  validateSchema(python, path.join("opencode", "protocols", "schemas", "task-status.schema.json"), taskPath);
  validateSchema(python, path.join("opencode", "protocols", "schemas", "agent-status.schema.json"), agentPath);
  console.log("OK scenario: resume stale reconciliation");
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-smoke-"));
  const python = resolvePythonCommand();
  const runtime = createStatusRuntime();

  try {
    await scenarioRunOnly(runtime, tempRoot, python);
    await scenarioExpanded(runtime, tempRoot, python);
    await scenarioResumeStale(runtime, tempRoot, python);
    console.log(`OK cleanup: removing ${tempRoot}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
