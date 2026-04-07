/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_REFRESH_SECONDS = 300;
const ENABLED_KEY = "agents-pipeline.usage-status.enabled";
const MODE_KEY = "agents-pipeline.usage-status.mode";
const FILTER_KEY = "agents-pipeline.usage-status.filter";
const SUMMARY_KEY = "agents-pipeline.usage-status.last-summary";
const SESSION_TOKENS_KEY = "agents-pipeline.usage-status.session-tokens";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(pluginDir, "..", "..", "tools", "provider-usage.py");
const accountHelperPath = path.join(pluginDir, "..", "..", "tools", "codex-account.py");
const sessionTokenHelperPath = path.join(pluginDir, "..", "..", "tools", "session-token-usage.py");

function resolvePythonCommand() {
  const candidates = [["python3"], ["python"], ["py", "-3"], ["py"]];
  for (const candidate of candidates) {
    try {
      if (process.platform === "win32") {
        const probe = Bun.spawnSync(["cmd.exe", "/d", "/c", ...candidate, "--version"], {
          stdio: ["ignore", "ignore", "ignore"]
        });
        if (probe.exitCode === 0) {
          return ["cmd.exe", "/d", "/c", ...candidate];
        }
        continue;
      }
      const probe = Bun.spawnSync([...candidate, "--version"], { stdio: ["ignore", "ignore", "ignore"] });
      if (probe.exitCode === 0) {
        return candidate;
      }
    } catch {}
  }
  throw new Error("Missing Python interpreter: install python3, python, or the Windows py launcher.");
}

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

function asMode(value, fallback = "short") {
  return value === "detail" || value === "short" ? value : fallback;
}

function asFilter(value, fallback = "all") {
  return value === "all" || value === "codex" || value === "copilot" ? value : fallback;
}

function filterFromFlags(showCodex, showCopilot) {
  if (showCodex && showCopilot) {
    return "all";
  }
  if (showCodex) {
    return "codex";
  }
  if (showCopilot) {
    return "copilot";
  }
  return "all";
}

function visibilityFromFilter(filter) {
  return {
    showCodex: filter !== "copilot",
    showCopilot: filter !== "codex",
  };
}

function roundPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function parseUtcDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatResetClock(resetAtMs) {
  if (typeof resetAtMs !== "number" || !Number.isFinite(resetAtMs) || resetAtMs <= 0) {
    return undefined;
  }
  const parsed = new Date(resetAtMs);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString().slice(11, 16);
}

function formatResetDay(resetAtMs) {
  if (typeof resetAtMs !== "number" || !Number.isFinite(resetAtMs) || resetAtMs <= 0) {
    return undefined;
  }
  const parsed = new Date(resetAtMs);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toUTCString().slice(0, 3);
}

function formatMonthDay(value) {
  const parsed = parseUtcDate(value);
  if (!parsed) {
    return undefined;
  }
  return parsed.toISOString().slice(5, 10);
}

function sectionIsStale(section) {
  return Boolean(section?._meta?.stale);
}

function formatLocalReset(value) {
  const parsed = typeof value === "number" ? new Date(value) : parseUtcDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  const date = parsed.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

function metric(label, percent, detail, reset) {
  return {
    label,
    percent: typeof percent === "number" && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
    detail,
    reset,
  };
}

function metricTone(api, percent) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return api.theme.current.textMuted;
  }
  if (percent <= 15) {
    return api.theme.current.error ?? api.theme.current.primary;
  }
  if (percent <= 40) {
    return api.theme.current.warning ?? api.theme.current.primary;
  }
  if (percent >= 70) {
    return api.theme.current.success ?? api.theme.current.primary;
  }
  return api.theme.current.text;
}

