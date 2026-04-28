---
description: Run a simple build-style dispatcher that delegates to subagents without pipeline artifacts
agent: orchestrator-simple
---

# Run Simple

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is the main task prompt.
- This command is for build-agent-like work with automatic subagent delegation.
- It does not write `.pipeline-output/`, checkpoints, run manifests, task lists, dispatch plans, or status artifacts.
- Source of truth for behavior: `opencode/agents/orchestrator-simple.md`.
- Supported flags:
  - `--max-parallel=<n>`
  - `--confirm`
  - `--verbose`

## Examples

```
/run-simple Fix the failing profile validation test
/run-simple Update docs and run focused validation --max-parallel=2
/run-simple Review the changed files and run relevant checks --max-parallel=4
```

## Guarantees

- No pipeline artifacts or run manifests are created by the orchestrator.
- Tasks are delegated to existing subagents instead of being implemented directly by the orchestrator.
- Parallel dispatch is capped by `--max-parallel=<n>`.
