import fs from "fs/promises";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultEffortForAgent,
  findInheritedSessionEffort,
  getProjectDefaultEffort,
  readState,
  resolveDesiredEffort,
  setProjectDefaultEffort,
  setSessionEffort
} from "./effort-control/state.js";
import {
  extractCommandEffortContext,
  extractMessageEffortContext,
  shouldSuppressBaselineForContext
} from "./effort-control.js";

test("OpenAI and Copilot GPT-5 models floor selected agents while leaving excluded roles alone", () => {
  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5",
      agent: "executor",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    "medium"
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "test-runner",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "specifier",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "flow-splitter",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "codex-account-manager",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "planner",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "router",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "repo-scout",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "github-copilot",
      modelId: "gpt-5.2",
      agent: "executor",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined
    }),
    "medium"
  );
});

test("project defaults raise delegated effort without downgrading stronger existing effort", () => {
  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5-mini",
      agent: "specifier",
      sessionEffort: undefined,
      projectEffort: "high",
      existingEffort: "medium"
    }),
    "high"
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "build",
      sessionEffort: "high",
      projectEffort: "medium",
      existingEffort: "xhigh"
    }),
    "xhigh"
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-4.1",
      agent: "specifier",
      sessionEffort: "high",
      projectEffort: "high",
      existingEffort: "medium"
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "github-copilot",
      modelId: "gpt-5.2",
      agent: "build",
      sessionEffort: "xhigh",
      projectEffort: "high",
      existingEffort: "medium"
    }),
    "xhigh"
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "github-copilot",
      modelId: "claude-sonnet-4.5",
      agent: "executor",
      sessionEffort: "high",
      projectEffort: "high",
      existingEffort: "medium"
    }),
    undefined
  );
});

test("context-aware planning flags can suppress the default GPT-5 medium floor without affecting explicit overrides", () => {
  assert.equal(
    defaultEffortForAgent("executor", "gpt-5.4", { suppressBaseline: true }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "executor",
      sessionEffort: undefined,
      projectEffort: undefined,
      existingEffort: undefined,
      suppressBaseline: true
    }),
    undefined
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "executor",
      sessionEffort: undefined,
      projectEffort: "high",
      existingEffort: undefined,
      suppressBaseline: true
    }),
    "high"
  );

  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
      agent: "executor",
      sessionEffort: "xhigh",
      projectEffort: undefined,
      existingEffort: "medium",
      suppressBaseline: true
    }),
    "xhigh"
  );
});

test("context-aware effort detection only reacts to reliable slash-command planning flags", () => {
  assert.deepEqual(
    extractCommandEffortContext("run-pipeline", "Fix bug --dry"),
    {
      command: "run-pipeline",
      dryRun: true,
      decisionOnly: false
    }
  );

  assert.deepEqual(
    extractCommandEffortContext("/modernize", "Audit legacy app --decision-only"),
    {
      command: "modernize",
      dryRun: false,
      decisionOnly: true
    }
  );

  assert.equal(
    extractCommandEffortContext("run-flow", "Ship fix --autopilot"),
    undefined
  );

  assert.deepEqual(
    extractMessageEffortContext("/run-pipeline plan this change --decision-only"),
    {
      command: "run-pipeline",
      dryRun: false,
      decisionOnly: true
    }
  );

  assert.equal(
    extractMessageEffortContext("Can you explain what --dry does?"),
    undefined
  );

  assert.equal(
    shouldSuppressBaselineForContext({ dryRun: true, decisionOnly: false }),
    true
  );

  assert.equal(shouldSuppressBaselineForContext(undefined), false);
});

test("project defaults and parent-session overrides are persisted and inherited", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "effort-control-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  await setProjectDefaultEffort(root, "high");
  await setSessionEffort(root, "session-parent", "xhigh");
  const store = await readState(root);

  assert.equal(getProjectDefaultEffort(store), "high");

  const inherited = await findInheritedSessionEffort({
    sessionId: "session-child",
    store,
    getParentSessionId: async (sessionId) => sessionId === "session-child" ? "session-parent" : undefined
  });

  assert.deepEqual(inherited, {
    effort: "xhigh",
    sessionId: "session-parent"
  });
});