function summarizeCodex(result, mode) {
  const codex = result?.codex;
  if (!codex || codex.status === "unavailable") {
    return "C n/a";
  }

  const accounts = Array.isArray(codex.accounts) ? codex.accounts : [];
  const account = accounts.find((item) => item?.status === "ok") || accounts[0];
  if (!account || account.status !== "ok") {
    return "C err";
  }

  const limits = Array.isArray(account.limits) ? account.limits : [];
  const fiveHour = limits.find((item) => item?.windowMinutes === 300 || item?.name === "5h limit");
  const weekly = limits.find((item) => item?.windowMinutes === 10080 || item?.name === "Weekly limit");

  const parts = ["C"];
  const fiveHourPercent = roundPercent(fiveHour?.leftPercent);
  const weeklyPercent = roundPercent(weekly?.leftPercent);
  if (fiveHourPercent !== undefined) {
    parts.push(`5h${fiveHourPercent}`);
  }
  if (weeklyPercent !== undefined) {
    parts.push(`W${weeklyPercent}`);
  }

  return parts.length > 1 ? parts.join(" ") : "C n/a";
}

function summarizeCopilot(result, mode) {
  const copilot = result?.copilot;
  if (!copilot || copilot.status !== "ok") {
    return "GH n/a";
  }

  if (copilot.source === "github-internal-user") {
    const quotas = Array.isArray(copilot.quotas) ? copilot.quotas : [];
    const premium = quotas.find((item) => item?.quotaId === "premium_interactions");
    if (!premium) {
      return "GH n/a";
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
    return percentRemaining !== undefined ? `GH ${percentRemaining}%` : "GH n/a";
  }

  if (typeof copilot.remaining === "number" && typeof copilot.monthlyQuota === "number") {
    return `GH ${Math.round(copilot.remaining)}/${Math.round(copilot.monthlyQuota)}`;
  }

  return "GH n/a";
}

function buildSummary(result, options, mode) {
  const parts = [];
  let stale = false;
  if (options.showCodex) {
    parts.push(summarizeCodex(result, mode));
    stale = stale || sectionIsStale(result?.codex);
  }
  if (options.showCopilot) {
    parts.push(summarizeCopilot(result, mode));
    stale = stale || sectionIsStale(result?.copilot);
  }
  const text = parts.filter(Boolean).join(" | ") || "Usage n/a";
  return stale ? `~ ${text}` : text;
}

function firstCodexAccount(result) {
  const codex = result?.codex;
  const accounts = Array.isArray(codex?.accounts) ? codex.accounts : [];
  return accounts.find((item) => item?.status === "ok") || accounts[0];
}

function codexCard(result, mode) {
  const codex = result?.codex;
  const account = firstCodexAccount(result);
  if (!codex || codex.status === "unavailable") {
    return {
      title: "Codex",
      subtitle: "OAuth unavailable",
      value: "Connect Codex auth",
      metrics: [],
      muted: true,
      stale: false,
    };
  }
  if (!account || account.status !== "ok") {
    return {
      title: "Codex",
      subtitle: account?.planType || account?.source || "lookup failed",
      value: "Usage unavailable",
      metrics: [],
      muted: true,
      stale: sectionIsStale(codex),
    };
  }

  const limits = Array.isArray(account.limits) ? account.limits : [];
  const fiveHour = limits.find((item) => item?.windowMinutes === 300 || item?.name === "5h limit");
  const weekly = limits.find((item) => item?.windowMinutes === 10080 || item?.name === "Weekly limit");
  const pieces = [];
  const fiveHourPercent = roundPercent(fiveHour?.leftPercent);
  const weeklyPercent = roundPercent(weekly?.leftPercent);
  if (fiveHourPercent !== undefined) {
    pieces.push(`5h ${fiveHourPercent}%`);
  }
  if (weeklyPercent !== undefined) {
    pieces.push(`Week ${weeklyPercent}%`);
  }

  return {
    title: "Codex",
    subtitle: account.planType || account.source || "quota windows",
    value: pieces.join("  ") || "Usage unavailable",
    metrics: [
      metric("5h", fiveHourPercent, fiveHourPercent !== undefined ? `${fiveHourPercent}% left` : "n/a", formatLocalReset(fiveHour?.resetAtMs)),
      metric("Week", weeklyPercent, weeklyPercent !== undefined ? `${weeklyPercent}% left` : "n/a", formatLocalReset(weekly?.resetAtMs)),
    ],
    muted: false,
    stale: sectionIsStale(codex),
  };
}

function copilotCard(result, mode) {
  const copilot = result?.copilot;
  if (!copilot || copilot.status !== "ok") {
    return {
      title: "Copilot",
      subtitle: "GitHub auth unavailable",
      value: "Premium usage unavailable",
      metrics: [],
      muted: true,
      stale: false,
    };
  }

  if (copilot.source === "github-internal-user") {
    const quotas = Array.isArray(copilot.quotas) ? copilot.quotas : [];
    const premium = quotas.find((item) => item?.quotaId === "premium_interactions");
    if (!premium) {
      return {
        title: "Copilot",
        subtitle: copilot.accessTypeSku || copilot.copilotPlan || "premium usage",
        value: "Premium usage unavailable",
        metrics: [],
        muted: true,
        stale: sectionIsStale(copilot),
      };
    }

    let value = "Unlimited";
    if (!premium.unlimited) {
      if (typeof premium.remaining === "number" && typeof premium.entitlement === "number") {
        value = `${Math.round(premium.remaining)}/${Math.round(premium.entitlement)} left`;
      } else {
        const percent = roundPercent(premium.percentRemaining);
        value = percent !== undefined ? `${percent}% left` : "Usage available";
      }
    }

    return {
      title: "Copilot",
      subtitle: copilot.accessTypeSku || copilot.copilotPlan || "premium requests",
      value,
      metrics: [
        metric(
          "Premium",
          roundPercent(premium.percentRemaining),
          typeof premium.remaining === "number" && typeof premium.entitlement === "number"
            ? `${Math.round(premium.remaining)}/${Math.round(premium.entitlement)} left`
            : value,
          formatLocalReset(copilot.resetAt),
        ),
      ],
      muted: false,
      stale: sectionIsStale(copilot),
    };
  }

  if (typeof copilot.remaining === "number" && typeof copilot.monthlyQuota === "number") {
    return {
      title: "Copilot",
      subtitle: copilot.month || "report",
      value: `${Math.round(copilot.remaining)}/${Math.round(copilot.monthlyQuota)} left`,
      metrics: [
        metric(
          "Premium",
          typeof copilot.remaining === "number" && typeof copilot.monthlyQuota === "number" && copilot.monthlyQuota > 0
            ? Math.round((copilot.remaining / copilot.monthlyQuota) * 100)
            : undefined,
          `${Math.round(copilot.remaining)}/${Math.round(copilot.monthlyQuota)} left`,
          formatLocalReset(copilot.resetAt),
        ),
      ],
      muted: false,
      stale: sectionIsStale(copilot),
    };
  }

  return {
    title: "Copilot",
    subtitle: copilot.source || "usage",
    value: "Usage unavailable",
    metrics: [],
    muted: true,
    stale: sectionIsStale(copilot),
  };
}

function cardBadge(result, mode) {
  const stale = sectionIsStale(result?.codex) || sectionIsStale(result?.copilot);
  if (stale) {
    return "cached";
  }
  return mode === "detail" ? "detail" : "short";
}

async function runJsonHelper(projectRoot, scriptPath, args) {
  const pythonBin = resolvePythonCommand();
  const proc = Bun.spawn(
    [
      ...pythonBin,
      scriptPath,
      ...args,
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

async function runUsageHelper(projectRoot) {
  return runJsonHelper(projectRoot, helperPath, ["--provider", "auto", "--format", "json", "--project-root", projectRoot]);
}

export async function createUsageStatusTuiPlugin(api, options = {}) {
  if (!api || !api.kv || !api.command || !api.slots || !api.lifecycle || !api.state) {
    return;
  }

  const resolved = {
    enabled: asBoolean(options.enabled, false),
    refreshSeconds: asPositiveInteger(options.refreshSeconds, DEFAULT_REFRESH_SECONDS),
    defaultFilter: filterFromFlags(asBoolean(options.showCodex, true), asBoolean(options.showCopilot, true)),
    mode: asMode(options.mode, "short"),
  };

  const initialEnabled = api.kv.get(ENABLED_KEY, resolved.enabled);
  const initialMode = asMode(api.kv.get(MODE_KEY, resolved.mode), resolved.mode);
  const initialFilter = asFilter(api.kv.get(FILTER_KEY, resolved.defaultFilter), resolved.defaultFilter);
  const cachedSummary = api.kv.get(SUMMARY_KEY, "");
  const [enabled, setEnabled] = createSignal(Boolean(initialEnabled));
  const [mode, setMode] = createSignal(initialMode);
  const [filter, setFilter] = createSignal(initialFilter);
  const [summary, setSummary] = createSignal(cachedSummary ? `~ ${cachedSummary}` : "Usage sync...");
  const [lastResult, setLastResult] = createSignal(null);
  let intervalId;

  const projectRoot = api.state.path.worktree || api.state.path.directory || process.cwd();

  function displayOptions(nextFilter = filter()) {
    return visibilityFromFilter(nextFilter);
  }

  async function refresh(showToast = false) {
    if (!enabled()) {
      return;
    }

    try {
      const result = await runUsageHelper(projectRoot);
      setLastResult(result);
      const nextSummary = buildSummary(result, displayOptions(), mode());
      setSummary(nextSummary);
      if (!nextSummary.startsWith("~ ")) {
        api.kv.set(SUMMARY_KEY, nextSummary);
      }
      if (showToast) {
        api.ui.toast({
          title: "Usage status refreshed",
          message: nextSummary,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const staleSummary = api.kv.get(SUMMARY_KEY, "");
      setSummary(staleSummary ? `~ ${staleSummary}` : "Usage n/a");
      if (showToast) {
        api.ui.toast({
          title: "Usage status failed",
          message,
        });
      }
    }
  }

  async function rotateCodexAccount() {
    try {
      const result = await runJsonHelper(projectRoot, accountHelperPath, [
        "--action",
        "next",
        "--format",
        "json",
        "--project-root",
        projectRoot,
      ]);
      if (enabled()) {
        await refresh(false);
      }
      const accountLabel = result?.selected?.email || result?.selected?.label || "updated";
      const note = typeof result?.note === "string" && result.note ? ` ${result.note}` : "";
      api.ui.toast({
        title: result?.changed ? "Codex account rotated" : "Codex account unchanged",
        message: `Active Codex account: ${accountLabel}.${note}`,
        variant: result?.changed ? "success" : "info",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      api.ui.toast({
        title: "Codex account rotation failed",
        message,
        variant: "error",
      });
    }
  }

  async function inspectSessionTokens() {
    try {
      const result = await runJsonHelper(projectRoot, sessionTokenHelperPath, [
        "--format",
        "json",
        "--project-root",
        projectRoot,
      ]);
      api.kv.set(SESSION_TOKENS_KEY, result);
      const threadName = result?.thread_name ? ` (${result.thread_name})` : "";
      const summary = result?.summary || {};
      api.ui.toast({
        title: "Session tokens (POC)",
        message: `Total ${summary.total_tokens ?? "n/a"}${threadName}; uncached input ${summary.uncached_input_tokens ?? "n/a"}, cached input ${summary.cached_input_tokens ?? "n/a"}, output ${summary.output_tokens ?? "n/a"}. No subagent attribution yet.`,
        variant: "info",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      api.ui.toast({
        title: "Session tokens unavailable",
        message,
        variant: "error",
      });
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
          message: "The usage panel will keep Codex and Copilot quotas refreshed.",
        });
      }
      return;
    }

    stopPolling();
      if (showToast) {
        api.ui.toast({
          title: "Usage status disabled",
          message: "The usage panel is now hidden.",
        });
      }
  }

  function updateMode(nextMode, showToast = true) {
    const resolvedMode = asMode(nextMode, mode());
    setMode(resolvedMode);
    api.kv.set(MODE_KEY, resolvedMode);
    const snapshot = lastResult();
    if (snapshot) {
      const nextSummary = buildSummary(snapshot, displayOptions(), resolvedMode);
      setSummary(nextSummary);
      if (!nextSummary.startsWith("~ ")) {
        api.kv.set(SUMMARY_KEY, nextSummary);
      }
    }
    void refresh(false);
    if (showToast) {
      api.ui.toast({
        title: "Usage status mode updated",
        message: `Usage mode is now ${resolvedMode}.`,
      });
    }
  }

  function updateFilter(nextFilter, showToast = true) {
    const resolvedFilter = asFilter(nextFilter, filter());
    setFilter(resolvedFilter);
    api.kv.set(FILTER_KEY, resolvedFilter);
    const snapshot = lastResult();
    if (snapshot) {
      const nextSummary = buildSummary(snapshot, displayOptions(resolvedFilter), mode());
      setSummary(nextSummary);
      if (!nextSummary.startsWith("~ ")) {
        api.kv.set(SUMMARY_KEY, nextSummary);
      }
    }
    void refresh(false);
    if (showToast) {
      api.ui.toast({
        title: "Usage status scope updated",
        message: `Showing ${resolvedFilter}.`,
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
      title: enabled() ? "Disable Usage Status UI" : "Enable Usage Status UI",
      value: "usage-status:toggle",
      description: "Toggle the Codex/Copilot usage UI.",
      category: "Usage",
      suggested: true,
      slash: {
        name: "usage-status",
      },
      onSelect: () => updateEnabled(!enabled()),
    },
    {
      title: "Enable Usage Status UI",
      value: "usage-status:on",
      description: "Show the Codex/Copilot usage UI.",
      category: "Usage",
      hidden: enabled(),
      slash: {
        name: "usage-status-on",
        aliases: ["usage-status-enable"],
      },
      onSelect: () => updateEnabled(true),
    },
    {
      title: "Disable Usage Status UI",
      value: "usage-status:off",
      description: "Hide the Codex/Copilot usage UI.",
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
      description: "Refresh the usage summary now.",
      category: "Usage",
      slash: {
        name: "usage-status-refresh",
      },
      onSelect: () => {
        void refresh(true);
      },
    },
    {
      title: "Rotate To Next Codex Account",
      value: "usage-status:codex-next",
      description: "Rotate to the next local Codex account without using a model.",
      category: "Usage",
      slash: {
        name: "next-codex-account",
      },
      onSelect: () => {
        void rotateCodexAccount();
      },
    },
    {
      title: "Inspect Session Tokens (POC)",
      value: "usage-status:session-tokens",
      description: "Read the current worktree's latest Codex rollout token counts without using a model.",
      category: "Usage",
      slash: {
        name: "session-tokens",
        aliases: ["session-token-usage"],
      },
      onSelect: () => {
        void inspectSessionTokens();
      },
    },
    {
      title: mode() === "detail" ? "Use Short Usage Mode" : "Use Detailed Usage Mode",
      value: "usage-status:mode",
      description: "Toggle usage UI between short and detailed modes.",
      category: "Usage",
      slash: {
        name: "usage-status-mode",
      },
      onSelect: () => updateMode(mode() === "detail" ? "short" : "detail"),
    },
    {
      title: "Use Short Usage Mode",
      value: "usage-status:mode-short",
      description: "Show compact usage summary text.",
      category: "Usage",
      hidden: mode() === "short",
      slash: {
        name: "usage-status-short",
      },
      onSelect: () => updateMode("short"),
    },
    {
      title: "Use Detailed Usage Mode",
      value: "usage-status:mode-detail",
      description: "Show the detailed usage sidebar card.",
      category: "Usage",
      hidden: mode() === "detail",
      slash: {
        name: "usage-status-detail",
      },
      onSelect: () => updateMode("detail"),
    },
    {
      title: "Show All Usage Providers",
      value: "usage-status:filter-all",
      description: "Show both Codex and Copilot usage.",
      category: "Usage",
      hidden: filter() === "all",
      slash: {
        name: "usage-status-all",
      },
      onSelect: () => updateFilter("all"),
    },
    {
      title: "Show Codex Usage Only",
      value: "usage-status:filter-codex",
      description: "Show only Codex usage.",
      category: "Usage",
      hidden: filter() === "codex",
      slash: {
        name: "usage-status-codex",
      },
      onSelect: () => updateFilter("codex"),
    },
    {
      title: "Show Copilot Usage Only",
      value: "usage-status:filter-copilot",
      description: "Show only Copilot usage.",
      category: "Usage",
      hidden: filter() === "copilot",
      slash: {
        name: "usage-status-copilot",
      },
      onSelect: () => updateFilter("copilot"),
    },
  ]);

  api.slots.register({
    id: "agents-pipeline-usage-status",
    order: 40,
    slots: {
      home_bottom: () =>
        enabled() ? (
          <box paddingLeft={1} paddingRight={1}>
            <text>{summary()}</text>
          </box>
        ) : null,
      sidebar_content: () =>
        enabled() ? (
          (() => {
            const result = lastResult();
            const options = displayOptions();
            const codex = codexCard(result, mode());
            const copilot = copilotCard(result, mode());
            const panelBackground = api.theme.current.backgroundPanel ?? api.theme.current.backgroundElement;
            const chipBackground = api.theme.current.backgroundElement ?? panelBackground;
            const muted = api.theme.current.textMuted;
            const text = api.theme.current.text;
            const border = api.theme.current.border;
            const accent = api.theme.current.primary;
            const badge = cardBadge(result, mode());

            if (mode() === "short" || !result) {
              return (
                <box
                  border
                  borderColor={border}
                  backgroundColor={panelBackground}
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={2}
                  paddingRight={2}
                  flexDirection="column"
                  gap={1}
                >
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={accent}>
                      <b>Usage</b>
                    </text>
                    <text fg={muted}>{filter()}</text>
                  </box>
                  <text fg={text}>{summary()}</text>
                </box>
              );
            }

            return (
              <box
                border
                borderColor={border}
                backgroundColor={panelBackground}
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="column"
                gap={1}
              >
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={accent}>
                    <b>Usage</b>
                  </text>
                  <text fg={muted}>{badge} / {filter()}</text>
                </box>
                {options.showCodex ? (
                  <box
                    backgroundColor={chipBackground}
                    paddingTop={1}
                    paddingBottom={1}
                    paddingLeft={1}
                    paddingRight={1}
                    flexDirection="column"
                  >
                    <box flexDirection="row" justifyContent="space-between">
                      <text fg={text}>
                        <b>{codex.title}</b>
                      </text>
                      {codex.stale ? <text fg={muted}>cached</text> : null}
                    </box>
                    <text fg={muted}>{codex.subtitle}</text>
                    {codex.metrics.length > 0 ? (
                      codex.metrics.map((entry) => (
                        <box flexDirection="column" gap={0}>
                          <box flexDirection="row" justifyContent="space-between">
                            <text fg={text}>{entry.label}</text>
                            <text fg={metricTone(api, entry.percent)}>{entry.detail}</text>
                          </box>
                          {entry.reset ? <text fg={muted}>reset {entry.reset}</text> : null}
                        </box>
                      ))
                    ) : (
                      <text fg={codex.muted ? muted : text}>{codex.value}</text>
                    )}
                  </box>
                ) : null}
                {options.showCopilot ? (
                  <box
                    backgroundColor={chipBackground}
                    paddingTop={1}
                    paddingBottom={1}
                    paddingLeft={1}
                    paddingRight={1}
                    flexDirection="column"
                  >
                    <box flexDirection="row" justifyContent="space-between">
                      <text fg={text}>
                        <b>{copilot.title}</b>
                      </text>
                      {copilot.stale ? <text fg={muted}>cached</text> : null}
                    </box>
                    <text fg={muted}>{copilot.subtitle}</text>
                    {copilot.metrics.length > 0 ? (
                      copilot.metrics.map((entry) => (
                        <box flexDirection="column" gap={0}>
                          <box flexDirection="row" justifyContent="space-between">
                            <text fg={text}>{entry.label}</text>
                            <text fg={metricTone(api, entry.percent)}>{entry.detail}</text>
                          </box>
                          {entry.reset ? <text fg={muted}>reset {entry.reset}</text> : null}
                        </box>
                      ))
                    ) : (
                      <text fg={copilot.muted ? muted : text}>{copilot.value}</text>
                    )}
                  </box>
                ) : null}
              </box>
            );
          })()
        ) : null,
    },
  });
}
