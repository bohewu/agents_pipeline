# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

### Fixed

- Reverted the latest context-aware `effort-control` server-plugin expansion after local OpenCode validation showed it could trigger a startup crash in non-pure mode; the plugin returns to the prior GPT-5 floor behavior until the host-runtime compatibility issue is understood.

## [0.22.15] - 2026-04-18

### Changed

- `orchestrator-pipeline` now writes a minimal inline `context-pack.json` for clearly trivial successful `--compress` runs instead of always dispatching `@compressor`, keeping the flag/artifact contract unchanged while avoiding extra Stage 8 cost on obvious small-pass runs.
- Exported Copilot, Codex, and Claude orchestrator prompts now compact repeated checkpoint and run-status protocol sections at export time, reducing generated prompt overhead without changing source agent markdown, runtime contracts, or output paths.
- The effort-control plugin now suppresses its automatic GPT-5 medium floor on reliably detected planning-only slash-command runs such as `--dry` and `--decision-only`, while preserving stronger project/session overrides and the existing agent-based exclusions.
- `PROTOCOL_SUMMARY.md` is now smaller again: the global instruction file keeps only the two universal rules, while task traceability, evidence, and resource-control specifics stay in the local agent/protocol docs that already own those contracts.

## [0.22.14] - 2026-04-18

### Changed

- Helper artifact guidance now treats `todo-ledger.json` as the canonical kanban state while `kanban.md` stays a rendered view and `session-guide.md` stays stable repo guidance, with validator and CI coverage to keep those helper contracts aligned.
- Exported orchestrator prompts are leaner: runtime adapters, handoff boilerplate, responsibility matrices, response-mode defaults, and confirm/verbose progress rules are compacted at export time without changing source prompt readability, exporter CLIs, or output paths.
- The pipeline now defaults more aggressively to `ProblemSpec` for small isolated fixes by using an explicit `DevSpec` threshold gate instead of opening Stage 0.5 for most implementation-oriented uncertainty.
- Status runtime writes are cheaper and less chatty: same-run status deltas can flush through `status_runtime_event(event="batch")`, untouched status files are no longer rewritten on every event, redundant heartbeats are coalesced, and orchestrator guidance now treats standalone heartbeats as coarse liveness signals rather than routine per-step updates.
- GPT-5 effort-control exclusions now also cover additional structured low-reasoning roles such as `specifier`, `flow-splitter`, and `codex-account-manager`, reducing unnecessary medium-effort floors on planner-style work.
- Review failures now use in-band `[artifact]`, `[evidence]`, and `[logic]` prefixes so narrow formatting/evidence repairs can avoid broad retry loops when the underlying work is already present, with CI-backed guidance checks to keep reviewer and pipeline prompts aligned.

## [0.22.13] - 2026-04-18

### Changed

- Source agent prompts for `executor`, `peon`, `generalist`, `doc-writer`, `market-researcher`, and `test-runner` now use shorter cleanup and artifact wording while preserving the existing JSON contracts, artifact delimiters, cleanup evidence requirements, and non-clean success semantics.
- Exported Copilot, Codex, and Claude orchestrator prompts now use shorter runtime adapter text plus conservative markdown whitespace compaction, reducing generated prompt overhead without changing exporter CLI behavior or output paths.
- `orchestrator-pipeline` now defaults more small or mechanical runs back to `ProblemSpec`, reserving automatic `DevSpec` generation for behavior-heavier work where the extra traceability is more likely to pay off.
- The GPT-5 effort-control exclusions now also cover `planner`, `router`, and `repo-scout`, so structured planning/routing/scouting steps no longer inherit the default medium-effort floor.

## [0.22.12] - 2026-04-17

### Fixed

- `codex-imagegen` now resolves explicit `codex_command` values, `CODEX_IMAGEGEN_CODEX_COMMAND`, and common Windows npm/fnm Codex CLI install paths before falling back to `codex` on `PATH`, reducing false warnings when OpenCode is launched outside a shell-initialized PATH.
- `codex-imagegen` now supports deterministic `output_path` targets, including `/codex-imagegen --output-path=...` command text, and detects updates to an existing target file.

## [0.22.11] - 2026-04-17

### Added

- Added `/codex-imagegen`, the repo-managed `codex-imagegen` skill, and the `codex-imagegen` OpenCode custom tool for delegating image generation to Codex CLI `$imagegen` using the locally signed-in Codex account and Codex usage limits.

### Changed

- The Codex image generation bridge now enables Codex CLI's `image_generation` feature per run, suppresses non-actionable Codex plugin/analytics/shell-snapshot warning noise where possible, and returns warnings instead of using any API or provider fallback when Codex image generation fails.

## [0.22.10] - 2026-04-17

### Changed

- Codex installer/exporter flows now rewrite repo-managed `opencode/...` references inside generated role instructions to installed absolute paths under the target `.codex` directory, so global installs work reliably on Ubuntu/Linux, macOS, and Windows instead of depending on the original repo-relative layout.
- `install-codex` now mirrors the repo-managed `opencode/` support tree into the target Codex directory and includes that support tree in installer backups, keeping the generated roles and their referenced protocol/skill files aligned across platforms.

