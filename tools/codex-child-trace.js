#!/usr/bin/env node
"use strict";

const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const EXIT_CODES = Object.freeze({
  OK: 0,
  INVALID_OR_NOT_FOUND: 2
});
const SCHEMA_VERSION = "1.4";
const RUNTIME = "codex";
const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const EFFORT_SET = new Set(EFFORTS);
const PARENT_EFFORT_SET = new Set(["low", ...EFFORTS]);
const SELECTOR_EVIDENCE = Object.freeze([
  "distinct_from_parent",
  "matches_parent",
  "indeterminate",
  "mismatch"
]);
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 50;
const MAX_CANDIDATES = 64;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_NAME_PATTERN = /^\/root(?:\/[a-z0-9_]{1,64})+$/;
const SAFE_EXPECTED_ROLE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_EXPECTED_MODEL_PATTERN = /^(?:gpt-[a-z0-9][a-z0-9.-]{0,62}|o[1-9][a-z0-9.-]{0,62})$/;
const HELP_TEXT = `Usage:
  node tools/codex-child-trace.js (--agent-id <uuid> | --task-name <path>) [options]

Options:
  --task-name <path>           Resolve a V2 child from its returned /root/... path
  --parent-id <uuid>           Override the V2 parent (defaults to CODEX_THREAD_ID)
  --expected-role <role>       Optionally compare the bounded observed agent_role
  --expected-model <model>     Optionally compare the bounded observed model
  --expected-effort <effort>   Compare low, medium, high, xhigh, or max
  --codex-home <path>          Override CODEX_HOME
  --wait-ms <0-${MAX_WAIT_MS}>       Wait briefly for the trace to appear
  --compact                    Emit one-line JSON
  --help, -h                   Show this help

Output:
  agent_role and model are bounded observed trace values. Their *_matches
  fields compare optional expected values and are null when no comparison was requested.
`;

class ChildTraceInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ChildTraceInputError";
  }
}

function createResult(agentId = null) {
  return {
    schema_version: SCHEMA_VERSION,
    runtime: RUNTIME,
    agent_id: agentId,
    trace_found: false,
    agent_role: null,
    model: null,
    model_matches: null,
    effective_effort: null,
    role_matches: null,
    effort_matches: null,
    parent_trace_found: false,
    parent_effective_effort: null,
    inheritance_consistent: null,
    selector_evidence: null
  };
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new ChildTraceInputError(`${option} requires a value`);
  }
  return value;
}

