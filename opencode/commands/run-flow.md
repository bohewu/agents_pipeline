---
description: Run Flow pipeline (max 5 tasks)
agent: orchestrator-flow
---

# Run Flow Pipeline

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is the main task prompt.
- Source of truth for flag parsing/behavior: `opencode/agents/orchestrator-flow.md`.
- Supported flags (Flow-only, minimal):
  - `--scout=auto|skip|force`
  - `--skip-scout`
  - `--force-scout`
  - `--output-dir=<path>` — Override artifact output directory (default: `.pipeline-output/`)
  - `--resume` — Resume from the last checkpoint
  - `--confirm` — Pause after each stage for user review
  - `--verbose` — Implies `--confirm`; additionally pauses after each task

## Examples

```
/run-flow Fix the login validation bug
/run-flow Add dark mode toggle --skip-scout
/run-flow Continue previous run --resume
/run-flow Implement with review --confirm
```

## Flow vs Flow-Full

Flow:
- Daily engineering
- Max 5 atomic tasks
- Parallel execution
- No reviewer / no retries

Flow-Full:
- CI / PR / high-risk
- Deep pipeline
- Reviewer and retries