### Fixed

- Added regression coverage for Codex support-tree rewriting and installer command forwarding so Linux-style installed paths such as `~/.codex/opencode/...` stay validated in local and CI checks.

## [0.22.9] - 2026-04-16

### Added

- Added `scripts/validate-local-preview-lifecycle-smoke.cjs` plus a minimal `scripts/fixtures/local-preview-smoke/` fixture so the local-preview lifecycle behind `devtools-ux-audit` can be smoke-tested with explicit reachability and teardown checks.

### Changed

- The `devtools-ux-audit` skill, its Windows notes, and `UX_DEVTOOLS_WORKFLOW.md` now make the local-preview/dev-server boundary explicit: browser automation starts only after the target URL is reachable, teardown must verify both URL failure and closed listener port, Linux/Ubuntu/macOS still require the same reachability/cleanup proof, and Windows notes now call out the `npm.cmd` wrapper-PID caveat.
- CI and contributor validation guidance now include the local-preview lifecycle smoke harness, with dedicated macOS and Windows hosted-runner coverage in addition to the existing Ubuntu validation job.

## [0.22.8] - 2026-04-13

### Added

- Added the repo-managed `ui-communication-designer` skill as the communication-first companion to `/uiux`, covering task clarity, trust, labels, instructions, microcopy, and screen-level redesign guidance derived from *UI is Communication*.

### Changed

- The `/uiux` command, `ui-ux-designer` agent, `UI_UX_WORKFLOW.md` protocol, and `ui-ux-bundle` schema/example bundle now explicitly support communication-first redesign and critique inside the existing conceptual UI/UX surface instead of adding a separate command or orchestrator.
- Communication-first `/uiux` outputs and the optional `ui-ux-bundle` export fields now more explicitly preserve a short human-to-human explanation, revised task-flow structure, and targeted microcopy rewrites.

## [0.22.7] - 2026-04-12

### Added

- Added the thin conceptual UI/UX layer with `/uiux`, the hidden `ui-ux-designer` subagent, `UI_UX_WORKFLOW.md`, and the versioned `ui-ux-bundle` schema/example bundle for bounded concept-first UI/UX work.
- `/uiux` now supports repo-owned durable bundle export via `--output-dir=<path>`, writing paired `*.ui-ux-bundle.json` and `*.ui-ux-bundle.md` assets outside `.pipeline-output/` when requested.

### Changed

- The conceptual UI/UX workflow now explicitly supports rough low-fi ASCII/monospace wireframe sketches as a valid structure-first output format.
- Local repo-owned conceptual UI/UX export assets under `output/` are now ignored by default so smoke tests and saved bundles do not clutter the worktree.

## [0.22.6] - 2026-04-10

### Changed

- `/artgen` now behaves as a generic image-generation prompt generator on its normal output surface: it still returns the bounded brief and handoff package, but it now always ends with a `Direct Use Prompt` block that users can paste into an external image-generation tool without extracting prompt text manually.
- The art-generation scaffold, `/artgen` command contract, `2d-asset-brief` skill, and `art-director` source agent no longer foreground internal phase labels or Codex-specific formatting in user-facing wording; they now describe one generic handoff surface plus one directly usable prompt surface.

### Documentation

- Updated the top-level README art-generation pointer so it matches the current scaffold behavior and explicitly points readers at the standardized handoff package plus the final `Direct Use Prompt`.

## [0.22.5] - 2026-04-08

### Note

- `v0.22.5` is the first stable release for this Codex installer/mapping fix set. The intermediate tags `v0.22.2` through `v0.22.4` were withdrawn after CI-only follow-up corrections, and their Codex installer/exporter changes should be treated as superseded by this release.

### Fixed

- Resolved the remaining GitHub-only Pester 5 scope issue in `tests/install-codex.Tests.ps1` by resolving `install-codex.ps1` inside each test case instead of relying on top-level fixture variables, so the PowerShell installer regression suite now runs consistently on both local and hosted runners.

## [0.22.1] - 2026-04-08

### Added

- Added `tests/test_validate_orchestrator_contracts.py` to cover successful projections plus three negative cases: missing `AGENTS.md` entries, commands targeting unknown agents, and unallowlisted `run-*` aliases.

### Changed

- `scripts/validate-orchestrator-contracts.py` now validates the full `AGENTS.md` catalog, all command `agent:` frontmatter targets, and an explicit allowlist for intentional `run-*` aliases such as `run-monetize -> orchestrator-general`.
- CI now runs the new validator unit test coverage in addition to the existing compile-and-script checks for orchestrator contract projections.

## [0.22.0] - 2026-04-07

### Added

