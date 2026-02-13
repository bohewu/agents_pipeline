# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

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
