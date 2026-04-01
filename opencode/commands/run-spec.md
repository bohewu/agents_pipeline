---
description: Run docs-first development spec pipeline
agent: orchestrator-spec
---

# Run Spec Pipeline

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is treated as the main task prompt.
- This pipeline is for review-ready development specs, not code implementation.
- Source of truth for flag parsing/behavior: `opencode/agents/orchestrator-spec.md`.
- Supported flags:
  - `--output-dir=<path>`
  - `--resume`
  - `--confirm`
  - `--verbose`

## Examples

```
/run-spec Define the first version of workspace invites
/run-spec Specify a checkout retry flow with BDD scenarios
/run-spec Draft a reviewable DevSpec for OAuth login --confirm
/run-spec Continue previous spec session --resume
```

## Guarantees

- No direct code implementation in this pipeline.
- Structured staged execution with artifact traceability under `.pipeline-output/<run_id>/spec/` by default.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- The human-readable spec is written to `<run_output_dir>/spec/dev-spec.md`.
- Outputs are designed so humans can review them and `/run-pipeline` can later implement them.
