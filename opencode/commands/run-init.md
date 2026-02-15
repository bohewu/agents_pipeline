---
description: Run Init pipeline for greenfield projects
agent: orchestrator-init
---

# Run Init Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-init)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-init MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-init.md`.

### Supported flags (quick reference)

- `--decision-only` — only brief/architecture/constraints
- `--iterate` — one revision round after synthesis
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`

## Examples

```
/run-init Plan a new SaaS platform
/run-init Plan a new SaaS platform --decision-only
/run-init Plan a new SaaS platform --iterate
/run-init Continue previous run --resume
/run-init Plan with step-by-step review --confirm
```

## Notes

- Use for greenfield projects or major re-architecture.
