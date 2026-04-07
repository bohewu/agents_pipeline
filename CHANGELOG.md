# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

## [0.21.6] - 2026-04-07

### Fixed

- Replaced the `Bun.spawnSync` Python-probe stdio settings in `provider-usage`, `usage-status-refresh`, `skill-manager`, and `validate-schema` with a Bun-compatible ignored-stdio form, fixing the `stdio must be array...` runtime failure seen on some OpenCode/Bun builds after installing `v0.21.5`.

## [0.21.5] - 2026-04-07

### Fixed

- `provider-usage`, `usage-status-refresh`, `skill-manager`, and `validate-schema` runtime paths now resolve `python3` before falling back to `python`, so Ubuntu environments without a `python` alias no longer fail when refreshing usage, running `/usage`, or invoking Python-backed tools.
- Python command examples, validator shebangs, and related install/help text now consistently prefer `python3`, reducing copy-paste failures on Linux hosts that only ship `python3`.

## [0.21.4] - 2026-04-07

### Fixed

- `install-plugin-usage-status.sh` and `install-plugin-effort-control.sh` now resolve `python3` before falling back to `python`, so Ubuntu installs can register the TUI plugins in `tui.json` without failing on systems that do not ship a `python` alias.

## [0.21.3] - 2026-04-05

### Changed

- Adjusted the `/run-ci` GitHub Actions guidance wording in `orchestrator-ci` to keep the v5 action-major requirement without tripping the agent-export validator on inline `@v5` text, and rolled the release metadata forward to `v0.21.3`.

## [0.21.2] - 2026-04-05

### Changed

- `/run-ci` GitHub Actions generation guidance now prefers `actions/checkout@v5` and `actions/setup-node@v5` pinned by full commit SHA, and documents runtime compatibility env flags as a temporary fallback instead of the primary fix for Node 20 deprecation warnings.

## [0.21.1] - 2026-04-05

### Changed

- `effort-control` now applies its automatic medium floor to OpenAI and GitHub Copilot `gpt-5*` models instead of only OpenAI `gpt-5.4*`, while still leaving Copilot Claude/Gemini and other non-GPT-5 providers untouched.

## [0.21.0] - 2026-04-05

### Added

- Added the installable OpenCode-only `effort-control` plugin, which floors GPT-5.4 reasoning to at least `medium` for most non-mechanical agents and exposes `/effort`, `/effort-medium`, `/effort-high`, `/effort-max`, and `/effort-clear` for project-default and session-scoped overrides.
- Added clone and release-bundle installers for `effort-control`, including dedicated `install-plugin-effort-control.*` and `bootstrap-install-plugin-effort-control.*` entry points.

### Changed

- `install-all-local` and `bootstrap-install-all-local` now include the `effort-control` plugin as part of the all-in OpenCode bundle, with explicit per-target override support for its plugin entry path.
- CI and release-bundle validation now cover `effort-control` installer dry-runs, README release snippets, and bundle assembly so tagged releases publish the plugin consistently.

## [0.20.0] - 2026-04-05

### Added

- Added `/run-ux` plus the `orchestrator-ux` expert roster (`ux-novice`, `ux-task-flow`, `ux-copy-trust`, `ux-visual-hierarchy`, `ux-judge`) for profile-aware normal-user UX audits with scorecards and report artifacts.
- Added the repo-managed `devtools-ux-audit` skill with a tested cross-platform helper script for deterministic viewport planning during browser-backed UX audits.
- Added `/skill-list`, `/skill-search`, and `/skill-install`, backed by the local `skill-manager` custom tool and the hidden `skill-curator` agent, so OpenCode can browse installed skills and install curated skills from `anthropics/skills` or `github/awesome-copilot`.

### Changed

- `run-flow` and `run-pipeline` now treat git commit helpers as orchestrator workflow actions instead of canonical tasks, so they no longer consume Flow task budget or pipeline task/retry/reviewer quota.
- Modernize-to-pipeline execution now carries explicit delegated worktree/target-project expectations, target-anchored status/checkpoint writes, and stronger handoff guidance for follow-up sessions started from the target repo.
- OpenCode installs now mirror repo-managed skills into `~/.agents/skills` as the global baseline and `~/.claude/skills` as a compatibility mirror while preserving the OpenCode config copy.

## [0.19.1] - 2026-04-05

### Changed

