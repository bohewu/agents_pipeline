# Multi-Agent Pipeline

Codex-first multi-agent workflow assets, with best-effort exports for Claude Code and GitHub Copilot.
This repository (`bohewu/agents_pipeline`) contains the workflow definitions, protocols, tools, and runtime adapters for **Multi-Agent Pipeline**. During the v0.27 transition, the runtime-neutral source still lives under `opencode/`; those paths are transitional canonical locations until the v0.28 neutral-core move, not a statement that OpenCode remains the primary runtime.
See the **How To Use** section below for usage instructions.

## Contents

- [TL;DR](#tldr)
- [Runtime Support Policy](#runtime-support-policy)
- [Project Docs](#project-docs)
- [Usage Prerequisites](#usage-prerequisites)
- [Install (Recommended)](#install-recommended)
- [Developer Install (Clone Repo)](#developer-install-clone-repo)
- [How To Use](#how-to-use)
- [Quick Start](#quick-start)
- [Codex Agent Roles](#codex-agent-roles)
- [Claude Code Subagents](#claude-code-subagents)
- [VS Code Copilot Agents](#vs-code-copilot-agents)
- [Conceptual UI/UX Layer](#conceptual-uiux-layer)
- [Frontend UI Implementation](#frontend-ui-implementation)
- [Workspace Agent Model Profiles](#workspace-agent-model-profiles)
- [Protocol Validation](#protocol-validation)
- [Config Example](#config-example)
- [Flags](#flags)
- [Orchestrators](#orchestrators)
- [Versioning](#versioning)

## TL;DR

- Codex is the primary, fully supported runtime. Start with `Codex roles` in `Install (Recommended)`.
- Claude Code and GitHub Copilot exports are Tier 2 compatibility outputs: they receive export smoke validation, but feature parity is not promised.
- OpenCode support is frozen. [`v0.26.1`](https://github.com/bohewu/agents_pipeline/releases/tag/v0.26.1) is the last OpenCode-first release.
- If you are editing this repo or testing local changes from your working tree, use `Developer Install (Clone Repo)`.
- Common Codex entry: `use pipeline Implement OAuth2 login`. Workflow verification and recovery are risk-derived; model reasoning is controlled by the effective Codex runtime configuration.
- Optional Codex model routing is available through the Codex installer profile flags.

## Runtime Support Policy

| Runtime | Support level | Contract |
|---|---|---|
| Codex | Tier 1 / first-class | Primary docs and installer, full workflow development, and CI validation |
| Claude Code | Tier 2 / best-effort | Generated agent files and export smoke validation; no feature-parity guarantee |
| GitHub Copilot | Tier 2 / best-effort | Generated custom agents and export smoke validation; no feature-parity guarantee |
| OpenCode | Deprecated / frozen | No new runtime features; use `v0.26.1` for the last OpenCode-first release |

Tier 2 means the repository keeps bounded format adapters while they remain inexpensive to maintain. It does not mean every Codex behavior, tool, nested delegation pattern, status feature, or resume contract is reproduced in those runtimes.

## Project Docs

- `CONTRIBUTING.md` for repo layout, single-source-of-truth rules, local validation, and release expectations.
- `SECURITY.md` for private vulnerability reporting and token/supply-chain handling guidance.
- `COMPATIBILITY.md` for runtime and host-environment assumptions.
- `docs/external-dependencies.md` for network/auth/rate-limit/fallback/privacy notes on `provider-usage`, `skill-manager`, and bootstrap installers.
- `docs/art-generation-scaffold.md` for the bounded 2D asset brief/prompt scaffold, standardized External Handoff Package, Direct Use Prompt, and optional `/artgen --gen-provider=codex` bridge used by the repo-managed `artgen-scaffold` skill, `art-director`, and the normal `/artgen` surface.
- `opencode/skills/codex-imagegen/SKILL.md` for the Codex CLI `$imagegen` bridge used by `/codex-imagegen` when OpenCode should generate images through Codex quota without direct API or provider fallback.
- `opencode/protocols/UI_UX_WORKFLOW.md` for the thin conceptual UI/UX layer, non-expert design/interaction guidance, communication-first overlay, intake/review rubric, and the `ui-ux-bundle` schema/example bundle used by `/uiux`, `ui-ux-designer`, and the repo-managed `ui-ux-workflow` and `ui-communication-designer` skills.
- `opencode/skills/frontend-aesthetic-director/SKILL.md` for frontend implementation and polish tasks that need visual direction, design-token alignment, responsive behavior, accessibility states, and rendered browser/Playwright QA.
- `docs/agent-model-profiles.md` for the retained legacy OpenCode profile format during the v0.27 transition.
- `docs/runtime-agent-model-profiles.md` for Codex profile output plus the Tier 2 Claude Code/Copilot export behavior.

## Usage Prerequisites

This repo assumes Codex is installed and authenticated for the primary runtime path.
Compatibility assumptions and optional dependencies are documented in `COMPATIBILITY.md`.

### Required Tools

- Codex CLI (required for the primary runtime path)
- Claude Code (optional; default install target: `~/.claude/agents`)
- VS Code with GitHub Copilot (optional; for best-effort Copilot custom-agent usage)
- OpenCode (deprecated; use the frozen `v0.26.1` release if required)
- Python 3.9+ (required for `opencode/tools/validate-schema.py`, `opencode/tools/agent-profile.sh`, `scripts/export-copilot-agents.py`, and `scripts/export-codex-agents.py`)
- PowerShell 7+ for Windows installers or Bash for macOS/Linux installers
- `curl` + `tar` + `sha256sum` (or `shasum`) for release-bundle bootstrap install on macOS/Linux
- GitHub CLI (`gh`) is optional, but bootstrap installers use it to verify GitHub Artifact Attestations when available

## Workspace Agent Model Profiles

The Codex installer supports deterministic per-agent model routing. Profiles map agents to logical tiers (`mini`, `standard`, `strong`), and model sets map those tiers to concrete provider model IDs so model version updates stay centralized.

OpenAI is the primary bundled model family for Codex. Provider-specific catalogs remain in the transitional source tree for compatibility exports, while the tier profiles stay provider-independent.

For a workspace-local Codex override, target that workspace's `.codex` directory explicitly. Global `~/.codex` remains the normal install target.

PowerShell:

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1 -AgentProfile balanced -ModelSet openai -Target .\.codex
```

Bash/macOS/Linux:

```bash
bash scripts/install-codex.sh --agent-profile balanced --model-set openai --target ./.codex
```

Generated Codex overrides live in `.codex/agents`. The installer also manages the corresponding role entries in `.codex/config.toml`; do not hand-edit generated role files. The source profiles and model-set catalogs remain under `opencode/tools/` only as a v0.27 transitional layout. Model profiles select model names; Codex reasoning remains owned by the effective runtime configuration. See [docs/runtime-agent-model-profiles.md](docs/runtime-agent-model-profiles.md).

Maintainers can refresh every managed model-set catalog with `python3 scripts/update-agent-model-sets.py --dry-run`.

## Install (Recommended)

These commands install from the published release bundle and are the default path for most users.

Bootstrap installers download a release bundle, verify the archive checksum against the release `SHA256SUMS` asset, and, when `gh` is available, verify the GitHub Artifact Attestation before installing only the target you choose.
See `docs/external-dependencies.md` for external fetch, auth, and supply-chain notes for bootstrap/release installs.

Attestation details stay quiet by default. Use `--verbose` on Bash bootstrap scripts or `-Verbose` on PowerShell bootstrap scripts if you want to see the attestation verification steps.

Most common choices:

- For the supported runtime: use `Codex roles`.
- For a bounded compatibility export: use `Claude Code subagents` or `Copilot agents`.
- For a maintainer compatibility install from the current bundle: use `All local assets`.
- For OpenCode itself: use the frozen `v0.26.1` instructions; current development does not add OpenCode runtime features.

Pick the install target that matches what you want:

- [Codex roles](#codex-roles): install the Tier 1 Codex role config.
- [Claude Code subagents](#claude-code-subagents): install Tier 2 generated Claude Code agent files.
- [Copilot agents](#copilot-agents): install Tier 2 generated Copilot custom agents.
- [All local assets](#all-local-assets): maintainer-oriented compatibility install for every retained target.
- [OpenCode core](#opencode-core-deprecated): install the frozen OpenCode-first release.
- [Status plugin only](#status-plugin-only-deprecated) / [Usage only](#usage-only-deprecated): frozen OpenCode utilities from `v0.26.1`.

PowerShell tips:

- Prefer pinned tags over `main`.
- Pass `-Target` explicitly when you know the install location.
- When combining PowerShell switch flags with other arguments, prefer `-Flag:$true` form for clarity.
- Bootstrap installers create backups by default when they detect existing installed files.

<!-- BEGIN legacy-opencode-v0.26.1 -->

### OpenCode core (deprecated)

OpenCode support is frozen at `v0.26.1`. These commands intentionally stay pinned to that release; do not substitute `main` or a newer tag and expect supported OpenCode behavior.

Copy-paste commands (recommended):

Existing OpenCode files are backed up by default. The installer refreshes the managed repo files, removes stale managed files that were deleted from this repo, and leaves unrelated user-created files in place.

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1; pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag -Target "$HOME\.config\opencode"
```

macOS/Linux:

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install.sh" && bash ./bootstrap-install.sh --version "${tag}"
```

### Status plugin only (deprecated)

Install only the OpenCode status runtime plugin from the release bundle.
The target must be the plugin entry file path, not a directory.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-plugin-status-runtime.ps1" -OutFile .\bootstrap-install-plugin-status-runtime.ps1; pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js"
```

macOS/Linux:

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install-plugin-status-runtime.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-plugin-status-runtime.sh" && bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js" -DryRun
```

```bash
bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js" --dry-run
```

### Usage only (deprecated)

Install only the `/usage` command/tool and the toggleable OpenCode usage-status plugin from the release bundle.
The usage footer plugin defaults to `off`; enable it from OpenCode with `/usage-status` or `/usage-status-on` after install.
The installer registers the TUI plugin in `~/.config/opencode/tui.json`, not in `opencode.json`.

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-usage-only.ps1" -OutFile .\bootstrap-install-usage-only.ps1; pwsh -NoProfile -File .\bootstrap-install-usage-only.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -UsagePluginTarget "$HOME\.config\opencode\plugins\usage-status.js"
```

macOS/Linux:

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install-usage-only.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-usage-only.sh" && bash ./bootstrap-install-usage-only.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --usage-plugin-target "$HOME/.config/opencode/plugins/usage-status.js"
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
- Use `/usage-status-codex` to keep the footer scoped to Codex usage.
- If a live lookup fails after a previous success, the footer reuses cached data and prefixes the summary with `~`.
- The footer is intentionally compact; `/usage --json` remains the detailed/debug view.

<!-- END legacy-opencode-v0.26.1 -->

### All local assets

Install Codex config plus retained Claude Code, Copilot, and transitional OpenCode compatibility assets together from one release bundle. This is a maintainer convenience, not the recommended Codex-only path.

The v0.27 all-local scripts also remove a legacy `effort-control` installation. Cleanup uses its old default location automatically; `-EffortPluginTarget` / `--effort-plugin-target` is retained for one release only to locate a custom legacy entry and never installs the retired plugin. The pinned v0.26.1 commands below remain the frozen OpenCode-first compatibility path and do not perform this retirement cleanup.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.27.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-all-local.ps1" -OutFile .\bootstrap-install-all-local.ps1; pwsh -NoProfile -File .\bootstrap-install-all-local.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -PluginTarget "$HOME\.config\opencode\plugins\status-runtime.js" -CopilotTarget "$HOME\.copilot\agents" -ClaudeTarget "$HOME\.claude\agents" -CodexTarget "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.27.0" && tmp="$(mktemp)" && curl -fsSL -o "$tmp" "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-all-local.sh" && bash "$tmp" --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex" && rm -f "$tmp"
```

Ubuntu/macOS/Linux notes if you prefer downloading the script first:

- The easiest copy-paste path is to pipe the pinned bootstrap script into `bash`; this avoids the downloaded-file executable-bit problem entirely.
- If you download the bootstrap script first, run it as `bash ./bootstrap-install-all-local.sh ...`.
- A script fetched with `curl -o ./bootstrap-install-all-local.sh ...` usually does **not** have the executable bit on Ubuntu, so `./bootstrap-install-all-local.sh ...` can fail with `permission denied`.
- If you specifically want `./bootstrap-install-all-local.sh ...`, run `chmod +x ./bootstrap-install-all-local.sh` first.

Download-then-run version:

```bash
tag="v0.27.0"
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

GitHub Copilot is a Tier 2 best-effort target. The exporter and basic install shape are smoke-validated, but Codex workflow parity is not guaranteed.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.27.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1; pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux:

```bash
tag="v0.27.0" && curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh" && bash ./bootstrap-install-copilot.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.sh | bash
```

Opt-in runtime agent model profile when installing from a cloned repo:

```powershell
pwsh -NoProfile -File .\scripts\install-copilot.ps1 -AgentProfile balanced -ModelSet default
```

```bash
scripts/install-copilot.sh --agent-profile balanced --model-set default
```

### Claude Code subagents

Claude Code is a Tier 2 best-effort target. Use a tagged release bundle to install generated subagents; nested delegation and other Codex-specific behaviors may degrade or require a different execution pattern.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$release = "v0.27.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$release/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1; pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $release -Target "$HOME\.claude\agents"
```

macOS/Linux:

```bash
release="v0.27.0" && curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${release}/scripts/bootstrap-install-claude.sh" && bash ./bootstrap-install-claude.sh --version "${release}" --target "$HOME/.claude/agents"
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

Opt-in runtime agent model profile when installing from a cloned repo:

```powershell
pwsh -NoProfile -File .\scripts\install-claude.ps1 -AgentProfile balanced -ModelSet default
```

```bash
scripts/install-claude.sh --agent-profile balanced --model-set default
```

See `docs/claude-mapping.md` for tool mapping, `$ARGUMENTS` input adaptation, and the current orchestrator limitations.

### Codex roles

Codex is the Tier 1, first-class runtime for this project.

Copy-paste commands (recommended):

Existing `.codex` files are backed up by default. The installer preserves non-agent Codex settings, replaces the managed agent definitions, and removes stale managed agent files.
Default/primary install path is global `~/.codex`; target `<workspace>/.codex` only when you intentionally want a workspace override.
Global installs now also auto-manage the equivalent of the Codex mode-alias snippet in the active global AGENTS file inside that target: prefer `AGENTS.override.md` when it exists and is non-empty, otherwise use `AGENTS.md`. That managed note makes the authorization and definition-first workflow explicit for recognized mode aliases: a mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization. In a fresh/new session, first consult `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present, otherwise `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition. After applying it, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator, and if the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers inline and should delegate those work items when separately authorized. In the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. It also says that Codex mode simulation can ignore OpenCode-only plugin/command details that are not relevant in the current runtime. Manual snippet copy remains optional for users who are not using the installer.

Windows (PowerShell):

```powershell
$tag = "v0.27.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1; pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.27.0" && curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh" && bash ./bootstrap-install-codex.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.sh | bash
```

Opt-in runtime agent model profile when installing from a cloned repo:

```powershell
pwsh -NoProfile -File .\scripts\install-codex.ps1 -AgentProfile balanced -ModelSet openai
```

```bash
scripts/install-codex.sh --agent-profile balanced --model-set openai
```

Use generated Codex roles either by direct role name in prompts (for example, `Have orchestrator-pipeline ...`) or by leading aliases such as `use pipeline ...` / `使用flow ...`. Those leading aliases change only the current/main agent's working style; they are not requests to first spawn the same-named orchestrator role just to enter the mode, they do not automatically spawn subagents, and they do not override higher-priority `spawn_agent` authorization. In a fresh/new session, the expected behavior for those explicit aliases is definition-first: first consult `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present, otherwise `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition. After the definition is applied, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator; if the definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers inline and should delegate those work items when separately authorized. In the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. The managed note also says Codex mode simulation can ignore OpenCode-only plugin/command details that are not relevant in the current Codex runtime, focusing instead on mode behavior, task decomposition, delegation rules, and output style. Direct role-name prompts remain available when you explicitly want that. Global installer runs now manage that mode note automatically via the active global AGENTS file; the manual snippet remains available in [`docs/codex-mapping.md#global-custom-instructions-snippet`](docs/codex-mapping.md#global-custom-instructions-snippet).

## Developer Install (Clone Repo)

If you are editing this repo or validating installers from your working tree, see [docs/developer-install.md](docs/developer-install.md).
Most users should use the published release bundle commands in `Install (Recommended)` instead.

## How To Use

<details>
<summary>Repo map and platform export notes</summary>

- Agent definitions currently live in `opencode/agents/` (one file per agent). This is a v0.27 transitional canonical path pending the v0.28 neutral-core move.
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `AGENTS.md`.
- Default model and reasoning selection is runtime-driven by the effective Codex configuration.
- Optional Codex model profiles reuse the transitional catalogs under `opencode/tools/agent-profiles/*.json` and `opencode/tools/model-sets/*.json`; see `docs/runtime-agent-model-profiles.md`.
- Claude Code and Copilot profiles are compatibility-export options only; they do not imply runtime feature parity.
- Source agent frontmatter must not define `model` or `provider`; use generated workspace overrides or runtime export profile flags when you intentionally want per-agent model routing.
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
  - `session-guide.md` for stable repo guidance only; keep it limited to non-ephemeral content such as architecture landmarks, conventions, recurring commands, and canonical artifact locations
  - `todo-ledger.json` as the canonical kanban / carryover data (schema in `opencode/protocols/schemas/todo-ledger.schema.json`)
  - `kanban.md` as the human-readable rendered board view derived from `todo-ledger.json`
  - A starter ledger template is provided in `todo-ledger.example.json`.
  - A starter rendered board example is provided in `kanban.example.md`.
  - A starter session guide skeleton is provided in `session-guide.example.md`.
- Use `/run-ci` in `opencode/commands/run-ci.md` for CI/CD planning (docs-first; optional generation).
- Use `/run-modernize` in `opencode/commands/run-modernize.md` for modernization planning (experimental).
- Long-running goal execution is intentionally runtime-native rather than exported as a repository mode: use [Codex `/goal`](https://learn.chatgpt.com/use-cases/follow-goals), [Claude Code `/goal`](https://code.claude.com/docs/en/goal), or [Copilot CLI autopilot](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/autopilot) ([`/delegate`](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/delegate-tasks-to-cca) for cloud execution).
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end
- Use `/run-committee` in `opencode/commands/run-committee.md` for a decision committee (experts + KISS soft-veto + judge)
- Use `/run-simple` in `opencode/commands/run-simple.md` for build-agent-like subagent delegation without run artifacts
- Use `/run-general` in `opencode/commands/run-general.md` for general-purpose mixed workflows (coding/debugging/maintenance/planning/writing/analysis/checklists)
- Use `/run-ux` in `opencode/commands/run-ux.md` for profile-aware UX audits and normal-user scorecards.
- Use `/uiux` in `opencode/commands/uiux.md` for the thin conceptual UI/UX layer routed directly to the hidden subagent `opencode/agents/ui-ux-designer.md`.
- Use `opencode/protocols/UI_UX_WORKFLOW.md` plus `opencode/protocols/schemas/ui-ux-bundle.schema.json` and `opencode/protocols/examples/ui-ux-bundle.valid.json` for the conceptual UI/UX protocol and durable bundle contract.
- Use the repo-managed `opencode/skills/ui-ux-workflow/SKILL.md` for the same bounded conceptual workflow in skill form.
- Use the repo-managed `opencode/skills/ui-communication-designer/SKILL.md` as the communication-first companion to `/uiux` when the work is mainly about task clarity, copy, trust, and screen-level redesign.
- Use the repo-managed `opencode/skills/frontend-aesthetic-director/SKILL.md` for frontend UI implementation and polish. If `/uiux` output or wireframes exist, treat them as the upstream source of truth and refine only visual direction, tokens, responsive behavior, component states, accessibility, and rendered defects.
- Use `/codex-imagegen` plus the repo-managed `opencode/skills/codex-imagegen/SKILL.md` to delegate image generation to Codex CLI `$imagegen` with per-run `image_generation` feature enablement and no API/provider fallback.
- Use `/agent-profile` for deterministic workspace agent model profile installer examples.
- Use the repo-managed `devtools-ux-audit` skill for Chrome DevTools browser evidence collection. Installers mirror it into `~/.agents/skills` as the global baseline and `~/.claude/skills` as a compatibility mirror.
- Use `/skill-list` to inspect installed skills or browse curated catalogs.
- Use `/skill-search` to search installed skills plus curated catalogs.
- Use `/skill-install` to install skills from `anthropic` or `awesome-copilot`, or from a local skill folder.
- Use `opencode/protocols/UX_DEVTOOLS_WORKFLOW.md` as the browser-evidence workflow source behind that skill.
- Use `/session-guide` to create or refresh the root-tracked repo guide.
- Use `/kanban` to manage the root-tracked kanban / carryover ledger.
- Use `/emit-handoff` to create run-local handoff artifacts for a fresh session.
- Use `/usage` to inspect live Codex quota windows.

</details>

## VS Code Copilot Agents

<details>
<summary>Copilot / Claude / Codex reference</summary>

This repo can generate VS Code Copilot custom agents from `opencode/agents/*.md` as a Tier 2 best-effort compatibility output.

- Generate agents directly:

```text
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir /path/to/copilot/agents --strict
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

This repo also generates Tier 2 best-effort Claude Code files from the same transitional `opencode/agents/*.md` source.

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
    { "id": "T2", "agent": "orchestrator-pipeline", "prompt": "Implement phase P1 ...", "deps": ["T1"], "worktree": "../target-project" },
    { "id": "T3", "agent": "reviewer",      "prompt": "Review ...", "deps": ["T2"] }
  ]}
```

**Phase 2 — Execute:** The top-level Claude Code instance runs the plan automatically:

1. Tasks with empty `deps` are spawned in parallel.
2. Tasks with `deps` wait for their dependencies to complete; results are forwarded in the prompt.
3. If a task includes `worktree`, the runner should execute that subagent in the specified repo/worktree. If the runtime cannot honor it, stop and surface the blocker instead of silently using the current repo.
4. After all tasks finish, if the orchestrator needs post-dispatch work (e.g., synthesis), results are sent back via `SendMessage`.

**Which orchestrator to use:**

| Scenario | Orchestrator | Notes |
|----------|-------------|-------|
| Daily engineering tasks | `@orchestrator-flow` | Max 5 atomic tasks, optional reviewer gate |
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

This repo generates its primary Codex multi-agent role config from the transitional `opencode/agents/*.md` source.

- Generate a `.codex`-style config directory:

```text
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir /path/to/.codex --strict
```

- Output structure:
  - `/path/to/.codex/config.toml`
  - `/path/to/.codex/agents/*.toml`

- Safe overwrite behavior:
  - Generation fails if the target contains non-generated files unless you pass `--force`.

- Codex docs / mapping notes:
  - See `docs/codex-mapping.md` for the exact field mapping, global-first install notes, and the reusable custom-instructions snippet.

- Invocation note:
  - Ask Codex to use role names in prompts, or use the global custom-instructions snippet and leading aliases such as `use pipeline ...` / `使用flow ...`; those aliases only change the current agent's working style and do not auto-spawn subagents.
  - Do not expect `/agent` to display generated custom roles from `config.toml`.
  - Example: `Have reviewer inspect the patch and have generalist draft the migration notes.`

</details>

## Quick Start

1) Install the Codex roles into `~/.codex` (or intentionally into a workspace `.codex`).
2) Start Codex in the target repository and use a leading mode alias:

```text
use pipeline Implement OAuth2 login
```
3) Optional smoke-check request:

```text
use pipeline Run tests only --test-only
```

Codex owns model reasoning through its runtime configuration. The workflow derives verification, review, and repair rigor from task risk and explicit workflow flags.

### Legacy OpenCode commands

The following surfaces describe the frozen OpenCode integration. Use `v0.26.1` if you still depend on them; they are no longer the primary project interface.

- `/run-pipeline ...`
  Default end-to-end implementation flow.
- `/run-analysis ...`
  Runs a bounded post-hoc analysis pipeline for correctness, complexity, robustness, and conditional numerics review.
- `/codex-imagegen ...`
  Generates or edits images by delegating to Codex CLI `$imagegen` with Codex quota, per-run `image_generation` enablement, and no API/provider fallback.
- `/artgen ...`
  Produces the normal bounded 2D asset brief/prompt package, and with `--gen-provider=codex` can also hand the final prompt to Codex image generation using `danger-full-access` for that delegated imagegen step.
- `/usage`
  Shows live Codex quota windows.
- `/usage-status-on`
  Turns on the usage footer plugin.
- `/usage-status-refresh`
  Forces a fresh usage refresh.
- `/run-monetize ...`
  Runs a monetization analysis flow with a dedicated market-research lane and monthly USD scenarios.

### Local Codex account commands

These commands manage OpenCode's local `openai-codex-accounts.json` selection file when one exists.

- `/codex-account`
  Lists discovered local Codex account-selection files, the active stored account, and the switchable choices.
- `/codex-account-switch --email=<address-or-label>`
  Switches to a specific stored account.
- `/codex-account-switch --index=<n>`
  Switches to the stored account entry that owns that index.
- `/next-codex-account`
  Rotates to the next stored account in the selected file.

Behavior notes:

- If only one stored account is available, `/next-codex-account` is a no-op and returns a note explaining there is nothing to rotate.
- If no local OpenCode account-selection file exists, these commands report that clearly instead of guessing.
- These commands only manage OpenCode's local stored account-selection file. They do not create new logins by themselves.
- If Codex usage is coming only from `~/.codex/auth.json` and there is no OpenCode project account file, `/usage` can still work while `/next-codex-account` has nothing to rotate.

Examples:

```text
/codex-account
/codex-account --json
/codex-account-switch --email=bohewu@gmail.com
/codex-account-switch --index=2
/next-codex-account
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

- `modernize/modernize-source-assessment.md`
- `modernize/modernize-target-design.md`
- `modernize/modernize-migration-strategy.md`
- `modernize/modernize-migration-roadmap.md`
- `modernize/modernize-migration-risks.md`
- `modernize/modernize-index.md`

Modes:

- `/run-modernize --decision-only` (source-assessment + target-design + migration-strategy only)
- `/run-modernize --iterate` (one revision round after initial docs)
- `/run-modernize --mode=branch` (create a modernization branch before writing docs; repo-local planning)
- `/run-modernize --mode=branch --execute-phase=P1` (create a branch, write docs, then implement one selected phase on that branch)

Branch mode:

- Creates/switches to a `modernize/<slug>-<YYYYMMDD>` branch before writing docs, checkpoints, status files, or handoff files.
- Accepts `--branch=<name>` for an exact branch name; if that branch already exists, the run stops instead of silently suffixing or reusing it.
- Blocks on a dirty worktree instead of stashing, committing, or discarding changes automatically.
- Does not require runtime worktree support; execution stays in the current repo on the new branch.
- Without `--execute-phase=<phase-id>`, stops after planning and renders a branch-local `/run-pipeline` continuation command.
- Note: ignored/untracked files such as `.pipeline-output/` may remain on disk after switching branches, even though tracked changes are isolated by Git branch.

Recommended execution split:

- Start `/run-modernize` in the source project.
- Keep modernization docs and handoff files under the source project's `.pipeline-output/modernize/`.
- In same-session execution-enabled runs, target-local `.pipeline-output/` should be created as soon as delegated implementation starts.
- Once implementation starts, switch to the target project for `/run-pipeline` runs.
- Keep implementation/test/review artifacts under the target project's `.pipeline-output/pipeline/`.
- Mirror the latest modernization handoff into the target project's `.pipeline-output/modernize/` when the target directory exists.
- If the target project does not exist yet, create it manually before running execution modes.

## General-Purpose Pipeline

Use `/run-general` for general-purpose mixed work such as:

- small or moderate coding/debugging tasks
- repo maintenance and validation fixes
- strategy/roadmap planning
- process/SOP design
- structured analysis and recommendation memos
- checklist/playbook drafting

Examples:

```text
/run-general Draft a 90-day GTM roadmap
/run-general Fix the failing profile validation test --full-auto
/run-general Compare three vendor evaluation frameworks
/run-general Create an onboarding SOP for support team --confirm
```

General pipeline outputs are human-friendly by default:
- plain-language summary first
- clear Markdown sections
- actionable next steps

## Simple Dispatcher

Use `/run-simple` when you want build-agent-like execution with automatic subagent delegation but no pipeline artifacts:

- no `.pipeline-output/` run manifest, checkpoint, status, task-list, or dispatch-plan files
- existing subagents are selected for implementation, docs, tests, review, or mechanical edits
- parallel subagent dispatch is capped by `--max-parallel=<n>`

Examples:

```text
/run-simple Fix the failing profile validation test
/run-simple Update docs and run focused validation --max-parallel=2
```

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

Even if a runtime can do same-session cross-repo delegation, a fresh target-project session remains the recommended continuation path for modernization follow-up work.

</details>

## Conceptual UI/UX Layer

Use this thin layer when you need conceptual UI/UX direction before implementation-ready spec work or after `/run-ux` findings need a bounded redesign pass.

- Entry command: `/uiux` in `opencode/commands/uiux.md`
- Hidden subagent: `ui-ux-designer` in `opencode/agents/ui-ux-designer.md`
- Protocol, non-expert guidance, and intake/review rubric: `opencode/protocols/UI_UX_WORKFLOW.md`
- Contract bundle schema: `opencode/protocols/schemas/ui-ux-bundle.schema.json`
- Valid example bundle: `opencode/protocols/examples/ui-ux-bundle.valid.json`
- Repo-managed skill: `opencode/skills/ui-ux-workflow/SKILL.md`
- Repo-managed companion skill: `opencode/skills/ui-communication-designer/SKILL.md`

Use `/uiux` for conceptual assessments, low-fi wireframes, mid-fi drafts, flows, communication-first rewrites, revised task flows, targeted microcopy rewrites, prompt export, and thin read-only preview handoffs. Use `/run-ux` for audits, `/run-spec` for implementation-ready specs, and `/artgen` for bounded 2D asset briefs plus optional Codex-backed generation via `--gen-provider=codex`.

If you want repo-owned export assets instead of inline-only output, pass `--output-dir=<path>`. Example:

```text
/uiux Concept a privacy settings refactor for a desktop app --output-dir=output/uiux/
```

This writes a paired durable bundle under the selected repo path:

- `<output-dir>/<bundle-slug>.ui-ux-bundle.json`
- `<output-dir>/<bundle-slug>.ui-ux-bundle.md`

## Frontend UI Implementation

Use the repo-managed `frontend-aesthetic-director` skill when a task changes visible frontend UI and should produce implementation-quality polish rather than only a conceptual handoff. For screenshot, wireframe, or copy critique before implementation, use `/uiux` or `ui-communication-designer` first.

- Skill: `opencode/skills/frontend-aesthetic-director/SKILL.md`
- Upstream concept source: `/uiux` bundles, wireframes, screenshots, or Figma notes
- Polish reference: `opencode/skills/frontend-aesthetic-director/references/polish-checklist.md`
- Verification pairing: browser tooling, Playwright, screenshots, or `opencode/skills/devtools-ux-audit/SKILL.md` when rendered evidence is needed

The intended handoff is `/uiux` -> frontend implementation -> rendered QA. If a `/uiux` bundle already exists, preserve its flow, surface structure, primary action, and copy intent. For existing UI cleanup, choose a preserve-vs-modernize level before choosing the concrete layout/style direction. The frontend skill should only refine visual hierarchy, tokens, spacing, responsive behavior, component states, accessibility, and defects found during rendered inspection unless the upstream handoff is impossible to implement.

For localized landing page edits, dashboard polish, component styling, forms, tables, and visual hierarchy improvements, scale verification to task risk and include design-system scanning and visual QA. Runtime reasoning settings are not a substitute for browser evidence, content realism, responsive checks, or accessibility states.

Example:

```text
/run-flow Implement output/uiux/onboarding.ui-ux-bundle.md as the onboarding page. Preserve the /uiux wireframe and flow; use frontend-aesthetic-director for visual polish, design tokens, responsive behavior, and browser QA.
```

## Protocol Validation

Validate a JSON output against the protocol schemas:

Python 3.9+ is required for this command.

```text
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-list.schema.json --input path/to/task-list.json
```

Status contract fixtures follow the same validation pattern. To mirror the repository's status-layer CI checks locally, validate the positive fixtures and confirm the negative fixtures fail:

```text
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.run-only.valid/run-status.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/run-status.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-doc-summary.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-process-build.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-local-server-smoke.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-browser-resume.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-doc-01.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-process-01.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-server-01.json --require-jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-browser-02.json --require-jsonschema
```

To replay the local-preview lifecycle boundary behind the `devtools-ux-audit` guidance, run:

```text
node scripts/validate-local-preview-lifecycle-smoke.cjs
```

See `opencode/protocols/SCHEMAS.md` and `opencode/protocols/VALIDATION.md` for the status layout fixture set and the negative-fixture expectations enforced in CI.
For ownership boundaries and the follow-on roadmap, see `opencode/protocols/STATUS_MVP_HANDOFF.md`.


If you enable custom tools, you can call the `validate-schema` tool from OpenCode
instead of running the script manually (see `opencode/tools/validate-schema.ts`).

The `/usage` command relies on the custom tool `provider-usage` for live Codex quota
inspection (see `opencode/tools/provider-usage.ts`).

The `/codex-imagegen` command relies on the custom tool `codex-imagegen` to invoke
Codex CLI `$imagegen` with the local Codex login and per-run `image_generation`
feature enablement. It intentionally does not call direct image APIs or use provider
fallbacks (see `opencode/tools/codex-imagegen.ts`). If OpenCode cannot see `codex`
on `PATH`, pass `codex_command` or set `CODEX_IMAGEGEN_CODEX_COMMAND`; on Windows
the tool also checks common npm/fnm Codex CLI install paths before warning. Use
`--output-path=path/to/file.png` when the generated image needs a deterministic
file target; the command maps it to the tool's `output_path` argument.

The `/skill-list`, `/skill-search`, and `/skill-install` commands rely on the custom
tool `skill-manager` for local skill discovery plus curated catalog installs from
`anthropics/skills` and `github/awesome-copilot` (see `opencode/tools/skill-manager.py`
and `opencode/tools/skill-manager.ts`).
Use `--ref=<tag|sha>` for reproducible remote skill installs instead of mutable default-branch HEAD.

See `docs/external-dependencies.md` for auth requirements, rate limits, privacy boundaries, fallback behavior, and remote-install auditability notes.

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
- `--resume`
  - Resume from the newest compatible `<run_output_dir>/checkpoint.json` under the selected output root
  - Can be used without a new prompt (reuses `checkpoint.user_prompt` when valid)
- `--commit=off|before|after`
  - Optional git helper lane for pre-run or post-run commits
  - Does not consume Flow's max-5 task budget or the pipeline `TaskList` quota
  - Explicit `--commit=*` wins over workflow-style commit wording in the prompt
- `--review=off|on`
  - Flow-only optional post-synthesis reviewer gate
  - `--commit=after` waits for a passing review when `--review=on`
  - Reviewer failures in Flow allow at most one bounded repair + re-review pass; no delta-task retry loop is introduced
- `--max-retry=<n>`
  - Cap bounded workflow repair/retry rounds explicitly
  - Does not control model reasoning; that remains a runtime setting
- `--compress`
  - Write reusable `context-pack.json` at the end of the run
  - On clearly trivial successful runs, the pipeline writes a minimal valid pack inline instead of paying for a separate compressor subagent call
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
  - Defaults to `--max-retry=5` unless you override it explicitly
  - Uses risk-derived verification and review rather than a workflow-wide effort mode
  - Prefers the strongest safe bounded in-scope blocker recovery path before surfacing a non-hard blocker
  - Still stops on hard blockers and does not permit scope expansion or leaving resources running

Flag precedence:
- `--dry` overrides `--test-only` when both are present.
- `--full-auto` implies `--autopilot`.
- `--autopilot` overrides interactive pauses from `--confirm` / `--verbose`.
- `--commit=*` runs as a workflow helper, not a canonical task.

Examples:
```
/run-pipeline Refactor cache layer --no-test
/run-flow --resume
/run-pipeline --resume --autopilot
/run-pipeline Implement OAuth2 login --commit=before
/run-flow Ship login improvements --full-auto
/run-flow Ship login improvements --commit=after
/run-flow Ship login improvements --review=on --commit=after
/run-pipeline Ship migration end-to-end --full-auto
```

## When to Use `--autopilot` vs `--full-auto`

| Scenario | Recommended flag | Why |
|----------|-----------------|-----|
| Quick task, low risk, you just want no pauses | `--autopilot` | Runs non-interactively with risk-derived verification and default retries; stops on hard blockers |
| You want to walk away and let the pipeline finish | `--full-auto` | Non-interactive preset with strongest safe bounded recovery before surfacing non-hard blockers |
| You want non-interactive with a tighter repair budget | `--autopilot --max-retry=1` | Autopilot suppresses pauses while the explicit retry cap bounds repair rounds |
| You want full-auto but cap retries | `--full-auto --max-retry=2` | full-auto sets the baseline; explicit flags still override |
| Flow task, want forced repo scouting | `--full-auto` | Flow full-auto defaults to `--force-scout` |
| Modernize full-exec, no supervision | `--full-auto` | Defaults depth to `deep`, disables pauses, and forwards stronger full-auto behavior to delegated pipeline phases |

**Rule of thumb:**
- `--autopilot` = "don't ask me questions, use safe defaults"
- `--full-auto` = "don't ask me questions, try your hardest to finish everything"

Both flags stop on **hard blockers** (destructive actions, security/billing impact, missing credentials). The difference is that `--full-auto` also raises the retry/recovery preset and prefers the strongest safe bounded in-scope recovery before giving up on non-hard blockers.

Explicit flags always win: `--full-auto --max-retry=1` keeps full-auto's non-interactive recovery posture while capping workflow repair at one retry.

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
- Flow: `/run-flow` (max 5 atomic tasks; bounded parallel execution; reviewer optional; no delta-task retries)
- Simple: `/run-simple` (build-agent-like subagent dispatcher; no run artifacts)
- Committee: `/run-committee` (decision support; experts + KISS soft-veto + judge)
- General: `/run-general` (general dispatcher for coding, maintenance, planning, writing, and analysis)
- UX: `/run-ux` (normal-user experience audit with profile-aware viewport scoring)
- CI: `/run-ci` (docs-first CI/CD planning; optional generation)
- Modernize: `/run-modernize` (experimental modernization planning docs)
- Modernize branch: `/run-modernize --mode=branch` (branch-first repo-local modernization planning, optional selected-phase execution)

## Choosing a Pipeline (Quick Guide)

- Use `/run-committee` when:
  - you need a recommendation/decision (architecture, tradeoffs, approach selection)
  - you want multiple perspectives + a final judge, with budget as an explicit criterion
- Use `/run-analysis` when:
  - you want a post-hoc findings report instead of code changes
  - you need severity-ranked correctness / complexity / robustness review grounded in code references
- Use `/run-flow` when:
  - the change is small, low-risk, and you mainly want a fast execution plan (max 5 atomic tasks)
- Use `/run-simple` when:
  - you want build-agent-like execution with automatic subagent delegation
  - you do not want `.pipeline-output/`, run manifests, checkpoint/status files, task lists, or dispatch plans
  - you want to cap parallel subagents with `--max-parallel=<n>`
- Use `/run-spec` when:
  - you want to review a development spec before implementation starts
  - you want a human-readable `DevSpec` plus a machine-readable handoff for later `/run-pipeline` execution
- Use `/run-general` when:
  - you want the default general dispatcher for mixed repository work
  - the task may involve coding, debugging, maintenance, planning, analysis, writing, or operational documentation
  - you want either direct completion or a concrete `/run-pipeline` / `/run-flow` handoff recommendation, not a generic refusal
- Use `/run-ux` when:
  - you want a bounded UX audit from a normal-user perspective
  - you need profile-aware scoring across desktop/mobile viewports without assuming mobile-first behavior
  - you want prioritized UX findings and a practical scorecard before implementation changes
- Use `/run-pipeline` when:
  - the change is high-risk, multi-file/systemic, or needs reviewer gates + bounded retries

## Naming Convention

- Repo name (`agents-pipeline`) reflects the overall concept.
- Full pipeline uses `*-pipeline` naming (e.g. `orchestrator-pipeline.md`, `run-pipeline.md`).
- Flow pipeline uses `*-flow` naming (e.g. `orchestrator-flow.md`, `run-flow.md`).
- Simple dispatcher uses `*-simple` naming (e.g. `orchestrator-simple.md`, `run-simple.md`).
- General-purpose pipeline uses `*-general` naming (e.g. `orchestrator-general.md`, `run-general.md`).
- Spec pipeline uses `*-spec` naming (e.g. `orchestrator-spec.md`, `run-spec.md`).
- CI pipeline uses `*-ci` naming (e.g. `orchestrator-ci.md`, `run-ci.md`).
- Modernize pipeline uses `*-modernize` naming (e.g. `orchestrator-modernize.md`, `run-modernize.md`).
- Analysis pipeline uses `*-analysis` naming (e.g. `orchestrator-analysis.md`, `run-analysis.md`).
- UX pipeline uses `*-ux` naming (e.g. `orchestrator-ux.md`, `run-ux.md`).

</details>

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator-ci | CI/CD planning pipeline | Implementing code |
| orchestrator-modernize | Modernization planning pipeline, branch setup, execution handoff | Implementing code directly |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-spec | Development spec orchestration | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-simple | Build-style subagent dispatch without run artifacts | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
| orchestrator-general | General-purpose task routing and synthesis | Direct implementation instead of delegation |
| orchestrator-analysis | Post-hoc analysis orchestration | Implementing code |
| orchestrator-ux | UX audit orchestration with profile-aware scoring | Implementing code |
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

## Versioning

<details>
<summary>Maintainer release notes</summary>

- Single source of truth: root `VERSION` file (SemVer without `v`, for example `0.27.0`).
- Use SemVer tags with `v` prefix (for example: `v0.27.0`).
- Stay in `0.x` while the pipeline and prompts evolve quickly.
- In `0.x`, treat **minor** bumps as potentially breaking (`v0.5.0` -> `v0.6.0`).
- Use **patch** bumps for docs/scripting fixes without intended behavior changes.
- Release CI checks `VERSION` and tag alignment (`VERSION=0.27.0` must release as `v0.27.0`).
- After bumping `VERSION`, run `python3 scripts/sync-readme-version.py` to refresh the pinned README release examples before commit.
- README pinned examples that include explicit release versions must use the current `VERSION` value; CI validates those exact snippets.
- Track release notes in `CHANGELOG.md`.

## Release CI

- Workflow: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v0.27.0`) or manual `workflow_dispatch`
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
git tag v0.27.0
git push origin v0.27.0
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

<p align="center">
  <img src="docs/repo-footer-art.png" width="920" alt="Playful footer illustration of a multi-agent orchestration control room for agents_pipeline">
</p>

<p align="center"><sub>Generated with this repo's own <code>/artgen --gen-provider=codex</code> flow.</sub></p>
