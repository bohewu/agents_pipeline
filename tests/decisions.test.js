"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");
const { MODEL, ENDPOINT, LIMITS, validateRequest, execute, runCli } = require("../tools/decisions");

const KEY = ["sk", "synthetic", "decide", "test"].join("-");
const usage = { input_tokens: 12, output_tokens: 0, total_tokens: 12,
  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
const predicate = () => ({ model: MODEL, input: "Selected example only", questions: [
  { type: "predicate", name: "bounded", instructions: "Is the example bounded?" }
] });
const success = () => ({ model: MODEL, answers: [{ type: "predicate", name: "bounded", probability: 0.8 }], usage });
const response = (data = success(), status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "x-request-id": "req_fixture_123" }
});

async function cli(args, input, options = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    stdin: Readable.from([typeof input === "string" || Buffer.isBuffer(input) ? input : JSON.stringify(input)]),
    stdout: new Writable({ write(chunk, _, done) { stdout += chunk; done(); } }),
    stderr: new Writable({ write(chunk, _, done) { stderr += chunk; done(); } }),
    env: {}, ...options
  });
  return { code, stdout, stderr };
}

test("one pinned request returns validated predicates and actual usage", async () => {
  let calls = 0;
  const result = await execute(validateRequest(predicate()), { apiKey: KEY, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, ENDPOINT);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(JSON.parse(options.body), predicate());
    return response({ ...success(), untrusted_extra: KEY });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.request_id, "req_fixture_123");
  assert.deepEqual(result.usage, usage);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test("choice values preserve boolean/string identity and score allows weighted indices", async () => {
  const request = validateRequest({ input: [{ role: "user", content: [{ type: "input_json", data: { changes: 2 } }] }], questions: [
    { name: "route", type: "choice", instructions: "Choose", choices: [{ value: false }, { value: "false" }] },
    { name: "risk", type: "score", instructions: "Score", levels: [{ label: "low" }, { label: "high" }] }
  ] });
  const result = await execute(request, { apiKey: KEY, fetchImpl: async () => response({ model: MODEL, usage, answers: [
    { type: "choice", name: "route", choice: false, confidence: 0.8,
      probabilities: [{ value: false, probability: 0.9 }, { value: "false", probability: 0.1 }] },
    { type: "score", name: "risk", score: 0.25, confidence: 0.7,
      probabilities: [{ value: 0, label: "low", probability: 0.75 }, { value: 1, label: "high", probability: 0.25 }] }
  ] }) });
  assert.equal(result.answers[0].choice, false);
  assert.equal(result.answers[1].score, 0.25);
});

test("dry-run does not read credentials, echo evidence or access the network", async () => {
  const result = await cli(["--input", "-", "--dry-run"], predicate(), {
    env: new Proxy({}, { get() { assert.fail("credential lookup"); } }),
    fetchImpl: () => assert.fail("network")
  });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).network, false);
  assert.equal(result.stdout.includes("Selected example"), false);
});

test("input errors fail before sending and do not echo input", async t => {
  const invalid = [
    "{malformed private text", Buffer.from([0xff]), null,
    { ...predicate(), endpoint: "https://example.invalid" },
    { ...predicate(), model: "other" },
    { ...predicate(), input: [{ role: "user", content: [{ type: "input_image", image_url: "https://example.invalid" }] }] },
    { ...predicate(), input: [{ role: "developer", content: [{ type: "input_json", data: {} }] }] },
    { ...predicate(), questions: Array(17).fill(predicate().questions[0]) },
    { ...predicate(), questions: [predicate().questions[0], predicate().questions[0]] },
    { ...predicate(), questions: [{ ...predicate().questions[0], instructions: [] }] },
    { ...predicate(), questions: [{ type: "choice", name: "q", instructions: "Q", choices: [{ value: "same" }, { value: "same" }] }] },
    { ...predicate(), questions: [{ type: "score", name: "q", instructions: "Q", levels: [{ label: "only" }] }] },
    { ...predicate(), input: "x".repeat(LIMITS.input) }
  ];
  for (const input of invalid) await t.test(typeof input === "string" ? "malformed JSON" : "invalid shape or bounds", async () => {
    const result = await cli(["--input", "-"], input, { fetchImpl: () => assert.fail("network") });
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stderr).error.category, "invalid_input");
    assert.equal(result.stderr.includes("private text"), false);
  });
});

