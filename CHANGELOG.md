# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

### Added

- No changes yet.

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
