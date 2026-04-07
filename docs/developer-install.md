# Developer Install (Clone Repo)

Use this when you are modifying this repo, validating local changes, or you specifically want installers from your working tree instead of the latest release bundle.
Most users should use the published release bundle commands in `README.md` instead.

## OpenCode core from clone

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

## Status plugin only from clone

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

Use this when you want the OpenCode core config, the OpenCode-only status-runtime plugin, the OpenCode-only usage-status plugin, the OpenCode-only effort-control plugin, Copilot agents, Claude agents, and Codex config installed together from your working tree.

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
- Per-target overrides: `pwsh -NoProfile -File scripts/install-all-local.ps1 -OpenCodeTarget C:\path\to\opencode-config -PluginTarget C:\path\to\opencode-config\plugins\status-runtime.js -UsagePluginTarget C:\path\to\opencode-config\plugins\usage-status.js -EffortPluginTarget C:\path\to\opencode-config\plugins\effort-control.js -CopilotTarget C:\path\to\copilot\agents -ClaudeTarget C:\path\to\project\.claude\agents -CodexTarget C:\path\to\.codex`
- Per-target overrides: `bash scripts/install-all-local.sh --opencode-target /path/to/opencode-config --plugin-target /path/to/opencode-config/plugins/status-runtime.js --usage-plugin-target /path/to/opencode-config/plugins/usage-status.js --effort-plugin-target /path/to/opencode-config/plugins/effort-control.js --copilot-target /path/to/copilot/agents --claude-target /path/to/project/.claude/agents --codex-target /path/to/.codex`

## Usage only from clone

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

## Usage status plugin only from clone

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
- Use `/usage-status-all`, `/usage-status-codex`, or `/usage-status-copilot` to control which provider cards are shown.
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
      "showCodex": true,
      "showCopilot": true
    }]
  ]
}
```

## Usage FAQ

- Why does `/usage` work but the footer is missing?
  The TUI footer plugin defaults to `off`. Turn it on with `/usage-status` or `/usage-status-on`.
- Why does Copilot show unavailable or manual mode?
  Live Copilot usage depends on `gh` plus a working GitHub login. Run `gh auth status` and make sure the active account can access GitHub Copilot usage.
- Why does the footer start with `~`?
  The plugin fell back to cached data after a live lookup failed. Run `/usage-status-refresh` or `/usage` when connectivity/auth is back.
- Can I show only Codex or only Copilot?
  Yes. Use `/usage-status-codex`, `/usage-status-copilot`, or `/usage-status-all`. You can also set `showCodex` / `showCopilot` in `tui.json` for the default view.
- What is the difference between `tui.json` and `opencode.json`?
  `opencode.json` is for OpenCode runtime config and server-side plugins. `tui.json` is where OpenCode loads TUI plugins like `usage-status`.

## Effort-control plugin only from clone

Use this when you want an OpenCode-only reasoning-effort controller for OpenAI or GitHub Copilot GPT-5 sessions without changing the rest of the pipeline install.
The installer writes `~/.config/opencode/plugins/effort-control.js` plus its sibling support directory at `~/.config/opencode/plugins/effort-control/`.
The installer also ensures `~/.config/opencode/tui.json` contains `./plugins/effort-control/index.js`.

Behavior notes:

- The server plugin is active immediately after install. For OpenAI and GitHub Copilot `gpt-5*`, it floors most non-mechanical agents to at least `medium`.
- `/effort-medium`, `/effort-high`, and `/effort-max` set a reasoning floor. On the home screen they set a project default; inside a session they set a session override.
- `/effort-clear` removes the current session override or the project default.
- The plugin only applies OpenAI `reasoningEffort` overrides. Other providers are left untouched.
- State and verification traces are written under the active project at `.opencode/effort-control.sessions.json` and `.opencode/effort-control.trace.jsonl`.
- This installer is intentionally separate from `install-all-local`; it changes runtime behavior and should stay opt-in.

Installed file layout:

```text
~/.config/opencode/
├─ plugins/
│  ├─ effort-control.js
│  └─ effort-control/
│     ├─ index.js
│     ├─ state.js
│     └─ tui.jsx
└─ tui.json
```

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-plugin-effort-control.ps1
```

macOS/Linux:

```bash
bash scripts/install-plugin-effort-control.sh
```

Common options:

- Preview only: `pwsh -NoProfile -File scripts/install-plugin-effort-control.ps1 -DryRun` or `bash scripts/install-plugin-effort-control.sh --dry-run`
- Custom target entry file: `pwsh -NoProfile -File scripts/install-plugin-effort-control.ps1 -Target C:\path\to\opencode-config\plugins\effort-control.js` or `bash scripts/install-plugin-effort-control.sh --target /path/to/opencode-config/plugins/effort-control.js`

Quick verification after install:

- Open OpenCode with an OpenAI or GitHub Copilot `gpt-5*` model, run `/effort-high`, then start a new session and dispatch a delegated flow.
- Inspect `.opencode/effort-control.trace.jsonl` in the active project. `source: "project_default"` or `source: "session_override"` confirms the override path.

## Copilot agents from clone

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

Claude Code support is file-based today. Treat `opencode/agents/*.md` as the source of truth, install generated copies into Claude's global agents directory by default, and use a project-local `.claude/agents/` target only when you explicitly want repo-scoped overrides.

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

Default target: `~/.codex`

Behavior notes:

- Existing Codex files are backed up by default.
- The installer preserves unrelated Codex settings already present in `config.toml`, such as model, approval, sandbox, MCP, and profile settings.
- The installer replaces only the managed Codex agent definitions and removes stale managed agent files/entries that were deleted from this repo.

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

Important Codex usage note:

- Generated roles are configured as Codex agent roles in `config.toml`.
- Use them by role name in prompts.
- Do not expect Codex CLI `/agent` to list these custom roles. In current Codex CLI builds, `/agent` is used for switching between already-created agent threads, not for browsing roles from `config.toml`.
- Example prompt: `Have reviewer inspect the risks and have orchestrator-pipeline coordinate the implementation steps.`
