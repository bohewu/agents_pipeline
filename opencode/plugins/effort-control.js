import {
  appendTraceEvent,
  findInheritedSessionEffort,
  getProjectDefaultEffort,
  readState,
  resolveDesiredEffort,
  stateFilePath,
  traceFilePath
} from "./effort-control/state.js";

const CONTEXT_AWARE_COMMANDS = new Set([
  "run-modernize",
  "modernize",
  "run-pipeline",
  "pipeline"
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCommandName(command) {
  if (typeof command !== "string") {
    return undefined;
  }
  const normalized = command.trim().toLowerCase().replace(/^\//, "");
  return normalized || undefined;
}

function hasStandaloneFlag(text, flag) {
  if (typeof text !== "string" || !text) {
    return false;
  }
  return new RegExp(`(^|\\s)${escapeRegExp(flag)}(?=\\s|$)`).test(text);
}

function extractCommandEffortContext(command, argumentsText) {
  const normalizedCommand = normalizeCommandName(command);
  if (!normalizedCommand || !CONTEXT_AWARE_COMMANDS.has(normalizedCommand)) {
    return undefined;
  }

  const args = typeof argumentsText === "string" ? argumentsText : "";
  const dryRun = hasStandaloneFlag(args, "--dry");
  const decisionOnly = hasStandaloneFlag(args, "--decision-only");

  if ((normalizedCommand === "run-pipeline" || normalizedCommand === "pipeline") && (dryRun || decisionOnly)) {
    return { command: normalizedCommand, dryRun, decisionOnly };
  }

  if ((normalizedCommand === "run-modernize" || normalizedCommand === "modernize") && decisionOnly) {
    return { command: normalizedCommand, dryRun: false, decisionOnly: true };
  }

  return undefined;
}

function extractMessageEffortContext(messageText) {
  if (typeof messageText !== "string") {
    return undefined;
  }

  const trimmed = messageText.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const firstSpace = trimmed.indexOf(" ");
  const command = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const argumentsText = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1);
  return extractCommandEffortContext(command, argumentsText);
}

function extractUserMessageText(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string" && !part.ignored)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function shouldSuppressBaselineForContext(context) {
  return Boolean(context?.dryRun || context?.decisionOnly);
}

function unwrapSdkResult(result) {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  return result.data ?? result;
}

export const EffortControlPlugin = async ({ client, worktree, directory }) => {
  const sessionParentCache = new Map();
  const sessionContextCache = new Map();

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

  async function findInheritedSessionContext(sessionId, maxDepth = 12) {
    const visited = new Set();
    let currentId = sessionId;

    for (let depth = 0; depth < maxDepth && currentId; depth += 1) {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      if (sessionContextCache.has(currentId)) {
        return sessionContextCache.get(currentId);
      }

      currentId = await getParentSessionId(currentId);
    }

    return undefined;
  }

  return {
    "chat.message": async (input, output) => {
      const context = extractMessageEffortContext(extractUserMessageText(output.parts));
      if (context) {
        sessionContextCache.set(input.sessionID, context);
        return;
      }
      sessionContextCache.delete(input.sessionID);
    },
    "command.execute.before": async (input) => {
      const context = extractCommandEffortContext(input.command, input.arguments);
      if (context) {
        sessionContextCache.set(input.sessionID, context);
        return;
      }
      sessionContextCache.delete(input.sessionID);
    },
    "chat.params": async (input, output) => {
      const projectRoot = worktree || directory || process.cwd();
      const store = await readState(projectRoot);
      const inherited = await findInheritedSessionEffort({
        sessionId: input.sessionID,
        store,
        getParentSessionId
      });
      const projectEffort = getProjectDefaultEffort(store);
      const context = await findInheritedSessionContext(input.sessionID);

      const desiredEffort = resolveDesiredEffort({
        providerId: input.model?.providerID,
        modelId: input.model?.id,
        agent: input.agent,
        sessionEffort: inherited?.effort,
        projectEffort,
        existingEffort: output.options?.reasoningEffort,
        suppressBaseline: shouldSuppressBaselineForContext(context)
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
          : "gpt5_medium_floor";

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
export {
  extractCommandEffortContext,
  extractMessageEffortContext,
  shouldSuppressBaselineForContext
};