function defaultCodexHome(environment = process.env) {
  return path.resolve(environment.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function normalizeAgentId(value) {
  if (!isUuid(value)) {
    throw new ChildTraceInputError("--agent-id must be a UUID");
  }
  return value.toLowerCase();
}

function normalizeTaskName(value) {
  if (typeof value !== "string" || !TASK_NAME_PATTERN.test(value)) {
    throw new ChildTraceInputError("--task-name must be a bounded /root/... agent path");
  }
  return value;
}

function normalizeExpectedRole(value) {
  if (typeof value !== "string" || !SAFE_EXPECTED_ROLE_PATTERN.test(value)) {
    throw new ChildTraceInputError("--expected-role must be a bounded lowercase role identifier");
  }
  return value;
}

function normalizeExpectedModel(value) {
  if (typeof value !== "string" || !SAFE_EXPECTED_MODEL_PATTERN.test(value)) {
    throw new ChildTraceInputError("--expected-model must be a bounded OpenAI model name");
  }
  return value;
}

function normalizeExpectedEffort(value) {
  if (!EFFORT_SET.has(value)) {
    throw new ChildTraceInputError("--expected-effort must be low, medium, high, xhigh, or max");
  }
  return value;
}

function normalizeWaitMs(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WAIT_MS) {
    throw new ChildTraceInputError(`--wait-ms must be an integer from 0 to ${MAX_WAIT_MS}`);
  }
  return value;
}

function normalizeCodexHome(value, environment = process.env) {
  if (value === undefined) {
    return defaultCodexHome(environment);
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new ChildTraceInputError("--codex-home must be a non-empty path");
  }
  return path.resolve(value);
}

function normalizeInspectionOptions(input = {}, environment = process.env) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ChildTraceInputError("inspection options must be an object");
  }

  const hasAgentId = input.agentId !== undefined;
  const hasTaskName = input.taskName !== undefined;
  if (hasAgentId === hasTaskName) {
    throw new ChildTraceInputError("exactly one of --agent-id or --task-name is required");
  }
  if (!hasTaskName && input.parentId !== undefined) {
    throw new ChildTraceInputError("--parent-id is valid only with --task-name");
  }

  const environmentParentId = isUuid(environment.CODEX_THREAD_ID)
    ? environment.CODEX_THREAD_ID
    : undefined;
  const parentId = input.parentId === undefined
    ? environmentParentId
    : input.parentId;
  if (hasTaskName && parentId === undefined) {
    throw new ChildTraceInputError(
      "--task-name requires CODEX_THREAD_ID or an explicit --parent-id"
    );
  }

  const options = {
    agentId: hasAgentId ? normalizeAgentId(input.agentId) : undefined,
    taskName: hasTaskName ? normalizeTaskName(input.taskName) : undefined,
    parentId: hasTaskName ? normalizeAgentId(parentId) : undefined,
    codexHome: normalizeCodexHome(input.codexHome, environment),
    expectedRole: undefined,
    expectedModel: undefined,
    expectedEffort: undefined,
    waitMs: 0
  };

  if (input.expectedRole !== undefined) {
    options.expectedRole = normalizeExpectedRole(input.expectedRole);
  }
  if (input.expectedModel !== undefined) {
    options.expectedModel = normalizeExpectedModel(input.expectedModel);
  }
  if (input.expectedEffort !== undefined) {
    options.expectedEffort = normalizeExpectedEffort(input.expectedEffort);
  }
  if (input.waitMs !== undefined) {
    options.waitMs = normalizeWaitMs(input.waitMs);
  }

  return options;
}

function parseWaitMs(value) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new ChildTraceInputError("--wait-ms must be a non-negative integer");
  }
  const waitMs = Number(value);
  return normalizeWaitMs(waitMs);
}

function parseArgs(argv, environment = process.env) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }
  const raw = {
    agentId: undefined,
    taskName: undefined,
    parentId: undefined,
    codexHome: undefined,
    expectedEffort: undefined,
    expectedModel: undefined,
    expectedRole: undefined,
    waitMs: undefined,
    compact: false
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (seen.has(token)) {
      throw new ChildTraceInputError(`Duplicate argument: ${token}`);
    }

    switch (token) {
      case "--agent-id":
        raw.agentId = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--task-name":
        raw.taskName = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--parent-id":
        raw.parentId = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--expected-role":
        raw.expectedRole = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--expected-model":
        raw.expectedModel = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--expected-effort":
        raw.expectedEffort = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--codex-home":
        raw.codexHome = requireValue(argv, index, token);
        seen.add(token);
        index += 1;
        break;
      case "--wait-ms":
        raw.waitMs = parseWaitMs(requireValue(argv, index, token));
        seen.add(token);
        index += 1;
        break;
      case "--compact":
        raw.compact = true;
        seen.add(token);
        break;
      default:
        throw new ChildTraceInputError(`Unknown argument: ${token}`);
    }
  }

  const options = normalizeInspectionOptions(raw, environment);
  return { ...options, compact: raw.compact };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeEffort(value) {
  return EFFORT_SET.has(value) ? value : null;
}

function sanitizeObservedRole(value) {
  return typeof value === "string" && SAFE_EXPECTED_ROLE_PATTERN.test(value)
    ? value
    : null;
}

function sanitizeObservedModel(value) {
  return typeof value === "string" && SAFE_EXPECTED_MODEL_PATTERN.test(value)
    ? value
    : null;
}