test("missing credential and credential embedded in input fail without a request", async () => {
  const missing = await cli(["--input", "-"], predicate(), { fetchImpl: () => assert.fail("network") });
  assert.equal(JSON.parse(missing.stderr).error.category, "missing_credentials");
  const leaked = await cli(["--input", "-"], { ...predicate(), input: KEY }, {
    env: { OPENAI_API_KEY: KEY }, fetchImpl: () => assert.fail("network")
  });
  assert.equal(JSON.parse(leaked.stderr).error.category, "secret_in_input");
  assert.equal(leaked.stderr.includes(KEY), false);
});

test("safe API failures never retry, follow redirects, switch key or leak provider text", async t => {
  for (const [status, code, expected] of [
    [401, "invalid_api_key", "invalid_credentials"], [403, "forbidden", "permission_denied"],
    [429, "insufficient_quota", "quota_exhausted"], [429, "rate_limit_exceeded", "rate_limited"],
    [429, "other", "rate_or_quota_limit"], [307, "redirect", "redirect_refused"], [500, "internal", "api_error"]
  ]) await t.test(String(status) + code, async () => {
    let calls = 0;
    const result = await cli(["--input", "-"], predicate(), { env: { OPENAI_API_KEY: KEY }, fetchImpl: async () => {
      calls += 1;
      return response({ error: { code, message: KEY + " private evidence" } }, status);
    } });
    assert.equal(calls, 1);
    assert.equal(result.code, 3);
    assert.equal(JSON.parse(result.stderr).error.category, expected);
    assert.equal(result.stderr.includes(KEY), false);
    assert.equal(result.stderr.includes("private evidence"), false);
  });
});

test("network failure redacts raw exceptions and marks unknown outcome", async () => {
  const result = await cli(["--input", "-"], predicate(), { env: { OPENAI_API_KEY: KEY }, fetchImpl: async () => {
    throw new Error(KEY);
  } });
  assert.equal(result.code, 3);
  assert.equal(JSON.parse(result.stderr).error.outcome_unknown, true);
  assert.equal(result.stderr.includes(KEY), false);
});

test("timeout covers headers and response body, aborts once and never retries", async t => {
  for (const phase of ["headers", "body"]) await t.test(phase, async () => {
    let calls = 0;
    let signal;
    await assert.rejects(execute(validateRequest(predicate()), { apiKey: KEY, timeoutMs: 20,
      fetchImpl: async (_, options) => {
        calls += 1;
        signal = options.signal;
        if (phase === "headers") return new Promise(() => {});
        return new Response(new ReadableStream({ start() {} }));
      }
    }), error => error.category === "timeout" && error.outcomeUnknown);
    assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  });
});

test("malformed, oversized and mismatched responses never become decisions", async t => {
  for (const badResponse of [
    () => new Response("{bad " + KEY),
    () => new Response("x".repeat(LIMITS.output + 1)),
    () => response({ ...success(), model: "other" }),
    () => response({ ...success(), answers: [] }),
    () => response({ ...success(), answers: [{ ...success().answers[0], name: "other" }] }),
    () => response({ ...success(), answers: [{ ...success().answers[0], probability: 2 }] }),
    () => response({ ...success(), usage: { ...usage, input_tokens: KEY } })
  ]) await t.test("invalid output", async () => {
    const result = await cli(["--input", "-"], predicate(), { env: { OPENAI_API_KEY: KEY }, fetchImpl: async () => badResponse() });
    assert.equal(result.code, 3);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error.category, "invalid_response");
    assert.equal(result.stderr.includes(KEY), false);
  });
});

test("refusal is preserved with a distinct nonzero exit", async () => {
  const result = await cli(["--input", "-"], predicate(), { env: { OPENAI_API_KEY: KEY },
    fetchImpl: async () => response({ ...success(), answers: [{ type: "refusal", name: "bounded", extra: KEY }] }) });
  assert.equal(result.code, 4);
  assert.deepEqual(JSON.parse(result.stdout).answers, [{ type: "refusal", name: "bounded" }]);
  assert.equal(result.stdout.includes(KEY), false);
});

test("unknown or duplicate CLI flags and unreadable files fail safely", async () => {
  for (const args of [["--api-key", KEY], ["--input", "-", "--input", "-"], ["--input", "file-does-not-exist.json"]]) {
    const result = await cli(args, predicate());
    assert.equal(result.code, 2);
    assert.equal(result.stderr.includes(KEY), false);
  }
});
