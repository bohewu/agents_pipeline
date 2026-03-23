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
- `--resume` supports resume-only invocation without a new prompt (reuses checkpoint prompt when valid).

> Source of truth: detailed flag parsing, conflict handling, and execution semantics live in `opencode/agents/orchestrator-pipeline.md` and `opencode/protocols/PIPELINE_PROTOCOL.md`.

### Supported flags (quick reference)

- `--dry` — stop after `atomizer + router`
- `--no-test` — skip test-runner (reviewer warns)
- `--test-only` — run test-runner + reviewer only
- `--decision-only` — planning/design only, no execution
- `--loose-review` — allow unverified outputs with warning
- `--scout=auto|skip|force`, `--skip-scout`, `--force-scout`
- `--effort=low|balanced|high`
- `--max-retry=<int>` — override retry rounds (0-5)
- `--full-auto` — hands-off preset: implies `--autopilot`, disables pauses, defaults to `--effort=high` and `--max-retry=5`, and explicit flags still override those defaults
- `--output-dir=<path>` — override the base artifact output root (fresh runs use a run-specific subdirectory under it; resume searches that root for the newest compatible run unless a specific run dir is targeted), `--resume`, `--confirm`, `--verbose`, `--autopilot`

## Examples

```
/run-pipeline Fix login bug --dry
/run-pipeline Implement OAuth2 login --effort=low
/run-pipeline Refactor cache layer --no-test
/run-pipeline Run tests only --test-only
/run-pipeline Quick doc update --skip-scout
/run-pipeline Implement the approved invite spec. Use .pipeline-output/spec/problem-spec.json and .pipeline-output/spec/dev-spec.json as approved inputs.
/run-pipeline Continue modernization phase P1. Use .pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
/run-pipeline --resume
/run-pipeline Continue previous run --resume
/run-pipeline Implement feature with review --confirm
/run-pipeline Execute migration end-to-end --autopilot
/run-pipeline Execute migration end-to-end --full-auto
```

## Guarantees

- This command does NOT rely on CLI-level flag parsing
- All behavior is enforced at orchestrator-pipeline prompt level
- Compatible with OpenCode official command system
- This command writes real status artifacts under `<output_dir>/status/` for `status-cli`.
- When generated, the human-readable development spec is written to `<output_dir>/pipeline/dev-spec.md` (default: `.pipeline-output/pipeline/dev-spec.md`)
- Heavy resource tasks such as browser automation or temporary local servers are routed conservatively and require teardown evidence before the next heavy batch.
- The global handoff protocol is embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need it externalized, extract that section into your runtime path (e.g. under `~/.config/opencode/agents/protocols`).

## Design Notes

- Main prompt does NOT need to be quoted
- Flags are explicit and discoverable
- No assumptions about shell behavior
- Parsing is deterministic and reviewable

> This design intentionally avoids over-engineering and targets ~95% practical usefulness.
