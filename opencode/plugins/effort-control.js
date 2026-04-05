import {
  appendTraceEvent,
  findInheritedSessionEffort,
  getProjectDefaultEffort,
  readState,
  resolveDesiredEffort,
  stateFilePath,
  traceFilePath
} from "./effort-control/state.js";

function unwrapSdkResult(result) {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  return result.data ?? result;
}

export const EffortControlPlugin = async ({ client, worktree, directory }) => {
  const sessionParentCache = new Map();

  async function getParentSessionId(sessionId) {
    if (!sessionId) {
      return undefined;
    }
    if (sessionParentCache.has(sessionId)) {
      return sessionParentCache.get(sessionId);
    }

    try {
      const session = unwrapSdkResult(await client.session.get({ path: { id: sessionId } }));
      const parentId = typeof session?.parentID === "string" ? session.parentID : undefined;
      sessionParentCache.set(sessionId, parentId);
      return parentId;
    } catch {
      sessionParentCache.set(sessionId, undefined);
      return undefined;
    }
  }

  return {
    "chat.params": async (input, output) => {
      const projectRoot = worktree || directory || process.cwd();
      const store = await readState(projectRoot);
      const inherited = await findInheritedSessionEffort({
        sessionId: input.sessionID,
        store,
        getParentSessionId
      });
      const projectEffort = getProjectDefaultEffort(store);

      const desiredEffort = resolveDesiredEffort({
        providerId: input.model?.providerID,
        modelId: input.model?.id,
        agent: input.agent,
        sessionEffort: inherited?.effort,
        projectEffort,
        existingEffort: output.options?.reasoningEffort
      });

      if (!desiredEffort) {
        return;
      }

      if (!output.options || typeof output.options !== "object") {
        output.options = {};
      }

      if (output.options.reasoningEffort === desiredEffort) {
        return;
      }

      const priorEffort = output.options.reasoningEffort;
      output.options.reasoningEffort = desiredEffort;

      const source = inherited?.effort
        ? "session_override"
        : projectEffort
          ? "project_default"
          : "gpt54_medium_floor";

      await appendTraceEvent(projectRoot, {
        session_id: input.sessionID,
        source_session_id: inherited?.sessionId,
        inherited: Boolean(inherited?.sessionId && inherited.sessionId !== input.sessionID),
        source,
        effort: desiredEffort,
        existing_effort: priorEffort,
        project_default_effort: projectEffort,
        agent: input.agent,
        model_id: input.model?.id,
        provider_id: input.model?.providerID,
        state_file: stateFilePath(projectRoot),
        trace_file: traceFilePath(projectRoot)
      }).catch(() => undefined);

      await client.app
        .log({
          body: {
            service: "effort-control",
            level: "debug",
            message: "Applied reasoning effort override",
            extra: {
              session_id: input.sessionID,
              source_session_id: inherited?.sessionId,
              inherited: Boolean(inherited?.sessionId && inherited.sessionId !== input.sessionID),
              source,
              effort: desiredEffort,
              project_default_effort: projectEffort,
              agent: input.agent,
              model_id: input.model?.id,
              provider_id: input.model?.providerID,
              state_file: stateFilePath(projectRoot),
              trace_file: traceFilePath(projectRoot)
            }
          }
        })
        .catch(() => undefined);
    }
  };
};

export const OpenCodeEffortControlPlugin = EffortControlPlugin;
export const server = EffortControlPlugin;
