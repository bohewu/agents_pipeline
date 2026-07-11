# Multi-Agent Pipeline Repository Guide

This is a Codex-first multi-agent workflow repository with a runtime-neutral source core. Claude Code support is a Tier 2 best-effort export.

## Architecture

- `agents/*.md`: canonical primary/subagent definitions.
- `modes.json`: supported mode aliases and orchestrator routing.
- `protocols/`: workflow contracts, JSON schemas, and fixtures.
- `skills/`: portable repo-managed skills.
- `tools/status-event.js` + `tools/status-runtime/`: status/checkpoint writer.
- `tools/agent-profiles/`: neutral model tiers.
- `runtimes/claude/model-sets/`: Claude model aliases.
- `scripts/export-claude-agents.py`: Claude Code projection.

Generated `.claude/agents/*.md` files are outputs, not source. Canonical agent frontmatter contains only `name`, `description`, and `kind`.

## Common commands

```bash
python3 scripts/export-claude-agents.py --source-agents agents --target-dir /tmp/agents-pipeline-claude --strict --dry-run
bash scripts/install-claude.sh --dry-run
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/validate-orchestrator-contracts.py
python3 scripts/validate-skill-frontmatter.py
node --test tests/status-runtime.test.js
```

Schema validation:

```bash
python3 tools/validate-schema.py \
  --schema protocols/schemas/<schema>.json \
  --input <payload>.json \
  --require-jsonschema
```

## Invariants

- Do not add OpenCode runtime surfaces; its last supported release is `v0.26.1`.
- Do not reintroduce `/run-goal` or a goal orchestrator. Long-running work belongs to the host runtime's native task/session mechanisms.
- Do not add workflow-wide effort controls. Verification, review, and repair are risk-derived; model reasoning belongs to the runtime.
- Keep `modes.json`, orchestrator agents, status constants, schemas, and `AGENTS.md` synchronized.
- Preserve resource teardown and evidence requirements for browser/server/process work.
- Claude and Copilot adapters may document capability degradation instead of forking the canonical workflow.
