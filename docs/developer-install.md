# Developer Install (Clone Repo)

Use this when you are modifying this repo, validating local changes, or you specifically want installers from your working tree instead of the latest release bundle.
Most users should use the published release bundle commands in `README.md` instead.

## Runtime Scope

- Codex is Tier 1 and the primary developer-install target. Start with [Codex roles from clone](#codex-roles-from-clone).
- Claude Code and GitHub Copilot are Tier 2 best-effort targets. Their exporters/installers receive smoke validation but do not promise Codex feature parity.
- OpenCode is deprecated and frozen. Use `v0.26.1` for user-facing OpenCode installs; current-tree OpenCode installers remain only for migration maintenance during v0.27.
- The reusable source still lives under `opencode/` temporarily. Those paths remain canonical until the coordinated v0.28 neutral-core move.

## OpenCode core from clone (deprecated)

Do not use the current working tree as a supported OpenCode distribution. These commands are retained for maintainers testing the v0.27 migration boundary; normal OpenCode users should install the frozen `v0.26.1` release.

Default target: `~/.config/opencode`

Behavior notes:

- Existing installed OpenCode files are backed up by default.
- The installer tracks the files it manages and removes stale managed files that were deleted from this repo on later installs.
- Unrelated user-created files under the target directory are left in place.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install.ps1
```

macOS/Linux:

```bash
bash scripts/install.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install.ps1 -DryRun` or `bash scripts/install.sh --dry-run`
- Custom target: `pwsh -NoProfile -File scripts/install.ps1 -Target C:\path\to\opencode-config` or `bash scripts/install.sh --target /path/to/opencode-config`
- Skip backup: `pwsh -NoProfile -File scripts/install.ps1 -NoBackup` or `bash scripts/install.sh --no-backup`

## Status plugin only from clone (deprecated)

Use this when OpenCode is already set up and you only want the status runtime plugin.
The installer writes `~/.config/opencode/plugins/status-runtime.js` plus its sibling support directory at `~/.config/opencode/plugins/status-runtime/`.
The plugin owns the canonical status layout under `<run_output_dir>/status/`, including `run-status.json`, `tasks/<task_id>.json`, and `agents/<agent_id>.json`.
When status payloads include `working_project_dir`, the OpenCode plugin anchors relative `output_root` and `checkpoint_path` values to that target repo. This is what allows same-session delegated runs such as `run-modernize -> run-pipeline` to keep status/checkpoints under the target project.
OpenCode core installs now also mirror repo-managed skills into the global cross-runtime skill locations `~/.agents/skills/` and `~/.claude/skills/` by default, while preserving the OpenCode config copy under `~/.config/opencode/skills/`.
If a newly installed skill does not appear immediately, start a fresh OpenCode session so the runtime can re-scan the installed skill catalog.

Installed file layout:

```text
~/.config/opencode/
├─ opencode.json
└─ plugins/
   ├─ status-runtime.js
   └─ status-runtime/
      └─ index.js
```

No extra `opencode.json` plugin stanza is required for this repository's local plugin install; the entry file lives directly under `plugins/`.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-plugin-status-runtime.ps1
```

macOS/Linux:

```bash
bash scripts/install-plugin-status-runtime.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-plugin-status-runtime.ps1 -DryRun` or `bash scripts/install-plugin-status-runtime.sh --dry-run`
- Custom target entry file: `pwsh -NoProfile -File scripts/install-plugin-status-runtime.ps1 -Target C:\path\to\opencode-config\plugins\status-runtime.js` or `bash scripts/install-plugin-status-runtime.sh --target /path/to/opencode-config/plugins/status-runtime.js`

## All local assets from clone

Use this maintainer convenience when you need Codex config plus every retained Claude Code, Copilot, and transitional OpenCode compatibility asset from the working tree. It is not the recommended Codex-only install path.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-all-local.ps1
```

macOS/Linux:

```bash
bash scripts/install-all-local.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-all-local.ps1 -DryRun` or `bash scripts/install-all-local.sh --dry-run`
- Per-target overrides: `pwsh -NoProfile -File scripts/install-all-local.ps1 -OpenCodeTarget C:\path\to\opencode-config -PluginTarget C:\path\to\opencode-config\plugins\status-runtime.js -UsagePluginTarget C:\path\to\opencode-config\plugins\usage-status.js -CopilotTarget C:\path\to\copilot\agents -ClaudeTarget C:\path\to\project\.claude\agents -CodexTarget C:\path\to\.codex`
- Per-target overrides: `bash scripts/install-all-local.sh --opencode-target /path/to/opencode-config --plugin-target /path/to/opencode-config/plugins/status-runtime.js --usage-plugin-target /path/to/opencode-config/plugins/usage-status.js --copilot-target /path/to/copilot/agents --claude-target /path/to/project/.claude/agents --codex-target /path/to/.codex`
- v0.27 retirement cleanup: all-local removes a legacy `effort-control` install. If it was previously installed at a custom entry path, pass that old path with cleanup-only `-EffortPluginTarget` / `--effort-plugin-target`; the parameter never installs or enables the retired plugin.

## Usage only from clone (deprecated)

Use this when you want just the `/usage` command/tool and the usage-status TUI plugin from your working tree, without installing the rest of the pipeline.
The installer copies the usage command/tool files into `~/.config/opencode`, installs the plugin files under `plugins/usage-status/`, and ensures `tui.json` contains `./plugins/usage-status/index.js`.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-usage-only.ps1
```

macOS/Linux:

```bash
bash scripts/install-usage-only.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-usage-only.ps1 -DryRun` or `bash scripts/install-usage-only.sh --dry-run`
- Custom targets: `pwsh -NoProfile -File scripts/install-usage-only.ps1 -OpenCodeTarget C:\path\to\opencode-config -UsagePluginTarget C:\path\to\opencode-config\plugins\usage-status.js` or `bash scripts/install-usage-only.sh --opencode-target /path/to/opencode-config --usage-plugin-target /path/to/opencode-config/plugins/usage-status.js`

## Usage status plugin only from clone (deprecated)

Use this when OpenCode core assets are already installed and you want the toggleable TUI usage footer plugin.
The installer writes `~/.config/opencode/plugins/usage-status.js` plus its sibling support directory at `~/.config/opencode/plugins/usage-status/`.
The installer also ensures `~/.config/opencode/tui.json` contains `./plugins/usage-status/index.js`.
The plugin defaults to `off`; after install, enable it inside OpenCode with `/usage-status` or `/usage-status-on`.

Installed file layout:

```text
~/.config/opencode/
├─ plugins/
│  ├─ usage-status.js
│  └─ usage-status/
│     ├─ index.js
│     └─ tui.jsx
└─ tui.json
```

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-plugin-usage-status.ps1
```

macOS/Linux:

```bash
bash scripts/install-plugin-usage-status.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-plugin-usage-status.ps1 -DryRun` or `bash scripts/install-plugin-usage-status.sh --dry-run`
- Custom target entry file: `pwsh -NoProfile -File scripts/install-plugin-usage-status.ps1 -Target C:\path\to\opencode-config\plugins\usage-status.js` or `bash scripts/install-plugin-usage-status.sh --target /path/to/opencode-config/plugins/usage-status.js`

Behavior notes:

- When enabled, the footer refreshes immediately and then every `300` seconds.
- If you want the latest values on demand, use `/usage-status-refresh` or run `/usage`.
- Use `/usage-status-short` for a compact one-line summary or `/usage-status-detail` for the richer sidebar card view.
- Use `/usage-status-codex` to keep the footer scoped to Codex usage.
- If a live lookup fails after a previous success, the footer reuses cached data and prefixes the summary with `~`.

Example `tui.json` with explicit plugin options:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["./plugins/usage-status/index.js", {
      "enabled": false,
      "mode": "short",
      "refreshSeconds": 300,
      "showCodex": true
    }]
  ]
}
```

## Usage FAQ

- Why does `/usage` work but the footer is missing?
  The TUI footer plugin defaults to `off`. Turn it on with `/usage-status` or `/usage-status-on`.
- Why does the footer start with `~`?
  The plugin fell back to cached data after a live lookup failed. Run `/usage-status-refresh` or `/usage` when connectivity/auth is back.
- Can I keep the footer scoped to Codex?
  Yes. Use `/usage-status-codex`. You can also set `showCodex` in `tui.json` for the default view.
- What is the difference between `tui.json` and `opencode.json`?
  `opencode.json` is for OpenCode runtime config and server-side plugins. `tui.json` is where OpenCode loads TUI plugins like `usage-status`.

## Copilot agents from clone

This is a Tier 2 best-effort output. Validate the concrete workflow you rely on; a successful export does not imply Codex feature parity.

Default target: `~/.copilot/agents`

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1
```

macOS/Linux:

```bash
bash scripts/install-copilot.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-copilot.ps1 -DryRun` or `bash scripts/install-copilot.sh --dry-run`
- Custom target: `pwsh -NoProfile -File scripts/install-copilot.ps1 -Target C:\path\to\copilot\agents` or `bash scripts/install-copilot.sh --target /path/to/copilot/agents`
- Skip backup: `pwsh -NoProfile -File scripts/install-copilot.ps1 -NoBackup` or `bash scripts/install-copilot.sh --no-backup`

## Claude Code subagents from clone

Default target: `~/.claude/agents`

Claude Code support is a Tier 2 best-effort file export. Treat `opencode/agents/*.md` as the transitional source of truth, install generated copies into Claude's global agents directory by default, and use a project-local `.claude/agents/` target only when you explicitly want repo-scoped overrides.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-claude.ps1
```

macOS/Linux:

```bash
bash scripts/install-claude.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-claude.ps1 -DryRun` or `bash scripts/install-claude.sh --dry-run`
- Custom target: `pwsh -NoProfile -File scripts/install-claude.ps1 -Target C:\path\to\your-project\.claude\agents` or `bash scripts/install-claude.sh --target /path/to/your-project/.claude/agents`

Claude Code limitation note:

- Keep orchestrator guidance conservative: do not assume nested orchestrator -> subagent -> subagent routing in Claude Code.
- Prefer inline execution for orchestrator-owned stages, or invoke leaf subagents directly when needed.

## Codex roles from clone

Primary/default target: `~/.codex`

This is the Tier 1 developer-install path.

Behavior notes:

- Existing Codex files are backed up by default.
- The installer preserves unrelated Codex settings already present in `config.toml`, such as model, approval, sandbox, MCP, and profile settings.
- The installer replaces only the managed Codex agent definitions and removes stale managed agent files/entries that were deleted from this repo.
- When the target is a global Codex home such as `~/.codex`, the installer also auto-merges the managed global mode note into the active global AGENTS file inside that target: prefer `AGENTS.override.md` when it exists and is non-empty, otherwise use `AGENTS.md`; if neither exists, it creates `AGENTS.md`. That managed note makes the authorization and definition-first workflow explicit for recognized mode aliases: a mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization. In a fresh/new session, first consult `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present, otherwise `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition. After applying it, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator, and if the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers inline and should delegate those work items when separately authorized. In the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. It also says that Codex mode simulation can ignore OpenCode-only plugin/command details that are not relevant in the current runtime and instead focus on mode behavior, task decomposition, delegation rules, and output style.
- Target `<workspace>/.codex` only when you intentionally want a workspace-local override; that is also when the installer applies the optional managed merge into `<workspace>/AGENTS.md`, using the same definition-precedence rule.

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1
```

macOS/Linux:

```bash
bash scripts/install-codex.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-codex.ps1 -DryRun` or `bash scripts/install-codex.sh --dry-run`
- Custom target: `pwsh -NoProfile -File scripts/install-codex.ps1 -Target C:\path\to\.codex` or `bash scripts/install-codex.sh --target /path/to/.codex`
- `features.multi_agent` is always set to `true`, and the managed `[agents]` settings are refreshed from this repo; `-Force` / `--force` is accepted only for backward compatibility.
- The reusable manual snippet still lives in `docs/codex-mapping.md#global-custom-instructions-snippet` for users who are not using the installer-backed global AGENTS merge.

Important Codex usage note:

- Generated roles are configured as Codex agent roles in `config.toml`.
- For global installs, the installer now manages the equivalent mode-alias snippet in the active global AGENTS file automatically. That note makes the same authorization and definition-first rule central: a recognized mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization. For explicit mode aliases in fresh/new sessions, first consult `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present, otherwise `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition. After applying it, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator, and it must not bypass helper-routed scouting or implementation work inline; it should delegate those work items only when separately authorized. In the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. It also says Codex mode simulation can ignore OpenCode-only plugin/command details that are not relevant in the current runtime. You can also use the manual snippet from `docs/codex-mapping.md#global-custom-instructions-snippet` when you are not using the installer-backed merge.
- Leading aliases such as `use pipeline ...` / `使用flow ...` tell the current/main agent to adopt that mode directly. They do not first spawn the same-named orchestrator role just to enter the mode, do not automatically spawn subagents, and do not override higher-priority `spawn_agent` authorization. After the definition is applied, the current/main agent must follow that orchestrator definition's hard constraints and helper-routing rules rather than bypassing them inline.
- Direct role-name prompts still work when you explicitly want that behavior.
- Do not expect Codex CLI `/agent` to list these custom roles. In current Codex CLI builds, `/agent` is used for switching between already-created agent threads, not for browsing roles from `config.toml`.
- Example prompt: `Have reviewer inspect the risks and have orchestrator-pipeline coordinate the implementation steps.`
