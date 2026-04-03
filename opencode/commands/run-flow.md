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
- Prerequisite: the runtime must load the status plugin that exposes the `status_runtime_event` tool.
- Flow uses the shared `status_runtime_event` contract in `opencode/protocols/PIPELINE_PROTOCOL.md` for checkpoint/status writes.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`, where `<run_output_dir>` is a run-specific directory under the selected output root.
- Flow task decomposition is persisted to `<run_output_dir>/flow/task-list.json` and should follow the dedicated Flow task-list schema.
- Heavy resource tasks such as local servers and browser automation are routed conservatively and require teardown evidence before the next heavy task.
- Supported flags (Flow-only, minimal):
  - `--scout=auto|skip|force`
  - `--skip-scout`
  - `--force-scout`
  - `--handoff` — write run-local handoff artifacts at the end of the run
  - `--kanban=off|manual|auto` — control root-tracked `todo-ledger.json` / `kanban.md` behavior
  - `--output-dir=<path>` — Override the base artifact output root (default: `.pipeline-output/`); fresh runs use a run-specific subdirectory under it, and resume searches that root for the newest compatible run unless a specific run dir is targeted
  - `--resume` — Resume from the last checkpoint
  - `--confirm` — Pause after each stage for user review
  - `--verbose` — Implies `--confirm`; additionally pauses after each task
  - `--autopilot` — Run non-interactively; disables stage/task pauses and stops only on hard blockers
  - `--full-auto` — Hands-off preset: implies `--autopilot`, disables pauses, defaults Flow to `--force-scout` unless scout mode was set explicitly, and prefers the strongest safe bounded in-scope recovery available within Flow before surfacing a non-hard blocker
- Root-tracked helper artifacts stay in the project root:
  - `todo-ledger.json` is the canonical kanban source
  - `kanban.md` is the rendered board view
  - `session-guide.md` is stable repo guidance, not run state

## Examples

```
/run-flow Fix the login validation bug
/run-flow Add dark mode toggle --skip-scout
/run-flow --resume
/run-flow Continue previous run --resume
/run-flow Implement with review --confirm
/run-flow Ship login improvements --autopilot
/run-flow Ship login improvements --full-auto
/run-flow Finish login cleanup --handoff --kanban=auto
```

## Flow vs Flow-Full

Flow:
- Daily engineering
- Max 5 atomic tasks
- Parallel execution
- No reviewer / no retry loops

Flow-Full:
- CI / PR / high-risk
- Deep pipeline
- Reviewer and retries
