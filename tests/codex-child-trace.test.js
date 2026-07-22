const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXIT_CODES,
  inspectChildTrace
} = require("../tools/codex-child-trace");

const TOOL_PATH = path.resolve(__dirname, "..", "tools", "codex-child-trace.js");
const AGENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const PARENT_ID = "223e4567-e89b-42d3-a456-426614174000";
const TASK_NAME = "/root/run_adaptive_review_01";

async function createCodexHome(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const codexHome = await fs.mkdtemp(path.join(tempRoot, "codex-child-trace-"));
  t.after(async () => {
    await fs.rm(codexHome, { recursive: true, force: true });
  });
  return codexHome;
}

async function writeSession(codexHome, relativePath, records) {
  const sessionPath = path.join(codexHome, relativePath);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(
    sessionPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8"
  );
  return sessionPath;
}

function traceRecords({
  agentId = AGENT_ID,
  agentRole = "executor",
  model = "gpt-5.3-codex",
  effort = "xhigh",
  parentId,
  sessionTimestamp,
  turnTimestamp
} = {}) {
  return [
    {
      timestamp: sessionTimestamp,
      type: "session_meta",
      payload: {
        agent_role: agentRole,
        base_instructions: "BASE_INSTRUCTIONS_SHOULD_NOT_ESCAPE",
        cwd: "/private/worktree",
        id: agentId,
        parent_thread_id: parentId
      }
    },
    {
      type: "event_msg",
      payload: {
        command: "COMMAND_SHOULD_NOT_ESCAPE",
        output: "OUTPUT_SHOULD_NOT_ESCAPE",
        nested: {
          type: "turn_context",
          content: "NESTED_RECORD_MUST_NOT_BE_PARSED"
        }
      }
    },
    {
      timestamp: turnTimestamp,
      type: "turn_context",
      payload: {
        model,
        effort,
        developer_instructions: "DEVELOPER_PROMPT_SHOULD_NOT_ESCAPE",
        user_instructions: "USER_PROMPT_SHOULD_NOT_ESCAPE",
        cwd: "/private/worktree"
      }
    },
    {
      type: "turn_context",
      payload: {
        model: "SECOND_TURN_CONTEXT_MUST_NOT_BE_USED",
        effort: "medium"
      }
    }
  ];
}

function v2TraceRecords({
  effort = "max",
  taskName = TASK_NAME,
  parentId = PARENT_ID,
  sessionTimestamp = "2026-07-15T10:00:00.000Z",
  turnTimestamp = "2026-07-15T10:00:01.000Z"
} = {}) {
  const records = traceRecords({
    effort,
    parentId: undefined,
    sessionTimestamp,
    turnTimestamp
  });
  records[0].payload.source = {
    subagent: {
      thread_spawn: {
        parent_thread_id: parentId,
        agent_path: taskName,
        depth: 1,
        agent_role: "executor"
      }
    }
  };
  return records;
}

function parentTraceRecords(efforts) {
  return [
    {
      timestamp: "2026-07-15T08:00:00.000Z",
      type: "session_meta",
      payload: { id: PARENT_ID }
    },
    ...efforts.map(({ timestamp, effort }) => ({
      timestamp,
      type: "turn_context",
      payload: {
        model: "gpt-5.6-sol",
        effort,
        summary: "PARENT_PRIVATE_SUMMARY_MUST_NOT_ESCAPE"
      }
    }))
  ];
}

function invokeCli(args, codexHome, environment = {}) {
  return spawnSync(process.execPath, [TOOL_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome, ...environment }
  });
}

function expectedFoundResult(overrides = {}) {
  return {
    schema_version: "1.2",
    runtime: "codex",
    agent_id: AGENT_ID,
    trace_found: true,
    agent_role: null,
    model: null,
    model_matches: null,
    effective_effort: "xhigh",
    role_matches: null,
    effort_matches: null,
    parent_trace_found: false,
    parent_effective_effort: null,
    inheritance_consistent: null,
    selector_evidence: null,
    ...overrides
  };
}

test("finds a synthetic archived trace through the importable API and compact CLI", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("archived_sessions", "2026", "07", `rollout-test-${AGENT_ID}.jsonl`),
    traceRecords()
  );

  const imported = await inspectChildTrace({ agentId: AGENT_ID, codexHome });
  assert.deepEqual(imported, expectedFoundResult());
  const compared = await inspectChildTrace({
    agentId: AGENT_ID,
    codexHome,
    expectedRole: "executor"
  });
  assert.deepEqual(compared, expectedFoundResult({ role_matches: true }));

  const processResult = invokeCli(["--agent-id", AGENT_ID, "--compact"], codexHome);
  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.equal(processResult.stderr, "");
  assert.equal(processResult.stdout.split("\n").filter(Boolean).length, 1);
  assert.deepEqual(JSON.parse(processResult.stdout), expectedFoundResult());
});

