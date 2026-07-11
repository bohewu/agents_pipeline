# Multi-Agent Pipeline

Codex-first multi-agent workflow assets with a runtime-neutral source core and best-effort exports for Claude Code and GitHub Copilot.

## Quick links

- [Install globally once](#install-globally-once-from-a-release)
- [Interactive profile manager](#interactive-runtime-and-model-profile-setup)
- [Codex workspace profile](#codex-workspace-profile)
- [Workspace trust and eligibility](#workspace-trust-and-eligibility)
- [Modes and Pipeline entry points](#modes)
- [Runtime profile details](docs/runtime-agent-model-profiles.md#codex-workspace-profile)
- [Compatibility matrix](COMPATIBILITY.md#runtime-profile-manager-compatibility)
- [Explicit full workspace materialization](docs/developer-install.md#explicit-workspace-materialization-compatibility)

## Support policy

| Runtime | Level | Contract |
|---|---|---|
| Codex | Tier 1 | Primary installer, documentation, workflow development, and CI validation |
| Claude Code | Tier 2 | Generated subagent files and export/install smoke validation |
| GitHub Copilot | Tier 2 | Generated custom agents and export/install smoke validation |
| OpenCode | Ended | Use the frozen `v0.26.1` release; it is not built from current main |

Tier 2 is intentionally bounded: the adapters preserve useful prompt behavior and mode aliases, but do not promise Codex feature parity.

## What changed in v0.28

- Canonical sources moved from the runtime-named tree to `agents/`, `protocols/`, `skills/`, and `tools/`.
- `modes.json` replaced runtime command files as the mode-routing source of truth.
- Ten formal `run-*` skills provide the primary Codex workflow entry points; natural-language `use <mode>` forms remain compatibility aliases.
- Codex installs mirror the marker-owned neutral support tree under `.codex/agents-pipeline`, including the scripts and runtime catalogs needed to run the installed profile manager.
- Status/checkpoint writing is a portable Node CLI instead of a runtime plugin.
- A runtime-neutral profile manager provides interactive or scripted `set`/`status`/`clear`/`list` flows. Runtime assets are installed globally once; Codex workspace profiles materialize only profile-specific role TOML plus a managed config block and manifest, without copying skills, scripts, protocols, or the support tree.
- OpenCode commands, plugins, tools, installers, model catalogs, and release targets were removed from main.
- Claude Code and Copilot remain inexpensive Tier 2 adapters; Codex remains the only first-class runtime.

There is no `$run-goal` skill, and `run-goal` is not part of the mode manifest. Use the host runtime's native task/session/goal facilities for long-running work.

## Repository layout

```text
agents/                         canonical agent Markdown
modes.json                      mode names, aliases, orchestrator targets
protocols/                      contracts, schemas, and fixtures
skills/                         portable repo-managed skills
skills/run-*/                   formal Codex workflow entry skills
tools/status-event.js           runtime-neutral status/checkpoint CLI
tools/status-runtime/           reusable status projection core
tools/agent-profile.py          interactive/runtime-neutral profile manager
tools/agent-profiles/           neutral mini/standard/strong profiles
runtimes/<runtime>/model-sets/  runtime-specific model mappings
scripts/agent-profile.*         Bash/PowerShell profile-manager entrypoints
scripts/codex-project-profile.py Codex workspace role/profile helper
scripts/export-*.py             Codex/Claude/Copilot adapters
scripts/install-*               local and release-bundle installers
```

Canonical agent frontmatter contains only `name`, `description`, and `kind`. Model, provider, reasoning, sandbox, tool, visibility, and temperature controls belong to runtime projections—not the neutral source.

## Install globally once from a release

Bootstrap installers download the pinned neutral release bundle, verify its checksum, and use GitHub Artifact Attestation when `gh` is available. Run the bootstrap once per runtime on a machine. A new project does not need another runtime installation.

<!-- BEGIN current-release -->

### Codex (recommended)

Windows (PowerShell):

```powershell
$tag = "v0.28.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1; pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

macOS/Linux (Bash):

```bash
tag="v0.28.0" && curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh" && bash ./bootstrap-install-codex.sh --version "${tag}" --target "$HOME/.codex"
```

### Claude Code (best effort)

Windows (PowerShell):

```powershell
$tag = "v0.28.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1; pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $tag -Target "$HOME\.claude\agents"
```

macOS/Linux (Bash):

```bash
tag="v0.28.0" && curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-claude.sh" && bash ./bootstrap-install-claude.sh --version "${tag}" --target "$HOME/.claude/agents"
```

### GitHub Copilot (best effort)

Windows (PowerShell):

```powershell
$tag = "v0.28.0"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1; pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux (Bash):

```bash
tag="v0.28.0" && curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh" && bash ./bootstrap-install-copilot.sh --version "${tag}" --target "$HOME/.copilot/agents"
```

Release invariant: `VERSION=0.28.0` must release as `v0.28.0`.

<!-- END current-release -->

Use each bootstrap's dry-run option before changing a non-default global target. See [external dependency notes](docs/external-dependencies.md) for download, checksum, and attestation behavior.

The normal global layout is:

| Runtime | Generated definitions | Global support assets |
|---|---|---|
| Codex | `~/.codex/agents/`, `~/.codex/config.toml`, and the active `~/.codex/AGENTS.md` or `AGENTS.override.md` | `~/.codex/agents-pipeline/` |
| Claude Code | `~/.claude/agents/` and `~/.claude/CLAUDE.md` | `~/.claude/agents-pipeline/` |
| GitHub Copilot | `~/.copilot/agents/` | `~/.copilot/agents-pipeline/` |

For the default `~/.codex` target, the Codex global installer also publishes exactly ten managed workflow skills under `~/.agents/skills/run-*/`; a custom Codex home requires an explicit `--user-skills-root` / `-UserSkillsRoot`. Each skill has an ownership marker; updates are rollback-capable and use an atomic rename for each skill directory. Existing unowned, corrupt, linked, or junction-backed same-named skill directories are preserved and cause a safe refusal instead of being overwritten.

Direct workspace targets remain available only as explicit materialization compatibility. They copy complete generated agents and support assets into a project; they are not the normal profile workflow. See [developer install](docs/developer-install.md#explicit-workspace-materialization-compatibility).

## Developer install from a clone

```bash
bash scripts/install-codex.sh --dry-run
bash scripts/install-codex.sh
```

Optional Tier 2 outputs:

```bash
bash scripts/install-claude.sh --dry-run
bash scripts/install-copilot.sh --dry-run
```

PowerShell equivalents use `scripts/install-*.ps1` with `-DryRun`.

## Interactive runtime and model-profile setup

After the one-time global Codex install, use the installed profile manager from any directory:

```bash
bash "$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"
```

```powershell
pwsh -File "$HOME\.codex\agents-pipeline\scripts\agent-profile.ps1"
```

The menu selects the action, runtime, scope, profile, and runtime-specific model set. The public actions are `set`, `status`, `clear`, and `list`; `install` remains only as a deprecated compatibility alias for `set`. Codex is the recommended runtime and global is the default scope. Codex also offers a workspace **project profile override**. Claude Code and Copilot profiles are global-only.

If a new Codex project should use the global profile, do nothing: it inherits the global roles and support installation.

### Codex workspace profile

When a project needs a different resource tier, `set --scope workspace` materializes only the profile-specific role layer:

```text
<project>/.codex/config.toml
<project>/.codex/agents/*.toml
<project>/.codex/.agents-pipeline-project-profile.json
```

The managed block in `config.toml` points to those workspace-local role files. The globally installed exporter renders them from the installed neutral agent sources, selected profile, and Codex model catalog. It does not read or copy the active global roles, so selecting a workspace profile cannot change the active global profile. Existing unrelated project configuration is preserved.

#### Workspace trust and eligibility

Codex loads project `.codex/config.toml` only after the repository is trusted. Workspace `set` deliberately does not grant trust or edit global trust settings. If the project is not yet trusted, open it in Codex and approve the normal trust prompt, then run workspace `status` again. JSON status keeps file integrity and trust eligibility separate through `health`, `project_trust`, and `profile_eligibility`; `eligible` means the trust gate is open, not that every unrelated preserved Codex setting is semantically valid. Actual routing remains owned by Codex's effective configuration. See the official [Codex project-config trust behavior](https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml).

The profile manager and reusable runtime assets remain global. A workspace profile never copies `agents-pipeline/`, `skills/`, `scripts/`, `protocols/`, `tools/`, or the full support tree into the project. Top-level source directories in this repository are release inputs, not per-project installation instructions.

Automation and redirected input are deliberately non-interactive. Supply every required choice explicitly:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"

# Optional per-project profile override; this is not an install.
bash "$profile_tool" set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai
bash "$profile_tool" status --runtime codex --scope workspace --workspace /path/to/project --json
bash "$profile_tool" clear --runtime codex --scope workspace --workspace /path/to/project

# Global profile management.
bash "$profile_tool" set balanced --runtime codex --scope global --model-set openai
bash "$profile_tool" status --runtime codex --scope global
bash "$profile_tool" list --runtime codex
```

`status` reports model-profile file health and trust eligibility, not workflow run progress or a full native Codex config evaluation. A Codex workspace with no overlay reports that it inherits the global profile. Workspace `clear` removes the installer-owned workspace role files, managed config block, and project-profile manifest, preserving unrelated `.codex/config.toml` content and every global asset. Codex global status validates its native manifest, role registrations, active managed `AGENTS.md` block, generated roles, and critical global support assets; Claude Code and Copilot validate their common runtime-profile manifest, generated agents, and sibling support tree. None of these commands reads OpenCode settings.

Codex workspace profiles use local role definitions while inheriting global support assets, `agents.max_threads`, and `agents.max_depth`; modes that use nested orchestration require an effective global `agents.max_depth` of at least `2`. The local role files reference the machine's installed global support root, so the generated workspace profile should normally not be committed. Run `set` once on another machine after its one-time global bootstrap.

The installed marker-owned support tree includes `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`. Its installed profile-manager wrapper supports `set`, `status`, `clear`, and `list` without requiring a source clone. The formal `run-*` skill copies remain global at `~/.agents/skills/`; neither a workspace profile nor explicit full workspace materialization installs user skills.

Profiles map roles to `mini`, `standard`, and `strong`; runtime catalogs map those tiers to valid runtime model settings. Omit profile flags to inherit normal runtime model selection. Profiles never control reasoning effort. See [runtime agent model profiles](docs/runtime-agent-model-profiles.md).

## Modes

The primary Codex entry points are formal skills installed globally under `~/.agents/skills/`. Each skill adopts the globally installed orchestrator workflow in the current/main agent and never manually loads a raw repository role. Every invocation checks current-workspace profile status: a normal unconfigured workspace inherits global roles, while unverifiable status, orphaned managed config, or non-`ok` file health stops before dispatch. Rerun workspace `set` to repair it or `clear` to inherit global roles. A healthy but ineligible profile warns and uses global routing. Only a healthy, eligible profile lets Codex's effective trusted project configuration apply workspace-specific models to dispatched role names. Invoking a skill does not spawn the same-named orchestrator merely to enter the workflow.

| Primary skill | Compatibility alias | Typical use |
|---|---|---|
| `$run-simple` | `use simple` | One small, clear delivery with minimal ceremony |
| `$run-flow` | `use flow` | Daily engineering, at most five bounded tasks |
| `$run-pipeline` | `use pipeline` | High-risk or multi-module work with reviewer/retry gates |
| `$run-general` | `use general` | Mixed work and adaptive dispatch; also handles monetization requests |
| `$run-spec` | `use spec` | Review-ready development specification |
| `$run-ci` | `use ci` | CI/CD planning and optional generation |
| `$run-modernize` | `use modernize` | Modernization planning and bounded phase handoff |
| `$run-analysis` | `use analysis` | Post-hoc correctness/complexity/robustness analysis |
| `$run-ux` | `use ux` | Profile-aware UX audit |
| `$run-committee` | `use committee` | Multi-perspective decision support |

Examples:

```text
$run-flow Fix the parser bug and add focused tests
$run-pipeline 實作跨模組權限變更
$run-committee Compare the two migration designs
```

The managed AGENTS note retains `use <mode>` and the documented Chinese leading forms as compatibility aliases for the matching formal skill. They follow the same workspace-profile preflight, definition-first, and current-agent adoption behavior, but the explicit `$run-*` skills are the recommended interface. `use monetize` remains a compatibility alias for the general workflow; use `$run-general` as the formal skill entry. Compatibility alias routing lives in `modes.json`; skill behavior lives in `skills/run-*/SKILL.md`. There is no `$run-goal` skill or goal mode.

## Workflow controls

Workflow rigor is risk-derived. Model reasoning belongs to the active runtime.

Common controls include:

- `--resume`: resume from a compatible checkpoint.
- `--review=off|on`: Flow's optional bounded reviewer gate.
- `--max-retry=<n>`: cap workflow repair rounds; it is not model reasoning effort.
- `--confirm` / `--verbose`: add stage/task pauses.
- `--autopilot` / `--full-auto`: non-interactive bounded execution with hard-blocker safeguards.
- `--commit=off|before|after`: optional bounded Git helper lane.
- `--compress`: write a reusable context pack.
- `--force-scout` / `--skip-scout`: override evidence-driven repo scouting.

The canonical semantics live in each orchestrator definition and `protocols/PIPELINE_PROTOCOL.md`.

## Runtime-neutral status writer

Orchestrators emit semantic events through one CLI:

```bash
node tools/status-event.js \
  --event run.started \
  --payload-json '{"output_root":".pipeline-output","run_id":"run-1","orchestrator":"orchestrator-flow","user_prompt":"Implement the requested change"}'
```

Batch task/agent deltas with `--event batch`. The CLI also accepts `--payload-file <path|->` and `--stdin`. Successful output is JSON; exit code `2` is an input error and `3` is a runtime/projection/filesystem error.

IDs are safe filesystem basenames, fresh starts cannot reuse an existing `run_id`, and resume validates the persisted run identity plus expected orchestrator.

Canonical files remain:

```text
<output_root>/<run_id>/checkpoint.json
<output_root>/<run_id>/status/run-status.json
<output_root>/<run_id>/status/tasks/<task_id>.json
<output_root>/<run_id>/status/agents/<agent_id>.json
```

See [status writer spec](docs/status-writer-spec.md).

## Validation

The full commands below are for a source checkout. Published installer bundles intentionally omit the repository test suite and test-only root fixtures; the release workflow runs this full cross-platform CI before it builds and publishes a bundle.

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/validate-orchestrator-contracts.py
python3 scripts/validate-helper-contracts.py
python3 scripts/validate-reviewer-retry-guidance.py
python3 scripts/validate-status-emission-guidance.py
python3 scripts/validate-skill-frontmatter.py
python3 scripts/update-agent-model-sets.py --check
node --test tests/status-runtime.test.js
node scripts/validate-status-runtime-smoke.cjs
```

Exporter smoke checks:

```bash
python3 scripts/export-codex-agents.py --source-agents agents --target-dir .tmp-codex --strict --dry-run
python3 scripts/export-claude-agents.py --source-agents agents --target-dir .tmp-claude --strict --dry-run
python3 scripts/export-copilot-agents.py --source-agents agents --target-dir .tmp-copilot --strict --dry-run
```

Schema example:

```bash
python3 tools/validate-schema.py \
  --schema protocols/schemas/run-status.schema.json \
  --input protocols/examples/status-layout.run-only.valid/run-status.json \
  --require-jsonschema
```

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Codex mapping](docs/codex-mapping.md)
- [Claude Code mapping](docs/claude-mapping.md)
- [Copilot mapping](docs/copilot-mapping.md)
- [Developer install](docs/developer-install.md)
- [Compatibility](COMPATIBILITY.md)
- [Protocol summary](protocols/PROTOCOL_SUMMARY.md)
- [Security policy](SECURITY.md)

## OpenCode frozen release

Current main no longer contains an OpenCode runtime. The following commands are intentionally pinned to the last supported OpenCode-first release and are excluded from current-version synchronization.

<!-- BEGIN legacy-opencode-v0.26.1 -->

### OpenCode core (deprecated)

OpenCode support is frozen at `v0.26.1`. These commands intentionally stay pinned to that release; do not substitute `main` or a newer tag and expect supported OpenCode behavior.

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1; pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag -Target "$HOME\.config\opencode"
```

macOS/Linux (Bash):

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install.sh" && bash ./bootstrap-install.sh --version "${tag}"
```

### Status plugin only (deprecated)

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-plugin-status-runtime.ps1" -OutFile .\bootstrap-install-plugin-status-runtime.ps1; pwsh -NoProfile -File .\bootstrap-install-plugin-status-runtime.ps1 -Version $tag -Target "$HOME\.config\opencode\plugins\status-runtime.js"
```

macOS/Linux (Bash):

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install-plugin-status-runtime.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-plugin-status-runtime.sh" && bash ./bootstrap-install-plugin-status-runtime.sh --version "${tag}" --target "$HOME/.config/opencode/plugins/status-runtime.js"
```

### Usage only (deprecated)

Windows (PowerShell):

```powershell
$tag = "v0.26.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-usage-only.ps1" -OutFile .\bootstrap-install-usage-only.ps1; pwsh -NoProfile -File .\bootstrap-install-usage-only.ps1 -Version $tag -OpenCodeTarget "$HOME\.config\opencode" -UsagePluginTarget "$HOME\.config\opencode\plugins\usage-status.js"
```

macOS/Linux (Bash):

```bash
tag="v0.26.1" && curl -fsSL -o ./bootstrap-install-usage-only.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-usage-only.sh" && bash ./bootstrap-install-usage-only.sh --version "${tag}" --opencode-target "$HOME/.config/opencode" --usage-plugin-target "$HOME/.config/opencode/plugins/usage-status.js"
```

<!-- END legacy-opencode-v0.26.1 -->

## Release

The release workflow builds `agents-pipeline-bundle-v<version>.tar.gz` and `.zip`, plus checksums and attestations. The bundle contains the neutral source, retained runtime adapters, model catalogs, interactive profile manager, and status writer; it contains no `opencode/` tree.

See [CHANGELOG.md](CHANGELOG.md) for version history.
