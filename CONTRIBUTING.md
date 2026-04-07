# Contributing

## Purpose

This repository is a workflow-assets and protocol repository for OpenCode-first multi-agent workflows.
It is not only a library:

- `opencode/agents/*.md` define the agent catalog and orchestrator behavior.
- `opencode/commands/*.md` define slash-command routing.
- `opencode/protocols/**/*` define JSON contracts, fixtures, and workflow rules.
- `opencode/plugins/*` and `opencode/tools/*` provide runtime/plugin/tooling support.
- export/install scripts publish those assets into OpenCode, Claude Code, Copilot, and Codex targets.

## Single Source Of Truth

- `opencode/agents/*.md`
  This is the source of truth for agent definitions.
  Do not hand-edit generated/exported agent outputs in other runtimes.
- `opencode/commands/*.md`
  Source of truth for command routing/frontmatter.
- `VERSION`
  Source of truth for release versioning.
- `opencode/protocols/schemas/*.json`
  Canonical protocol schemas.
- `opencode/protocols/examples/**/*`
  Validation fixtures that must stay aligned with the schemas.
- `opencode/plugins/status-runtime/*`
  Canonical runtime-owned status writer/projector implementation.
  Active orchestrator names are derived from `opencode/agents/orchestrator-*.md`; `scripts/validate-orchestrator-contracts.py` enforces that the runtime allowlist and schema enums stay aligned.

## Change Guidance

### Agent Changes

- Edit `opencode/agents/*.md`, not generated outputs.
- Keep frontmatter bounded and consistent with export-script expectations.
- If you add/remove a primary orchestrator, update related docs and run `scripts/validate-orchestrator-contracts.py`.

### Command Changes

- Keep `agent:` frontmatter aligned with a real agent.
- Update README command references when adding user-facing workflows or major flags.

### Protocol Or Status Changes

- Update schemas, positive fixtures, and negative fixtures together.
- Run the schema validator and the status-runtime smoke/unit checks.
- Avoid duplicating orchestrator lists or status enums in new places unless CI also validates them.

### Tool Or Plugin Changes

- Document auth, rate-limit, fallback, and privacy expectations when a tool touches external services.
- Prefer the smallest change that improves operator clarity or safety.
- For remote skill installs, prefer pinned refs (`--ref=<tag|sha>`) over mutable default-branch HEAD.

## Local Validation

Recommended baseline before opening a PR:

```text
python3 scripts/sync-readme-version.py --check
python3 scripts/validate-flag-contracts.py
python3 scripts/validate-orchestrator-contracts.py
python3 opencode/tools/provider-usage.py --help
python3 opencode/tools/skill-manager.py --help
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir ./.tmp-copilot --strict --dry-run
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir ./.tmp-codex --strict --dry-run
python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir ./.tmp-claude --strict --dry-run
node --test opencode/plugins/status-runtime/run-registry.test.js
node scripts/validate-status-runtime-smoke.cjs
```

For full schema validation parity with CI, install `jsonschema` first:

```text
python3 -m pip install jsonschema
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.run-only.valid/run-status.json --require-jsonschema
```

## CI Coverage

CI currently checks, at minimum:

- lightweight doc/community-only changes keep the README/docs/version coverage checks and skip the heavier runtime/export/installer matrix
- `VERSION` format and README pinned-version snippets
- agent export-script dry runs
- command flag contracts
- orchestrator projection drift between source agents, commands, status-runtime constants, and schema enums
- protocol/status schema fixtures, including negative fixtures that must fail
- status-runtime unit tests and smoke harness
- installer syntax/dry-run checks
- selected tool help/contract checks

## Release And Versioning

- Bump `VERSION` using SemVer without the `v` prefix.
- Use git tags with a `v` prefix, for example `v0.21.14`.
- After changing `VERSION`, run `python3 scripts/sync-readme-version.py` so pinned README examples stay current.
- Record notable changes in `CHANGELOG.md`.
- Release workflows expect the repo assets and docs to match the tagged version.

## Do Not

- Do not hand-edit generated/exported agent outputs.
- Do not add a second hand-maintained orchestrator list when an existing checked projection already exists.
- Do not commit tokens, auth files, downloaded credential payloads, or real provider reports.
- Do not silently add new external fetch/install behavior without documenting the risk and failure mode.
- Do not switch audited install examples back to mutable `main` unless you explicitly label them as less auditable.

## Pull Requests

- Use the PR template.
- Call out user-facing behavior changes, validation performed, and any external dependency or security impact.
- If you intentionally skip a CI-parity check locally, say so in the PR.
