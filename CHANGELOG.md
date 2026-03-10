# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

### Added

- No changes yet.

### Changed

- Release bundles now include `README.md`, `CHANGELOG.md`, and `LICENSE` at the archive root.
- CI now simulates the release bundle layout to catch missing packaged files before tagging.

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
