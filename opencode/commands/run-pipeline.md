---
description: Run full AI pipeline with optional flags
agent: orchestrator-pipeline
---

# Run Full AI Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-pipeline)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-pipeline MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as pipeline flags.

> Source of truth: detailed flag parsing, conflict handling, and execution semantics live in `opencode/agents/orchestrator-pipeline.md` and `opencode/protocols/PIPELINE_PROTOCOL.md`.

### Supported flags (quick reference)

- `--dry` — stop after `atomizer + router`
- `--no-test` — skip test-runner (reviewer warns)
- `--test-only` — run test-runner + reviewer only
- `--decision-only` — planning/design only, no execution
- `--loose-review` — allow unverified outputs with warning
- `--scout=auto|skip|force`, `--skip-scout`, `--force-scout`
- `--budget=low|medium|high`
- `--max-retry=<int>` — override retry rounds (0-5)
- `--output-dir=<path>`, `--resume`, `--confirm`, `--verbose`

## Examples

```
/run-pipeline Fix login bug --dry
/run-pipeline Implement OAuth2 login --budget=low
/run-pipeline Refactor cache layer --no-test
/run-pipeline Run tests only --test-only
/run-pipeline Quick doc update --skip-scout
/run-pipeline Continue previous run --resume
/run-pipeline Implement feature with review --confirm
```

## Guarantees

- This command does NOT rely on CLI-level flag parsing
- All behavior is enforced at orchestrator-pipeline prompt level
- Compatible with OpenCode official command system
- The global handoff protocol is embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need it externalized, extract that section into your runtime path (e.g. under `~/.config/opencode/agents/protocols`).

## Design Notes

- Main prompt does NOT need to be quoted
- Flags are explicit and discoverable
- No assumptions about shell behavior
- Parsing is deterministic and reviewable

> This design intentionally avoids over-engineering and targets ~95% practical usefulness.
