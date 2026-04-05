import fs from "fs/promises";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  findInheritedSessionEffort,
  getProjectDefaultEffort,
  readState,
  resolveDesiredEffort,
  setProjectDefaultEffort,
  setSessionEffort
} from "./effort-control/state.js";

test("gpt-5.4 defaults non-mechanical agents to at least medium", () => {
  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
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
});

test("project defaults raise delegated effort without downgrading stronger existing effort", () => {
  assert.equal(
    resolveDesiredEffort({
      providerId: "openai",
      modelId: "gpt-5.4",
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
