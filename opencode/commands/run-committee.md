---
description: Run decision committee (experts + KISS soft-veto + judge)
agent: orchestrator-committee
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

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-committee.md`.

### Supported flags (quick reference)

- `--budget=low|medium|high` — explicit decision criterion; defaults to `medium` when omitted
- `--scout=auto|skip|force`, `--skip-scout`, `--force-scout`
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`

## Notes

- This command writes real status artifacts under `<output_dir>/status/` for `status-cli`.

## Examples

```text
/run-committee Decide between rollout options for feature flags
/run-committee Decide between REST vs GraphQL for our internal API --budget=medium
/run-committee Should we split the monolith into services now? --budget=low
/run-committee Pick an auth approach for this repo --budget=medium --scout=force
/run-committee Decide logging/telemetry standard --budget=high --skip-scout
/run-committee Choose database migration strategy --budget=medium --scout=auto
/run-committee Continue previous decision --resume
/run-committee Decide with step-by-step review --budget=medium --confirm
```
