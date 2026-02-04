---
description: Run Flow pipeline (max 5 tasks)
agent: orchestrator-flow
model: openai/gpt-5.2-codex
---

# Run Flow Pipeline

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is the main task prompt.
- Supported flags (Flow-only, minimal):
  - `--scout=auto|skip|force`
  - `--skip-scout`
  - `--force-scout`

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