- Refined the `usage-status` OpenCode TUI plugin with short/detail modes, provider filtering (`all`, `codex`, `copilot`), a more stable session sidebar card, and local-time reset timestamps in detail mode.
- Added local cache fallback to `provider-usage` so stale-but-usable quota snapshots can still be surfaced when live Codex or Copilot lookups fail.
- Expanded README guidance for the usage-only install path, usage-status FAQ, mode/filter commands, and cache behavior.

## [0.19.0] - 2026-04-05

### Added

- Added `/usage` plus the hidden `usage-inspector` subagent so OpenCode can report live Codex quota windows and GitHub Copilot premium-request usage from local auth state.
- Added the installable `usage-status` OpenCode TUI plugin, which can show a compact Codex/Copilot quota footer and exposes `/usage-status`, `/usage-status-on`, `/usage-status-off`, and `/usage-status-refresh` commands.
- Added focused `usage-only` installers and release-bundle bootstraps so users can install just the usage command/tooling and TUI plugin without taking the full pipeline.

### Changed

- `provider-usage` now reads Codex CLI auth from `~/.codex/auth.json`, renders quota output with ASCII progress bars, and performs live GitHub Copilot quota lookup through `gh auth` when available.
- OpenCode usage-status installation now follows the official TUI plugin contract by registering the plugin in `tui.json` and shipping a target-exclusive `default export { id, tui }` module entry.
- README, CI coverage, and release-bundle assembly now include the usage-status plugin and usage-only installers so future releases validate and publish these assets automatically.

## [0.18.2] - 2026-04-04

### Fixed

- Release bundles now include `scripts/install-codex-config.py`, which `install-codex.*` needs for managed Codex config merges. This fixes the published `all-local` and Codex release-bundle install paths.

## [0.18.1] - 2026-04-04

### Changed

- Codex install now merges managed agent sections into existing `config.toml` instead of overwriting the whole file, while still forcing `features.multi_agent = true`, refreshing managed `[agents]` settings from this repo, backing up existing files, and removing stale managed Codex agent definitions.
- Codex exporter now writes `name`, `description`, and `developer_instructions` into each generated standalone agent TOML so the output matches the current official Codex custom-agent file schema.
- OpenCode core install now records a manifest of managed files so later installs can remove stale repo-managed `agents/commands/protocols/tools` files without deleting unrelated user-created files in the target directory.

## [0.18.0] - 2026-04-03

### Added

- Added `session-guide`, `kanban`, and `emit-handoff` helper commands plus supporting subagents for root-tracked repo guidance, kanban management, and run-local cross-session handoff output.
- Added `flow-splitter` and a dedicated `FlowTaskList` schema so `orchestrator-flow` can delegate bounded task decomposition instead of keeping it inside the orchestrator.
- Added `handoff-pack.schema.json`, `flow-task-list.schema.json`, and starter examples for session guide, kanban, flow task lists, and handoff artifacts.

### Changed

- Simplified execution routing by merging `executor-core` and `executor-advanced` into a single `executor` agent with handoff-controlled `effort`, `verification`, and `repair_budget` settings.
- Reworked `orchestrator-flow` to delegate ProblemSpec extraction and task decomposition, support optional handoff/kanban terminal helpers, and allow a single bounded same-task recovery path without adding retry loops.
- Clarified artifact ownership: root-tracked files such as `session-guide.md`, `todo-ledger.json`, and `kanban.md` now stay outside `.pipeline-output/`, while run-local handoff artifacts remain under the run directory.
- Exporters and docs now enforce runtime-owned model/provider selection; source agent frontmatter must not define `model` or `provider`.

### Removed

- Removed the redundant dual-executor naming split (`executor-core` / `executor-advanced`) and related schema/export assumptions.

## [0.17.0] - 2026-04-02

### Removed

- **Init pipeline**: Removed `orchestrator-init`, `/run-init` command, and all supporting artifacts (`INIT_TEMPLATES.md`, `INIT_EXAMPLE.md`, `INIT_TO_PIPELINE.md`). The init pipeline's outputs were only consumed by `orchestrator-pipeline` and had no auto-update mechanism, making them a stale-docs liability. Greenfield planning is covered by `/run-spec` and `/run-pipeline`.
- **Target bootstrap in modernize**: Removed `--init-target` flag and Stage 4.5 (Target Bootstrap) from `orchestrator-modernize`. Users should create target directories manually before running execution modes.
- Removed `MODERNIZE_TARGET_BOOTSTRAP_EXAMPLE.md` (documented the removed `--init-target` workflow).
- Removed `orchestrator-init` from `AGENTS.md`, schema enums (`checkpoint.schema.json`, `run-status.schema.json`), and status runtime constants.

