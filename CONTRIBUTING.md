# Contributing

This repository is Codex-first and runtime-neutral at its source boundary.

## Support policy

- Codex is Tier 1 and receives the primary installer, documentation, workflow development, and CI coverage.
- Claude Code and GitHub Copilot are Tier 2 best-effort format adapters.
- OpenCode support ended at `v0.26.1`. Do not add current-tree OpenCode commands, plugins, tools, installers, or release targets.

## Source of truth

- `agents/*.md`: canonical agent instructions with only `name`, `description`, and `kind` frontmatter.
- `modes.json`: supported mode names, aliases, and primary orchestrator targets.
- `protocols/`: schemas, fixtures, and workflow contracts.
- `skills/`: portable repo-managed skills.
- `tools/status-event.js` and `tools/status-runtime/`: runtime-neutral status/checkpoint writer.
- `tools/agent-profiles/`: neutral logical model-tier profiles.
- `runtimes/<runtime>/model-sets/`: runtime-specific tier mappings.
- `scripts/export-*.py` and `scripts/install-*`: generated runtime projections and installers.

Do not hand-edit generated files under `.codex/agents`, `.claude/agents`, or Copilot agent targets. Change the neutral source or the corresponding adapter, then regenerate.

## Frontmatter contract

Canonical agent files use this bounded shape:

```yaml
---
name: reviewer
description: Reviews implementation evidence and quality gates.
kind: subagent
---
```

`kind` is `primary` or `subagent`. Runtime-specific model, provider, tool, sandbox, visibility, temperature, and reasoning fields do not belong in canonical frontmatter.

## Local validation

Run the focused checks that cover your change, then run the full suite before a release:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/validate-orchestrator-contracts.py
python3 scripts/validate-helper-contracts.py
python3 scripts/validate-reviewer-retry-guidance.py
python3 scripts/validate-status-emission-guidance.py
python3 scripts/validate-skill-frontmatter.py
python3 scripts/update-agent-model-sets.py --check
node --test tests/status-runtime.test.js
node scripts/validate-status-runtime-smoke.cjs
```

Exporter smoke checks:

```bash
python3 scripts/export-codex-agents.py --source-agents agents --target-dir .tmp-codex --strict --dry-run
python3 scripts/export-claude-agents.py --source-agents agents --target-dir .tmp-claude --strict --dry-run
python3 scripts/export-copilot-agents.py --source-agents agents --target-dir .tmp-copilot --strict --dry-run
```

Schema example:

```bash
python3 tools/validate-schema.py \
  --schema protocols/schemas/run-status.schema.json \
  --input protocols/examples/status-layout.run-only.valid/run-status.json \
  --require-jsonschema
```

## Change rules

- Keep mode targets, primary orchestrators, status-runtime allowlists, schema enums, and `AGENTS.md` synchronized. The orchestrator validator enforces this projection.
- Keep risk/verification/review/retry semantics explicit; do not reintroduce a workflow-wide effort mode or map workflow rigor to model reasoning.
- Preserve canonical checkpoint/status schemas and cleanup evidence requirements.
- Tier 2 adapters may degrade unsupported capabilities clearly; do not add runtime-specific protocol forks just to claim parity.
- Keep OpenCode history in `CHANGELOG.md` and the frozen README block; do not restore it as an active build target.

## Release changes

Update `VERSION`, `CHANGELOG.md`, and current release examples together. Then run:

```bash
python3 scripts/sync-readme-version.py --check
```

The release workflow publishes `agents-pipeline-bundle-v<version>` archives containing neutral source, all three retained adapters, and the status writer. It must not include an `opencode/` runtime tree.
