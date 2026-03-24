const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

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