test("verifies a caller-supplied model without emitting mismatched raw metadata", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-model-${AGENT_ID}.jsonl`),
    traceRecords({ model: "gpt-5.6-sol" })
  );

  const matched = await inspectChildTrace({
    agentId: AGENT_ID,
    codexHome,
    expectedModel: "gpt-5.6-sol"
  });
  assert.deepEqual(matched, expectedFoundResult({
    model: "gpt-5.6-sol",
    model_matches: true
  }));
  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-model", "gpt-5.6-sol",
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);
  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.deepEqual(JSON.parse(processResult.stdout), matched);

  const mismatched = await inspectChildTrace({
    agentId: AGENT_ID,
    codexHome,
    expectedModel: "gpt-5.6-terra"
  });
  assert.deepEqual(mismatched, expectedFoundResult({ model_matches: false }));
  assert.equal(JSON.stringify(mismatched).includes("gpt-5.6-sol"), false);
});

test("reports role and effort mismatches without treating a found trace as an error", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-test-${AGENT_ID}.jsonl`),
    traceRecords()
  );

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-role", "reviewer",
    "--expected-effort", "high",
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.deepEqual(JSON.parse(processResult.stdout), expectedFoundResult({
    role_matches: false,
    effort_matches: false,
    selector_evidence: "mismatch"
  }));
});