## [0.14.0] - 2026-04-01

### Changed

- Claude Code orchestrator export now uses native Agent tool delegation instead of inlining all stages into a single agent context. Orchestrators receive the `Agent` tool and a delegation protocol adapter that maps `@agent-name` references to `Agent(subagent_type=...)` calls.
- Resolved `@agent-name` references are listed in each orchestrator's generated adapter so the agent knows which subagents are available.
- Updated `docs/claude-mapping.md` to document the new delegation approach, replacing the previous inline-only orchestrator limitation.

## [0.13.0] - 2026-04-01

### Changed

- Slim `PROTOCOL_SUMMARY.md` from ~974 to ~200 tokens; orchestrator-only content (status layer, schema paths, todo ledger) removed from global instructions, saving ~9,300 tokens/run across subagent calls.
- Make Compressor (Stage 8) opt-in via `--compress` flag; most runs do not reference prior context packs.
- Trim boilerplate across all 8 orchestrators: condensed flag parsing, status protocol, confirm/verbose protocol, and agent responsibility matrix sections (-435 lines).
- Inline Stage 9 summary in `orchestrator-pipeline` (eliminates one subagent call).
- Default `orchestrator-flow` scout mode to `skip` instead of `auto`; Flow targets small tasks where the orchestrator's direct tool access is sufficient.

### Removed

- `status-cli/` component and related planning docs (`docs/status-cli-plan.md`, `docs/status-cli-roadmap.md`). The status contract (schemas, examples, validation) is preserved; only the unused CLI consumer is removed.

## [0.12.6] - 2026-03-30

### Changed

- Bootstrap release installers now keep GitHub Artifact Attestation logs quiet by default and only print attestation details when users opt in with `--verbose` on Bash or `-Verbose` on PowerShell.

## [0.12.5] - 2026-03-30

### Changed

- Bootstrap release installers now verify GitHub Artifact Attestations automatically when `gh` is available, while preserving the existing checksum-only path on machines that do not have GitHub CLI installed.

## [0.12.4] - 2026-03-30

### Changed

- `/run-ci` and the paired CI/CD protocol docs now treat software supply chain integrity as a first-class design requirement, including pinned GitHub Actions, least-privilege workflow permissions, immutable release inputs, and explicit release verification gates.

### Fixed

- Release publishing workflows now pin artifact transfer actions by full commit SHA, disable persisted checkout credentials, re-verify bundle checksums after artifact download, and require GitHub Artifact Attestation verification before publishing release assets.

## [0.12.3] - 2026-03-27

### Fixed

- Status runtime now validates `agent.started` payloads at the entry point and reports missing `agent_id` and/or `agent` fields with a single clearer error before deeper runtime processing begins.

## [0.12.2] - 2026-03-25

### Changed

- `README.md` install guidance now uses a more consistent copy-paste-first structure across release targets, keeps clone-based install guidance scoped to developers, and clarifies the all-in-one Bash flow.
- Codex install docs now explain that the standard install path already backs up and overwrites existing `.codex` files, instead of making users reach for a separate overwrite flag.

### Fixed

- Codex install and bootstrap scripts now enable overwrite mode by default, matching the behavior users already expect from the other installers while preserving backups and backward-compatible force flags.
- Bash release install one-liners now use safer command chaining, and the README version-sync helper now matches the updated install snippet layout.

## [0.12.1] - 2026-03-25

### Changed

- `README.md` now leads with release / no-clone installation, adds a copy-paste Ubuntu/macOS/Linux all-in-one one-liner, and keeps clone-based install as a secondary path.
- Release-bundle install sections in `README.md` now use collapsible blocks, and pinned bootstrap examples are synchronized from `VERSION` via `scripts/sync-readme-version.py` so future version bumps are easier to keep in sync.
- `README.md` now folds more maintainer/reference sections into collapsible blocks and clarifies the Bash-first Ubuntu/macOS/Linux all-in-one bootstrap flow.
- Flow and pipeline orchestrator guidance now explicitly asks visible subagent attempts to use unique `agent_id` values or include disambiguating metadata when a base id is reused.

### Fixed

