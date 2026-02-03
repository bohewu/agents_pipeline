---
description: Run full AI pipeline with optional flags
agent: orchestrator
model: openai/gpt-5.2-codex
---

# Run Full AI Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as pipeline flags.

### Supported flags

- `--dry`
  - Stop after `atomizer + router`
  - Output TaskList and DispatchPlan only

- `--no-test`
  - Skip test-runner stage
  - Reviewer must warn about missing verification

- `--test-only`
  - Only run test-runner + reviewer

- `--budget=low|medium|high`
  - low: Prefer Gemini Flash / Pro, minimize GPT usage
  - medium: Default routing
  - high: Allow GPT-5.2-codex more freely

## Examples

```
/run-pipeline Fix login bug --dry
/run-pipeline Implement OAuth2 login --budget=low
/run-pipeline Refactor cache layer --no-test
/run-pipeline Run tests only --test-only
```

## Guarantees

- This command does NOT rely on CLI-level flag parsing
- All behavior is enforced at orchestrator prompt level
- Compatible with OpenCode official command system
- The global handoff protocol is embedded in `opencode/agents/orchestrator.md` for portability. If you need it externalized, extract that section into your runtime path (e.g. under `~/.config/opencode/agents/protocols`).

## Design Notes

- Main prompt does NOT need to be quoted
- Flags are explicit and discoverable
- No assumptions about shell behavior
- Parsing is deterministic and reviewable

> This design intentionally avoids over-engineering and targets ~95% practical usefulness.
