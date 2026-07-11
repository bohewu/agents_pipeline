#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const smokeScripts = [
  "status-runtime-smoke.mjs",
  "status-resume-smoke.mjs",
  "status-trace-negative.mjs"
];

for (const scriptName of smokeScripts) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], { stdio: "inherit" });

  if (result.error) {
    console.error(`Unable to run ${scriptName}: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