- Added `scripts/validate-orchestrator-contracts.py` and wired it into CI so primary orchestrator definitions in `opencode/agents/orchestrator-*.md` remain aligned with command routing, `AGENTS.md`, status-runtime constants, and protocol schema enums.
- Added contributor-facing governance and onboarding docs with `CONTRIBUTING.md`, `SECURITY.md`, `COMPATIBILITY.md`, GitHub PR/issue templates, `CODEOWNERS`, and a dedicated external-dependency risk guide in `docs/external-dependencies.md`.

### Changed

- `skill-manager` now supports `--ref=<tag|sha>` for remote GitHub catalog lookups/installations, and its text output/help now makes mutable default-branch installs explicit.
- `provider-usage` now exposes clearer help text, auth guidance, and fallback-oriented error messages for Codex and Copilot usage lookups.
- CI now runs orchestrator projection checks, status-runtime unit tests, the smoke harness, and helper-tool contract checks locally and in pull requests.

### Fixed

- Added the missing `orchestrator-analysis` allowlist entry to the status-runtime constants and the `run-status` / `checkpoint` schemas so analysis runs no longer fail validation/runtime writes due to stale hard-coded enums.

### Removed

- Removed the experimental `/session-tokens` POC because it reported the latest worktree-matched Codex rollout history rather than a trustworthy current single-session usage signal, and it frequently failed on machines without rollout session data.

## [0.21.14] - 2026-04-07

### Changed

- Shortened the experimental `/session-tokens` toast output to a compact `total | uncached | cached | out` summary and rounded `k`-scale values to whole thousands, so the usage-status UI no longer wraps awkwardly on narrow terminal widths.

## [0.21.13] - 2026-04-07

### Added

- Added `/run-monetize` as a research-capable monetization analysis workflow that reuses the general non-coding orchestrator, prefers a dedicated market-research lane, and steers outputs toward comparable scans, monetization-model comparisons, monthly USD scenarios, and validation experiments.
- Added the hidden `market-researcher` subagent for source-cited web market scans, pricing signal collection, and monetization benchmark gathering.
- Added `/session-tokens` as an experimental no-token POC command in the usage-status plugin that reads local Codex rollout `token_count` events, separates cached vs uncached input, and reports session-level token totals.

### Changed

- `/next-codex-account` now routes through a local OpenCode plugin command path instead of an agent-backed command, making it a true local/no-model slash command in interactive OpenCode sessions.
- `run-monetize` now has a stronger output contract with separate research and synthesis lanes plus a preferred three-artifact structure (`market-scan`, `monetization-scenarios`, `monetization-report`).
- `/session-tokens` output now uses compact `k` / `M` token formatting and explicitly documents why safe subagent token attribution is still unavailable in this POC.

### Fixed

- Claude Code agent export now maps web research tools to the official tool names `WebFetch` and `WebSearch`, so the new market-researcher subagent exports cleanly to Claude.

## [0.21.12] - 2026-04-07

### Documentation

- Kept the shorter README landing page from `v0.21.11`, with clone-based developer install details living in `docs/developer-install.md` and common OpenCode commands surfaced near `Quick Start`.

### Fixed

- Updated the CI README installer-coverage check to validate the combined coverage from `README.md` and `docs/developer-install.md`, so moving clone-install details out of the main landing page no longer trips the coverage gate.

## [0.21.11] - 2026-04-07

### Documentation

- Shortened the README landing page by moving clone-based developer install instructions into `docs/developer-install.md`, trimming the table of contents, surfacing common OpenCode commands near `Quick Start`, and moving maintainer-only release notes back to the end of the README.

## [0.21.10] - 2026-04-07

### Documentation

- Documented the local Codex account management slash commands in the README, including `/codex-account`, `/codex-account-switch`, `/next-codex-account`, and the single-account / no-account behaviors users should expect.

## [0.21.9] - 2026-04-07

### Added

- Added local Codex account management helpers and slash commands for listing accounts, switching to a specific stored account, and rotating to the next stored account without editing `openai-codex-accounts.json` by hand.

### Fixed

- The `usage-status` OpenCode plugin now uses the same Windows `cmd.exe /d /c` Python resolution path as the other Python-backed helpers, so usage refreshes keep working on Windows installs where `python` is only reachable through normal shell resolution.
- `next-codex-account` now returns a stable no-op result when only one stored account is available, and a clear error when no local OpenCode account-selection file exists.

## [0.21.8] - 2026-04-07

### Fixed

- Python-backed OpenCode runtime helpers now execute Windows interpreter probes and Python script launches via `cmd.exe /d /c`, so Windows systems where `python` works through the normal shell resolution path also work inside Bun/OpenCode for `/usage`, `/usage-status-refresh`, `skill-manager`, and `validate-schema`.

## [0.21.7] - 2026-04-07

### Fixed

- Python-backed OpenCode runtime helpers now also probe the Windows `py` launcher (`py -3` / `py`) in addition to `python3` and `python`, so environments where interactive terminals can reach Python via the launcher no longer report a missing interpreter inside the Bun/OpenCode runtime.

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
