const fs = require("fs/promises");
const path = require("path");

async function readJsonIfPresent(readJson, filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return undefined;
  }
}

function resolveCandidateOrchestrator(checkpoint, runStatus) {
  if (checkpoint && typeof checkpoint.orchestrator === "string" && checkpoint.orchestrator) {
    return checkpoint.orchestrator;
  }
  if (runStatus && typeof runStatus.orchestrator === "string" && runStatus.orchestrator) {
    return runStatus.orchestrator;
  }
  return undefined;
}

function hasOrchestratorMismatch(checkpoint, runStatus) {
  const checkpointOrchestrator = checkpoint?.orchestrator;
  const runStatusOrchestrator = runStatus?.orchestrator;
  return Boolean(
    checkpointOrchestrator && runStatusOrchestrator && checkpointOrchestrator !== runStatusOrchestrator
  );
}

async function describeRunCandidate({
  runDir,
  entryName,
  readJson,
  expectedOrchestrator,
  requireCheckpoint
}) {
  const checkpointPath = path.join(runDir, "checkpoint.json");
  const runStatusPath = path.join(runDir, "status", "run-status.json");
  const checkpointExists = await fs.access(checkpointPath).then(() => true).catch(() => false);
  const runStatusExists = await fs.access(runStatusPath).then(() => true).catch(() => false);

  if (requireCheckpoint && !checkpointExists) {
    return undefined;
  }
  if (!checkpointExists && !runStatusExists) {
    return undefined;
  }

  const [checkpoint, runStatus] = await Promise.all([
    checkpointExists ? readJsonIfPresent(readJson, checkpointPath) : undefined,
    runStatusExists ? readJsonIfPresent(readJson, runStatusPath) : undefined
  ]);

  if (requireCheckpoint && !checkpoint) {
    return undefined;
  }
  if (!checkpoint && !runStatus) {
    return undefined;
  }
  if (hasOrchestratorMismatch(checkpoint, runStatus)) {
    return undefined;
  }

  const candidateOrchestrator = resolveCandidateOrchestrator(checkpoint, runStatus);
  if (expectedOrchestrator && candidateOrchestrator !== expectedOrchestrator) {
    return undefined;
  }

  const sortPath = checkpoint ? checkpointPath : runStatusPath;
  const stats = await fs.stat(sortPath).catch(() => undefined);
  if (!stats) {
    return undefined;
  }

  return {
    runDir,
    runId: runStatus?.run_id || checkpoint?.pipeline_id || entryName,
    orchestrator: candidateOrchestrator,
    sortMtimeMs: stats.mtimeMs,
    sortName: entryName
  };
}

async function selectNewestCompatibleRun({
  baseDir,
  readJson,
  expectedOrchestrator,
  requireCheckpoint = false,
  allowBaseDir = false
}) {
  const resolvedBaseDir = path.resolve(baseDir);
  const entries = await fs.readdir(resolvedBaseDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];

  if (allowBaseDir) {
    const selfCandidate = await describeRunCandidate({
      runDir: resolvedBaseDir,
      entryName: path.basename(resolvedBaseDir),
      readJson,
      expectedOrchestrator,
      requireCheckpoint
    });
    if (selfCandidate) {
      candidates.push(selfCandidate);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = await describeRunCandidate({
      runDir: path.join(resolvedBaseDir, entry.name),
      entryName: entry.name,
      readJson,
      expectedOrchestrator,
      requireCheckpoint
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    if (right.sortMtimeMs !== left.sortMtimeMs) {
      return right.sortMtimeMs - left.sortMtimeMs;
    }
    return right.sortName.localeCompare(left.sortName);
  });

  return candidates[0];
}

module.exports = {
  describeRunCandidate,
  hasOrchestratorMismatch,
  selectNewestCompatibleRun
};