test("rejects an invalid UUID with only the bounded JSON schema", async (t) => {
  const codexHome = await createCodexHome(t);
  const processResult = invokeCli([
    "--agent-id", "not-a-uuid",
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(processResult.stderr, "");
  assert.equal(processResult.stdout.split("\n").filter(Boolean).length, 1);
  assert.deepEqual(JSON.parse(processResult.stdout), {
    schema_version: "1.2",
    runtime: "codex",
    agent_id: null,
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
  });
});

test("prints bounded help without requiring a trace", () => {
  const processResult = spawnSync(process.execPath, [TOOL_PATH, "--help"], {
    encoding: "utf8"
  });

  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.match(processResult.stdout, /--agent-id <uuid>/);
  assert.match(processResult.stdout, /--task-name <path>/);
  assert.match(processResult.stdout, /--parent-id <uuid>/);
  assert.match(processResult.stdout, /--expected-model/);
  assert.match(processResult.stdout, /--expected-effort/);
  assert.equal(processResult.stderr, "");
});

test("rejects unsafe expected-role input without echoing it", async (t) => {
  const codexHome = await createCodexHome(t);
  const privateRole = "../PRIVATE_ROLE";
  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-role", privateRole,
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(processResult.stdout.includes(privateRole), false);
  assert.equal(JSON.parse(processResult.stdout).trace_found, false);
});

test("rejects unsafe expected-model input without echoing it", async (t) => {
  const codexHome = await createCodexHome(t);
  const privateModel = "ghp_PRIVATESECRET123";
  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-model", privateModel,
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(processResult.stdout.includes(privateModel), false);
  assert.equal(JSON.parse(processResult.stdout).model_matches, null);
});

test("ignores a symlinked matching session file", async (t) => {
  const codexHome = await createCodexHome(t);
  const target = path.join(codexHome, "outside.jsonl");
  await fs.writeFile(target, `${traceRecords().map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  await fs.mkdir(path.join(codexHome, "sessions"), { recursive: true });
  await fs.symlink(target, path.join(codexHome, "sessions", `rollout-link-${AGENT_ID}.jsonl`));

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(JSON.parse(processResult.stdout).trace_found, false);
});

test("rejects a Codex home reached through a symlink or Windows junction ancestor", async (t) => {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, "codex-child-trace-link-parent-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const realParent = path.join(root, "real-parent");
  const realCodexHome = path.join(realParent, "codex-home");
  await writeSession(
    realCodexHome,
    path.join("sessions", "2026", "07", `rollout-real-${AGENT_ID}.jsonl`),
    traceRecords()
  );
  const linkedParent = path.join(root, "linked-parent");
  await fs.symlink(
    realParent,
    linkedParent,
    process.platform === "win32" ? "junction" : "dir"
  );

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--codex-home", path.join(linkedParent, "codex-home"),
    "--compact"
  ], realCodexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(JSON.parse(processResult.stdout).trace_found, false);
});

test("ignores a filename match whose session metadata has a different agent ID", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-forged-${AGENT_ID}.jsonl`),
    traceRecords({ agentId: "223e4567-e89b-42d3-a456-426614174000" })
  );

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(JSON.parse(processResult.stdout).trace_found, false);
});

test("never emits trace identifiers, credentials, session content, or later records", async (t) => {
  const codexHome = await createCodexHome(t);
  const privateRole = "sk-live-private-role";
  const privateModel = "ghp_PRIVATESECRET123";
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-private-${AGENT_ID}.jsonl`),
    traceRecords({ agentRole: privateRole, model: privateModel })
  );

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-role", "executor",
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);
  const output = processResult.stdout;
  const parsed = JSON.parse(output);

  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.equal(parsed.model, null);
  assert.deepEqual(Object.keys(parsed), [
    "schema_version",
    "runtime",
    "agent_id",
    "trace_found",
    "agent_role",
    "model",
    "model_matches",
    "effective_effort",
    "role_matches",
    "effort_matches",
    "parent_trace_found",
    "parent_effective_effort",
    "inheritance_consistent",
    "selector_evidence"
  ]);
  for (const privateValue of [
    "BASE_INSTRUCTIONS_SHOULD_NOT_ESCAPE",
    "DEVELOPER_PROMPT_SHOULD_NOT_ESCAPE",
    "USER_PROMPT_SHOULD_NOT_ESCAPE",
    "COMMAND_SHOULD_NOT_ESCAPE",
    "OUTPUT_SHOULD_NOT_ESCAPE",
    "NESTED_RECORD_MUST_NOT_BE_PARSED",
    "SECOND_TURN_CONTEXT_MUST_NOT_BE_USED",
    "/private/worktree",
    privateRole,
    privateModel
  ]) {
    assert.equal(output.includes(privateValue), false);
  }
  assert.equal(processResult.stderr, "");
});

test("separates selector evidence from parent-effort inheritance", async (t) => {
  const scenarios = [
    {
      name: "same requested and parent effort is observationally ambiguous",
      expectedEffort: "max",
      childEffort: "max",
      parentEffort: "max",
      selectorEvidence: "matches_parent",
      inheritanceConsistent: true
    },
    {
      name: "a matching child effort distinct from the parent excludes simple inheritance",
      expectedEffort: "high",
      childEffort: "high",
      parentEffort: "max",
      selectorEvidence: "distinct_from_parent",
      inheritanceConsistent: false
    },
    {
      name: "a mismatched child matching the parent is inheritance-consistent",
      expectedEffort: "high",
      childEffort: "max",
      parentEffort: "max",
      selectorEvidence: "mismatch",
      inheritanceConsistent: true
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (st) => {
      const codexHome = await createCodexHome(st);
      await writeSession(
        codexHome,
        path.join("sessions", "2026", "07", `rollout-parent-${PARENT_ID}.jsonl`),
        parentTraceRecords([
          { timestamp: "2026-07-15T09:00:00.000Z", effort: "xhigh" },
          { timestamp: "2026-07-15T09:30:00.000Z", effort: scenario.parentEffort },
          { timestamp: "2026-07-15T10:30:00.000Z", effort: "medium" }
        ])
      );
      await writeSession(
        codexHome,
        path.join("sessions", "2026", "07", `rollout-child-${AGENT_ID}.jsonl`),
        traceRecords({
          effort: scenario.childEffort,
          parentId: PARENT_ID,
          sessionTimestamp: "2026-07-15T10:00:00.000Z",
          turnTimestamp: "2026-07-15T10:00:01.000Z"
        })
      );

      const result = await inspectChildTrace({
        agentId: AGENT_ID,
        codexHome,
        expectedEffort: scenario.expectedEffort
      });

      assert.deepEqual(result, expectedFoundResult({
        effective_effort: scenario.childEffort,
        effort_matches: scenario.childEffort === scenario.expectedEffort,
        parent_trace_found: true,
        parent_effective_effort: scenario.parentEffort,
        inheritance_consistent: scenario.inheritanceConsistent,
        selector_evidence: scenario.selectorEvidence
      }));
    });
  }
});

test("resolves the V2 spawn task name and a lower parent effort", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-parent-${PARENT_ID}.jsonl`),
    parentTraceRecords([
      { timestamp: "2026-07-15T09:30:00.000Z", effort: "low" }
    ])
  );
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-child-${AGENT_ID}.jsonl`),
    v2TraceRecords()
  );

  const result = await inspectChildTrace({
    taskName: TASK_NAME,
    codexHome,
    expectedRole: "executor",
    expectedEffort: "max"
  }, { CODEX_THREAD_ID: PARENT_ID });

  assert.deepEqual(result, expectedFoundResult({
    effective_effort: "max",
    role_matches: true,
    effort_matches: true,
    parent_trace_found: true,
    parent_effective_effort: "low",
    inheritance_consistent: false,
    selector_evidence: "distinct_from_parent"
  }));

  const processResult = invokeCli([
    "--task-name", TASK_NAME,
    "--expected-role", "executor",
    "--expected-effort", "max",
    "--compact"
  ], codexHome, { CODEX_THREAD_ID: PARENT_ID });
  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.deepEqual(JSON.parse(processResult.stdout), result);
});

test("requires exactly one bounded V1 or V2 spawn identifier", async (t) => {
  const codexHome = await createCodexHome(t);
  for (const args of [
    [],
    ["--agent-id", AGENT_ID, "--task-name", TASK_NAME],
    ["--agent-id", AGENT_ID, "--parent-id", PARENT_ID],
    ["--task-name", "/root/../private"]
  ]) {
    const processResult = invokeCli([...args, "--compact"], codexHome);
    assert.equal(processResult.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
    assert.equal(JSON.parse(processResult.stdout).trace_found, false);
  }

  const missingParent = invokeCli(
    ["--task-name", TASK_NAME, "--compact"],
    codexHome,
    { CODEX_THREAD_ID: "" }
  );
  assert.equal(missingParent.status, EXIT_CODES.INVALID_OR_NOT_FOUND);
  assert.equal(JSON.parse(missingParent.stdout).trace_found, false);
});

test("binds a repeated V2 task path to the current parent thread", async (t) => {
  const codexHome = await createCodexHome(t);
  const otherAgentId = "323e4567-e89b-42d3-a456-426614174000";
  const otherParentId = "423e4567-e89b-42d3-a456-426614174000";
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-other-${otherAgentId}.jsonl`),
    v2TraceRecords({ parentId: otherParentId, effort: "medium" }).map((record) => {
      if (record.type === "session_meta") {
        record.payload.id = otherAgentId;
      }
      return record;
    })
  );
  await writeSession(
    codexHome,
    path.join("archived_sessions", "2026", "07", `rollout-current-${AGENT_ID}.jsonl`),
    v2TraceRecords({ effort: "max" })
  );

  const result = await inspectChildTrace(
    { taskName: TASK_NAME, codexHome, expectedEffort: "max" },
    { CODEX_THREAD_ID: PARENT_ID }
  );
  assert.deepEqual(result, expectedFoundResult({
    effective_effort: "max",
    effort_matches: true,
    parent_trace_found: false,
    selector_evidence: "indeterminate"
  }));
});

