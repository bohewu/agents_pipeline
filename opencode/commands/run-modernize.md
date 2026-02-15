---
description: Run modernize pipeline for legacy systems (docs-first)
agent: orchestrator-modernize
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

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-modernize.md`.

### Supported flags (quick reference)

- `--decision-only` — only source-assessment/target-design/migration-strategy
- `--iterate` — one revision round after synthesis
- `--target=<path>` — target project path reference (not auto-created)
- `--depth=lite|standard|deep` — control doc verbosity (default: standard)
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`

## Examples

```
/run-modernize Assess legacy .NET monolith
/run-modernize Assess legacy .NET monolith --decision-only
/run-modernize Assess legacy .NET monolith --iterate
/run-modernize Assess legacy .NET monolith --target=../my-app-v2
/run-modernize Continue previous assessment --resume
/run-modernize Assess with review --confirm
```

## Notes

- Use for legacy modernization planning or major platform migrations.
- The modernize pipeline follows a **Source-to-Target model**: project A (source) is analyzed, and docs plan for building project B (target) as a separate project.
- Output documents are written to `.pipeline-output/modernize/` by default.
- A navigation index (`modernize-index.md`) is generated during synthesis and links the documents produced in that run (5 by default; 3 in `--decision-only`).
