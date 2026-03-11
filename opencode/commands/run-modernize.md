---
description: Run modernize pipeline for legacy systems (planning + optional execution handoff)
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

- `--mode=plan|plan+handoff|phase-exec|full-exec` — planning only (default) or continue into execution via agent handoff
- `--decision-only` — only source-assessment/target-design/migration-strategy
- `--iterate` — one revision round after synthesis
- `--target=<path>` — target project path reference (auto-created only when paired with `--init-target`)
- `--init-target` — create/bootstrap the target project path and init docs before implementation handoff when needed
- `--execute-phase=<phase-id>` — required in `phase-exec`; roadmap phase identifier to implement in target project
- `--pipeline-flag=<flag>` — optional; repeatable pipeline flag forwarded to orchestrator-pipeline semantics (e.g. `--pipeline-flag=--effort=balanced`)
- `--depth=lite|standard|deep` — control doc verbosity (default: standard)
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`, `--autopilot`

## Examples

```
/run-modernize Assess legacy .NET monolith
/run-modernize Assess legacy .NET monolith --mode=plan+handoff
/run-modernize Assess legacy .NET monolith --decision-only
/run-modernize Assess legacy .NET monolith --iterate
/run-modernize Assess legacy .NET monolith --target=../my-app-v2
/run-modernize Assess legacy .NET monolith --mode=plan+handoff --target=../my-app-v2 --init-target
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=1 --target=../my-app-v2 --pipeline-flag=--effort=balanced --pipeline-flag=--confirm
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=1 --target=../my-app-v2 --init-target --pipeline-flag=--effort=balanced
/run-modernize Modernize legacy .NET monolith --mode=full-exec --target=../my-app-v2 --pipeline-flag=--effort=balanced --autopilot
/run-modernize Continue previous assessment --resume
/run-modernize Assess with review --confirm
```

## Notes

- Use for legacy modernization planning or major platform migrations.
- The modernize pipeline follows a **Source-to-Target model**: project A (source) is analyzed, and docs plan for building project B (target) as a separate project.
- In execution-enabled modes, `orchestrator-modernize` delegates implementation to `orchestrator-pipeline` via agent handoff. `/run-pipeline` is the human-facing equivalent command.
- Practical default: start `/run-modernize` from the source project, then start later `/run-pipeline` continuation runs from the target project.
- If the target project path does not exist yet, rerun with `--init-target` for a one-shot target bootstrap before execution handoff.
- `--pipeline-flag` is repeatable (instead of a quoted flag string) because `run-modernize` parsing is whitespace-based.
- `--pipeline-flag` is only for `run-pipeline`-compatible flags. `run-modernize` flags such as `--mode`, `--target`, `--depth`, `--iterate`, and `--execute-phase` should not be forwarded.
- `--autopilot` makes the modernize orchestrator non-interactive, and in execution modes it also forwards non-interactive behavior to delegated pipeline runs.
- Output documents are written to `.pipeline-output/modernize/` by default.
- A navigation index (`modernize-index.md`) is generated during synthesis and links the documents produced in that run (5 by default; 3 in `--decision-only`).
