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
- `--resume` also supports resume-only invocation without a new prompt (reuses checkpoint prompt when valid).
- Source of truth for flag parsing/behavior: `opencode/agents/orchestrator-flow.md`.
- Heavy resource tasks such as local servers and browser automation are routed conservatively and require teardown evidence before the next heavy task.
- Supported flags (Flow-only, minimal):
  - `--scout=auto|skip|force`
  - `--skip-scout`
  - `--force-scout`
  - `--output-dir=<path>` — Override artifact output directory (default: `.pipeline-output/`)
  - `--resume` — Resume from the last checkpoint
  - `--confirm` — Pause after each stage for user review
  - `--verbose` — Implies `--confirm`; additionally pauses after each task
  - `--autopilot` — Run non-interactively; disables stage/task pauses and stops only on hard blockers
  - `--full-auto` — Hands-off preset: implies `--autopilot` and defaults Flow to `--force-scout` unless a scout mode was set explicitly

## Examples

```
/run-flow Fix the login validation bug
/run-flow Add dark mode toggle --skip-scout
/run-flow --resume
/run-flow Continue previous run --resume
/run-flow Implement with review --confirm
/run-flow Ship login improvements --autopilot
/run-flow Ship login improvements --full-auto
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
