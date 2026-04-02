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
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`, `--autopilot`
- `--full-auto` — hands-off preset: implies `--autopilot`, disables pauses, defaults modernize depth to `deep`, forwards pipeline `--full-auto` in execution-enabled modes where applicable, and explicit forwarded flags still override preset defaults
- `--target=<path>` — target project path reference
- `--depth=lite|standard|deep` — control doc verbosity (default: standard)
- `--execute-phase=<phase-id>` — required in `phase-exec`; roadmap phase identifier to implement in target project
- `--pipeline-flag=<flag>` — optional; repeatable pipeline flag forwarded to orchestrator-pipeline semantics (e.g. `--pipeline-flag=--effort=balanced`)

## Examples

```
/run-modernize Assess legacy .NET monolith
/run-modernize Assess legacy .NET monolith --mode=plan+handoff
/run-modernize Assess legacy .NET monolith --decision-only
/run-modernize Assess legacy .NET monolith --iterate
/run-modernize Assess legacy .NET monolith --target=../my-app-v2
/run-modernize Assess legacy .NET monolith --mode=plan+handoff --target=../my-app-v2
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=1 --target=../my-app-v2 --pipeline-flag=--effort=balanced --pipeline-flag=--confirm
/run-modernize Modernize legacy .NET monolith --mode=full-exec --target=../my-app-v2 --pipeline-flag=--effort=balanced --autopilot
/run-modernize Modernize legacy .NET monolith --mode=full-exec --target=../my-app-v2 --full-auto
/run-modernize Continue previous assessment --resume
/run-modernize Assess with review --confirm
```

## Notes

- Use for legacy modernization planning or major platform migrations.
- The modernize pipeline follows a **Source-to-Target model**: project A (source) is analyzed, and docs plan for building project B (target) as a separate project.
- In execution-enabled modes, `orchestrator-modernize` delegates implementation to `orchestrator-pipeline` via agent handoff. `/run-pipeline` is the human-facing equivalent command.
- Practical default: start `/run-modernize` from the source project, then start later `/run-pipeline` continuation runs from the target project.
- If the target project path does not exist yet, create it manually before running execution modes.
- `--pipeline-flag` is repeatable (instead of a quoted flag string) because `run-modernize` parsing is whitespace-based.
- `--pipeline-flag` is only for `run-pipeline`-compatible flags. `run-modernize` flags such as `--mode`, `--target`, `--depth`, `--iterate`, and `--execute-phase` should not be forwarded.
- `--autopilot` makes the modernize orchestrator non-interactive, and in execution modes it also forwards non-interactive behavior to delegated pipeline runs.
- `--full-auto` is the strongest non-interactive preset for modernization runs and execution-enabled handoffs; it still stops on hard blockers and does not permit scope expansion or leaving resources running.
- Output documents are written under `.pipeline-output/<run_id>/modernize/` by default.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- A navigation index (`modernize-index.md`) is generated during synthesis and links the documents produced in that run (5 by default; 3 in `--decision-only`).
