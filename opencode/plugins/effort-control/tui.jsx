/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js";
import {
  clearProjectDefaultEffort,
  clearSessionEffort,
  getProjectDefaultEffort,
  normalizeEffort,
  readState,
  setProjectDefaultEffort,
  setSessionEffort
} from "./state.js";

function currentRoute(api) {
  return typeof api?.route?.current === "function" ? api.route.current() : api?.route?.current;
}

function activeSessionId(api) {
  const route = currentRoute(api);
  return route?.name === "session" && typeof route?.params?.sessionID === "string"
    ? route.params.sessionID
    : undefined;
}

function projectRoot(api) {
  return api?.state?.path?.worktree || api?.state?.path?.directory || process.cwd();
}

async function readCurrentSelection(api) {
  const state = await readState(projectRoot(api));
  const sessionId = activeSessionId(api);
  const sessionEffort = sessionId ? normalizeEffort(state?.sessions?.[sessionId]?.effort) : undefined;
  if (sessionEffort) {
    return {
      scope: "session",
      effort: sessionEffort
    };
  }

  const projectEffort = getProjectDefaultEffort(state);
  if (projectEffort) {
    return {
      scope: "project",
      effort: projectEffort
    };
  }

  return undefined;
}

function toast(api, title, message, variant = "info") {
  api?.ui?.toast?.({ title, message, variant });
}

export async function createEffortControlTuiPlugin(api) {
  if (!api?.command || !api?.ui || !api?.state) {
    return;
  }

  const [currentSelection, setCurrentSelection] = createSignal(await readCurrentSelection(api));

  async function refreshSelection() {
    const next = await readCurrentSelection(api);
    setCurrentSelection(next);
    return next;
  }

  async function mutateEffort(nextEffort) {
    const sessionId = activeSessionId(api);
    const root = projectRoot(api);

    if (nextEffort) {
      if (sessionId) {
        await setSessionEffort(root, sessionId, nextEffort);
        await refreshSelection();
        toast(
          api,
          "Effort updated",
          `Session effort is now ${nextEffort}. Child sessions inherit it. OpenAI GPT-5 models also floor non-mechanical agents to medium by default.`,
          "success"
        );
      } else {
        await setProjectDefaultEffort(root, nextEffort);
        await refreshSelection();
        toast(
          api,
          "Project default updated",
          `Project default effort is now ${nextEffort}. New sessions and delegated child tasks inherit it unless a session override is set.`,
          "success"
        );
      }
      return;
    }

    if (sessionId) {
      await clearSessionEffort(root, sessionId);
      const next = await refreshSelection();
      toast(
        api,
        "Session effort cleared",
        next?.scope === "project"
          ? `Removed the explicit session override. Project default ${next.effort} is now active for this session.`
          : "Removed the explicit session override. OpenAI GPT-5 models still floor non-mechanical agents to medium.",
        "success"
      );
      return;
    }

    await clearProjectDefaultEffort(root);
    await refreshSelection();
    toast(
      api,
      "Project default cleared",
      "Removed the project default override. OpenAI GPT-5 models still floor non-mechanical agents to medium.",
      "success"
    );
  }

  async function showStatus() {
    const selection = await refreshSelection();
    const sessionId = activeSessionId(api);
    toast(
      api,
      "Effort status",
      selection?.scope === "session"
        ? `Explicit session effort: ${selection.effort}. Use /effort-clear to remove it for this session.`
        : selection?.scope === "project"
          ? sessionId
            ? `No explicit session override. Project default effort: ${selection.effort}.`
            : `Project default effort: ${selection.effort}. New sessions inherit it.`
          : "No explicit override. OpenAI GPT-5 models still floor non-mechanical agents to medium.",
      "info"
    );
  }

  function badgeLabel() {
    const selection = currentSelection();
    if (!selection) {
      return undefined;
    }
    return selection.scope === "session"
      ? `effort:${selection.effort}`
      : `project:${selection.effort}`;
  }

  api.command.register(() => [
    {
      title: `Reasoning Effort${currentSelection() ? ` (${currentSelection().scope}: ${currentSelection().effort})` : ""}`,
      value: "effort-control:status",
      description: "Show the current reasoning-effort override for this session or project.",
      category: "Reasoning",
      suggested: true,
      slash: {
        name: "effort"
      },
      onSelect: () => {
        void showStatus();
      }
    },
    {
      title: "Set Reasoning Effort Medium",
      value: "effort-control:set-medium",
      description: "Use medium reasoning for this session, or set the project default when no session is open.",
      category: "Reasoning",
      slash: {
        name: "effort-medium"
      },
      onSelect: () => {
        void mutateEffort("medium");
      }
    },
    {
      title: "Set Reasoning Effort High",
      value: "effort-control:set-high",
      description: "Use high reasoning for this session, or set the project default when no session is open.",
      category: "Reasoning",
      slash: {
        name: "effort-high"
      },
      onSelect: () => {
        void mutateEffort("high");
      }
    },
    {
      title: "Set Reasoning Effort XHigh",
      value: "effort-control:set-xhigh",
      description: "Use xhigh reasoning for this session, or set the project default when no session is open.",
      category: "Reasoning",
      slash: {
        name: "effort-max",
        aliases: ["effort-xhigh"]
      },
      onSelect: () => {
        void mutateEffort("xhigh");
      }
    },
    {
      title: "Clear Reasoning Effort Override",
      value: "effort-control:clear",
      description: "Remove the current session override or the project default override.",
      category: "Reasoning",
      hidden: !currentSelection(),
      slash: {
        name: "effort-clear",
        aliases: ["effort-reset"]
      },
      onSelect: () => {
        void mutateEffort(undefined);
      }
    }
  ]);

  api.slots?.register({
    id: "agents-pipeline-effort-control",
    order: 45,
    slots: {
      home_bottom: () =>
        badgeLabel() ? (
          <box paddingLeft={1} paddingRight={1}>
            <text fg={api.theme.current.info ?? api.theme.current.primary}>{badgeLabel()}</text>
          </box>
        ) : null,
      session_prompt_right: () =>
        badgeLabel() ? (
          <box paddingRight={1}>
            <text fg={api.theme.current.info ?? api.theme.current.primary}>{badgeLabel()}</text>
          </box>
        ) : null,
    }
  });
}
