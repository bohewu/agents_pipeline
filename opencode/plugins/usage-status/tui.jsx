/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_REFRESH_SECONDS = 300;
const ENABLED_KEY = "agents-pipeline.usage-status.enabled";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(pluginDir, "..", "..", "tools", "provider-usage.py");

function asBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInteger(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

function roundPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function summarizeCodex(result) {
  const codex = result?.codex;
  if (!codex || codex.status === "unavailable") {
    return "C --";
  }

  const accounts = Array.isArray(codex.accounts) ? codex.accounts : [];
  const account = accounts.find((item) => item?.status === "ok") || accounts[0];
  if (!account || account.status !== "ok") {
    return "C --";
  }

  const limits = Array.isArray(account.limits) ? account.limits : [];
  const fiveHour = limits.find((item) => item?.windowMinutes === 300 || item?.name === "5h limit");
  const weekly = limits.find((item) => item?.windowMinutes === 10080 || item?.name === "Weekly limit");

  const parts = ["C"];
  const fiveHourPercent = roundPercent(fiveHour?.leftPercent);
  const weeklyPercent = roundPercent(weekly?.leftPercent);
  if (fiveHourPercent !== undefined) {
    parts.push(`5h ${fiveHourPercent}%`);
  }
  if (weeklyPercent !== undefined) {
    parts.push(`W ${weeklyPercent}%`);
  }

  return parts.length > 1 ? parts.join(" ") : "C --";
}

function summarizeCopilot(result) {
  const copilot = result?.copilot;
  if (!copilot || copilot.status !== "ok") {
    return "GH --";
  }

  if (copilot.source === "github-internal-user") {
    const quotas = Array.isArray(copilot.quotas) ? copilot.quotas : [];
    const premium = quotas.find((item) => item?.quotaId === "premium_interactions");
    if (!premium) {
      return "GH --";
    }
    if (premium.unlimited) {
      return "GH unlimited";
    }

    const remaining = premium.remaining;
    const entitlement = premium.entitlement;
    if (typeof remaining === "number" && typeof entitlement === "number") {
      return `GH ${Math.round(remaining)}/${Math.round(entitlement)}`;
    }
    const percentRemaining = roundPercent(premium.percentRemaining);
    return percentRemaining !== undefined ? `GH ${percentRemaining}%` : "GH --";
  }

  if (typeof copilot.remaining === "number" && typeof copilot.monthlyQuota === "number") {
    return `GH ${Math.round(copilot.remaining)}/${Math.round(copilot.monthlyQuota)}`;
  }

  return "GH --";
}

function buildSummary(result, options) {
  const parts = [];
  if (options.showCodex) {
    parts.push(summarizeCodex(result));
  }
  if (options.showCopilot) {
    parts.push(summarizeCopilot(result));
  }
  return parts.filter(Boolean).join(" | ") || "Usage unavailable";
}

async function runUsageHelper(projectRoot) {
  const proc = Bun.spawn(
    [
      "python",
      helperPath,
      "--provider",
      "auto",
      "--format",
      "json",
      "--project-root",
      projectRoot,
    ],
    {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `usage helper failed with exit code ${exitCode}`);
  }

  return JSON.parse(stdout);
}

export async function createUsageStatusTuiPlugin(api, options = {}) {
  if (!api || !api.kv || !api.command || !api.slots || !api.lifecycle || !api.state) {
    return;
  }

  const resolved = {
    enabled: asBoolean(options.enabled, false),
    refreshSeconds: asPositiveInteger(options.refreshSeconds, DEFAULT_REFRESH_SECONDS),
    showCodex: asBoolean(options.showCodex, true),
    showCopilot: asBoolean(options.showCopilot, true),
  };

  const initialEnabled = api.kv.get(ENABLED_KEY, resolved.enabled);
  const [enabled, setEnabled] = createSignal(Boolean(initialEnabled));
  const [summary, setSummary] = createSignal("Usage loading...");
  let intervalId;

  const projectRoot = api.state.path.worktree || api.state.path.directory || process.cwd();

  async function refresh(showToast = false) {
    if (!enabled()) {
      return;
    }

    try {
      const result = await runUsageHelper(projectRoot);
      const nextSummary = buildSummary(result, resolved);
      setSummary(nextSummary);
      if (showToast) {
        api.ui.toast({
          title: "Usage status refreshed",
          message: nextSummary,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSummary("Usage unavailable");
      if (showToast) {
        api.ui.toast({
          title: "Usage status failed",
          message,
        });
      }
    }
  }

  function stopPolling() {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  }

  function startPolling() {
    stopPolling();
    void refresh(false);
    intervalId = setInterval(() => {
      void refresh(false);
    }, resolved.refreshSeconds * 1000);
  }

  function updateEnabled(nextEnabled, showToast = true) {
    setEnabled(nextEnabled);
    api.kv.set(ENABLED_KEY, nextEnabled);
    if (nextEnabled) {
      startPolling();
      if (showToast) {
        api.ui.toast({
          title: "Usage status enabled",
          message: "The footer will keep Codex and Copilot quotas refreshed.",
        });
      }
      return;
    }

    stopPolling();
    if (showToast) {
      api.ui.toast({
        title: "Usage status disabled",
        message: "The footer usage summary is now hidden.",
      });
    }
  }

  if (enabled()) {
    startPolling();
  }

  api.lifecycle.onDispose(() => {
    stopPolling();
  });

  api.command.register(() => [
    {
      title: enabled() ? "Disable Usage Status Footer" : "Enable Usage Status Footer",
      value: "usage-status:toggle",
      description: "Toggle the Codex/Copilot usage footer.",
      category: "Usage",
      suggested: true,
      slash: {
        name: "usage-status",
      },
      onSelect: () => updateEnabled(!enabled()),
    },
    {
      title: "Enable Usage Status Footer",
      value: "usage-status:on",
      description: "Show the Codex/Copilot usage footer.",
      category: "Usage",
      hidden: enabled(),
      slash: {
        name: "usage-status-on",
        aliases: ["usage-status-enable"],
      },
      onSelect: () => updateEnabled(true),
    },
    {
      title: "Disable Usage Status Footer",
      value: "usage-status:off",
      description: "Hide the Codex/Copilot usage footer.",
      category: "Usage",
      hidden: !enabled(),
      slash: {
        name: "usage-status-off",
        aliases: ["usage-status-disable"],
      },
      onSelect: () => updateEnabled(false),
    },
    {
      title: "Refresh Usage Status",
      value: "usage-status:refresh",
      description: "Refresh the footer quota summary now.",
      category: "Usage",
      slash: {
        name: "usage-status-refresh",
      },
      onSelect: () => {
        void refresh(true);
      },
    },
  ]);

  api.slots.register({
    id: "agents-pipeline-usage-status",
    order: 100,
    slots: {
      home_bottom: () =>
        enabled() ? (
          <box paddingLeft={1} paddingRight={1}>
            <text>{summary()}</text>
          </box>
        ) : null,
      sidebar_footer: () =>
        enabled() ? (
          <box paddingLeft={1} paddingRight={1}>
            <text>{summary()}</text>
          </box>
        ) : null,
    },
  });
}
