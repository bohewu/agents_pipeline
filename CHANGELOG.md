# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

### Added

- No changes yet.

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