function sanitizeParentEffort(value) {
  return PARENT_EFFORT_SET.has(value) ? value : null;
}

async function lstatSafe(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch {
    return null;
  }
}

function comparablePath(filePath) {
  let resolved = path.resolve(filePath);
  if (process.platform === "win32") {
    resolved = resolved
      .replace(/^\\\\\?\\UNC\\/i, "\\\\")
      .replace(/^\\\\\?\\/i, "");
    return resolved.toLowerCase();
  }
  return resolved;
}

async function isPlainResolvedPath(filePath, expectedKind) {
  const fileStat = await lstatSafe(filePath);
  if (!fileStat || fileStat.isSymbolicLink()) {
    return false;
  }
  if (expectedKind === "directory" && !fileStat.isDirectory()) {
    return false;
  }
  if (expectedKind === "file" && !fileStat.isFile()) {
    return false;
  }

  let realPath;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    return false;
  }
  return comparablePath(realPath) === comparablePath(filePath);
}

async function collectCandidates(codexHome, agentId) {
  if (!await isPlainResolvedPath(codexHome, "directory")) {
    return [];
  }

  const suffix = `-${agentId}.jsonl`;
  const candidates = [];

  async function visit(directory) {
    if (candidates.length >= MAX_CANDIDATES) {
      return;
    }

    if (!await isPlainResolvedPath(directory, "directory")) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (candidates.length >= MAX_CANDIDATES || entry.isSymbolicLink()) {
        continue;
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(suffix)) {
        continue;
      }

      if (await isPlainResolvedPath(entryPath, "file")) {
        candidates.push(entryPath);
      }
    }
  }

  await visit(path.join(codexHome, "sessions"));
  await visit(path.join(codexHome, "archived_sessions"));
  return candidates;
}

async function collectRecentCandidates(codexHome) {
  if (!await isPlainResolvedPath(codexHome, "directory")) {
    return [];
  }

  const candidates = [];
  async function visit(directory) {
    if (candidates.length >= MAX_CANDIDATES) {
      return;
    }
    if (!await isPlainResolvedPath(directory, "directory")) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      if (candidates.length >= MAX_CANDIDATES || entry.isSymbolicLink()) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        entry.isFile()
        && entry.name.endsWith(".jsonl")
        && await isPlainResolvedPath(entryPath, "file")
      ) {
        candidates.push(entryPath);
      }
    }
  }

  await visit(path.join(codexHome, "sessions"));
  await visit(path.join(codexHome, "archived_sessions"));
  return candidates;
}

