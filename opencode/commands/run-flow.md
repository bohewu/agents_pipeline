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

- This command passes all input as the main task prompt.
- No CLI flag parsing is performed.

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
