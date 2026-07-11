#!/usr/bin/env node
"use strict";

const fs = require("fs/promises");
const path = require("path");

const {
  createStatusRuntime,
  STATUS_RUNTIME_BATCH_EVENT,
  STATUS_RUNTIME_EVENTS
} = require("./status-runtime");
const {
  resolvePathFromBase,
  resolvePayloadPath,
  stableJson
} = require("./status-runtime/utils");

const EXIT_CODES = Object.freeze({
  OK: 0,
  INPUT_ERROR: 2,
  RUNTIME_ERROR: 3
});

class StatusEventInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "StatusEventInputError";
  }
}

function usage() {
  return `Usage:
  node tools/status-event.js --event <name> --payload-json '<json>' [--base-dir <path>]
  node tools/status-event.js --event <name> --payload-file <path|-> [--base-dir <path>]
  node tools/status-event.js --event <name> --stdin [--base-dir <path>]

Events:
  ${STATUS_RUNTIME_EVENTS.join(", ")}, ${STATUS_RUNTIME_BATCH_EVENT}

Input:
  Exactly one of --payload-json, --payload-file, or --stdin is required.
  --payload-file - is equivalent to --stdin.
  A batch payload accepts optional shared_payload plus a non-empty events array.

Exit codes:
  ${EXIT_CODES.OK} success
  ${EXIT_CODES.INPUT_ERROR} argument, input-source, or JSON error
  ${EXIT_CODES.RUNTIME_ERROR} event validation, projection, resume, or filesystem error
`;
}

function requireValue(argv, index, option) {
  if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
    throw new StatusEventInputError(`${option} requires a value`);
  }
  return argv[index + 1];
}

function parseArgs(argv) {
  const options = {
    baseDir: process.cwd(),
    event: undefined,
    help: false,
    payloadFile: undefined,
    payloadJson: undefined,
    stdin: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--event":
        options.event = requireValue(argv, index, token);
        index += 1;
        break;
      case "--payload-json":
        options.payloadJson = requireValue(argv, index, token);
        index += 1;
        break;
      case "--payload-file":
        options.payloadFile = requireValue(argv, index, token);
        index += 1;
        break;
      case "--stdin":
        options.stdin = true;
        break;
      case "--base-dir":
        options.baseDir = requireValue(argv, index, token);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new StatusEventInputError(`Unknown argument: ${token}`);
    }
  }

  if (options.help) {
    return options;
  }
  if (!options.event) {
    throw new StatusEventInputError("--event is required");
  }
  if (![...STATUS_RUNTIME_EVENTS, STATUS_RUNTIME_BATCH_EVENT].includes(options.event)) {
    throw new StatusEventInputError(`Unsupported status runtime event: ${options.event}`);
  }

  if (options.payloadFile === "-") {
    options.payloadFile = undefined;
    options.stdin = true;
  }
  const sourceCount = [
    options.payloadJson !== undefined,
    options.payloadFile !== undefined,
    options.stdin
  ].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new StatusEventInputError(
      "Exactly one of --payload-json, --payload-file, or --stdin is required"
    );
  }

  options.baseDir = path.resolve(options.baseDir);
  return options;
}

async function readStdin(input = process.stdin) {
  let value = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    value += chunk;
  }
  return value;
}

function parsePayloadJson(raw, label) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new StatusEventInputError(`${label} must contain valid JSON: ${error.message}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StatusEventInputError(`${label} must decode to a JSON object`);
  }
  return payload;
}

async function loadPayload(options, input = process.stdin) {
  if (options.payloadJson !== undefined) {
    return parsePayloadJson(options.payloadJson, "--payload-json");
  }
  if (options.payloadFile !== undefined) {
    const filePath = path.resolve(options.baseDir, options.payloadFile);
    let raw;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      throw new StatusEventInputError(`Unable to read payload file ${filePath}: ${error.message}`);
    }
    return parsePayloadJson(raw, "--payload-file");
  }
  return parsePayloadJson(await readStdin(input), "stdin");
}

function normalizePayload(payload, baseDir) {
  const normalized = { ...payload };
  if (normalized.working_project_dir !== undefined) {
    normalized.working_project_dir = resolvePathFromBase(
      baseDir,
      normalized.working_project_dir
    );
  }
  if (normalized.output_root !== undefined) {
    normalized.output_root = resolvePayloadPath(baseDir, normalized, normalized.output_root);
  }
  return normalized;
}

function normalizeBatchPayload(batchPayload, baseDir) {
  const sharedPayload = batchPayload.shared_payload ?? {};
  if (!sharedPayload || typeof sharedPayload !== "object" || Array.isArray(sharedPayload)) {
    throw new StatusEventInputError("batch shared_payload must be a JSON object when provided");
  }
  if (!Array.isArray(batchPayload.events) || batchPayload.events.length === 0) {
    throw new StatusEventInputError("batch payload must include a non-empty events array");
  }

  return batchPayload.events.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StatusEventInputError(`batch events[${index}] must be an object`);
    }
    if (!STATUS_RUNTIME_EVENTS.includes(entry.event)) {
      throw new StatusEventInputError(
        `Unsupported status runtime event in batch: ${entry.event}`
      );
    }

    const { event, payload, ...inlinePayload } = entry;
    const deltaPayload = payload === undefined ? inlinePayload : payload;
    if (!deltaPayload || typeof deltaPayload !== "object" || Array.isArray(deltaPayload)) {
      throw new StatusEventInputError(`batch events[${index}].payload must be an object`);
    }

    return {
      event,
      payload: normalizePayload({ ...sharedPayload, ...deltaPayload }, baseDir)
    };
  });
}

async function applyStatusEvent(options, payload, runtime = createStatusRuntime()) {
  if (options.event === STATUS_RUNTIME_BATCH_EVENT) {
    return runtime.applyEvents(normalizeBatchPayload(payload, options.baseDir));
  }
  return runtime.applyEvent(options.event, normalizePayload(payload, options.baseDir));
}

async function runCli(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      stdout.write(usage());
      return EXIT_CODES.OK;
    }
    const payload = await loadPayload(options, io.stdin || process.stdin);
    const result = await applyStatusEvent(options, payload, io.runtime);
    stdout.write(stableJson(result));
    return EXIT_CODES.OK;
  } catch (error) {
    const inputError = error instanceof StatusEventInputError;
    const exitCode = inputError ? EXIT_CODES.INPUT_ERROR : EXIT_CODES.RUNTIME_ERROR;
    stderr.write(
      stableJson({
        error: inputError ? "input_error" : "runtime_error",
        message: error instanceof Error ? error.message : String(error)
      })
    );
    return exitCode;
  }
}

async function main() {
  process.exitCode = await runCli(process.argv.slice(2));
}

if (require.main === module) {
  main();
}

module.exports = {
  EXIT_CODES,
  StatusEventInputError,
  applyStatusEvent,
  loadPayload,
  normalizeBatchPayload,
  normalizePayload,
  parseArgs,
  parsePayloadJson,
  runCli,
  usage
};