- Status runtime agent tracking now preserves multiple visible agent records when the same base `agent_id` is reused, instead of silently overwriting prior nodes in `status-cli`.
- Release bundle packaging now normalizes shipped shell/Python script permissions, and the all-in-one Bash bootstrap installer reapplies readable/executable bits after extraction to avoid Linux permission-denied install failures.
- `scripts/sync-readme-version.py` now covers the added all-in-one shell snippet so README release examples stay aligned with `VERSION`.

## [0.12.0] - 2026-03-24

### Added

- OpenCode status runtime plugin support is now documented and release-published as a first-class install target alongside the core asset bundle.

### Changed

- OpenCode entry-contract guidance and release examples now align around the runtime-owned status plugin entry path and updated install shape.
- Deterministic pipeline glue helpers now centralize run-resolution and flag-contract checks, with a smoke harness covering the status runtime integration path.

## [0.11.5] - 2026-03-23

### Changed

- Flow and Pipeline guidance now treat the selected output path as a base output root, with fresh runs writing checkpoint, status, and artifacts into run-specific subdirectories and resume-only flows preferring the newest compatible run.

### Fixed

- `status-cli` now rejects non-canonical status JSON instead of guessing through legacy layouts, and its project-root discovery now prefers the newest run-specific output directory under `.pipeline-output/`.

### Added

- `docs/status-runtime-plugin-spec.md` describing a small runtime-owned plugin that can emit canonical run/task/agent status artifacts from lifecycle events.

## [0.11.4] - 2026-03-20

### Changed

- Status contract and orchestrator guidance now require visible `AgentStatus` records for delegated stage-scoped subagents such as `repo-scout`, even before canonical task ids exist.

### Fixed

- `status-cli` terminal and web graph views now show run-scoped agents directly under the run instead of silently dropping task-less subagents from the visualization.

## [0.11.3] - 2026-03-20

### Fixed

- Claude bootstrap install examples in `README.md` now use directly downloadable bootstrap scripts, so the documented copy-paste install flow works as written for global and optional project-local targets.

## [0.11.2] - 2026-03-20

### Fixed

- Claude Code docs now correctly treat the global `~/.claude/agents` directory as the default install target, with project-local `.claude/agents` documented only as an explicit override.

## [0.11.1] - 2026-03-20

### Fixed

- Claude support follow-up fixes now align README pinned release examples and stabilize the new CI regressions for Claude exporter frontmatter and stale generated-file cleanup coverage.

## [0.11.0] - 2026-03-19

### Added

- Claude Code support docs covering project-local `.claude/agents` installs, release-bundle bootstrap copying, and mapping guidance alongside existing OpenCode, Copilot, and Codex docs.
- `docs/claude-mapping.md` documenting source-of-truth usage, frontmatter/tool mapping, input adaptation, and current inline/no-nested-subagent guidance for Claude Code orchestrators.
- Claude Code exporter/install/bootstrap support with release-bundle and CI coverage via `scripts/export-claude-agents.py`, `scripts/install-claude.*`, and `scripts/bootstrap-install-claude.*`.

### Changed

- Root docs and exporter notes now describe Claude Code output generation alongside Copilot and Codex outputs.
- `status-cli/README.md` now includes a short cross-repo `web serve` cheatsheet for monitoring a fresh `run-*` execution from another repository via `.pipeline-output/<run-id>/...`.

## [0.10.1] - 2026-03-19

### Changed

- All primary `run-*` orchestrator prompts and command docs now align to runtime/plugin-owned status artifacts under `<run_output_dir>/status/`, so fresh runs can produce inputs that `status-cli` can inspect across repos.

### Fixed

- `checkpoint.schema.json` now includes `orchestrator-spec`, allowing `/run-spec` checkpoint smoke validation to pass end-to-end.

## [0.10.0] - 2026-03-18

### Added

- Status-layer MVP contract artifacts, schemas, examples, and validation coverage for the in-repo pipeline status layout.
- In-repo read-only `status-cli` inspection flows for run summaries, record views, visual inspection, task and agent listing, terminal dashboard triage, self-contained HTML export, and a loopback-only localhost web viewer with bounded refresh controls.

### Changed

- Status CLI planning and handoff docs now allow bounded same-repo localhost viewing and HTML export while keeping the feature read-only, local-only, non-controlling, and outside hosted/remote runtime scope.
- `--full-auto` guidance is now aligned across README, protocol docs, command docs, and orchestrator prompts around pause suppression, explicit flag precedence, bounded recovery, hard blockers, and cleanup boundaries.

### Fixed

- Release publishing job now checks out the repo before invoking `gh release`, so tag and manual releases can publish assets successfully.

