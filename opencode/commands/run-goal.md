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
- `run-goal` does not call other slash commands internally.
- The command accepts either:
  - a freeform goal prompt, or
  - an inline explicit batch set in Markdown/JSON-like form where each batch may optionally specify its own orchestrator.
- Default batch orchestrator is `orchestrator-flow` unless the user or batch explicitly overrides it.
- Goal-session state is persisted under `<output_root>/goals/<goal_id>/goal-manifest.json`.
- Inner Flow/Pipeline run status remains canonical in the existing status runtime layout under `<output_root>/<run_id>/`.
- When the runtime supports orchestrator-to-orchestrator agent dispatch, `orchestrator-goal` may hand a batch to the selected inner orchestrator directly.
- When direct delegation is unavailable but the runtime supports definition-driven mode adoption in the current/main agent, `orchestrator-goal` may read the selected `orchestrator-*` definition file and simulate that inner orchestrator behavior from the loaded definition.
- When neither direct delegation nor supported mode simulation is available, `orchestrator-goal` should persist state and return an exact human-facing `/run-flow`, `/run-pipeline`, `/run-general`, or `/run-simple` continuation command.
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
- If direct inner-orchestrator dispatch is not available, the goal session should prefer definition-driven mode simulation when the runtime formally supports it; otherwise it should degrade to a persisted handoff instead of ad hoc reimplementation.