#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "tools", "status-event.js");

function invoke(args, input) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-runtime-cli-smoke-"));
try {
  const runId = "runtime-neutral-smoke";
  const shared = {
    output_root: ".pipeline-output",
    run_id: runId
  };

  const started = invoke([
    "--event",
    "run.started",
    "--base-dir",
    tempRoot,
    "--payload-json",
    JSON.stringify({
      ...shared,
      orchestrator: "orchestrator-pipeline",
      user_prompt: "Exercise the runtime-neutral status CLI",
      timestamp: "2026-07-10T01:00:00.000Z"
    })
  ]);
  assert.equal(started.event, "run.started");
  assert.equal(started.run_id, runId);
  assert.equal(started.layout, "run-only");

  const batch = invoke(
    ["--event", "batch", "--base-dir", tempRoot, "--stdin"],
    JSON.stringify({
      shared_payload: shared,
      events: [
        {
          event: "tasks.registered",
          payload: {
            tasks: [{ task_id: "task-a", summary: "Smoke task" }],
            timestamp: "2026-07-10T01:01:00.000Z"
          }
        },
        {
          event: "agent.started",
          payload: {
            agent_id: "executor",
            agent: "executor",
            task_id: "task-a",
            status: "running",
            timestamp: "2026-07-10T01:02:00.000Z"
          }
        },
        {
          event: "agent.finished",
          payload: {
            agent_id: "executor",
            status: "done",
            timestamp: "2026-07-10T01:03:00.000Z"
          }
        },
        {
          event: "task.updated",
          payload: {
            task_id: "task-a",
            status: "done",
            result_summary: "Smoke task completed",
            timestamp: "2026-07-10T01:04:00.000Z"
          }
        },
        {
          event: "run.finished",
          payload: {
            status: "completed",
            waiting_on: "none",
            timestamp: "2026-07-10T01:05:00.000Z"
          }
        }
      ]
    })
  );

  assert.equal(batch.event, "batch");
  assert.equal(batch.event_count, 5);
  assert.equal(batch.task_count, 1);
  assert.equal(batch.agent_count, 1);
  assert.equal(batch.layout, "expanded");

  const runDir = path.join(tempRoot, ".pipeline-output", runId);
  const [checkpoint, runStatus, task, agent] = await Promise.all([
    fs.readFile(path.join(runDir, "checkpoint.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "run-status.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "tasks", "task-a.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "agents", "executor.json"), "utf8").then(JSON.parse)
  ]);

  assert.equal(checkpoint.pipeline_id, runId);
  assert.equal(runStatus.status, "completed");
  assert.equal(runStatus.task_counts.done, 1);
  assert.equal(task.status, "done");
  assert.equal(agent.status, "done");
  process.stdout.write("status-runtime smoke: ok\n");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