## [0.9.1] - 2026-03-17

### Changed

- Release workflows now use Node 24-compatible artifact actions and GitHub CLI publishing to avoid Node 20 deprecation warnings in release jobs.

## [0.9.0] - 2026-03-17

### Added

- Resource-aware DispatchPlan schema coverage with positive and negative fixtures for browser, server, and bounded process routing.
- CI checks for dispatch-plan resource validation and prompt/documentation coverage of the resource-control contract.

### Changed

- Pipeline and Flow orchestration docs now require resource classification, conservative heavy-task scheduling, and teardown evidence for lingering resources.
- Router, executor, test-runner, and reviewer prompts now treat cleanup as part of task completion and enforce teardown evidence for heavy batches.
- DispatchPlan batches now carry required resource metadata fields for `resource_class`, `max_parallelism`, and `teardown_required`.

## [0.8.0] - 2026-03-12

### Added

- `--full-auto` preset for `run-pipeline`, `run-modernize`, and `run-flow` to bundle stronger hands-off execution defaults.

### Changed

- Pipeline autopilot guidance now explicitly continues runnable work and performs a bounded non-hard blocker recovery pass before surfacing a stop condition.
- Flow documentation now exposes a consistent `--full-auto` hands-off preset with forced repo scouting by default.
- README now includes a comparison table and rule-of-thumb guide for choosing between `--autopilot` and `--full-auto`.

## [0.7.0] - 2026-03-11

### Added

- CI now covers mocked bootstrap dry runs for shell and PowerShell installer flows across base, Copilot, and Codex targets.

### Changed

- PowerShell CI validation now handles expected non-zero exit codes correctly when checking switch-like target rejection.
- Release bundle build and validation now run through a reusable release workflow.
- Pipeline docs now use `effort` terminology instead of `budget` for non-committee execution semantics.
- Committee docs now default omitted `--budget` handling to `medium`.
- General pipeline docs no longer carry a budget-ignore contract.

### Fixed

- README pinned-version checks now validate documented versions against `VERSION`.
- Exporters now use deterministic, bounded frontmatter parsing.
- Generated Copilot and Codex output cleanup in CI is now bounded to expected stale files.

## [0.6.1] - 2026-03-10

### Changed

- Release bundles now include `README.md`, `CHANGELOG.md`, and `LICENSE` at the archive root.
- CI now simulates the release bundle layout to catch missing packaged files before tagging.
- PowerShell install/bootstrap scripts now reject switch-like target values and use safer parameter forwarding for nested installer calls.

## [0.6.0] - 2026-03-10

### Added

- `DevSpec` schema, examples, and pipeline/spec workflow documentation for human-readable, pipeline-consumable development specs.
- `orchestrator-spec` plus `/run-spec` for review-first spec generation.
- Task-level `trace_ids` support for linking execution back to stories, scenarios, acceptance criteria, and test cases.
- Codex multi-agent export CLI (`scripts/export-codex-agents.py`) that converts `opencode/agents/*.md` into `.codex/config.toml` plus per-role TOML files.
- Codex mapping documentation (`docs/codex-mapping.md`).
- Codex install/bootstrap scripts for local and release-bundle installation.

### Changed

- `orchestrator-pipeline`, `planner`, `atomizer`, `reviewer`, and `doc-writer` now understand optional `DevSpec` artifacts and canonical spec output paths.
- Modernize execution semantics now distinguish non-interactive `--autopilot` from phase traversal, persist reusable handoff contracts, and document source-planning versus target-implementation ownership.
- Modernize flow now documents `--init-target` target bootstrap behavior and reuses init docs as target-project constraints before implementation handoff.
- README and protocol docs now include spec handoff, modernize handoff, and end-to-end workflow examples.

## [0.5.6] - 2026-03-06

### Added

- `--autopilot` flag guidance across Flow/Pipeline command and protocol docs, including non-interactive precedence over `--confirm`/`--verbose`.
- Resume-only invocation documentation for `/run-flow --resume` and `/run-pipeline --resume`.

### Changed

- Flow/Pipeline orchestrator docs now specify checkpoint-based prompt hydration (`checkpoint.user_prompt`) when `--resume` is used without a new prompt.
- README flag guidance now includes resume-only and autopilot usage with updated examples.

## [0.5.5] - 2026-03-05

### Added

- `--require-jsonschema` flag for `opencode/tools/validate-schema.py` to enforce full-schema validation when required.

