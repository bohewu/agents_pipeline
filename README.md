# Multi-Agent Pipeline

Multi-agent workflows for OpenCode with companion agent docs for Claude Code, VS Code Copilot, and Codex.
This repository (`bohewu/agents_pipeline`) contains the workflow assets, protocols, tools, and plugins for **Multi-Agent Pipeline**, with `opencode/agents/*.md` as the single source of truth.
See the **How To Use** section below for usage instructions.

## Contents

- [TL;DR](#tldr)
- [Project Docs](#project-docs)
- [Usage Prerequisites](#usage-prerequisites)
- [Install (Recommended)](#install-recommended)
- [Developer Install (Clone Repo)](#developer-install-clone-repo)
- [How To Use](#how-to-use)
- [Quick Start](#quick-start)
- [VS Code Copilot Agents](#vs-code-copilot-agents)
- [Claude Code Subagents](#claude-code-subagents)
- [Codex Agent Roles](#codex-agent-roles)
- [Conceptual UI/UX Layer](#conceptual-uiux-layer)
- [Frontend UI Implementation](#frontend-ui-implementation)
- [Workspace Agent Model Profiles](#workspace-agent-model-profiles)
- [Protocol Validation](#protocol-validation)
- [Config Example](#config-example)
- [Flags](#flags)
- [Orchestrators](#orchestrators)
- [Versioning](#versioning)

## TL;DR

- Most users should use the published release bundle install commands in `Install (Recommended)`.
- Fastest Ubuntu/macOS/Linux all-in-one path: paste the one-liner in `All local assets`; no extra `chmod` step is needed for that path.
- If you are editing this repo or testing local changes from your working tree, use `Developer Install (Clone Repo)`.
- Most common run: `/run-pipeline Implement OAuth2 login --effort=balanced`
- Optional workspace model routing: use `agent-profile.ps1` or `agent-profile.sh` to generate `.opencode/agents` overrides from tiered profiles and provider model sets.

## Project Docs

- `CONTRIBUTING.md` for repo layout, single-source-of-truth rules, local validation, and release expectations.
- `SECURITY.md` for private vulnerability reporting and token/supply-chain handling guidance.
- `COMPATIBILITY.md` for runtime and host-environment assumptions.
- `docs/external-dependencies.md` for network/auth/rate-limit/fallback/privacy notes on `provider-usage`, `skill-manager`, and bootstrap installers.
- `docs/art-generation-scaffold.md` for the bounded 2D asset brief/prompt scaffold, standardized External Handoff Package, Direct Use Prompt, and optional `/artgen --gen-provider=codex` bridge used by the repo-managed `artgen-scaffold` skill, `art-director`, and the normal `/artgen` surface.
- `opencode/skills/codex-imagegen/SKILL.md` for the Codex CLI `$imagegen` bridge used by `/codex-imagegen` when OpenCode should generate images through Codex quota without direct API or provider fallback.
- `opencode/protocols/UI_UX_WORKFLOW.md` for the thin conceptual UI/UX layer, non-expert design/interaction guidance, communication-first overlay, intake/review rubric, and the `ui-ux-bundle` schema/example bundle used by `/uiux`, `ui-ux-designer`, and the repo-managed `ui-ux-workflow` and `ui-communication-designer` skills.
- `opencode/skills/frontend-aesthetic-director/SKILL.md` for frontend implementation and polish tasks that need visual direction, design-token alignment, responsive behavior, accessibility states, and rendered browser/Playwright QA.
- `docs/agent-model-profiles.md` for workspace-local OpenCode agent model profiles, provider model sets, and safe generated overrides under `.opencode/agents`.

## Usage Prerequisites

This repo assumes you have configured the required model providers in OpenCode.
If no model/provider is available in your OpenCode runtime config, update `opencode.json` (or your global OpenCode config) before running any commands.
Compatibility assumptions and optional dependencies are documented in `COMPATIBILITY.md`.

### Required Tools

- OpenCode (with model providers configured)
- Claude Code (optional; default install target: `~/.claude/agents`)
- VS Code with GitHub Copilot (for Copilot custom-agent usage)
- Codex CLI (optional; for Codex multi-agent usage)
- Python 3.9+ (required for `opencode/tools/validate-schema.py`, `opencode/tools/agent-profile.sh`, `scripts/export-copilot-agents.py`, and `scripts/export-codex-agents.py`)
- PowerShell 7+ (for `scripts/install.ps1` on Windows) or Bash (for `scripts/install.sh` on macOS/Linux)
- `curl` + `tar` + `sha256sum` (or `shasum`) for release-bundle bootstrap install on macOS/Linux
- GitHub CLI (`gh`) is optional, but bootstrap installers use it to verify GitHub Artifact Attestations when available

## Workspace Agent Model Profiles

OpenCode core installs include deterministic workspace profile installers for per-agent model routing. Profiles map agents to logical tiers (`mini`, `standard`, `strong`), and model sets map those tiers to concrete provider model IDs so provider changes or model version updates stay centralized.

PowerShell:

```powershell
pwsh ~/.config/opencode/tools/agent-profile.ps1 list
pwsh ~/.config/opencode/tools/agent-profile.ps1 install balanced -ModelSet openai -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install uniform -Model openai/gpt-5.4 -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 status -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 clear -Workspace .
```

Bash/macOS/Linux:

```bash
bash ~/.config/opencode/tools/agent-profile.sh list
bash ~/.config/opencode/tools/agent-profile.sh install balanced --model-set openai --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install uniform --model openai/gpt-5.4 --workspace .
bash ~/.config/opencode/tools/agent-profile.sh status --workspace .
bash ~/.config/opencode/tools/agent-profile.sh clear --workspace .
```

Generated overrides live in `.opencode/agents`; canonical `opencode/agents/*.md` remains unchanged. Restart OpenCode after changing profiles. See [docs/agent-model-profiles.md](docs/agent-model-profiles.md).

Maintainers can refresh bundled Anthropic and Google model-set catalogs with `python3 scripts/update-agent-model-sets.py --dry-run`.

## Install (Recommended)

These commands install from the published release bundle and are the default path for most users.

Bootstrap installers download a release bundle, verify the archive checksum against the release `SHA256SUMS` asset, and, when `gh` is available, verify the GitHub Artifact Attestation before installing only the target you choose.
See `docs/external-dependencies.md` for external fetch, auth, and supply-chain notes for bootstrap/release installs.

Attestation details stay quiet by default. Use `--verbose` on Bash bootstrap scripts or `-Verbose` on PowerShell bootstrap scripts if you want to see the attestation verification steps.

Most common choices:

- Want everything in one step: start with `All local assets`.
- Already have OpenCode and only need the runtime status plugin: use `Status plugin only`.
- Only want `/usage` plus the usage footer plugin: use `Usage only`.
- Want OpenAI or GitHub Copilot GPT-5 reasoning floor controls in OpenCode: use `Effort-control plugin only`.
- Only need one editor/CLI integration: jump to `Copilot agents`, `Claude Code subagents`, or `Codex roles`.

Pick the install target that matches what you want:

- [OpenCode core](#opencode-core): install the main OpenCode config only.
- [Status plugin only](#status-plugin-only): install just the OpenCode status runtime plugin.
- [Usage only](#usage-only): install just the usage command/tool and the usage-status plugin.
- [Effort-control plugin only](#effort-control-plugin-only): install just the OpenCode GPT-5 reasoning-effort controller for OpenAI and GitHub Copilot.
- [All local assets](#all-local-assets): install OpenCode core + status/usage/effort plugins + Copilot + Claude + Codex in one step.
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
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1; pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag -Target "$HOME\.config\opencode"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install.sh" && bash ./bootstrap-install.sh --version "${tag}"
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
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-plugin-status-runtime.ps1" -OutFile .\bootstrap-install-plugin-status-runtime.ps1; pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install-plugin-status-runtime.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-plugin-status-runtime.sh" && bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js"
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
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-usage-only.ps1" -OutFile .\bootstrap-install-usage-only.ps1; pwsh -NoProfile -File .\bootstrap-install-usage-only.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -UsagePluginTarget "$HOME\.config\opencode\plugins\usage-status.js"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install-usage-only.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-usage-only.sh" && bash ./bootstrap-install-usage-only.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --usage-plugin-target "$HOME/.config/opencode/plugins/usage-status.js"
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

### Effort-control plugin only

Install only the OpenCode effort-control plugin from the release bundle.
Use this when you want the reasoning controller without installing the rest of the all-in bundle.
The installer registers the TUI plugin in `~/.config/opencode/tui.json`, not in `opencode.json`.

Windows (PowerShell):

```powershell
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-plugin-effort-control.ps1" -OutFile .\bootstrap-install-plugin-effort-control.ps1; pwsh -NoProfile -File .\bootstrap-install-plugin-effort-control.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\effort-control.js"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install-plugin-effort-control.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-plugin-effort-control.sh" && bash ./bootstrap-install-plugin-effort-control.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/effort-control.js"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-plugin-effort-control.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\effort-control.js" -DryRun
```

```bash
bash ./bootstrap-install-plugin-effort-control.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/effort-control.js" --dry-run
```

Behavior notes:

- For OpenAI and GitHub Copilot `gpt-5*`, the plugin floors most execution/review-style agents to at least `medium`, but leaves structured low-reasoning roles such as `specifier`, `planner`, `router`, `repo-scout`, `flow-splitter`, `codex-account-manager`, and `test-runner` excluded.
- Frontend UI work is not escalated to xhigh by default. For page, dashboard, or component polish, pair medium/high effort with `opencode/skills/frontend-aesthetic-director/SKILL.md` and rendered QA instead of relying on reasoning effort alone.
- `/effort-medium`, `/effort-high`, and `/effort-max` set a reasoning floor. On the home screen they set a project default; inside a session they set a session override.
- `/effort-clear` removes the current session override or the project default.
- Verification traces are written under the active project at `.opencode/effort-control.trace.jsonl`.

### All local assets

Install OpenCode core assets, the OpenCode-only status-runtime plugin, the OpenCode-only usage-status plugin, the OpenCode-only effort-control plugin, Copilot agents, Claude agents, and Codex config together from one release bundle.

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-all-local.ps1" -OutFile .\bootstrap-install-all-local.ps1; pwsh -NoProfile -File .\bootstrap-install-all-local.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -PluginTarget "$HOME\.config\opencode\plugins\status-runtime.js" -EffortPluginTarget "$HOME\.config\opencode\plugins\effort-control.js" -CopilotTarget "$HOME\.copilot\agents" -ClaudeTarget "$HOME\.claude\agents" -CodexTarget "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.22.26" && tmp="$(mktemp)" && curl -fsSL -o "$tmp" "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-all-local.sh" && bash "$tmp" --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --effort-plugin-target "$HOME/.config/opencode/plugins/effort-control.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex" && rm -f "$tmp"
```

Ubuntu/macOS/Linux notes if you prefer downloading the script first:

- The easiest copy-paste path is to pipe the pinned bootstrap script into `bash`; this avoids the downloaded-file executable-bit problem entirely.
- If you download the bootstrap script first, run it as `bash ./bootstrap-install-all-local.sh ...`.
- A script fetched with `curl -o ./bootstrap-install-all-local.sh ...` usually does **not** have the executable bit on Ubuntu, so `./bootstrap-install-all-local.sh ...` can fail with `permission denied`.
- If you specifically want `./bootstrap-install-all-local.sh ...`, run `chmod +x ./bootstrap-install-all-local.sh` first.

Download-then-run version:

```bash
tag="v0.22.26"
curl -fsSL -o ./bootstrap-install-all-local.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-all-local.sh"
bash ./bootstrap-install-all-local.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --effort-plugin-target "$HOME/.config/opencode/plugins/effort-control.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex"
```

Dry-run preview (resolves release metadata only):

```powershell
pwsh -NoProfile -File .\bootstrap-install-all-local.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -PluginTarget "$HOME\.config\opencode\plugins\status-runtime.js" -EffortPluginTarget "$HOME\.config\opencode\plugins\effort-control.js" -CopilotTarget "$HOME\.copilot\agents" -ClaudeTarget "$HOME\.claude\agents" -CodexTarget "$HOME\.codex" -DryRun
```

```bash
bash ./bootstrap-install-all-local.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --plugin-target "$HOME/.config/opencode/plugins/status-runtime.js" --effort-plugin-target "$HOME/.config/opencode/plugins/effort-control.js" --copilot-target "$HOME/.copilot/agents" --claude-target "$HOME/.claude/agents" --codex-target "$HOME/.codex" --dry-run
```

### Copilot agents

Copy-paste commands (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1; pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh" && bash ./bootstrap-install-copilot.sh --version "${tag}"
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
$release = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$release/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1; pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $release -Target "$HOME\.claude\agents"
```

macOS/Linux:

```bash
release="v0.22.26" && curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${release}/scripts/bootstrap-install-claude.sh" && bash ./bootstrap-install-claude.sh --version "${release}" --target "$HOME/.claude/agents"
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
$tag = "v0.22.26"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1; pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

macOS/Linux:

```bash
tag="v0.22.26" && curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh" && bash ./bootstrap-install-codex.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.sh | bash
```

## Developer Install (Clone Repo)

If you are editing this repo or validating installers from your working tree, see [docs/developer-install.md](docs/developer-install.md).
Most users should use the published release bundle commands in `Install (Recommended)` instead.

## How To Use

<details>
<summary>Repo map and platform export notes</summary>

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `AGENTS.md`.
- Default model selection is runtime-driven by OpenCode/provider configuration.
- Optional workspace model profiles can generate `.opencode/agents` overrides from `opencode/tools/agent-profiles/*.json` and `opencode/tools/model-sets/*.json`.
- Source agent frontmatter must not define `model` or `provider`; use generated workspace overrides when you intentionally want per-agent model routing.
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
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end
- Use `/run-committee` in `opencode/commands/run-committee.md` for a decision committee (experts + KISS soft-veto + judge)
- Use `/run-general` in `opencode/commands/run-general.md` for non-coding general-purpose workflows (planning/writing/analysis/checklists)
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
- Use `/usage` to inspect live Codex quota windows and optionally summarize a Copilot premium-request usage report.

</details>

## VS Code Copilot Agents

<details>
<summary>Copilot / Claude / Codex reference</summary>

This repo can generate VS Code Copilot custom agents from `opencode/agents/*.md` with single-source maintenance.

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
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir /path/to/.codex --strict
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

### Common OpenCode commands

- `/run-pipeline ...`
  Default end-to-end implementation flow.
- `/run-analysis ...`
  Runs a bounded post-hoc analysis pipeline for correctness, complexity, robustness, and conditional numerics review.
- `/codex-imagegen ...`
  Generates or edits images by delegating to Codex CLI `$imagegen` with Codex quota, per-run `image_generation` enablement, and no API/provider fallback.
- `/artgen ...`
  Produces the normal bounded 2D asset brief/prompt package, and with `--gen-provider=codex` can also hand the final prompt to Codex image generation using `danger-full-access` for that delegated imagegen step.
- `/usage`
  Shows live Codex quota windows and optional Copilot premium-request usage.
- `/usage-status-on`
  Turns on the usage footer plugin.
- `/usage-status-refresh`
  Forces a fresh usage refresh.
- `/effort-medium`, `/effort-high`, `/effort-max`
  Sets a reasoning-effort floor for supported GPT-5 sessions.
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
- In same-session execution-enabled runs, target-local `.pipeline-output/` should be created as soon as delegated implementation starts.
- Once implementation starts, switch to the target project for `/run-pipeline` runs.
- Keep implementation/test/review artifacts under the target project's `.pipeline-output/pipeline/`.
- Mirror the latest modernization handoff into the target project's `.pipeline-output/modernize/` when the target directory exists.
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

Use the repo-managed `frontend-aesthetic-director` skill when a task changes visible frontend UI and should produce implementation-quality polish rather than only a conceptual handoff.

- Skill: `opencode/skills/frontend-aesthetic-director/SKILL.md`
- Upstream concept source: `/uiux` bundles, wireframes, screenshots, or Figma notes
- Verification pairing: browser tooling, Playwright, screenshots, or `opencode/skills/devtools-ux-audit/SKILL.md` when rendered evidence is needed

The intended handoff is `/uiux` -> frontend implementation -> rendered QA. If a `/uiux` bundle already exists, preserve its flow, surface structure, primary action, and copy intent. The frontend skill should only refine visual hierarchy, tokens, spacing, responsive behavior, component states, accessibility, and defects found during rendered inspection unless the upstream handoff is impossible to implement.

For localized landing page edits, dashboard polish, component styling, forms, tables, and visual hierarchy improvements, prefer medium or high execution effort plus design-system scanning and visual QA. Do not treat xhigh reasoning as the default substitute for browser evidence, content realism, responsive checks, or accessibility states.

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
inspection, live Copilot quota lookup, and Copilot report parsing (see
`opencode/tools/provider-usage.ts`).

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
- `--effort=low|balanced|high`
  - low: Favor the smallest viable plan and fewer retries
  - balanced: Practical default depth with standard validation
  - high: Allow deeper analysis and higher execution rigor
- `--resume`
  - Resume from the newest compatible `<run_output_dir>/checkpoint.json` under the selected output root
  - Can be used without a new prompt (reuses `checkpoint.user_prompt` when valid)
- `--commit=off|before|after`
  - Optional git helper lane for pre-run or post-run commits
  - Does not consume Flow's max-5 task budget or the pipeline `TaskList` quota
  - Explicit `--commit=*` wins over workflow-style commit wording in the prompt
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
  - Defaults to `--effort=high` and `--max-retry=5` unless you override them explicitly
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
/run-pipeline Improve search relevance --effort=balanced
/run-flow --resume
/run-pipeline --resume --autopilot
/run-pipeline Implement OAuth2 login --commit=before
/run-flow Ship login improvements --full-auto
/run-flow Ship login improvements --commit=after
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
- UX: `/run-ux` (normal-user experience audit with profile-aware viewport scoring)
- CI: `/run-ci` (docs-first CI/CD planning; optional generation)
- Modernize: `/run-modernize` (experimental modernization planning docs)

## Choosing a Pipeline (Quick Guide)

- Use `/run-committee` when:
  - you need a recommendation/decision (architecture, tradeoffs, approach selection)
  - you want multiple perspectives + a final judge, with budget as an explicit criterion
- Use `/run-analysis` when:
  - you want a post-hoc findings report instead of code changes
  - you need severity-ranked correctness / complexity / robustness review grounded in code references
- Use `/run-flow` when:
  - the change is small, low-risk, and you mainly want a fast execution plan (max 5 atomic tasks)
- Use `/run-spec` when:
  - you want to review a development spec before implementation starts
  - you want a human-readable `DevSpec` plus a machine-readable handoff for later `/run-pipeline` execution
- Use `/run-general` when:
  - the objective is not code implementation
  - you need structured planning, analysis, writing, or operational documentation
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
| orchestrator-modernize | Modernization planning pipeline | Implementing code |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-spec | Development spec orchestration | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
| orchestrator-general | Non-coding workflow orchestration | Implementing code |
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

- Single source of truth: root `VERSION` file (SemVer without `v`, for example `0.22.26`).
- Use SemVer tags with `v` prefix (for example: `v0.22.26`).
- Stay in `0.x` while the pipeline and prompts evolve quickly.
- In `0.x`, treat **minor** bumps as potentially breaking (`v0.5.0` -> `v0.6.0`).
- Use **patch** bumps for docs/scripting fixes without intended behavior changes.
- Release CI checks `VERSION` and tag alignment (`VERSION=0.22.26` must release as `v0.22.26`).
- After bumping `VERSION`, run `python3 scripts/sync-readme-version.py` to refresh the pinned README release examples before commit.
- README pinned examples that include explicit release versions must use the current `VERSION` value; CI validates those exact snippets.
- Track release notes in `CHANGELOG.md`.

## Release CI

- Workflow: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v0.22.26`) or manual `workflow_dispatch`
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
git tag v0.22.26
git push origin v0.22.26
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
