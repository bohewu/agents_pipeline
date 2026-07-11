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
  return JSON.parse(result.stdout);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-resume-cli-smoke-"));
try {
  const outputRoot = path.join(tempRoot, "runs");
  const runId = "resume-source-run";
  invoke([
    "--event",
    "batch",
    "--payload-json",
    JSON.stringify({
      shared_payload: { output_root: outputRoot, run_id: runId },
      events: [
        {
          event: "run.started",
          payload: {
            orchestrator: "orchestrator-pipeline",
            user_prompt: "Resume the newest compatible run",
            flags: { scout_mode: "auto" },
            timestamp: "2026-07-10T02:00:00.000Z"
          }
        },
        {
          event: "tasks.registered",
          payload: {
            tasks: [{ task_id: "task-a", summary: "Interrupted task", status: "in_progress" }],
            timestamp: "2026-07-10T02:01:00.000Z"
          }
        },
        {
          event: "agent.started",
          payload: {
            agent_id: "executor",
            agent: "executor",
            task_id: "task-a",
            status: "running",
            timestamp: "2026-07-10T02:02:00.000Z"
          }
        }
      ]
    })
  ]);

  const payloadPath = path.join(tempRoot, "resume-payload.json");
  await fs.writeFile(
    payloadPath,
    JSON.stringify({
      output_root: outputRoot,
      orchestrator: "orchestrator-pipeline",
      flags: { confirm_mode: true },
      resume_note: "Reconciled by runtime-neutral resume smoke",
      timestamp: "2026-07-10T02:03:00.000Z"
    }),
    "utf8"
  );

  const resumed = invoke([
    "--event",
    "run.resumed",
    "--payload-file",
    payloadPath
  ]);
  assert.equal(resumed.run_id, runId);

  const runDir = path.join(outputRoot, runId);
  const [checkpoint, runStatus, task, agent] = await Promise.all([
    fs.readFile(path.join(runDir, "checkpoint.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "run-status.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "tasks", "task-a.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(runDir, "status", "agents", "executor.json"), "utf8").then(JSON.parse)
  ]);

  assert.equal(runStatus.resume_from_checkpoint, true);
  assert.equal(task.status, "stale");
  assert.equal(agent.status, "stale");
  assert.deepEqual(checkpoint.flags, { confirm_mode: true, scout_mode: "auto" });
  process.stdout.write("status-resume smoke: ok\n");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