### Changed

- CI now installs `jsonschema` and runs modernize handoff schema checks with `--require-jsonschema`.
- Bash bootstrap installers now parse GitHub release JSON via structured Python parsing instead of `grep|cut|head` chains.
- Root `.gitignore` now uses targeted local artifact patterns in place of broad wildcard rules.

### Fixed

- Added `orchestrator-general` to `checkpoint.schema.json` orchestrator enum to align schema with active orchestrators.

## [0.5.4] - 2026-02-23

### Added

- Optional `modernize -> pipeline` execution handoff contract schema (`modernize-exec-handoff.schema.json`) with valid/invalid example payloads.
- `scripts/validate-modernize-handoff.py` helper for validating handoff payloads against the schema.

### Changed

- `orchestrator-modernize` now supports planning plus optional phase execution handoff modes (`plan+handoff`, `phase-exec`, `full-exec`) delegated to `@orchestrator-pipeline`.
- `orchestrator-pipeline` now documents compatibility rules for phase-scoped modernization execution handoffs.
- CI now validates modernize handoff schema examples (positive + negative case), and release bundles now include the handoff validation script.

## [0.5.3] - 2026-02-20

### Changed

- Copilot install scripts now default to `~/.copilot/agents` to match current Copilot CLI custom agent resolution.
- Updated Copilot install docs to use `~/.copilot/agents` as the default target.

## [0.5.2] - 2026-02-20

### Changed

- Copilot PowerShell installer default target now follows `${XDG_CONFIG_HOME:-~/.config}/copilot/agents` across platforms.
- Copilot export filename generation now uses source file stem with `.agent.md` suffix for deterministic CLI agent IDs.

### Fixed

- Updated repository docs to align Copilot install location and custom agent filename rules with GitHub Copilot docs.

## [0.5.1] - 2026-02-15

### Added

- Modernize depth profiles via `--depth=lite|standard|deep` for verbosity control.
- A stricter summarizer output contract for concise final responses.

### Changed

- Orchestrators now default to concise output and only provide stage-by-stage progress in `--confirm`/`--verbose` modes.
- Command docs were simplified to quick-reference flags and now point to orchestrator/protocol docs as the source of truth.
- Modernize templates now use shorter executive summaries and remove fixed per-section word minimums.

### Fixed

- Aligned checkpoint resume validation and test/retry semantics across orchestrator and protocol docs.
- Clarified artifact filename policy between fixed-name docs and task-id metadata usage.

## [0.4.0] - 2026-02-13

### Added

- General-purpose non-coding orchestrator (`opencode/agents/orchestrator-general.md`).
- General-purpose command entrypoint (`opencode/commands/run-general.md`).

### Changed

- General-purpose pipeline now ignores `--budget` and focuses on task-fit routing.
- General-purpose artifact outputs are now explicitly required to be human-friendly.

## [0.3.0] - 2026-02-13

### Added

- VS Code Copilot agent export CLI (`scripts/export-copilot-agents.py`).
- Copilot installers (`scripts/install-copilot.ps1`, `scripts/install-copilot.sh`).
- Copilot bootstrap installers (`scripts/bootstrap-install-copilot.ps1`, `scripts/bootstrap-install-copilot.sh`).
- Copilot mapping documentation (`docs/copilot-mapping.md`).

### Changed

- CI now validates Copilot export/install dry-run paths.
- Release bundle now includes Copilot installer/export scripts.

## [0.2.0] - 2026-02-13

### Changed

- Removed per-agent model mapping management (`agent-models.json` and sync script).
- Switched model selection to runtime-driven behavior in docs and workflows.
- Neutralized executor naming and routing schema fields (`executor-core`, `executor-advanced`, `advanced_reserve_tasks`).

## [0.1.1] - 2026-02-06

### Added

- CI workflow (`.github/workflows/ci.yml`) for PR/main validation.
- Checksum verification in bootstrap installers (`scripts/bootstrap-install.ps1`, `scripts/bootstrap-install.sh`).

### Changed

- Added root `VERSION` source-of-truth and enforced release tag alignment in workflow checks.
- Pinned GitHub Actions in workflows to immutable commit SHAs.

## [0.1.0] - 2026-02-06

### Added

- Initial release automation with release bundle publishing.
- Local installers (`scripts/install.ps1`, `scripts/install.sh`) and no-clone bootstrap installers.
- Agent model mapping config (`agent-models.json`) and sync script (`scripts/update-agent-models.py`).
