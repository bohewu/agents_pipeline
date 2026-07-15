const fs = require("fs/promises");
const path = require("path");

const { describeRunCandidate, selectNewestCompatibleRun } = require("./run-resolution");
const { StatusWriter } = require("./status-writer");
const { assert, ensureSafeStatusId } = require("./utils");

class RunRegistry {
  constructor(options = {}) {
    this.writer = options.writer || new StatusWriter();
  }

  async resolveFreshRun({ output_root, run_id, reject_existing = false }) {
    assert(output_root, "output_root is required");
    ensureSafeStatusId(run_id, "run_id");

    const baseDir = path.resolve(output_root);
    await fs.mkdir(baseDir, { recursive: true });
    const runDir = path.join(baseDir, run_id);
    const existing = await fs.lstat(runDir).catch(() => undefined);
    assert(!existing?.isSymbolicLink(), `Run directory must not be a symbolic link: ${runDir}`);
    if (reject_existing) {
      assert(!existing, `run.started refuses to reuse existing run_id: ${run_id}`);
    }
    await fs.mkdir(path.join(runDir, "status", "tasks"), { recursive: true });
    await fs.mkdir(path.join(runDir, "status", "agents"), { recursive: true });
    await fs.mkdir(path.join(runDir, "observations", "reasoning"), { recursive: true });
    await this.assertSafeRunLayout(runDir);

    return this.describeRun(runDir, run_id);
  }

  async resolveExistingRun({ output_root, run_id }) {
    assert(output_root, "output_root is required");
    ensureSafeStatusId(run_id, "run_id");

    const runDir = path.join(path.resolve(output_root), run_id);
    const runStats = await fs.lstat(runDir).catch(() => undefined);
    assert(
      runStats?.isDirectory() && !runStats.isSymbolicLink(),
      `Run must be started before status updates: ${run_id}`
    );
    await this.assertSafeRunLayout(runDir);

    const [checkpointStats, runStatusStats] = await Promise.all([
      fs.lstat(path.join(runDir, "checkpoint.json")).catch(() => undefined),
      fs.lstat(path.join(runDir, "status", "run-status.json")).catch(() => undefined)
    ]);
    assert(
      checkpointStats?.isFile() &&
        !checkpointStats.isSymbolicLink() &&
        runStatusStats?.isFile() &&
        !runStatusStats.isSymbolicLink(),
      `Run must be started before status updates: ${run_id}`
    );

    return this.describeRun(runDir, run_id);
  }

  async resolveResumeRun({ output_root, run_id, orchestrator }) {
    assert(output_root, "output_root is required");

    if (run_id) {
      ensureSafeStatusId(run_id, "run_id");
      const baseDir = path.resolve(output_root);
      const runDir = path.join(baseDir, run_id);
      const stats = await fs.lstat(runDir).catch(() => undefined);
      assert(stats?.isDirectory() && !stats.isSymbolicLink(), `Resume run not found: ${run_id}`);
      await this.assertSafeRunLayout(runDir);
      const match = await describeRunCandidate({
        runDir,
        entryName: run_id,
        readJson: (filePath) => this.writer.readJson(filePath),
        expectedOrchestrator: orchestrator,
        requireCheckpoint: true,
        requireRunStatus: true
      });
      assert(match && match.runId === run_id, `Run is not compatible for resume: ${run_id}`);
      return this.describeRun(runDir, run_id);
    }

    const baseDir = path.resolve(output_root);
    const match = await selectNewestCompatibleRun({
      baseDir,
      readJson: (filePath) => this.writer.readJson(filePath),
      expectedOrchestrator: orchestrator,
      requireCheckpoint: true,
      requireRunStatus: true,
      allowBaseDir: true
    });

    assert(match, `No compatible resumable run found under ${baseDir}`);
    await this.assertSafeRunLayout(match.runDir);
    return this.describeRun(match.runDir, match.runId);
  }

