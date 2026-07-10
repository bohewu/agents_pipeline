# Contributing

## Purpose

This repository is a workflow-assets and protocol repository for Codex-first multi-agent workflows.
It is not only a library:

- `opencode/agents/*.md` currently define the agent catalog and orchestrator behavior.
- `opencode/commands/*.md` currently hold legacy command routing and shared flag contracts.
- `opencode/protocols/**/*` currently define JSON contracts, fixtures, and workflow rules.
- export/install scripts publish the primary Codex roles and the bounded Claude Code/Copilot compatibility outputs.
- retained `opencode/plugins/*` and OpenCode-specific tools are frozen compatibility code, not the direction for new runtime features.

The `opencode/` source paths are transitional canonical locations during v0.27. The v0.28 neutral-core migration will move reusable assets out of the runtime-named tree. Do not perform that directory move piecemeal in unrelated v0.27 changes.

## Runtime Support Policy

- Codex is Tier 1: primary behavior, docs, installers, and CI validation.
- Claude Code and GitHub Copilot are Tier 2: best-effort exporters with smoke validation, without a feature-parity promise.
- OpenCode is deprecated and frozen. `v0.26.1` is the last OpenCode-first release.
- Do not add a cross-runtime abstraction solely to reproduce a capability already provided natively by the supported runtimes.

## Single Source Of Truth

- `opencode/agents/*.md`
  Transitional source of truth for agent definitions until the v0.28 neutral-core move.
  Do not hand-edit generated/exported agent outputs in other runtimes.
- `opencode/commands/*.md`
  Transitional source of truth for retained command routing/frontmatter. Do not add new OpenCode-only commands.
- `VERSION`
  Source of truth for release versioning.
- `opencode/protocols/schemas/*.json`
  Canonical protocol schemas.
- `opencode/protocols/examples/**/*`
  Validation fixtures that must stay aligned with the schemas.
- `opencode/plugins/status-runtime/*`
  Transitional status writer/projector implementation while the neutral tool boundary is prepared.
  Active orchestrator names are derived from `opencode/agents/orchestrator-*.md`; `scripts/validate-orchestrator-contracts.py` enforces that the runtime allowlist and schema enums stay aligned.

## Change Guidance

### Agent Changes

- Edit `opencode/agents/*.md`, not generated outputs.
- Keep frontmatter bounded and consistent with export-script expectations.
- If you add/remove a primary orchestrator, update related docs and run `scripts/validate-orchestrator-contracts.py`.
- Design and verify the Codex behavior first. Document any intentional degradation in Tier 2 exports.

### Command Changes

- Keep `agent:` frontmatter aligned with a real agent.
- Update README command references when adding user-facing workflows or major flags.
- Do not add new OpenCode-only command surfaces; prefer Codex-native behavior or runtime-neutral workflow semantics.

### Protocol Or Status Changes

- Update schemas, positive fixtures, and negative fixtures together.
- Run the schema validator and the status-runtime smoke/unit checks.
- Avoid duplicating orchestrator lists or status enums in new places unless CI also validates them.

### Tool Or Plugin Changes

- Document auth, rate-limit, fallback, and privacy expectations when a tool touches external services.
- Prefer the smallest change that improves operator clarity or safety.
- For remote skill installs, prefer pinned refs (`--ref=<tag|sha>`) over mutable default-branch HEAD.
- Do not introduce new OpenCode plugins or expand frozen OpenCode runtime behavior.

## Local Validation

Recommended baseline before opening a PR:

```text
python3 scripts/sync-readme-version.py --check
python3 scripts/validate-flag-contracts.py
python3 scripts/validate-orchestrator-contracts.py
python3 opencode/tools/provider-usage.py --help
python3 opencode/tools/skill-manager.py --help
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir ./.tmp-codex --strict --dry-run
python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir ./.tmp-claude --strict --dry-run
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir ./.tmp-copilot --strict --dry-run
node --test opencode/plugins/status-runtime/run-registry.test.js
node scripts/validate-status-runtime-smoke.cjs
node scripts/validate-local-preview-lifecycle-smoke.cjs
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
- Codex export/install validation plus strict Claude Code and Copilot compatibility-export dry runs
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
- Preserve `v0.26.1` as the frozen OpenCode-first reference; newer releases must not imply continued OpenCode feature support.

## Do Not

- Do not hand-edit generated/exported agent outputs.
- Do not advertise Tier 2 runtimes as feature-equivalent to Codex.
- Do not add new OpenCode runtime features or silently move the transitional `opencode/` source tree before the v0.28 migration.
- Do not add a second hand-maintained orchestrator list when an existing checked projection already exists.
- Do not commit tokens, auth files, downloaded credential payloads, or real provider reports.
- Do not silently add new external fetch/install behavior without documenting the risk and failure mode.
- Do not switch audited install examples back to mutable `main` unless you explicitly label them as less auditable.

## Pull Requests

- Use the PR template.
- Call out user-facing behavior changes, validation performed, and any external dependency or security impact.
- If you intentionally skip a CI-parity check locally, say so in the PR.
