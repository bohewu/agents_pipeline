# Modernize -> Pipeline Handoff

This SOP explains how to continue from `/run-modernize` outputs into `/run-pipeline`, including the case where the original session has already ended.

## Two Common Paths

### Path A: Immediate delegated execution

Use `/run-modernize` with an execution mode:

- `--mode=phase-exec` -> execute one selected roadmap phase
- `--mode=full-exec` -> execute all roadmap phases sequentially

If you also pass `--autopilot`, the orchestrator should run non-interactively and continue phase-by-phase until all phases complete or a hard blocker stops execution.

If you pass `--full-auto`, it should also imply `--autopilot`, disable interactive pauses, prefer deep planning output, forward stronger delegated pipeline execution defaults where applicable, and attempt the strongest safe bounded in-scope non-hard-blocker recovery before surfacing a stop condition.

If the target project directory does not exist yet, create it manually before running execution modes.

### Path B: Later manual execution in a new session

You can close the session after `/run-modernize`, then later run `/run-pipeline` manually.

This works because modernize execution modes should persist machine-readable handoff files under the same output root.

## Expected Modernize Artifacts

Human-facing planning docs:

- `.pipeline-output/modernize/modernize-source-assessment.md`
- `.pipeline-output/modernize/modernize-target-design.md`
- `.pipeline-output/modernize/modernize-migration-strategy.md`
- `.pipeline-output/modernize/modernize-migration-roadmap.md`
- `.pipeline-output/modernize/modernize-migration-risks.md`
- `.pipeline-output/modernize/modernize-index.md`

Internal handoff files for execution-enabled runs:

- `.pipeline-output/modernize/latest-handoff.json`
- `.pipeline-output/modernize/phase-<phase_id>.handoff.json`

If you used `--output-dir=<path>`, replace `.pipeline-output/` with that path.

## Source vs Target Ownership

- `run-modernize` starts from the source project because it analyzes the legacy system and writes migration planning docs there.
- The source project owns `.pipeline-output/modernize/`.
- Real implementation should start from the target project.
- The target project should own `.pipeline-output/pipeline/` once `/run-pipeline` is executing code, tests, and reviews.
- After the first execution handoff exists, treat the target project as the default starting point for later implementation sessions.

## If The Target Project Does Not Exist Yet

- `run-modernize` should stop before implementation handoff.
- Create the target directory manually, then run `/run-pipeline` from that target project.

## What The Handoff Files Are For

- `latest-handoff.json` -> the most recently prepared execution contract
- `phase-<phase_id>.handoff.json` -> a stable, phase-specific execution contract you can reuse later

These files should conform to `opencode/protocols/schemas/modernize-exec-handoff.schema.json`.

## Recommended Commands

### Run all phases non-interactively

```text
/run-modernize Modernize legacy .NET monolith --mode=full-exec --target=../my-app-v2 --pipeline-flag=--effort=balanced --autopilot
```

Semantics:

- `--autopilot` disables modernize stage pauses
- delegated `/run-pipeline` phases also run non-interactively
- overall status is only `done` when all resolved phases complete

### Run all phases with the strongest preset

```text
/run-modernize Modernize legacy .NET monolith --mode=full-exec --target=../my-app-v2 --full-auto
```

Semantics:

- modernize planning runs non-interactively
- delegated pipeline phases inherit `--full-auto`
- execution prefers deeper analysis, more retries, and stronger safe bounded in-scope blocker recovery
- hard blockers still stop execution

## Copyable Command Patterns

### Target missing, create it manually first

```text
mkdir ../my-app-v2
```

Then, from the target project:

```text
/run-pipeline Implement modernization roadmap phase P1 in target project B. Use ../source-repo/.pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
```

### Target already exists, continue later from target project

```text
/run-pipeline Continue the approved modernization execution. Use ../source-repo/.pipeline-output/modernize/latest-handoff.json as the execution contract.
```

### Run one approved phase later in a new session

Start a fresh session in the target project and run:

```text
/run-pipeline Implement modernization roadmap phase P1 in target project B using the approved handoff contract. Use .pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
```

### Run the latest prepared handoff later in a new session

```text
/run-pipeline Continue the approved modernization execution. Use .pipeline-output/modernize/latest-handoff.json as the execution contract.
```

If the handoff file lives in the source repository instead of the target repository, reference it explicitly in the prompt, but still start the execution session from the target project.

## How `/run-pipeline` Should Treat These Inputs

- Use the handoff JSON as the execution source of truth.
- Respect `phase_execution_contract` boundaries.
- Use the referenced modernize docs in `context_paths` as constraints.
- Do not expand beyond the selected phase.
- Treat the target project as the working repo for edits, tests, checkpoints, and review artifacts.

## Completion Rules

- `phase-exec` is complete when the selected phase finishes successfully.
- `full-exec` is complete only when every resolved roadmap phase finishes successfully.
- If execution stops after M0 or M1 while M2 remains, report `partial` or `blocked`, not `done`.

## When To Prefer Manual Later Execution

Use the later manual `/run-pipeline` path when:

- you want to stop after planning and review the roadmap first
- the original session ended
- agent-to-agent delegation is unavailable in your runtime
- you want to rerun a single phase with different pipeline flags
