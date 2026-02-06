---
description: Run Init pipeline for greenfield projects
agent: orchestrator-init
model: openai/gpt-5.3-codex
---

# Run Init Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-init)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-init MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

### Supported flags

- `--decision-only`
  - Produce only: brief, architecture, constraints
  - Skip structure and roadmap docs
  - No revision loop

- `--iterate`
  - Enable one revision round after initial synthesis
  - Orchestrator asks for feedback and applies targeted updates

## Notes

- Use for greenfield projects or major re-architecture.
