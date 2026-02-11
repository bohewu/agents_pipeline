---
description: Run modernize pipeline for legacy systems (docs-first)
agent: orchestrator-modernize
model: openai/gpt-5.3-codex
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
  - Produce only: source-assessment, target-design, migration-strategy
  - Skip roadmap and risks docs
  - No revision loop

- `--iterate`
  - Enable one revision round after initial synthesis

- `--target=<path>`
  - Specify the target project directory for the modernized system
  - Default: `../<source-project-dirname>-modernize/`
  - The pipeline does NOT create this directory; it references it in documentation

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
- A navigation index (`modernize-index.md`) is generated during synthesis linking all 5 documents.
