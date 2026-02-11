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

- `--output-dir=<path>`
  - Override the default artifact output directory
  - Default: `.pipeline-output/`

- `--resume`
  - Resume from the last checkpoint

- `--confirm`
  - Pause after each stage for user review and approval

- `--verbose`
  - Implies `--confirm`
  - Additionally pauses after each individual document task

## Examples

```
/run-init Plan a new SaaS platform
/run-init Plan a new SaaS platform --decision-only
/run-init Plan a new SaaS platform --iterate
/run-init Continue previous run --resume
/run-init Plan with step-by-step review --confirm
```

## Notes

- Use for greenfield projects or major re-architecture.