function parseSelectedRecord(line, expectedType) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(record) || record.type !== expectedType) {
    return null;
  }
  if (!isObject(record.payload)) {
    return null;
  }
  return {
    payload: record.payload,
    timestamp: normalizeTimestamp(record.timestamp)
      ?? normalizeTimestamp(record.payload.timestamp)
  };
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function skipWhitespace(value, index) {
  let cursor = index;
  while (cursor < value.length && /\s/.test(value[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findJsonStringEnd(value, start) {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === '"') {
      return index;
    }
  }
  return -1;
}

function hasTopLevelRecordType(line, expectedType) {
  let depth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      const keyEnd = findJsonStringEnd(line, index);
      if (keyEnd === -1) {
        return false;
      }

      if (depth === 1 && line.slice(index + 1, keyEnd) === "type") {
        let cursor = skipWhitespace(line, keyEnd + 1);
        if (line[cursor] === ":") {
          cursor = skipWhitespace(line, cursor + 1);
          if (line[cursor] === '"') {
            const valueEnd = findJsonStringEnd(line, cursor);
            if (
              valueEnd !== -1
              && line.slice(cursor + 1, valueEnd) === expectedType
            ) {
              return true;
            }
            index = valueEnd === -1 ? keyEnd : valueEnd;
            continue;
          }
        }
      }

      index = keyEnd;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
  return false;
}

async function readTraceFile(filePath) {
  if (!await isPlainResolvedPath(filePath, "file")) {
    return null;
  }

  const noFollow = fsSync.constants.O_NOFOLLOW || 0;
  let stream;
  try {
    stream = fsSync.createReadStream(filePath, {
      encoding: "utf8",
      flags: fsSync.constants.O_RDONLY | noFollow
    });
  } catch {
    return null;
  }

  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let sessionMetaRecord;
  let turnContextRecord;
  try {
    for await (const line of lines) {
      if (sessionMetaRecord === undefined && hasTopLevelRecordType(line, "session_meta")) {
        sessionMetaRecord = parseSelectedRecord(line, "session_meta");
        if (sessionMetaRecord === null) {
          return null;
        }
      }
      if (turnContextRecord === undefined && hasTopLevelRecordType(line, "turn_context")) {
        turnContextRecord = parseSelectedRecord(line, "turn_context");
        if (turnContextRecord === null) {
          return null;
        }
      }
      if (sessionMetaRecord !== undefined && turnContextRecord !== undefined) {
        return {
          sessionMeta: sessionMetaRecord.payload,
          sessionTimestamp: sessionMetaRecord.timestamp,
          turnContext: turnContextRecord.payload
        };
      }
    }
  } catch {
    return null;
  } finally {
    lines.close();
    stream.destroy();
  }

  return null;
}

async function readParentEffortFile(filePath, parentId, childTimestamp) {
  if (!await isPlainResolvedPath(filePath, "file")) {
    return null;
  }

  const noFollow = fsSync.constants.O_NOFOLLOW || 0;
  let stream;
  try {
    stream = fsSync.createReadStream(filePath, {
      encoding: "utf8",
      flags: fsSync.constants.O_RDONLY | noFollow
    });
  } catch {
    return null;
  }

  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let sessionMeta;
  let selectedEffort = null;
  let selectedTimestamp = Number.NEGATIVE_INFINITY;
  try {
    for await (const line of lines) {
      if (sessionMeta === undefined && hasTopLevelRecordType(line, "session_meta")) {
        const record = parseSelectedRecord(line, "session_meta");
        if (record === null) {
          return null;
        }
        sessionMeta = record.payload;
        continue;
      }

      if (!hasTopLevelRecordType(line, "turn_context")) {
        continue;
      }
      const record = parseSelectedRecord(line, "turn_context");
      if (
        record === null
        || childTimestamp === null
        || record.timestamp === null
        || record.timestamp > childTimestamp
        || record.timestamp < selectedTimestamp
      ) {
        continue;
      }
      selectedTimestamp = record.timestamp;
      selectedEffort = sanitizeParentEffort(record.payload.effort);
    }
  } catch {
    return null;
  } finally {
    lines.close();
    stream.destroy();
  }

  if (
    !sessionMeta
    || !isUuid(sessionMeta.id)
    || sessionMeta.id.toLowerCase() !== parentId
  ) {
    return null;
  }
  return { effectiveEffort: selectedEffort };
}

async function findTrace(options) {
  const candidates = options.agentId === undefined
    ? await collectRecentCandidates(options.codexHome)
    : await collectCandidates(options.codexHome, options.agentId);
  for (const candidate of candidates) {
    const trace = await readTraceFile(candidate);
    if (!trace || !isUuid(trace.sessionMeta.id)) {
      continue;
    }
    const idMatches = options.agentId !== undefined
      && trace.sessionMeta.id.toLowerCase() === options.agentId;
    const taskMatches = options.taskName !== undefined
      && trace.sessionMeta.source?.subagent?.thread_spawn?.agent_path === options.taskName
      && parentThreadIdFromSessionMeta(trace.sessionMeta) === options.parentId;
    if (idMatches || taskMatches) {
      return trace;
    }
  }
  return null;
}

function parentThreadIdFromSessionMeta(sessionMeta) {
  const direct = sessionMeta.parent_thread_id;
  const nested = sessionMeta.source?.subagent?.thread_spawn?.parent_thread_id;
  const candidates = [...new Set(
    [direct, nested]
      .filter(isUuid)
      .map((candidate) => candidate.toLowerCase())
  )];
  if (candidates.length !== 1) {
    return null;
  }
  return candidates[0];
}

async function findParentEffort(options, trace) {
  const parentId = parentThreadIdFromSessionMeta(trace.sessionMeta);
  if (parentId === null) {
    return null;
  }

  const candidates = await collectCandidates(options.codexHome, parentId);
  for (const candidate of candidates) {
    const parent = await readParentEffortFile(
      candidate,
      parentId,
      trace.sessionTimestamp
    );
    if (parent) {
      return parent;
    }
  }
  return null;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resultFromTrace(options, trace) {
  const result = createResult(trace.sessionMeta.id.toLowerCase());
  const agentRole = sanitizeObservedRole(trace.sessionMeta.agent_role);
  const model = sanitizeObservedModel(trace.turnContext.model);
  const effectiveEffort = sanitizeEffort(trace.turnContext.effort);

  result.trace_found = true;
  result.agent_role = agentRole;
  result.model = model;
  result.effective_effort = effectiveEffort;
  result.role_matches = options.expectedRole === undefined
    ? null
    : agentRole === options.expectedRole;
  result.model_matches = options.expectedModel === undefined
    ? null
    : model === options.expectedModel;
  result.effort_matches = options.expectedEffort === undefined
    ? null
    : effectiveEffort === options.expectedEffort;

  const parent = await findParentEffort(options, trace);
  if (parent) {
    result.parent_trace_found = true;
    result.parent_effective_effort = parent.effectiveEffort;
    result.inheritance_consistent = parent.effectiveEffort === null || effectiveEffort === null
      ? null
      : parent.effectiveEffort === effectiveEffort;
  }

  if (options.expectedEffort !== undefined) {
    if (effectiveEffort !== options.expectedEffort) {
      result.selector_evidence = "mismatch";
    } else if (!parent || parent.effectiveEffort === null) {
      result.selector_evidence = "indeterminate";
    } else if (parent.effectiveEffort === effectiveEffort) {
      result.selector_evidence = "matches_parent";
    } else {
      result.selector_evidence = "distinct_from_parent";
    }
  }
  return result;
}

async function inspectChildTrace(input = {}, environment = process.env) {
  const options = normalizeInspectionOptions(input, environment);
  const deadline = Date.now() + options.waitMs;

  do {
    const trace = await findTrace(options);
    if (trace) {
      return await resultFromTrace(options, trace);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(POLL_INTERVAL_MS, remainingMs));
  } while (Date.now() <= deadline);

  return createResult(options.agentId || null);
}

function formatResult(result, compact) {
  return `${JSON.stringify(result, null, compact ? 0 : 2)}\n`;
}

async function runCli(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const compact = argv.includes("--compact");
  try {
    const options = parseArgs(argv, io.environment || process.env);
    if (options.help) {
      stdout.write(HELP_TEXT);
      return EXIT_CODES.OK;
    }
    const result = await inspectChildTrace(options, io.environment || process.env);
    stdout.write(formatResult(result, options.compact));
    return result.trace_found ? EXIT_CODES.OK : EXIT_CODES.INVALID_OR_NOT_FOUND;
  } catch {
    stdout.write(formatResult(createResult(), compact));
    return EXIT_CODES.INVALID_OR_NOT_FOUND;
  }
}

async function main() {
  process.exitCode = await runCli(process.argv.slice(2));
}

if (require.main === module) {
  main();
}

module.exports = {
  ChildTraceInputError,
  EFFORTS,
  EXIT_CODES,
  HELP_TEXT,
  SCHEMA_VERSION,
  SELECTOR_EVIDENCE,
  inspectChildTrace,
  isUuid,
  parseArgs,
  runCli
};
