#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { TextDecoder } = require("node:util");

const MODEL = "gpt-6-luna";
const ENDPOINT = "https://api.openai.com/v1/decisions";
const LIMITS = Object.freeze({ input: 64 * 1024, output: 256 * 1024, questions: 16, timeout: 30000 });
const EXIT_CODES = Object.freeze({ OK: 0, INPUT: 2, API: 3, REFUSED: 4 });

class DecisionError extends Error {
  constructor(category, message, outcomeUnknown = false) {
    super(message);
    this.category = category;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function requireThat(condition, category, message) {
  if (!condition) throw new DecisionError(category, message);
}

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
const count = value => Number.isSafeInteger(value) && value >= 0;

function fields(value, allowed) {
  return object(value) && Object.keys(value).every(key => allowed.includes(key));
}

function validateJsonData(data) {
  const valid = object(data) || (Array.isArray(data) && data.every(object));
  requireThat(valid, "invalid_input", "input_json data must be an object or array of objects.");
  let values = 0;
  function visit(value, depth) {
    values += 1;
    requireThat(values <= 10000 && depth <= 32, "invalid_input", "JSON evidence exceeds API nesting or value limits.");
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
  }
  visit(data, 0);
}

function validateInput(input) {
  if (text(input)) return;
  requireThat(Array.isArray(input) && input.length > 0, "invalid_input", "Supply text or text/JSON messages as input.");
  for (const message of input) {
    requireThat(fields(message, ["role", "content", "type"]) &&
      ["user", "developer", "system"].includes(message.role) &&
      (message.type === undefined || message.type === "message"), "invalid_input", "Unsupported evidence message.");
    if (text(message.content)) continue;
    requireThat(Array.isArray(message.content) && message.content.length > 0, "invalid_input", "Message content must contain text or JSON.");
    for (const part of message.content) {
      if (fields(part, ["type", "text"]) && part.type === "input_text" && text(part.text)) continue;
      requireThat(message.role === "user" && fields(part, ["type", "data"]) && part.type === "input_json",
        "invalid_input", "Only text and user JSON evidence are supported.");
      validateJsonData(part.data);
    }
  }
}

function validateRequest(value) {
  requireThat(fields(value, ["model", "input", "questions"]) &&
    (value.model === undefined || value.model === MODEL), "invalid_input", "Unsupported request fields or model.");
  validateInput(value.input);
  requireThat(Array.isArray(value.questions) && value.questions.length >= 1 && value.questions.length <= LIMITS.questions,
    "invalid_input", "Supply between 1 and 16 named questions.");
  const names = new Set();
  for (const question of value.questions) {
    requireThat(object(question) && typeof question.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(question.name) &&
      !names.has(question.name) && text(question.instructions), "invalid_input", "Questions need unique safe names and text instructions.");
    names.add(question.name);
    const allowed = ["type", "name", "instructions"];
    if (question.type === "choice") allowed.push("choices");
    else if (question.type === "score") allowed.push("levels");
    else requireThat(question.type === "predicate", "invalid_input", "Unsupported question type.");
    requireThat(fields(question, allowed), "invalid_input", "Unsupported question fields.");
    if (question.type === "choice") {
      requireThat(Array.isArray(question.choices) && question.choices.length >= 2 && question.choices.length <= 255,
        "invalid_input", "Choice questions need between 2 and 255 choices.");
      const choices = new Set();
      for (const choice of question.choices) {
        requireThat(fields(choice, ["value", "description"]) && (typeof choice.value === "string" || typeof choice.value === "boolean") &&
          !choices.has(choice.value) && (choice.description === undefined || typeof choice.description === "string"),
        "invalid_input", "Choice values must be distinct strings or booleans.");
        choices.add(choice.value);
      }
    } else if (question.type === "score") {
      requireThat(Array.isArray(question.levels) && question.levels.length >= 2 && question.levels.length <= 10,
        "invalid_input", "Score questions need between 2 and 10 ordered levels.");
      const labels = new Set();
      for (const level of question.levels) {
        requireThat(fields(level, ["label", "description"]) && text(level.label) && !labels.has(level.label) &&
          (level.description === undefined || typeof level.description === "string"), "invalid_input", "Score levels need distinct text labels.");
        labels.add(level.label);
      }
    }
  }
  const request = { model: MODEL, input: value.input, questions: value.questions };
  requireThat(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.input, "invalid_input", "Request exceeds 64 KiB.");
  return request;
}

function validateResponse(value, request) {
  const check = condition => requireThat(condition, "invalid_response", "Provider returned an incompatible decision.");
  check(object(value) && value.model === MODEL && Array.isArray(value.answers) && value.answers.length === request.questions.length);
  const answers = value.answers.map((answer, index) => {
    const question = request.questions[index];
    check(object(answer) && answer.name === question.name);
    if (answer.type === "refusal") return { type: "refusal", name: question.name };
    check(answer.type === question.type);
    const result = { type: answer.type, name: question.name };
    if (answer.type === "predicate") {
      check(probability(answer.probability));
      return { ...result, probability: answer.probability };
    }
    check(probability(answer.confidence));
    const options = question.type === "choice" ? question.choices.map(choice => choice.value) : question.levels.map((_, i) => i);
    check(Array.isArray(answer.probabilities) && answer.probabilities.length === options.length);
    const seen = new Set();
    result.probabilities = answer.probabilities.map(entry => {
      check(object(entry) && options.includes(entry.value) && !seen.has(entry.value) && probability(entry.probability));
      seen.add(entry.value);
      const item = { value: entry.value, probability: entry.probability };
      if (question.type === "score") {
        check(entry.label === question.levels[entry.value].label);
        item.label = entry.label;
      }
      return item;
    });
    check(Math.abs(result.probabilities.reduce((sum, entry) => sum + entry.probability, 0) - 1) <= 0.001);
    result.confidence = answer.confidence;
    if (question.type === "choice") {
      check(options.includes(answer.choice));
      result.choice = answer.choice;
    } else {
      check(Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= options.length - 1);
      result.score = answer.score;
    }
    return result;
  });
  const usage = value.usage;
  check(object(usage) && [usage.input_tokens, usage.output_tokens, usage.total_tokens].every(count) &&
    object(usage.input_tokens_details) && object(usage.output_tokens_details) &&
    [usage.input_tokens_details.cached_tokens, usage.input_tokens_details.cache_write_tokens,
      usage.output_tokens_details.reasoning_tokens].every(count));
  return {
    status: answers.some(answer => answer.type === "refusal") ? "refused" : "completed",
    model: MODEL,
    answers,
    usage: {
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, total_tokens: usage.total_tokens,
      input_tokens_details: { cached_tokens: usage.input_tokens_details.cached_tokens, cache_write_tokens: usage.input_tokens_details.cache_write_tokens },
      output_tokens_details: { reasoning_tokens: usage.output_tokens_details.reasoning_tokens }
    }
  };
}

async function readBounded(stream, limit, category) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    requireThat(size <= limit, category, category === "invalid_input" ? "Request exceeds 64 KiB." : "Provider response exceeds 256 KiB.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseJson(buffer, category) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new DecisionError(category, category === "invalid_input" ? "Supply valid UTF-8 JSON." : "Provider returned invalid UTF-8 JSON.");
  }
}

function httpError(status, code) {
  if (status === 429 && ["insufficient_quota", "rate_limit_exceeded"].includes(code)) {
    return new DecisionError(code === "insufficient_quota" ? "quota_exhausted" : "rate_limited",
      code === "insufficient_quota" ? "The API reported exhausted quota; check the selected project's credits or billing." :
        "The API reported a rate limit; no automatic retry was made.");
  }
  const [category, message] = {
    401: ["invalid_credentials", "The selected API key was rejected; update it explicitly."],
    403: ["permission_denied", "The selected API key or project lacks access."],
    429: ["rate_or_quota_limit", "The API reported a rate or quota limit; check the selected project."],
  }[status] || (status >= 300 && status < 400 ? ["redirect_refused", "API redirect refused."] :
    ["api_error", "The API request failed; no automatic retry was made."]);
  return new DecisionError(category, message);
}

async function execute(request, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = LIMITS.timeout } = {}) {
  requireThat(typeof apiKey === "string" && /^\S+$/.test(apiKey), "missing_credentials", "Configure the dedicated OPENAI_API_KEY for this tool process.");
  const body = JSON.stringify(request);
  requireThat(!body.includes(apiKey), "secret_in_input", "Remove the configured credential from the request before sending it.");
  const controller = new AbortController();
  let timer;
  // The same deadline covers both headers and the entire response body.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DecisionError("timeout", "Request timed out; server outcome and billing may be unknown. No retry was made.", true));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST", redirect: "manual", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body
      });
      if (response.status !== 200) {
        // Interpret only documented quota/rate codes; never return upstream text.
        let code;
        if (response.status === 429 && response.body) {
          try {
            code = parseJson(await readBounded(response.body, 4096, "invalid_response"), "invalid_response").error?.code;
          } catch { /* An unknown/oversized error remains a generic 429. */ }
        } else if (response.body) await response.body.cancel();
        throw httpError(response.status, code);
      }
      const data = await readBounded(response.body, LIMITS.output, "invalid_response");
      const result = validateResponse(parseJson(data, "invalid_response"), request);
      const id = response.headers.get("x-request-id");
      if (typeof id === "string" && /^req_[A-Za-z0-9_-]{1,120}$/.test(id) && !id.includes(apiKey)) result.request_id = id;
      return result;
    })()]);
  } catch (error) {
    if (error instanceof DecisionError) throw error;
    if (controller.signal.aborted) throw new DecisionError("timeout", "Request timed out; server outcome and billing may be unknown. No retry was made.", true);
    throw new DecisionError("network_error", "Request transport failed; server outcome and billing may be unknown. No retry was made.", true);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function usage() {
  return "Usage: node tools/decisions.js --input <request.json|-> [--dry-run]\n" +
    "Node.js 18+. Reads only process-local OPENAI_API_KEY. No dotenv discovery, redirects, retries, or provider fallback.\n" +
    "Dry-run validates locally without reading credentials or making a request.\n" +
    "Limits: 64 KiB request, 16 questions, 30 seconds, 256 KiB response.\n" +
    "Exit: 0 completed/dry-run, 2 local input/credential error, 3 API/transport/response error, 4 refusal.\n";
}

async function runCli(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, env = process.env, fetchImpl } = {}) {
  try {
    if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) { stdout.write(usage()); return 0; }
    let input;
    let dryRun = false;
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === "--input" && input === undefined && argv[i + 1] && !argv[i + 1].startsWith("--")) input = argv[++i];
      else if (argv[i] === "--dry-run" && !dryRun) dryRun = true;
      else throw new DecisionError("invalid_input", "Unsupported arguments; use --help. Never pass a key as an argument.");
    }
    requireThat(input !== undefined, "invalid_input", "Supply --input <request.json|->.");
    let buffer;
    try {
      buffer = await readBounded(input === "-" ? stdin : fs.createReadStream(input), LIMITS.input, "invalid_input");
    } catch (error) {
      if (error instanceof DecisionError) throw error;
      throw new DecisionError("invalid_input", "Unable to read the selected input.");
    }
    const request = validateRequest(parseJson(buffer, "invalid_input"));
    if (dryRun) {
      stdout.write(JSON.stringify({ status: "dry_run", model: MODEL, questions: request.questions.length, request_bytes: Buffer.byteLength(JSON.stringify(request)), network: false }) + "\n");
      return EXIT_CODES.OK;
    }
    const result = await execute(request, { apiKey: env.OPENAI_API_KEY, fetchImpl });
    stdout.write(JSON.stringify(result) + "\n");
    return result.status === "refused" ? EXIT_CODES.REFUSED : EXIT_CODES.OK;
  } catch (error) {
    const safe = error instanceof DecisionError ? error : new DecisionError("local_error", "Local operation failed.");
    stderr.write(JSON.stringify({ status: "error", error: { category: safe.category, message: safe.message, ...(safe.outcomeUnknown ? { outcome_unknown: true } : {}) } }) + "\n");
    return ["invalid_input", "missing_credentials", "secret_in_input", "local_error"].includes(safe.category) ? EXIT_CODES.INPUT : EXIT_CODES.API;
  }
}

if (require.main === module) runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });

module.exports = { MODEL, ENDPOINT, LIMITS, EXIT_CODES, DecisionError, validateRequest, validateResponse, execute, runCli };
