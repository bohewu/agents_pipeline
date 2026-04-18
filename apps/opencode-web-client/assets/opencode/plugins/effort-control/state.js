import fs from "fs/promises";
import path from "path";

const STATE_FILE = "effort-control.sessions.json";
const TRACE_FILE = "effort-control.trace.jsonl";
const EFFORT_ORDER = ["medium", "high", "xhigh"];
const EXCLUDED_BASELINE_AGENTS = new Set([
  "codex-account-manager",
  "compressor",
  "doc-writer",
  "flow-splitter",
  "handoff-writer",
  "kanban-manager",
  "peon",
  "planner",
  "repo-scout",
  "router",
  "session-guide-writer",
  "skill-curator",
  "specifier",
  "summarizer",
  "test-runner",
  "usage-inspector"
]);
const SUPPORTED_PROVIDERS = new Set(["openai", "github-copilot"]);

function stateDirPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), ".opencode");
}

function stateFilePath(projectRoot) {
  return path.join(stateDirPath(projectRoot), STATE_FILE);
}

function traceFilePath(projectRoot) {
  return path.join(stateDirPath(projectRoot), TRACE_FILE);
}

function emptyDefaults() {
  return {};
}

function normalizeEffort(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "max") {
    return "xhigh";
  }

  return EFFORT_ORDER.includes(normalized) ? normalized : undefined;
}

function effortRank(value) {
  const normalized = normalizeEffort(value);
  return normalized ? EFFORT_ORDER.indexOf(normalized) : -1;
}

function maxEffort(left, right) {
  return effortRank(left) >= effortRank(right) ? normalizeEffort(left) : normalizeEffort(right);
}

function maxDefinedEffort(...values) {
  let best;
  for (const value of values) {
    const normalized = normalizeEffort(value);
    if (!normalized) {
      continue;
    }
    best = best ? maxEffort(best, normalized) : normalized;
  }
  return best;
}

function isOpenAiGpt5Model(modelId) {
  return typeof modelId === "string" && /^gpt-5(?:$|[.-])/.test(modelId);
}

function defaultEffortForAgent(agent, modelId, options = {}) {
  if (!isOpenAiGpt5Model(modelId)) {
    return undefined;
  }

  if (options && options.suppressBaseline) {
    return undefined;
  }

  if (typeof agent === "string" && EXCLUDED_BASELINE_AGENTS.has(agent)) {
    return undefined;
  }

  return "medium";
}

function emptyState() {
  return {
    version: 1,
    defaults: emptyDefaults(),
    sessions: {}
  };
}

function sanitizeState(input) {
  const sessions = {};
  const defaults = emptyDefaults();
  const rawSessions = input && typeof input === "object" && !Array.isArray(input) ? input.sessions : undefined;
  const rawDefaults = input && typeof input === "object" && !Array.isArray(input) ? input.defaults : undefined;

  const projectEffort = normalizeEffort(rawDefaults && typeof rawDefaults === "object" ? rawDefaults.project?.effort : undefined);
  if (projectEffort) {
    defaults.project = {
      effort: projectEffort,
      updatedAt: typeof rawDefaults.project?.updatedAt === "string" ? rawDefaults.project.updatedAt : undefined
    };
  }

  if (rawSessions && typeof rawSessions === "object" && !Array.isArray(rawSessions)) {
    for (const [sessionId, entry] of Object.entries(rawSessions)) {
      const effort = normalizeEffort(entry && typeof entry === "object" ? entry.effort : undefined);
      if (!effort) {
        continue;
      }
      sessions[sessionId] = {
        effort,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined
      };
    }
  }

  return {
    version: 1,
    defaults,
    sessions
  };
}

async function readState(projectRoot) {
  try {
    const raw = await fs.readFile(stateFilePath(projectRoot), "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return emptyState();
    }
    return emptyState();
  }
}

async function writeState(projectRoot, state) {
  const nextState = sanitizeState(state);
  await fs.mkdir(stateDirPath(projectRoot), { recursive: true });
  await fs.writeFile(stateFilePath(projectRoot), `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return nextState;
}

async function appendTraceEvent(projectRoot, event) {
  const payload = {
    time: new Date().toISOString(),
    ...(event && typeof event === "object" && !Array.isArray(event) ? event : {})
  };
  await fs.mkdir(stateDirPath(projectRoot), { recursive: true });
  await fs.appendFile(traceFilePath(projectRoot), `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

async function setProjectDefaultEffort(projectRoot, effort) {
  const normalized = normalizeEffort(effort);
  if (!normalized) {
    throw new Error(`Unsupported effort '${effort}'`);
  }

  const state = await readState(projectRoot);
  state.defaults.project = {
    effort: normalized,
    updatedAt: new Date().toISOString()
  };
  return writeState(projectRoot, state);
}

async function clearProjectDefaultEffort(projectRoot) {
  const state = await readState(projectRoot);
  if (state.defaults && typeof state.defaults === "object") {
    delete state.defaults.project;
  }
  return writeState(projectRoot, state);
}

async function setSessionEffort(projectRoot, sessionId, effort) {
  const normalized = normalizeEffort(effort);
  if (!normalized) {
    throw new Error(`Unsupported effort '${effort}'`);
  }

  const state = await readState(projectRoot);
  state.sessions[sessionId] = {
    effort: normalized,
    updatedAt: new Date().toISOString()
  };
  return writeState(projectRoot, state);
}

async function clearSessionEffort(projectRoot, sessionId) {
  const state = await readState(projectRoot);
  delete state.sessions[sessionId];
  return writeState(projectRoot, state);
}

function getDirectSessionEffort(store, sessionId) {
  return normalizeEffort(store?.sessions?.[sessionId]?.effort);
}

function getProjectDefaultEffort(store) {
  return normalizeEffort(store?.defaults?.project?.effort);
}

async function findInheritedSessionEffort({ sessionId, store, getParentSessionId, maxDepth = 12 }) {
  const visited = new Set();
  let currentId = sessionId;

  for (let depth = 0; depth < maxDepth && currentId; depth += 1) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const effort = getDirectSessionEffort(store, currentId);
    if (effort) {
      return { effort, sessionId: currentId };
    }

    if (typeof getParentSessionId !== "function") {
      break;
    }
    currentId = await getParentSessionId(currentId);
  }

  return undefined;
}

function resolveDesiredEffort({ providerId, modelId, agent, sessionEffort, projectEffort, existingEffort, suppressBaseline }) {
  if (!SUPPORTED_PROVIDERS.has(providerId) || !isOpenAiGpt5Model(modelId)) {
    return undefined;
  }

  const explicit = normalizeEffort(sessionEffort);
  const projectDefault = normalizeEffort(projectEffort);
  const baseline = defaultEffortForAgent(agent, modelId, { suppressBaseline });
  const existing = normalizeEffort(existingEffort);

  if (explicit) {
    return maxDefinedEffort(existing, baseline, explicit);
  }

  if (projectDefault) {
    return maxDefinedEffort(existing, baseline, projectDefault);
  }

  return maxDefinedEffort(existing, baseline);
}

export {
  appendTraceEvent,
  clearProjectDefaultEffort,
  clearSessionEffort,
  defaultEffortForAgent,
  findInheritedSessionEffort,
  getDirectSessionEffort,
  getProjectDefaultEffort,
  normalizeEffort,
  readState,
  resolveDesiredEffort,
  setProjectDefaultEffort,
  setSessionEffort,
  stateDirPath,
  stateFilePath,
  traceFilePath,
  writeState
};
