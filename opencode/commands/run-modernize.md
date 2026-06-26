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

- `--mode=plan|plan+handoff|phase-exec|full-exec|branch` — planning only (default), cross-project execution handoff, or branch-first repo-local modernization
- `--decision-only` — only source-assessment/target-design/migration-strategy
- `--iterate` — one revision round after synthesis
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`, `--autopilot`
- `--full-auto` — hands-off preset: implies `--autopilot`, disables pauses, defaults modernize depth to `deep`, forwards pipeline `--full-auto` in execution-enabled modes where applicable, and explicit forwarded flags still override preset defaults
- `--target=<path>` — target project path reference
- `--branch=<name>` — exact branch name for `--mode=branch`; if omitted, branch names are generated as `modernize/<slug>-<YYYYMMDD>` with a collision suffix
- `--depth=lite|standard|deep` — control doc verbosity (default: standard)
- `--execute-phase=<phase-id>` — required in `phase-exec`; optional in `branch` to implement one selected roadmap phase in the current repo/branch
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
/run-modernize Modernize legacy auth in place --mode=branch --branch=modernize/auth-cleanup-20260626
/run-modernize Modernize legacy auth in place --mode=branch --execute-phase=P1 --pipeline-flag=--effort=balanced
/run-modernize Continue previous assessment --resume
/run-modernize Assess with review --confirm
```

## Notes

- Use for legacy modernization planning or major platform migrations.
- The modernize pipeline follows a **Source-to-Target model**: project A (source) is analyzed, and docs plan for building project B (target) as a separate project.
- `--mode=branch` follows a **repo-local branch model**: it creates/switches to a modernization branch before writing docs, then keeps planning artifacts and optional implementation in the current repo on that branch.
- Branch mode does not require runtime worktree support. It uses ordinary git branch semantics and should block on a dirty worktree before creating the branch.
- Branch mode is not compatible with `--target`; use `phase-exec` / `full-exec` for source-to-target modernization.
- `--branch=<name>` is exact. If that branch already exists, branch mode stops instead of silently suffixing or reusing it.
- Branch mode only performs same-branch implementation when `--execute-phase=<phase-id>` is provided. Without it, the run stops after planning and renders a branch-local `/run-pipeline` continuation command.
- In execution-enabled modes, `orchestrator-modernize` delegates implementation to `orchestrator-pipeline` via agent handoff. `/run-pipeline` is the human-facing equivalent command.
- Practical default: start `/run-modernize` from the source project, then start later `/run-pipeline` continuation runs from the target project.
- Even when same-session delegated execution is available, the preferred follow-up UX is still a fresh session started from the target project.
- If the target project path does not exist yet, create it manually before running execution modes.
- `--pipeline-flag` is repeatable (instead of a quoted flag string) because `run-modernize` parsing is whitespace-based.
- `--pipeline-flag` is only for `run-pipeline`-compatible flags. `run-modernize` flags such as `--mode`, `--target`, `--depth`, `--iterate`, and `--execute-phase` should not be forwarded.
- `--autopilot` makes the modernize orchestrator non-interactive, and in execution modes it also forwards non-interactive behavior to delegated pipeline runs.
- `--full-auto` is the strongest non-interactive preset for modernization runs and execution-enabled handoffs; it still stops on hard blockers and does not permit scope expansion or leaving resources running.
- Output documents are written under `.pipeline-output/<run_id>/modernize/` by default.
- In execution-enabled modes, delegated pipeline artifacts should be created under the target project's own `.pipeline-output/` even when execution starts in the same session.
- Same-session delegated execution should only proceed when the runtime can honor the target project as the delegated worktree/cwd; otherwise fall back to the saved handoff and target-project `/run-pipeline` command.
- When the target project exists, execution-enabled runs should also mirror the latest modernize handoff into `<target>/.pipeline-output/modernize/` for easier target-side continuation.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- A navigation index (`modernize-index.md`) is generated during synthesis and links the documents produced in that run (5 by default; 3 in `--decision-only`).
