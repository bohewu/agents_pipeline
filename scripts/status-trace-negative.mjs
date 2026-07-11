#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "tools", "status-event.js");

function invoke(args, input) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input
  });
}

function assertFailure(result, expectedCode, expectedType, messagePattern) {
  assert.equal(result.status, expectedCode, result.stderr || result.stdout);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.error, expectedType);
  assert.match(error.message, messagePattern);
}

assertFailure(
  invoke(["--event", "not.an.event", "--payload-json", "{}"]),
  2,
  "input_error",
  /Unsupported status runtime event/
);

assertFailure(
  invoke(["--event", "run.started", "--stdin"], "{not-json"),
  2,
  "input_error",
  /stdin must contain valid JSON/
);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "status-trace-negative-"));
try {
  assertFailure(
    invoke([
      "--event",
      "agent.started",
      "--payload-json",
      JSON.stringify({
        output_root: tempRoot,
        run_id: "negative-agent",
        agent_id: "executor"
      })
    ]),
    3,
    "runtime_error",
    /agent\.started requires non-empty string field\(s\): agent/
  );

  assertFailure(
    invoke([
      "--event",
      "batch",
      "--payload-json",
      JSON.stringify({
        events: [
          {
            event: "run.started",
            payload: {
              output_root: tempRoot,
              run_id: "run-a",
              orchestrator: "orchestrator-pipeline",
              user_prompt: "Exercise batch run mismatch"
            }
          },
          {
            event: "stage.completed",
            payload: {
              output_root: tempRoot,
              run_id: "run-b",
              stage: 1,
              name: "Mismatch",
              status: "completed"
            }
          }
        ]
      })
    ]),
    3,
    "runtime_error",
    /batch events must share the same run_id/
  );

  process.stdout.write("status negative trace: ok\n");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
