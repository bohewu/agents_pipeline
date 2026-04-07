# Compatibility

## Scope

This repository targets current OpenCode-style runtimes that support:

- custom agent markdown
- slash commands
- custom tools
- server/TUI plugins through `@opencode-ai/plugin`

The repo is capability-driven more than semver-gated. There is no separate compatibility shim for older runtimes that lack those features.

## Required For Contributors

- Python 3.9+
  Required for schema validation, export scripts, and Python-backed helper tools.
- Bash on macOS/Linux or PowerShell 7+ on Windows
  Required for installer paths and local validation parity.
- Node 18+
  Required for repo-local status-runtime tests and the smoke harness.

## Required For OpenCode Runtime Usage

- An OpenCode runtime that can load this repo's commands, tools, and plugins.
- Compatibility with `@opencode-ai/plugin` `1.3.17` as declared in `.opencode/package.json`.
- Configured model providers in OpenCode.

Note:
Installed plugins run inside the host runtime's JavaScript environment. Contributors use Node for local validation, but end users do not run the plugins directly with standalone Node.

## Optional Dependencies

- GitHub CLI (`gh`)
  Used for live Copilot usage lookup and optional release-attestation verification.
- Codex CLI / local Codex auth files
  Needed for live Codex quota inspection.
- Claude Code, VS Code Copilot, Codex CLI targets
  Only required if you are installing/exporting those companion assets.
- `jsonschema` Python package
  Optional locally, but recommended for full schema validation parity with CI.

## Host-Provided Assumptions

- OpenCode/Bun provides the runtime needed by the TypeScript tool shims that call the Python helpers.
- Installer scripts assume standard platform tooling:
  - Linux/macOS: `curl`, `tar`, `sha256sum` or `shasum`
  - Windows: PowerShell 7+

## Common Incompatibilities

- Python missing or older than 3.9
- PowerShell 5.x instead of PowerShell 7+
- `gh` installed but not authenticated when using live Copilot usage lookup
- no local OpenCode/Codex auth files when using live Codex usage lookup
- older OpenCode runtimes that do not support the plugin/tool APIs used here
- missing Node when running repo-local test/smoke commands

## Practical Guidance

- If you only need published assets, prefer the release bundle install path in `README.md`.
- If you are editing the repo, use `docs/developer-install.md` and `CONTRIBUTING.md`.
- If a feature depends on network/auth state, check `docs/external-dependencies.md` before assuming the repo itself is broken.
