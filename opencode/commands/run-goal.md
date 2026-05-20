---
description: Run a stateful goal session that persists batches and resumes by goal id
agent: orchestrator-goal
---

# Run Goal Session

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-goal)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-goal MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as goal-session flags.
- `--resume` supports resume-only invocation when `--goal-id=<id>` is provided.

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-goal.md`.

### Supported flags (quick reference)

- `--goal-id=<id>` — explicit goal session id for fresh or resume runs
- `--resume` — resume an existing goal session; resume-only invocation requires `--goal-id=<id>`
- `--orchestrator=<name>` — default inner orchestrator for batches that do not specify one (`orchestrator-flow` by default)
- `--commit=off|before|after` — optional git helper lane; `after` commits once per completed outer batch
- `--handoff` — write run-local handoff artifacts at the end of the goal session
- `--kanban=off|manual|auto` — control root-tracked `todo-ledger.json` / `kanban.md` behavior at batch boundaries and final completion
- `--output-dir=<path>` — override the base artifact output root (default: `.pipeline-output/`)
- `--confirm` — pause after each outer stage or batch boundary for user review
- `--verbose` — implies `--confirm`; additionally reports per-batch dispatch details
- `--autopilot` — run non-interactively; disables outer pauses and auto-continues between batches unless hard-blocked
- `--full-auto` — hands-off preset: implies `--autopilot`, defaults the session to the strongest safe bounded continuation path, and forwards compatible autonomy flags to inner orchestrators unless a batch overrides them

## Notes

- Use for multi-batch goals that need durable progress, resumable state, and optional carryover sync.
- Prompt file input is intentionally out of scope for v1.
- The command accepts either:
  - a freeform goal prompt, or
  - an inline explicit batch set in Markdown/JSON-like form where each batch may optionally specify its own orchestrator.
- Default batch orchestrator is `orchestrator-flow` unless the user or batch explicitly overrides it.
- Goal-session state is persisted under `<output_root>/goals/<goal_id>/goal-manifest.json`.
- Inner Flow/Pipeline run status remains canonical in the existing status runtime layout under `<output_root>/<run_id>/`.
- Root-tracked helper artifacts stay in the project root:
  - `todo-ledger.json` is the canonical kanban source
  - `kanban.md` is the rendered board view
  - `session-guide.md` is stable repo guidance, not run state

## Examples

```
/run-goal Ship the auth hardening work in resumable batches
/run-goal Ship onboarding cleanup --goal-id=goal-onboarding-cleanup --commit=after --kanban=auto
/run-goal --resume --goal-id=goal-onboarding-cleanup
/run-goal Batch 1: fix login validation. Batch 2: run reviewed cleanup with orchestrator-pipeline. --commit=after --full-auto
```

## Guarantees

- This command does NOT rely on CLI-level flag parsing.
- All behavior is enforced at orchestrator-goal prompt level.
- Compatible with OpenCode official command system.
- The outer goal manifest is the source of truth for goal-session progress and batch ordering.
- Existing inner orchestrators retain ownership of their own checkpoints, status files, and task semantics.