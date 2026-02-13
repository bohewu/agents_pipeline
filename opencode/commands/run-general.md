---
description: Run general-purpose non-coding pipeline
agent: orchestrator-general
---

# Run General Pipeline

## Raw input

```
$ARGUMENTS
```

## Notes

- Input before the first flag token is treated as the main task prompt.
- This pipeline is for non-coding work: planning, analysis, writing, checklists, decision records.
- Supported flags:
  - `--output-dir=<path>`
  - `--resume`
  - `--confirm`
  - `--verbose`

## Examples

```
/run-general Draft a 90-day product roadmap for our team
/run-general Compare 3 onboarding process options
/run-general Create an SOP for incident communication --confirm
/run-general Continue previous planning session --resume
```

## Guarantees

- No direct code implementation in this pipeline.
- Structured staged execution with artifact traceability under `.pipeline-output/general/` by default.
- File outputs are human-friendly by default (plain language, clear structure, actionable next steps).