  async loadState(runDir) {
    await this.assertSafeRunLayout(runDir);
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

  async assertSafeRunLayout(runDir) {
    const resolvedRunDir = path.resolve(runDir);
    const runStats = await fs.lstat(resolvedRunDir).catch(() => undefined);
    assert(
      runStats?.isDirectory() && !runStats.isSymbolicLink(),
      `Run directory must be a real directory: ${resolvedRunDir}`
    );

    const resolvedRunParent = await fs.realpath(path.dirname(resolvedRunDir));
    const realRunDir = await fs.realpath(resolvedRunDir);
    assert(
      path.dirname(realRunDir) === resolvedRunParent,
      `Run directory escapes its output root: ${resolvedRunDir}`
    );

    const statusDir = await this.assertContainedDirectory(
      path.join(resolvedRunDir, "status"),
      realRunDir,
      "status"
    );
    await this.assertContainedDirectory(
      path.join(resolvedRunDir, "status", "tasks"),
      statusDir,
      "status/tasks"
    );
    await this.assertContainedDirectory(
      path.join(resolvedRunDir, "status", "agents"),
      statusDir,
      "status/agents"
    );
    const observationsPath = path.join(resolvedRunDir, "observations");
    const observationsStats = await fs.lstat(observationsPath).catch(() => undefined);
    if (observationsStats) {
      const observationsDir = await this.assertContainedDirectory(
        observationsPath,
        realRunDir,
        "observations"
      );
      const reasoningPath = path.join(observationsPath, "reasoning");
      const reasoningStats = await fs.lstat(reasoningPath).catch(() => undefined);
      if (reasoningStats) {
        await this.assertContainedDirectory(reasoningPath, observationsDir, "observations/reasoning");
      }
    }
    await this.assertCanonicalFile(path.join(resolvedRunDir, "checkpoint.json"));
    await this.assertCanonicalFile(
      path.join(resolvedRunDir, "status", "run-status.json")
    );
  }

  async assertContainedDirectory(dirPath, expectedParent, label) {
    const stats = await fs.lstat(dirPath).catch(() => undefined);
    assert(
      stats?.isDirectory() && !stats.isSymbolicLink(),
      `${label} must be a real directory: ${dirPath}`
    );
    const realDir = await fs.realpath(dirPath);
    assert(path.dirname(realDir) === expectedParent, `${label} escapes its run directory`);
    return realDir;
  }

  async assertCanonicalFile(filePath) {
    const stats = await fs.lstat(filePath).catch(() => undefined);
    if (!stats) {
      return;
    }
    assert(
      stats.isFile() && !stats.isSymbolicLink(),
      `Canonical status path must be a regular file: ${filePath}`
    );
  }

  async ensureReasoningObservationLayout(runDir) {
    await this.assertSafeRunLayout(runDir);
    const resolvedRunDir = path.resolve(runDir);
    const realRunDir = await fs.realpath(resolvedRunDir);
    const observationsPath = path.join(resolvedRunDir, "observations");
    const existingObservations = await fs.lstat(observationsPath).catch(() => undefined);
    if (!existingObservations) {
      await fs.mkdir(observationsPath);
    }
    const observationsDir = await this.assertContainedDirectory(
      observationsPath,
      realRunDir,
      "observations"
    );

    const reasoningPath = path.join(observationsPath, "reasoning");
    const existingReasoning = await fs.lstat(reasoningPath).catch(() => undefined);
    if (!existingReasoning) {
      await fs.mkdir(reasoningPath);
    }
    await this.assertContainedDirectory(reasoningPath, observationsDir, "observations/reasoning");
    return reasoningPath;
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
        ensureSafeStatusId(value[keyName], keyName);
        assert(entry.name === `${value[keyName]}.json`, `${entry.name} does not match ${keyName}`);
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
      agentsDir: path.join(runDir, "status", "agents"),
      reasoningObservationsDir: path.join(runDir, "observations", "reasoning")
    };
  }
}

module.exports = { RunRegistry };