test("never emits parent identifiers or parent session content", async (t) => {
  const codexHome = await createCodexHome(t);
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-parent-${PARENT_ID}.jsonl`),
    parentTraceRecords([
      { timestamp: "2026-07-15T09:30:00.000Z", effort: "max" }
    ])
  );
  await writeSession(
    codexHome,
    path.join("sessions", "2026", "07", `rollout-child-${AGENT_ID}.jsonl`),
    traceRecords({
      effort: "max",
      parentId: PARENT_ID,
      sessionTimestamp: "2026-07-15T10:00:00.000Z",
      turnTimestamp: "2026-07-15T10:00:01.000Z"
    })
  );

  const processResult = invokeCli([
    "--agent-id", AGENT_ID,
    "--expected-effort", "max",
    "--codex-home", codexHome,
    "--compact"
  ], codexHome);

  assert.equal(processResult.status, EXIT_CODES.OK);
  assert.equal(processResult.stdout.includes(PARENT_ID), false);
  assert.equal(
    processResult.stdout.includes("PARENT_PRIVATE_SUMMARY_MUST_NOT_ESCAPE"),
    false
  );
  assert.deepEqual(JSON.parse(processResult.stdout), expectedFoundResult({
    effective_effort: "max",
    effort_matches: true,
    parent_trace_found: true,
    parent_effective_effort: "max",
    inheritance_consistent: true,
    selector_evidence: "matches_parent"
  }));
});

test("retries for a bounded wait while a trace is being created", async (t) => {
  const codexHome = await createCodexHome(t);
  const delayedWrite = new Promise((resolve, reject) => {
    setTimeout(() => {
      writeSession(
        codexHome,
        path.join("sessions", "2026", "07", `rollout-delayed-${AGENT_ID}.jsonl`),
        traceRecords()
      ).then(resolve, reject);
    }, 25);
  });

  const result = await inspectChildTrace({
    agentId: AGENT_ID,
    codexHome,
    waitMs: 250
  });
  await delayedWrite;

  assert.deepEqual(result, expectedFoundResult());
});
