---
description: Run post-hoc analysis pipeline (correctness, complexity, robustness, numerics)
agent: orchestrator-analysis
---

# Run Analysis

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-analysis)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-analysis MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-analysis.md`.

### Supported flags (quick reference)

- `--focus=<path>` — scope analysis to specific files/directories
- `--scout=auto|skip|force`, `--skip-scout`, `--force-scout`
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`

## Notes

- Expert roster is dynamically selected: core experts (correctness, complexity, robustness) always run; numerics is dispatched conditionally based on code characteristics.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- Analysis findings include a handoff section for critical/high severity issues, suggesting fix tasks for orchestrator-pipeline or orchestrator-flow.

## Examples

```text
/run-analysis src/parser/ --focus=src/parser/tokenizer.ts
/run-analysis Analyze the backtesting engine for correctness and numerical stability
/run-analysis src/algorithm/ --scout=skip
/run-analysis Review the sorting implementation for complexity issues --focus=src/sort.ts
/run-analysis Analyze the trading strategy module --confirm
/run-analysis Continue previous analysis --resume
/run-analysis Deep review with step-by-step output --verbose
```
