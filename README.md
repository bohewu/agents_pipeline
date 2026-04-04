# Multi-Agent Pipeline

Multi-agent workflows for OpenCode with companion agent docs for Claude Code, VS Code Copilot, and Codex.
This repository demonstrates a **Multi-Agent Pipeline** with `opencode/agents/*.md` as the single source of truth. See the **How To Use** section below for usage instructions.

## Contents

- [Usage Prerequisites](#usage-prerequisites)
- [Install (Recommended)](#install-recommended)
  - [OpenCode core](#opencode-core)
  - [Status plugin only](#status-plugin-only)
  - [Usage only](#usage-only)
  - [All local assets](#all-local-assets)
  - [Copilot agents](#copilot-agents)
  - [Claude Code subagents](#claude-code-subagents)
  - [Codex roles](#codex-roles)
- [Developer Install (Clone Repo)](#developer-install-clone-repo)
- [How To Use](#how-to-use)
- [Quick Start](#quick-start)
- [Protocol Validation](#protocol-validation)
- [Config Example](#config-example)
- [Flags](#flags)
- [Orchestrators](#orchestrators)
- [Agent Responsibility Matrix](#agent-responsibility-matrix)

## TL;DR

- Most users should use the published release bundle install commands in `Install (Recommended)`.
- Fastest Ubuntu/macOS/Linux all-in-one path: paste the one-liner in `All local assets`; no extra `chmod` step is needed for that path.
- If you are editing this repo or testing local changes from your working tree, use `Developer Install (Clone Repo)`.
- Most common run: `/run-pipeline Implement OAuth2 login --effort=balanced`

## Usage Prerequisites

This repo assumes you have configured the required model providers in OpenCode.
If no model/provider is available in your OpenCode runtime config, update `opencode.json` (or your global OpenCode config) before running any commands.

### Required Tools

- OpenCode (with model providers configured)
- Claude Code (optional; default install target: `~/.claude/agents`)
- VS Code with GitHub Copilot (for Copilot custom-agent usage)
- Codex CLI (optional; for Codex multi-agent usage)
- Python 3.9+ (required for `opencode/tools/validate-schema.py`, `scripts/export-copilot-agents.py`, and `scripts/export-codex-agents.py`)
- PowerShell 7+ (for `scripts/install.ps1` on Windows) or Bash (for `scripts/install.sh` on macOS/Linux)
- `curl` + `tar` + `sha256sum` (or `shasum`) for release-bundle bootstrap install on macOS/Linux
- GitHub CLI (`gh`) is optional, but bootstrap installers use it to verify GitHub Artifact Attestations when available

## Install (Recommended)

These commands install from the published release bundle and are the default path for most users.

Bootstrap installers download a release bundle, verify the archive checksum against the release `SHA256SUMS` asset, and, when `gh` is available, verify the GitHub Artifact Attestation before installing only the target you choose.

Attestation details stay quiet by default. Use `--verbose` on Bash bootstrap scripts or `-Verbose` on PowerShell bootstrap scripts if you want to see the attestation verification steps.

Most common choices:

- Want everything in one step: start with `All local assets`.
- Already have OpenCode and only need the runtime status plugin: use `Status plugin only`.
- Only want `/usage` plus the usage footer plugin: use `Usage only`.
- Only need one editor/CLI integration: jump to `Copilot agents`, `Claude Code subagents`, or `Codex roles`.

Pick the install target that matches what you want:

- [OpenCode core](#opencode-core): install the main OpenCode config only.
- [Status plugin only](#status-plugin-only): install just the OpenCode status runtime plugin.
- [Usage only](#usage-only): install just the usage command/tool and the usage-status plugin.
- [All local assets](#all-local-assets): install OpenCode core + plugin + Copilot + Claude + Codex in one step.
- [Copilot agents](#copilot-agents): install only VS Code Copilot custom agents.
- [Claude Code subagents](#claude-code-subagents): install only Claude Code agent markdown files.
- [Codex roles](#codex-roles): install only Codex role config.

PowerShell tips:

- Prefer pinned tags over `main`.
- Pass `-Target` explicitly when you know the install location.
- When combining PowerShell switch flags with other arguments, prefer `-Flag:$true` form for clarity.
- Bootstrap installers create backups by default when they detect existing installed files.

### OpenCode core

Copy-paste commands (recommended):

Existing OpenCode files are backed up by default. The installer refreshes the managed repo files, removes stale managed files that were deleted from this repo, and leaves unrelated user-created files in place.

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1; pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag -Target "$HOME\.config\opencode"
```

macOS/Linux:

```bash
tag="v0.19.1" && curl -fsSL -o ./bootstrap-install.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install.sh" && bash ./bootstrap-install.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install.sh | bash
```

### Status plugin only

Install only the OpenCode status runtime plugin from the release bundle.
The target must be the plugin entry file path, not a directory.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-plugin-status-runtime.ps1" -OutFile .\bootstrap-install-plugin-status-runtime.ps1; pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js"
```

macOS/Linux:

```bash
tag="v0.19.1" && curl -fsSL -o ./bootstrap-install-plugin-status-runtime.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-plugin-status-runtime.sh" && bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js" -DryRun
```

```bash
bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js" --dry-run
```

### Usage only

Install only the `/usage` command/tool and the toggleable OpenCode usage-status plugin from the release bundle.
The usage footer plugin defaults to `off`; enable it from OpenCode with `/usage-status` or `/usage-status-on` after install.
The installer registers the TUI plugin in `~/.config/opencode/tui.json`, not in `opencode.json`.

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-usage-only.ps1" -OutFile .\bootstrap-install-usage-only.ps1; pwsh -NoProfile -File .\bootstrap-install-usage-only.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -UsagePluginTarget "$HOME\.config\opencode\plugins\usage-status.js"
```

macOS/Linux:

```bash
tag="v0.19.1" && curl -fsSL -o ./bootstrap-install-usage-only.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-usage-only.sh" && bash ./bootstrap-install-usage-only.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --usage-plugin-target "$HOME/.config/opencode/plugins/usage-status.js"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-usage-only.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -UsagePluginTarget "$HOME\.config\opencode\plugins\usage-status.js" -DryRun
```

```bash
bash ./bootstrap-install-usage-only.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --usage-plugin-target "$HOME/.config/opencode/plugins/usage-status.js" --dry-run
```

Behavior notes:

- When enabled, the footer refreshes immediately and then every `300` seconds.
- If you want the latest values on demand, use `/usage-status-refresh` or run `/usage`.
- Use `/usage-status-short` for a compact one-line summary or `/usage-status-detail` for the richer sidebar card view.
- Use `/usage-status-all`, `/usage-status-codex`, or `/usage-status-copilot` to control which provider cards are shown.
- If a live lookup fails after a previous success, the footer reuses cached data and prefixes the summary with `~`.
- The footer is intentionally compact; `/usage --json` remains the detailed/debug view.

### All local assets

Install OpenCode core assets, the OpenCode-only status-runtime plugin, the OpenCode-only usage-status plugin, Copilot agents, Claude agents, and Codex config together from one release bundle.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-all-local.ps1" -OutFile .\bootstrap-install-all-local.ps1; pwsh -NoProfile -File .\bootstrap-install-all-local.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -PluginTarget "$HOME\.config\opencode\plugins\status-runtime.js" -CopilotTarget "$HOME\.copilot\agents" -ClaudeTarget "$HOME\.claude\agents" -CodexTarget "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.19.1" && tmp="$(mktemp)" && curl -fsSL -o "$tmp" "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-all-local.sh" && bash "$tmp" --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex" && rm -f "$tmp"
```

Ubuntu/macOS/Linux notes if you prefer downloading the script first:

- The easiest copy-paste path is to pipe the pinned bootstrap script into `bash`; this avoids the downloaded-file executable-bit problem entirely.
- If you download the bootstrap script first, run it as `bash ./bootstrap-install-all-local.sh ...`.
- A script fetched with `curl -o ./bootstrap-install-all-local.sh ...` usually does **not** have the executable bit on Ubuntu, so `./bootstrap-install-all-local.sh ...` can fail with `permission denied`.
- If you specifically want `./bootstrap-install-all-local.sh ...`, run `chmod +x ./bootstrap-install-all-local.sh` first.

Download-then-run version:

```bash
tag="v0.19.1"
curl -fsSL -o ./bootstrap-install-all-local.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-all-local.sh"
bash ./bootstrap-install-all-local.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-all-local.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -PluginTarget "$HOME\.config\opencode\plugins\status-runtime.js" -CopilotTarget "$HOME\.copilot\agents" -ClaudeTarget "$HOME\.claude\agents" -CodexTarget "$HOME\.codex" -DryRun
```

```bash
bash ./bootstrap-install-all-local.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex" --dry-run
```

### Copilot agents

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1; pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux:

```bash
tag="v0.19.1" && curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh" && bash ./bootstrap-install-copilot.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.sh | bash
```

### Claude Code subagents

Use a tagged release bundle to install Claude Code subagents.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$release = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$release/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1; pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $release -Target "$HOME\.claude\agents"
```

macOS/Linux:

```bash
release="v0.19.1" && curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${release}/scripts/bootstrap-install-claude.sh" && bash ./bootstrap-install-claude.sh --version "${release}" --target "$HOME/.claude/agents"
```

Optional project-local override:

```powershell
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$release/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1
pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $release -Target "C:\path\to\your-project\.claude\agents"
```

```bash
curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${release}/scripts/bootstrap-install-claude.sh"
bash ./bootstrap-install-claude.sh --version "${release}" --target "/path/to/your-project/.claude/agents"
```

See `docs/claude-mapping.md` for tool mapping, `$ARGUMENTS` input adaptation, and the current orchestrator limitations.

### Codex roles

Copy-paste commands (recommended):

Existing `.codex` files are backed up by default. The installer preserves non-agent Codex settings, replaces the managed agent definitions, and removes stale managed agent files.

Windows (PowerShell):

```powershell
$tag = "v0.19.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1; pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.19.1" && curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh" && bash ./bootstrap-install-codex.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.sh | bash
```

## Developer Install (Clone Repo)

Use this when you are modifying this repo, validating local changes, or you specifically want installers from your working tree instead of the latest release bundle.

### OpenCode core from clone

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

### Status plugin only from clone

Use this when OpenCode is already set up and you only want the status runtime plugin.
The installer writes `~/.config/opencode/plugins/status-runtime.js` plus its sibling support directory at `~/.config/opencode/plugins/status-runtime/`.
The plugin owns the canonical status layout under `<run_output_dir>/status/`, including `run-status.json`, `tasks/<task_id>.json`, and `agents/<agent_id>.json`.

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

### All local assets from clone

Use this when you want the OpenCode core config, the OpenCode-only status-runtime plugin, the OpenCode-only usage-status plugin, Copilot agents, Claude agents, and Codex config installed together from your working tree.

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

### Usage only from clone

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

### Usage status plugin only from clone

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

### Usage FAQ

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

### Copilot agents from clone

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

### Claude Code subagents from clone

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

### Codex roles from clone

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

## Versioning

<details>
<summary>Maintainer release notes</summary>

- Single source of truth: root `VERSION` file (SemVer without `v`, for example `0.19.1`).
- Use SemVer tags with `v` prefix (for example: `v0.19.1`).
- Stay in `0.x` while the pipeline and prompts evolve quickly.
- In `0.x`, treat **minor** bumps as potentially breaking (`v0.5.0` -> `v0.6.0`).
- Use **patch** bumps for docs/scripting fixes without intended behavior changes.
- Release CI checks `VERSION` and tag alignment (`VERSION=0.19.1` must release as `v0.19.1`).
- After bumping `VERSION`, run `python scripts/sync-readme-version.py` to refresh the pinned README release examples before commit.
- README pinned examples that include explicit release versions must use the current `VERSION` value; CI validates those exact snippets.
- Track release notes in `CHANGELOG.md`.

## Release CI

- Workflow: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v0.19.1`) or manual `workflow_dispatch`
- Output assets:
  - `agents-pipeline-opencode-bundle-vX.Y.Z.tar.gz`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.zip`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.SHA256SUMS.txt`
- Release workflow verifies downloaded artifact checksums before publishing release assets.
- Release workflow generates GitHub Artifact Attestations for the bundle artifacts and verifies them before publishing release assets.

## CI Checks

- Workflow: `.github/workflows/ci.yml`
- Trigger: `pull_request`, push to `main`, manual `workflow_dispatch`
- Checks:
  - `VERSION` format check
  - README pinned version snippet validation against root `VERSION`
  - schema validator script sanity check
  - dispatch-plan resource schema/examples validation (positive + negative cases)
  - status contract schema/examples validation (`run-status`, `task-status`, `agent-status`; positive + negative fixtures)
  - modernize execution handoff schema/examples validation (positive + negative case)
  - resource-control prompt coverage assertions for router/orchestrator/executor/reviewer docs
  - Copilot export script strict dry run
  - installer script syntax and dry-run validation

Example release:

```bash
git tag v0.19.1
git push origin v0.19.1
```

## Public Release Checklist

- Confirm there are no secrets or private endpoints in the repo.
- Review git history for removed secrets if any (history still contains them).
- Ensure `opencode.json.example` contains no real keys.
- Verify `LICENSE` exists and matches intended usage.
- Verify README usage notes align with your public story.

## Secret Scan (Optional)

If you already have a secret scanner installed, run one of:

```text
gitleaks detect --source .
```

```text
trufflehog filesystem .
```

Use whichever tool your team prefers.

</details>

## How To Use

<details>
<summary>Repo map and platform export notes</summary>

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `AGENTS.md`.
- Model selection is runtime-driven by OpenCode/provider configuration.
- This repo does not maintain per-agent default model mappings.
- Source agent frontmatter must not define `model` or `provider`; exporters will fail fast and tell you to update runtime config instead.
- VS Code Copilot `.agent.md` files are generated from OpenCode source by `scripts/export-copilot-agents.py`.
- Copilot mapping details live in `docs/copilot-mapping.md`.
- Claude Code mapping details live in `docs/claude-mapping.md`.
- Codex install scripts live at `scripts/install-codex.ps1`, `scripts/install-codex.sh`, `scripts/bootstrap-install-codex.ps1`, and `scripts/bootstrap-install-codex.sh`.
- Codex role mapping details live in `docs/codex-mapping.md`.
- Protocol and JSON schemas live in `opencode/protocols/`.
  Use `opencode/protocols/PROTOCOL_SUMMARY.md` for global instructions to reduce token usage.
- Spec handoff SOP lives in `opencode/protocols/SPEC_TO_PIPELINE.md`.
- Spec end-to-end example lives in `opencode/protocols/SPEC_E2E_EXAMPLE.md`.
- Modernize handoff SOP lives in `opencode/protocols/MODERNIZE_TO_PIPELINE.md`.
- CI artifact templates live in `opencode/protocols/CI_TEMPLATES.md`.
- CI example for .NET + Vue lives in `opencode/protocols/CI_EXAMPLE_DOTNET_VUE.md`.
- CI generated output example lives in `opencode/protocols/CI_GENERATE_EXAMPLE.md`.
- Publish SOP lives in `opencode/protocols/PUBLISH_SOP.md`.
- Modernize templates live in `opencode/protocols/MODERNIZE_TEMPLATES.md`.
- Modernize example lives in `opencode/protocols/MODERNIZE_EXAMPLE.md`.
- Public checklist lives in `opencode/protocols/PUBLIC_CHECKLIST.md`.
- Root-tracked helper artifacts live in the project root:
  - `session-guide.md` for stable repo guidance
  - `todo-ledger.json` as the canonical kanban / carryover source (schema in `opencode/protocols/schemas/todo-ledger.schema.json`)
  - `kanban.md` as the rendered board view
  - A starter ledger template is provided in `todo-ledger.example.json`.
  - A starter rendered board example is provided in `kanban.example.md`.
  - A starter session guide skeleton is provided in `session-guide.example.md`.
- Use `/run-ci` in `opencode/commands/run-ci.md` for CI/CD planning (docs-first; optional generation).
- Use `/run-modernize` in `opencode/commands/run-modernize.md` for modernization planning (experimental).
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end
- Use `/run-committee` in `opencode/commands/run-committee.md` for a decision committee (experts + KISS soft-veto + judge)
- Use `/run-general` in `opencode/commands/run-general.md` for non-coding general-purpose workflows (planning/writing/analysis/checklists)
- Use `/session-guide` to create or refresh the root-tracked repo guide.
- Use `/kanban` to manage the root-tracked kanban / carryover ledger.
- Use `/emit-handoff` to create run-local handoff artifacts for a fresh session.
- Use `/usage` to inspect live Codex quota windows and optionally summarize a Copilot premium-request usage report.

</details>

## VS Code Copilot Agents

<details>
<summary>Copilot / Claude / Codex reference</summary>

This repo can generate VS Code Copilot custom agents from `opencode/agents/*.md` with single-source maintenance.

- Generate agents directly:

```text
python scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir /path/to/copilot/agents --strict
```

- Filename rule:
  - Output filenames are generated as `<source-file-stem>.agent.md` (for example `orchestrator-pipeline.agent.md`).

- Experimental subagent mode:
  - Generated orchestrators include `agents:` references for Copilot subagent routing (experimental behavior).
- Fallback mode:
  - Generated `*-solo.agent.md` files run without subagents.
  - Example: `@orchestrator-pipeline-solo`

After install, add your generated directory to VS Code user settings:

```json
{
  "chat.agentFilesLocations": [
    "/path/to/copilot/agents"
  ]
}
```

## Claude Code Subagents

This repo also supports Claude Code with the same `opencode/agents/*.md` source files.

- Default install target: `~/.claude/agents`.
- Optional override target: `<project>/.claude/agents` when you explicitly want repo-scoped Claude agents.
- Source of truth stays in `opencode/agents/*.md`; do not fork a separate long-lived Claude-only source set.
- See `docs/claude-mapping.md` for the frontmatter/tool mapping and `$ARGUMENTS` input adaptation notes.

### Two-Phase Dispatch Model

Claude Code subagents cannot nest `Agent` calls, so orchestrators use a **two-phase dispatch model**: the orchestrator plans, and the top-level Claude Code instance executes.

**Phase 1 — Plan:** Ask an orchestrator to produce a dispatch plan (it will NOT execute tasks itself):

```text
@orchestrator-flow Create a REST endpoint for /api/health that returns {"status":"ok"}
```

The orchestrator returns a JSON dispatch plan:

```json
{ "dispatch": [
    { "id": "T1", "agent": "executor", "prompt": "Create ...", "deps": [] },
    { "id": "T2", "agent": "reviewer",      "prompt": "Review ...", "deps": ["T1"] }
  ]}
```

**Phase 2 — Execute:** The top-level Claude Code instance runs the plan automatically:

1. Tasks with empty `deps` are spawned in parallel.
2. Tasks with `deps` wait for their dependencies to complete; results are forwarded in the prompt.
3. After all tasks finish, if the orchestrator needs post-dispatch work (e.g., synthesis), results are sent back via `SendMessage`.

**Which orchestrator to use:**

| Scenario | Orchestrator | Notes |
|----------|-------------|-------|
| Daily engineering tasks | `@orchestrator-flow` | Max 5 atomic tasks, no reviewer |
| CI / PR / high-risk work | `@orchestrator-pipeline` | Full pipeline with review gates |
| Simple single-file change | `@executor` (directly) | Skip the orchestrator entirely |

**Example session:**

```text
You:   @orchestrator-flow Add input validation to src/api/users.ts
Claude: (orchestrator returns dispatch plan JSON)
Claude: (top-level spawns executor for T1, then reviewer for T2)
Claude: Done — here is the summary.
```

The dispatch protocol is also documented in `CLAUDE.md` under "Claude Code Pipeline Runner Protocol".

## Codex Agent Roles

This repo can also generate Codex multi-agent role config from `opencode/agents/*.md` with single-source maintenance.

- Generate a `.codex`-style config directory:

```text
python scripts/export-codex-agents.py --source-agents opencode/agents --target-dir /path/to/.codex --strict
```

- Output structure:
  - `/path/to/.codex/config.toml`
  - `/path/to/.codex/agents/*.toml`

- Safe overwrite behavior:
  - Generation fails if the target contains non-generated files unless you pass `--force`.

- Codex docs / mapping notes:
  - See `docs/codex-mapping.md` for the exact field mapping and adaptation rules.

- Invocation note:
  - Ask Codex to use role names in prompts.
  - Do not expect `/agent` to display generated custom roles from `config.toml`.
  - Example: `Have reviewer inspect the patch and have generalist draft the migration notes.`

</details>

## Quick Start

1) Load the orchestrator (handoff protocol is embedded for portability):
   - `opencode/agents/orchestrator-pipeline.md`
2) Run `/run-pipeline` with an optional effort flag:

```text
/run-pipeline Implement OAuth2 login --effort=balanced
```
3) Optional smoke-check run:

```text
/run-pipeline Run tests only --test-only
```

<details>
<summary>More command references</summary>

## CI Pipeline

Use `/run-ci` to create CI/CD plans and (optionally) generate workflows.

Examples:

```
/run-ci Plan CI/CD for .NET + Vue
/run-ci Plan CI/CD --generate --github
/run-ci Plan CI/CD --generate --github --docker --deploy
```

## Modernize Pipeline (Experimental)

Use `/run-modernize` for legacy modernization planning. It produces:

- `modernize/modernize-current-state.md`
- `modernize/modernize-target-vision.md`
- `modernize/modernize-strategy.md`
- `modernize/modernize-roadmap.md`
- `modernize/modernize-risks.md`

Modes:

- `/run-modernize --decision-only` (current-state + target-vision + strategy only)
- `/run-modernize --iterate` (one revision round after initial docs)
Recommended execution split:

- Start `/run-modernize` in the source project.
- Keep modernization docs and handoff files under the source project's `.pipeline-output/modernize/`.
- Once implementation starts, switch to the target project for `/run-pipeline` runs.
- Keep implementation/test/review artifacts under the target project's `.pipeline-output/pipeline/`.
- If the target project does not exist yet, create it manually before running execution modes.

## General-Purpose Pipeline

Use `/run-general` for non-coding work such as:

- strategy/roadmap planning
- process/SOP design
- structured analysis and recommendation memos
- checklist/playbook drafting

Examples:

```text
/run-general Draft a 90-day GTM roadmap
/run-general Compare three vendor evaluation frameworks
/run-general Create an onboarding SOP for support team --confirm
```

General pipeline outputs are human-friendly by default:
- plain-language summary first
- clear Markdown sections
- actionable next steps

## Workflow Guidance

New projects:

1. `/run-ci` → CI/CD plans (docs)
2. `/run-pipeline` (or `/run-flow` for small, low-risk changes)
3. `/run-ci --generate --github --docker --deploy` when ready to publish

Iterative development:

1. `/run-pipeline` (or `/run-flow` for small changes)
2. `/run-ci` when CI/CD plan needs updates
3. Publish using `opencode/protocols/PUBLISH_SOP.md`

Modernization work:

1. `/run-modernize` from the source project
2. If the target project does not exist, create it manually
3. Review roadmap + handoff
4. `/run-pipeline` from the target project for actual implementation

</details>

## Protocol Validation

Validate a JSON output against the protocol schemas:

Python 3.9+ is required for this command.

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-list.schema.json --input path/to/task-list.json
```

Status contract fixtures follow the same validation pattern. To mirror the repository's status-layer CI checks locally, validate the positive fixtures and confirm the negative fixtures fail:

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.run-only.valid/run-status.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/run-status.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-doc-summary.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-process-build.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-local-server-smoke.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-browser-resume.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-doc-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-process-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-server-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-browser-02.json --require-jsonschema
```

See `opencode/protocols/SCHEMAS.md` and `opencode/protocols/VALIDATION.md` for the status layout fixture set and the negative-fixture expectations enforced in CI.
For ownership boundaries and the follow-on roadmap, see `opencode/protocols/STATUS_MVP_HANDOFF.md`.


If you enable custom tools, you can call the `validate-schema` tool from OpenCode
instead of running the script manually (see `opencode/tools/validate-schema.ts`).

The `/usage` command relies on the custom tool `provider-usage` for live Codex quota
inspection, live Copilot quota lookup, and Copilot report parsing (see
`opencode/tools/provider-usage.ts`).

## Config Example

An example OpenCode config is provided at `opencode.json.example`.

<details>
<summary>Flags and execution behavior</summary>

## Flags

Use flags after the main task prompt. Tokens starting with `--` are treated as flags.
For resume-only flows, `--resume` can be used without a new prompt.

- `--dry`
  - Stop after `atomizer + router`
  - Output TaskList and DispatchPlan only
- `--no-test`
  - Skip test-runner stage
  - Reviewer must warn about missing verification
- `--test-only`
  - Only run test-runner + reviewer
- `--loose-review`
  - Reviewer does not require build/test evidence
  - Reviewer must add a warning that results are unverified
- `--effort=low|balanced|high`
  - low: Favor the smallest viable plan and fewer retries
  - balanced: Practical default depth with standard validation
  - high: Allow deeper analysis and higher execution rigor
- `--resume`
  - Resume from the newest compatible `<run_output_dir>/checkpoint.json` under the selected output root
  - Can be used without a new prompt (reuses `checkpoint.user_prompt` when valid)
- `--confirm`
  - Pause after each stage for review
- `--verbose`
  - Implies `--confirm`, plus per-task pauses during execution
- `--autopilot`
  - Run non-interactively
  - Overrides `--confirm` / `--verbose` pauses
  - Continues other runnable work first, then attempts one bounded blocker-recovery pass for non-hard blockers
  - Stops only on hard blockers (destructive/irreversible actions, security/billing impact, missing credentials)
- `--full-auto`
  - Hands-off preset for stronger execution
  - Implies `--autopilot`
  - Disables interactive pauses
  - For `/run-flow`, defaults to `--force-scout` unless you override scout mode
  - Defaults to `--effort=high` and `--max-retry=5` unless you override them explicitly
  - Prefers the strongest safe bounded in-scope blocker recovery path before surfacing a non-hard blocker
  - Still stops on hard blockers and does not permit scope expansion or leaving resources running

Flag precedence:
- `--dry` overrides `--test-only` when both are present.
- `--full-auto` implies `--autopilot`.
- `--autopilot` overrides interactive pauses from `--confirm` / `--verbose`.

Examples:
```
/run-pipeline Refactor cache layer --no-test
/run-pipeline Improve search relevance --effort=balanced
/run-flow --resume
/run-pipeline --resume --autopilot
/run-flow Ship login improvements --full-auto
/run-pipeline Ship migration end-to-end --full-auto
```

## When to Use `--autopilot` vs `--full-auto`

| Scenario | Recommended flag | Why |
|----------|-----------------|-----|
| Quick task, low risk, you just want no pauses | `--autopilot` | Runs non-interactively with default effort/retries; stops on hard blockers |
| You want to walk away and let the pipeline finish | `--full-auto` | Non-interactive preset with strongest safe bounded recovery before surfacing non-hard blockers |
| You want non-interactive but lower cost | `--autopilot --effort=low` | Autopilot suppresses pauses; effort=low keeps retries minimal |
| You want full-auto but cap retries | `--full-auto --max-retry=2` | full-auto sets the baseline; explicit flags still override |
| Flow task, want forced repo scouting | `--full-auto` | Flow full-auto defaults to `--force-scout` |
| Modernize full-exec, no supervision | `--full-auto` | Defaults depth to `deep`, disables pauses, and forwards stronger full-auto behavior to delegated pipeline phases |

**Rule of thumb:**
- `--autopilot` = "don't ask me questions, use safe defaults"
- `--full-auto` = "don't ask me questions, try your hardest to finish everything"

Both flags stop on **hard blockers** (destructive actions, security/billing impact, missing credentials). The difference is that `--full-auto` also raises preset defaults and prefers the strongest safe bounded in-scope recovery before giving up on non-hard blockers.

Explicit flags always win: `--full-auto --effort=low --max-retry=1` gives you full-auto's recovery posture but with low effort and only 1 retry.

### Execution Resource Control

- Dispatch plans annotate every batch with `resource_class`, `max_parallelism`, `teardown_required`, and optional timeout hints.
- Browser and local-server tasks are routed conservatively and should run one at a time by default.
- Process-class tasks stay conservative; `teardown_required` is only set when explicit shutdown is still needed after the command.
- Executors and test runners must tear down Node.js, Playwright, browser, and other background resources before reporting success.
- Missing teardown evidence for heavy tasks should be treated as incomplete execution, not a clean pass.

### Session vs Checkpoint Behavior

- A new chat/session does not automatically inherit prior runtime state or stage progress.
- Cross-session continuation works through persisted files under the selected output root (default: `.pipeline-output/`), with each run written to its own `<run_output_dir> = <output_root>/<run_id>/` directory.
- To continue an interrupted Flow or Pipeline run, use `--resume` from the same project and output root; resume-only flows should pick the newest compatible run directory unless you explicitly target a specific run directory.
- If `--resume` is not provided, the orchestrator starts a fresh run even if older artifacts still exist.
- Persisted artifacts may still be reused as inputs when the prompt explicitly references them or when the protocol treats them as optional context, but that is not the same as checkpoint resume.

</details>

<details>
<summary>Agent catalog quick reference</summary>

## Orchestrators

- Full: `/run-pipeline` (multi-stage pipeline with reviewer and retries)
- Short: `/run-pipeline --decision-only` (stops after planning/integration design; directional review only)
- Spec: `/run-spec` (review-ready development spec for humans first, pipeline-ready handoff second)
- Flow: `/run-flow` (max 5 atomic tasks; bounded parallel execution; no reviewer or retries)
- Committee: `/run-committee` (decision support; experts + KISS soft-veto + judge)
- General: `/run-general` (non-coding execution pipeline for planning/writing/analysis)
- CI: `/run-ci` (docs-first CI/CD planning; optional generation)
- Modernize: `/run-modernize` (experimental modernization planning docs)

## Choosing a Pipeline (Quick Guide)

- Use `/run-committee` when:
  - you need a recommendation/decision (architecture, tradeoffs, approach selection)
  - you want multiple perspectives + a final judge, with budget as an explicit criterion
- Use `/run-flow` when:
  - the change is small, low-risk, and you mainly want a fast execution plan (max 5 atomic tasks)
- Use `/run-spec` when:
  - you want to review a development spec before implementation starts
  - you want a human-readable `DevSpec` plus a machine-readable handoff for later `/run-pipeline` execution
- Use `/run-general` when:
  - the objective is not code implementation
  - you need structured planning, analysis, writing, or operational documentation
- Use `/run-pipeline` when:
  - the change is high-risk, multi-file/systemic, or needs reviewer gates + bounded retries

## Naming Convention

- Repo name (`agents-pipeline`) reflects the overall concept.
- Full pipeline uses `*-pipeline` naming (e.g. `orchestrator-pipeline.md`, `run-pipeline.md`).
- Flow pipeline uses `*-flow` naming (e.g. `orchestrator-flow.md`, `run-flow.md`).
- General-purpose pipeline uses `*-general` naming (e.g. `orchestrator-general.md`, `run-general.md`).
- Spec pipeline uses `*-spec` naming (e.g. `orchestrator-spec.md`, `run-spec.md`).
- CI pipeline uses `*-ci` naming (e.g. `orchestrator-ci.md`, `run-ci.md`).
- Modernize pipeline uses `*-modernize` naming (e.g. `orchestrator-modernize.md`, `run-modernize.md`).

</details>

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator-ci | CI/CD planning pipeline | Implementing code |
| orchestrator-modernize | Modernization planning pipeline | Implementing code |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-spec | Development spec orchestration | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
| orchestrator-general | Non-coding workflow orchestration | Implementing code |
| specifier | ProblemSpec / DevSpec extraction | Proposing solutions |
| planner | High-level planning | Atomic task creation |
| repo-scout | Repo discovery | Design decisions |
| atomizer | Atomic task DAG | Implementation |
| flow-splitter | Max-5 Flow task decomposition | Implementation |
| router | Cost-aware assignment | Changing tasks |
| executor | Task execution | Scope expansion |
| test-runner | Tests & builds | Code modification |
| reviewer | Quality gate | Implementation |
| compressor | Context reduction | New decisions |
| handoff-writer | Cross-session handoff artifacts | Scope expansion |
| kanban-manager | Root-tracked kanban management | Scope expansion |
| session-guide-writer | Root-tracked session guide refresh | Scope expansion |
| summarizer | User summary | Technical decisions |

---
