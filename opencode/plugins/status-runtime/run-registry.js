const fs = require("fs/promises");
const path = require("path");

const { selectNewestCompatibleRun } = require("./run-resolution");
const { StatusWriter } = require("./status-writer");
const { assert } = require("./utils");

class RunRegistry {
  constructor(options = {}) {
    this.writer = options.writer || new StatusWriter();
  }

  async resolveFreshRun({ output_root, run_id }) {
    assert(output_root, "output_root is required");
    assert(run_id, "run_id is required");

    const runDir = path.resolve(output_root, run_id);
    await fs.mkdir(path.join(runDir, "status", "tasks"), { recursive: true });
    await fs.mkdir(path.join(runDir, "status", "agents"), { recursive: true });

    return this.describeRun(runDir, run_id);
  }

  async resolveResumeRun({ output_root, run_id, orchestrator }) {
    assert(output_root, "output_root is required");

    if (run_id) {
      const runDir = path.resolve(output_root, run_id);
      return this.describeRun(runDir, run_id);
    }

    const baseDir = path.resolve(output_root);
    const match = await selectNewestCompatibleRun({
      baseDir,
      readJson: (filePath) => this.writer.readJson(filePath),
      expectedOrchestrator: orchestrator,
      requireCheckpoint: true,
      allowBaseDir: true
    });

    assert(match, `No compatible resumable run found under ${baseDir}`);
    return this.describeRun(match.runDir, match.runId);
  }

  async loadState(runDir) {
    const runStatusPath = path.join(runDir, "status", "run-status.json");
    const checkpointPath = path.join(runDir, "checkpoint.json");
    const [runStatus, checkpoint] = await Promise.all([
      this.writer.readJson(runStatusPath),
      this.writer.readJson(checkpointPath)
    ]);

    const tasks = await this.loadEntityDir(path.join(runDir, "status", "tasks"), "task_id");
    const agents = await this.loadEntityDir(path.join(runDir, "status", "agents"), "agent_id");

    return { runDir, runStatus, checkpoint, tasks, agents };
  }

  async loadEntityDir(dirPath, keyName) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    const map = new Map();
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const value = await this.writer.readJson(path.join(dirPath, entry.name));
      if (value && value[keyName]) {
        map.set(value[keyName], value);
      }
    }
    return map;
  }

  describeRun(runDir, run_id) {
    return {
      runDir,
      runId: run_id,
      checkpointPath: path.join(runDir, "checkpoint.json"),
      runStatusPath: path.join(runDir, "status", "run-status.json"),
      tasksDir: path.join(runDir, "status", "tasks"),
      agentsDir: path.join(runDir, "status", "agents")
    };
  }
}

module.exports = { RunRegistry };
