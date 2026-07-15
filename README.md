# Multi-Agent Pipeline

Codex-first multi-agent workflow assets with a runtime-neutral source core and best-effort exports for Claude Code and GitHub Copilot.

## Quick links

- [Install globally once](#install-globally-once-from-a-release)
- [Globally installed skills](#globally-installed-skills)
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

## Current architecture

- Canonical sources moved from the runtime-named tree to `agents/`, `protocols/`, `skills/`, and `tools/`.
- `modes.json` replaced runtime command files as the mode-routing source of truth.
- Eleven formal `run-*` skills provide the primary Codex workflow entry points. Five additional capability skills cover asset briefing, browser UX evidence, frontend polish, UI communication, and conceptual UI/UX handoff. `$run-adaptive` is a skill-only Simple/Flow/Pipeline router; natural-language `use <mode>` forms remain compatibility aliases for manifest-backed modes.
- Codex installs mirror the marker-owned neutral support tree under `.codex/agents-pipeline`, including the scripts and runtime catalogs needed to run the installed profile manager.
- Status/checkpoint writing is a portable Node CLI instead of a runtime plugin.
- A runtime-neutral profile manager provides interactive or scripted `set`/`status`/`clear`/`list` flows. Runtime assets and model-free Codex roles are installed globally once; Codex workspace profiles materialize only profile-specific role TOML plus a managed config block and manifest, without copying skills, scripts, protocols, or the support tree.
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
skills/<capability>/            reusable design and audit capability skills
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
$tag = "v0.31.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1; pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

macOS/Linux (Bash):

```bash
tag="v0.31.1" && curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh" && bash ./bootstrap-install-codex.sh --version "${tag}" --target "$HOME/.codex"
```

### Claude Code (best effort)

Windows (PowerShell):

```powershell
$tag = "v0.31.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-claude.ps1" -OutFile .\bootstrap-install-claude.ps1; pwsh -NoProfile -File .\bootstrap-install-claude.ps1 -Version $tag -Target "$HOME\.claude\agents"
```

macOS/Linux (Bash):

```bash
tag="v0.31.1" && curl -fsSL -o ./bootstrap-install-claude.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-claude.sh" && bash ./bootstrap-install-claude.sh --version "${tag}" --target "$HOME/.claude/agents"
```

### GitHub Copilot (best effort)

Windows (PowerShell):

```powershell
$tag = "v0.31.1"; Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1; pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux (Bash):

```bash
tag="v0.31.1" && curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh" && bash ./bootstrap-install-copilot.sh --version "${tag}" --target "$HOME/.copilot/agents"
```

Release invariant: `VERSION=0.31.1` must release as `v0.31.1`.

<!-- END current-release -->

Use each bootstrap's dry-run option before changing a non-default global target. See [external dependency notes](docs/external-dependencies.md) for download, checksum, and attestation behavior.

The normal global layout is:

| Runtime | Generated definitions | Global support assets |
|---|---|---|
| Codex | Model-free `~/.codex/agents/`, `~/.codex/config.toml`, and the active `~/.codex/AGENTS.md` or `AGENTS.override.md`; roles inherit the parent session | `~/.codex/agents-pipeline/` |
| Claude Code | `~/.claude/agents/` and `~/.claude/CLAUDE.md` | `~/.claude/agents-pipeline/` |
| GitHub Copilot | `~/.copilot/agents/` | `~/.copilot/agents-pipeline/` |

For the default `~/.codex` target, the Codex global installer publishes all 16 managed skills under `~/.agents/skills/`: eleven workflow skills and five capability skills. A custom Codex home requires an explicit `--user-skills-root` / `-UserSkillsRoot`. Each installed skill has a versioned ownership marker and content digest; updates are rollback-capable and use an atomic rename for each skill directory. Existing unowned, corrupt-marker, linked, or junction-backed same-named directories cause a safe refusal. If a marker-owned skill's content was edited, reinstall preserves that copy in the sibling backup area before restoring the managed version.

When upgrading a machine that already has an older unmarked copy of one of the five known capability skills, rerun the global installer once with `--migrate-legacy-skills` on Bash or `-MigrateLegacySkills` on PowerShell. The installer validates and moves each legacy directory into a timestamp-like hidden backup beside (not inside) the discovery root before installing the managed copy. This avoids duplicate skill discovery. The flag never takes over an unowned `run-*` skill or an unrelated skill name.

### Globally installed skills

Workflow entry skills are documented under [Modes](#modes). The additional global capability skills are:

| Skill | Use |
|---|---|
| [`$artgen-scaffold`](skills/artgen-scaffold/SKILL.md) | Versioned 2D asset briefs and copy-ready generation prompts |
| [`$devtools-ux-audit`](skills/devtools-ux-audit/SKILL.md) | Viewport-specific browser UX evidence |
| [`$frontend-aesthetic-director`](skills/frontend-aesthetic-director/SKILL.md) | Visible frontend implementation, polish, accessibility states, and rendered QA |
| [`$ui-communication-designer`](skills/ui-communication-designer/SKILL.md) | Task-flow, screen, and microcopy clarification |
| [`$ui-ux-workflow`](skills/ui-ux-workflow/SKILL.md) | Bounded conceptual UI/UX handoffs |

All 16 are installed globally once. Workspace profile setup does not copy or customize skills; it materializes only project-local role TOML and registrations for the selected resource profile.

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

The menu selects the action, runtime, scope when applicable, profile, and runtime-specific model set. The public actions are `set`, `status`, `clear`, and `list`; `install` remains only as a deprecated compatibility alias for `set`. Codex is the recommended runtime, and Codex model-profile `set` is workspace-only. Global Codex `status` and `clear` remain available for installation diagnostics and legacy profile cleanup. Claude Code and Copilot profiles remain global-only.

If a Codex project does not need explicit per-role model tiers, do nothing: it uses the model-free global roles and support installation, and those roles inherit the parent Codex session's model selection.

### Codex workspace profile

When a project needs a different resource tier, `set --scope workspace` materializes only the profile-specific role layer:

```text
<project>/.codex/config.toml
<project>/.codex/agents/*.toml
<project>/.codex/.agents-pipeline-project-profile.json
```

The managed block in `config.toml` points to those workspace-local role files. The globally installed exporter renders them from the installed neutral agent sources, selected profile, and Codex model catalog. It does not read or copy the active global roles, so selecting a workspace profile cannot add model settings to the global role definitions. Existing unrelated project configuration is preserved.

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

# Global installation diagnostics and legacy profile cleanup.
bash "$profile_tool" status --runtime codex --scope global --json
bash "$profile_tool" clear --runtime codex --scope global
bash "$profile_tool" list --runtime codex
```

`status` reports profile/install file health and trust eligibility, not workflow run progress or a full native Codex config evaluation. A Codex workspace with no overlay reports that it inherits the model-free global role definitions and parent-session model selection. Workspace `clear` removes the installer-owned workspace role files, managed config block, and project-profile manifest, preserving unrelated `.codex/config.toml` content and every global asset. Codex global status validates its native manifest, role registrations, active managed `AGENTS.md` block, generated model-free roles, critical global support assets, and the marker/content integrity of all recorded discovery skills. Global `clear` regenerates those model-free roles to remove a legacy global profile; it is not a Codex profile-selection workflow. Claude Code and Copilot continue to validate and manage their global profile manifests, generated agents, and sibling support trees. None of these commands reads OpenCode settings.

Codex exports and normal global installs do not write or replace `agents.max_threads` or `agents.max_depth`; configure those machine-level limits in your own global Codex config. Codex workspace profiles use local role definitions while inheriting the effective global limits. Formal `$run-*` skills adopt workflows in the current/main agent and dispatch worker roles directly, so `agents.max_depth = 1` is sufficient; even Modernize execution transitions into Pipeline in place instead of spawning another primary orchestrator. The local role files reference the machine's installed global support root, so the generated workspace profile should normally not be committed. Run `set` once on another machine after its one-time global bootstrap.

The installed marker-owned support tree includes `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`. Its installed profile-manager wrapper supports `set`, `status`, `clear`, and `list` without requiring a source clone. All managed discovery-skill copies remain global at `~/.agents/skills/`; neither a workspace profile nor explicit full workspace materialization installs user skills.

Profiles map roles to `mini`, `standard`, and `strong`; runtime catalogs map those tiers to valid runtime model settings. For Codex, these mappings are emitted only into workspace-local roles; the global roles always omit model settings and inherit the parent session. Claude Code and Copilot retain global profile output. Profiles do not set reasoning effort; the separate versioned child-spawn policy uses the selected logical tier as one resolver input. See [runtime agent model profiles](docs/runtime-agent-model-profiles.md).

## Modes

The primary Codex entry points are formal skills installed globally under `~/.agents/skills/`. Manifest-backed mode skills adopt the globally installed orchestrator workflow in the current/main agent and never manually load a raw repository role. `$run-adaptive` is a thin skill-only router that selects and adopts the installed Simple, Flow, or Pipeline definition; it does not create an Adaptive role. Every invocation checks current-workspace profile status: a normal unconfigured workspace uses model-free global roles that inherit the parent session, while unverifiable status, orphaned managed config, or non-`ok` file health stops before dispatch. Rerun workspace `set` to repair it or `clear` to return to model-free global roles. A healthy but ineligible profile warns and uses global routing. Only a healthy, eligible profile lets Codex's effective trusted project configuration apply workspace-specific models to dispatched role names. Invoking a skill does not spawn the same-named orchestrator merely to enter the workflow.

| Primary skill | Compatibility alias | Typical use |
|---|---|---|
| `$run-adaptive` | — | Flow-biased engineering router with route-independent presets and prompt-only preparation |
| `$run-simple` | `use simple` | One small, clear delivery with minimal ceremony |
| `$run-flow` | `use flow` | Daily engineering, at most five bounded tasks |
| `$run-pipeline` | `use pipeline` | High-risk or multi-module work with reviewer/retry gates |
| `$run-general` | `use general` | Mixed coding, planning, writing, analysis, maintenance, or monetization work |
| `$run-spec` | `use spec` | Review-ready development specification |
| `$run-ci` | `use ci` | CI/CD planning and optional generation |
| `$run-modernize` | `use modernize` | Modernization planning and bounded in-place Pipeline execution |
| `$run-analysis` | `use analysis` | Post-hoc correctness/complexity/robustness analysis |
| `$run-ux` | `use ux` | Profile-aware UX audit |
| `$run-committee` | `use committee` | Multi-perspective decision support |

Examples:

```text
$run-adaptive Fix the parser bug and add focused tests
$run-adaptive Fix and locally finalize this task --preset=delivery
$run-adaptive Plan the next workflow without executing it --preset=autonomous --prompt=on
$run-flow Fix the parser bug and add focused tests
$run-pipeline 實作跨模組權限變更
$run-committee Compare the two migration designs
```

The managed AGENTS note retains `use <mode>` and the documented Chinese leading forms as compatibility aliases for the matching manifest-backed formal skill. They follow the same workspace-profile preflight, definition-first, and current-agent adoption behavior, but the explicit `$run-*` skills are the recommended interface. `$run-adaptive` is intentionally skill-only and has no `use adaptive` alias or `orchestrator-adaptive` role. `use monetize` remains a compatibility alias for the general workflow; use `$run-general` as the formal skill entry. Compatibility alias routing lives in `modes.json`; skill behavior lives in `skills/run-*/SKILL.md`. There is no `$run-goal` skill or goal mode.

## Workflow controls

Workflow rigor remains risk-derived. Child-spawn reasoning is classified separately and projected by the versioned reasoning policy; model/provider selection remains profile/runtime-owned.

Common controls include:

- `--route=auto|simple|flow|pipeline`: Adaptive route selection; `auto` is Flow-biased.
- `--preset=balanced|autonomous|careful|delivery|interactive`: Adaptive run policy; presets do not select the route.
- `--prompt=off|on`: Adaptive prompt-only preparation. `on` performs read-only classification and emits a pinned `$run-adaptive --route=<selected>` prompt without execution or artifacts.
- `--resume`: resume from a compatible checkpoint.
- `--reasoning=inherit|shadow|adaptive`: child-spawn effort policy for Adaptive, Simple, Flow, and Pipeline. Version 1 defaults to `adaptive`; `inherit` is the rollback mode and `shadow` computes without applying a selector. Strict formal-assurance work conflicts in `inherit` or `shadow`, and exact effort overrides conflict in `shadow`. If an adaptive selector is unavailable, ordinary non-strict/non-exact work continues as `degraded` without a selector; strict/exact work conflicts. No adaptive child resolves below `medium`, and `mini` starts at `high`.
- `--review=off|on|max`: reviewer policy for Adaptive and the supported engineering workflows. `on` uses the run reasoning policy, while `max` is an exact reviewer-only override for every bounded review and re-review. Simple uses a bounded ad-hoc gate, Flow uses its optional gate, and Pipeline is mandatory and rejects `off`. The workspace profile still selects the reviewer model; `max` does not affect executors, test runners, or the main orchestrator. If the runtime cannot enforce the exact `max` selector, the resolver conflicts and blocks that review; ordinary non-strict `on` requests may report degradation.
- `--max-retry=<n>`: cap workflow repair rounds; it is not model reasoning effort.
- `--confirm` / `--verbose`: add stage/task pauses.
- `--autopilot` / `--full-auto`: non-interactive bounded execution with hard-blocker safeguards.
- `--commit=off|before|after`: optional bounded Git helper lane.
- `--compress`: write a reusable context pack.
- `--force-scout` / `--skip-scout`: override evidence-driven repo scouting.

The canonical semantics live in each orchestrator definition and `protocols/PIPELINE_PROTOCOL.md`.

Adaptive first normalizes preset plus explicit policy overrides, then selects Simple, Flow, or Pipeline from task complexity alone, and finally maps the same policy to that workflow. Review, scout, kanban, commit, handoff, interaction, and full-auto policy do not force Flow. `--resume` follows the persisted Flow/Pipeline orchestrator, and Pipeline still rejects `--review=off`. Materially underestimated work may promote Simple -> Flow -> Pipeline while preserving and reapplying the policy; operational errors and localized bugs are not promotion reasons.

For resumable Flow/Pipeline runs, Adaptive persists the selected preset plus its expanded effective flags. Resume keeps that preset locked: omit it or repeat the same value, then use individual flags for deliberate overrides. A different preset requires a fresh run so stale preset-owned values cannot leak across policies.

| Adaptive preset | Policy |
|---|---|
| `balanced` | Selected workflow defaults and risk-derived rigor |
| `autonomous` | Full-auto behavior within the selected workflow's existing safety and repair bounds |
| `careful` | Focused scouting plus review |
| `delivery` | Full-auto, review, kanban auto-sync, and one safe local commit after success |
| `interactive` | Confirm and verbose interaction |

All presets remain Simple-eligible. Under Simple, Adaptive applies requested policy as a bounded wrapper: optional focused scout/commit-before, one Simple core execution, at most one ad-hoc reviewer repair and re-review, then requested handoff, kanban, and commit-after helpers. The Simple core still creates no ProblemSpec, task list, checkpoint, status, or retry loop. Under Flow and Pipeline, Adaptive expands the same policy into their native flags. On a fresh run, standalone Adaptive `--full-auto` remains a compatibility form of `--preset=autonomous` when no explicit preset is present and normalizes to that preset without duplicating the flag; with an explicit preset it remains an individual override. On resume, `--full-auto` is always a current override of the locked preset rather than a preset change. Explicit individual flags override preset values, subject to workflow hard safety gates.

For example, `--preset=delivery` retains the familiar `--full-auto --review=on --kanban=auto --commit=after` policy without forcing a route. A parser bug plus focused tests selects Flow first, then receives those Flow controls; a typo may remain Simple and receive the bounded equivalent wrapper.

The agents_pipeline `reviewer` custom role is separate from Codex's native `/review` command. `$run-* --review=*` dispatches the registered cross-runtime role and follows the workflow ReviewReport contract; `/review` uses Codex's native Git diff/branch/commit review experience. For a standalone cross-runtime review without Flow or Pipeline, ask the current agent to dispatch `reviewer` in `mode = ad_hoc` with explicit targets.

Flow keeps three separate bounded controls: up to two transient operational retries that make no implementation change, task-local `repair_budget` of `0..2` additional modify-and-verify cycles after the first attempt, and one total Flow-level recovery re-dispatch per run. The same failure signature twice, no meaningful progress, budget exhaustion, or scope expansion stops local iteration. Reviewer repair remains a separate single targeted repair plus one re-review.

## Runtime-neutral status writer

Orchestrators emit semantic events through one CLI:

```bash
node tools/status-event.js \
  --event run.started \
  --payload-json '{"output_root":".pipeline-output","run_id":"run-1","orchestrator":"orchestrator-flow","user_prompt":"Implement the requested change"}'
```

Batch task/agent deltas with `--event batch`. The CLI also accepts `--payload-file <path|->` and `--stdin`. Successful output is JSON; exit code `2` is an input error and `3` is a runtime/projection/filesystem error.

IDs are safe filesystem basenames, fresh starts cannot reuse an existing `run_id`, and resume validates the persisted run identity plus expected orchestrator.
Use `checkpoint.updated` with a non-empty `flags` delta when derived state must be persisted during a stage; unlike `stage.completed`, it does not advance `current_stage` or append a completed stage.

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
- [Reasoning policy protocol](protocols/REASONING_POLICY.md)
- [Adaptive reasoning and model routing roadmap](docs/adaptive-reasoning-and-model-routing-roadmap.md)
- [Claude Code mapping](docs/claude-mapping.md)
- [Copilot mapping](docs/copilot-mapping.md)
- [Developer install](docs/developer-install.md)
- [Compatibility](COMPATIBILITY.md)
- [Protocol summary](protocols/PROTOCOL_SUMMARY.md)
- [Security policy](SECURITY.md)

## Legacy OpenCode support

<!-- BEGIN legacy-opencode-v0.26.1 -->

OpenCode support ended at `v0.26.1`. Current `main` no longer contains an OpenCode runtime or installer. OpenCode users should use the documentation and installers from the [`v0.26.1` tag](https://github.com/bohewu/agents_pipeline/tree/v0.26.1).

<!-- END legacy-opencode-v0.26.1 -->

## Release

The release workflow builds `agents-pipeline-bundle-v<version>.tar.gz` and `.zip`, plus checksums and attestations. The bundle contains the neutral source, retained runtime adapters, model catalogs, interactive profile manager, and status writer; it contains no `opencode/` tree.

See [CHANGELOG.md](CHANGELOG.md) for version history.
