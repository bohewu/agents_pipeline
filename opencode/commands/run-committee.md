---
description: Run decision committee (experts + KISS soft-veto + judge)
agent: orchestrator-committee
model: openai/gpt-5.3-codex
---

# Run Committee

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-committee)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-committee MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

### Supported flags

- `--budget=low|medium|high`
  - Used as an explicit evaluation criterion in the final decision
  - low: bias toward the smallest viable, reversible option
  - medium: balanced tradeoffs
  - high: allow more upfront engineering when it materially reduces risk

- `--scout=auto|skip|force`
  - auto: run repo-scout if repo exists or the prompt references code/implementation
  - skip: do not run repo-scout
  - force: run repo-scout even if the prompt is abstract

- `--skip-scout`
  - Alias for `--scout=skip`

- `--force-scout`
  - Alias for `--scout=force`

- `--output-dir=<path>`
  - Override the default artifact output directory
  - Default: `.pipeline-output/`

- `--resume`
  - Resume from the last checkpoint

- `--confirm`
  - Pause after each stage for user review and approval

- `--verbose`
  - Implies `--confirm`
  - Additionally pauses after each individual expert memo

## Examples

```text
/run-committee Decide between REST vs GraphQL for our internal API --budget=medium
/run-committee Should we split the monolith into services now? --budget=low
/run-committee Pick an auth approach for this repo --budget=medium --scout=force
/run-committee Decide logging/telemetry standard --budget=high --skip-scout
/run-committee Choose database migration strategy --budget=medium --scout=auto
/run-committee Continue previous decision --resume
/run-committee Decide with step-by-step review --budget=medium --confirm
```

