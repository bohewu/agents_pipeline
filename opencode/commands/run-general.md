---
description: Run the general-purpose dispatcher for coding, planning, analysis, writing, and maintenance tasks
agent: orchestrator-general
---

# Run General Pipeline

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is treated as the main task prompt.
- This command is the general-purpose dispatcher for mixed work: coding, debugging, maintenance, planning, analysis, writing, checklists, and decision records.
- For tasks that need stricter controls, it either completes the work in this general flow or returns a concrete handoff recommendation to `/run-pipeline` or `/run-flow`.
- Source of truth for flag parsing/behavior: `opencode/agents/orchestrator-general.md`.
- Supported flags:
  - `--output-dir=<path>`
  - `--resume`
  - `--confirm`
  - `--verbose`
  - `--full-auto`

## Examples

```
/run-general Draft a 90-day product roadmap for our team
/run-general Compare 3 onboarding process options
/run-general Create an SOP for incident communication --confirm
/run-general Fix the failing profile validation test --full-auto
/run-general Continue previous planning session --resume
```

## Guarantees

- Coding tasks are allowed and should be routed to implementation-capable agents rather than rejected because they involve code.
- Structured staged execution with artifact traceability under `.pipeline-output/<run_id>/general/` by default.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- File outputs are human-friendly by default (plain language, clear structure, actionable next steps).
