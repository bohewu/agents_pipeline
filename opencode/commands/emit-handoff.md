---
description: Emit run-local handoff artifacts for a fresh session
agent: handoff-writer
---

# Emit Handoff

## Raw input

```
$ARGUMENTS
```

## Notes

- Default outputs:
  - `<run_output_dir>/<pipeline-or-flow>/handoff-pack.json`
  - `<run_output_dir>/<pipeline-or-flow>/handoff-prompt.md`
- The handoff should capture completed work, pending work, blockers, key artifact paths, and the recommended next command.
- Include whether `/kanban sync` should be run before continuing.
- Only publish a root-tracked handoff copy when explicitly requested in the prompt.

## Examples

```text
/emit-handoff Use the latest pipeline run in .pipeline-output
/emit-handoff Create a handoff from .pipeline-output/run-20260403-101500 and publish a root copy too
```
