# Compatibility

## Runtime Support

This repository is Codex-first. Runtime support is intentionally tiered:

| Runtime | Level | What is maintained |
|---|---|---|
| Codex | Tier 1 / first-class | Primary installer and documentation, workflow behavior, role generation, and CI validation |
| Claude Code | Tier 2 / best-effort | Generated agent files plus strict export and install smoke checks |
| GitHub Copilot | Tier 2 / best-effort | Generated custom-agent files plus strict export and install smoke checks |
| OpenCode | Deprecated / frozen | No new runtime features; `v0.26.1` is the last OpenCode-first release |

Tier 2 targets are format adapters, not compatibility promises. A successful export does not guarantee parity with Codex delegation depth, tools, permissions, checkpoint/status behavior, runtime-native commands, or model controls.

OpenCode users should pin [`v0.26.1`](https://github.com/bohewu/agents_pipeline/releases/tag/v0.26.1). Files under `opencode/` remain the transitional canonical source layout during v0.27 so the migration can stay reviewable; they are scheduled to move into a runtime-neutral core in v0.28. Their current path does not make OpenCode a supported primary runtime.

## Required For Contributors

- Python 3.9+
  Required for schema validation, export scripts, installers, and Python-backed helper tools.
- Bash on macOS/Linux or PowerShell 7+ on Windows
  Required for installer paths and local validation parity.
- Node 18+
  Required for the retained status-runtime tests and smoke harness during the transition.

## Required For Codex Runtime Usage

- A current Codex CLI installation with a valid local login.
- A writable global Codex home (normally `~/.codex`) or an intentionally selected workspace `.codex` target.
- A Codex build that supports the generated agent-role configuration used by this repository.

Model and reasoning selection come from the effective Codex runtime configuration. Repository workflow flags do not emulate or override Codex reasoning controls.

## Optional Compatibility Targets

- Claude Code
  Required only when generating or installing the Tier 2 Claude agent files.
- VS Code with GitHub Copilot
  Required only when using the Tier 2 Copilot custom-agent output.
- GitHub CLI (`gh`)
  Used for optional release-attestation verification.
- `jsonschema` Python package
  Optional locally, but recommended for full schema-validation parity with CI.
- OpenCode
  Needed only for frozen legacy usage or while maintaining transitional compatibility assets. Use the `v0.26.1` release for the former.

## Host-Provided Assumptions

- Installer scripts assume standard platform tooling:
  - Linux/macOS: `curl`, `tar`, `sha256sum` or `shasum`
  - Windows: PowerShell 7+
- Retained OpenCode TypeScript shims and plugins depend on the legacy OpenCode/Bun host. They are not part of the Tier 1 Codex runtime contract.

## Common Incompatibilities

- Python missing or older than 3.9
- PowerShell 5.x instead of PowerShell 7+
- missing or expired Codex authentication
- expecting Claude Code or Copilot exports to reproduce every Codex orchestration feature
- installing OpenCode assets from current `main` instead of the frozen `v0.26.1` release
- missing Node when running repo-local test/smoke commands

## Practical Guidance

- For normal use, install the Codex roles described in `README.md`.
- For Claude Code or Copilot, treat generated files as bounded best-effort adapters and verify the workflow you rely on in that runtime.
- If you are editing the repository, use `docs/developer-install.md` and `CONTRIBUTING.md`.
- If a feature depends on network/auth state, check `docs/external-dependencies.md` before assuming the repository itself is broken.
