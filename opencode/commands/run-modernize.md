---
description: Run modernize pipeline for legacy systems (docs-first)
agent: orchestrator-modernize
model: openai/gpt-5.2-codex
---

# Run Modernize Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-modernize)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-modernize MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

### Supported flags

- `--decision-only`
  - Produce only: current-state, target-vision, strategy
  - Skip roadmap and risks docs
  - No revision loop

- `--iterate`
  - Enable one revision round after initial synthesis

## Notes

- Use for legacy modernization planning or major platform migrations.
