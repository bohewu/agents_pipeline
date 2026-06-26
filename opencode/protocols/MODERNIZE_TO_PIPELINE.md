# Modernize -> Pipeline Handoff

This SOP explains how to continue from `/run-modernize` outputs into `/run-pipeline`, including the case where the original session has already ended.

## Two Common Paths

### Path A: Immediate delegated execution

Use `/run-modernize` with an execution mode:

- `--mode=phase-exec` -> execute one selected roadmap phase
- `--mode=full-exec` -> execute all roadmap phases sequentially

If you also pass `--autopilot`, the orchestrator should run non-interactively and continue phase-by-phase until all phases complete or a hard blocker stops execution.

If you pass `--full-auto`, it should also imply `--autopilot`, disable interactive pauses, prefer deep planning output, forward stronger delegated pipeline execution defaults where applicable, and attempt the strongest safe bounded in-scope non-hard-blocker recovery before surfacing a stop condition.

Immediate delegated execution works best when the runtime can honor the target repo as the delegated worktree/cwd. If it cannot, fall back to Path B instead of letting implementation continue from the source-project worktree.

If the target project directory does not exist yet, create it manually before running execution modes.

### Path B: Branch-first repo-local modernization

Use `/run-modernize` with branch mode when the modernization should happen in the current repository rather than in a separate target project:

- `--mode=branch` -> create/switch to a modernization branch before planning docs are written
- `--branch=<name>` -> optional exact branch name; if it already exists, stop instead of suffixing or reusing it
- `--execute-phase=<phase-id>` -> optional same-branch implementation of one selected roadmap phase

Branch mode is designed for runtimes that can create ordinary git branches but may not support separate worktrees. It must create the branch before writing modernize docs, checkpoints, status files, handoff files, or code changes.

If no `--execute-phase` is provided, branch mode stops after planning and renders a branch-local `/run-pipeline` continuation command. It should not guess which roadmap phase to implement.

Branch mode should stop before branch creation if the current worktree is dirty. The orchestrator should not stash, commit, discard, or otherwise hide pre-existing changes automatically.

### Path C: Later manual execution in a new session

You can close the session after `/run-modernize`, then later run `/run-pipeline` manually.

This works because modernize execution modes should persist machine-readable handoff files under the same output root.

This remains the recommended human handoff path even when same-session delegated execution is available.

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
- In same-session delegated execution, target-local `.pipeline-output/` should be created immediately; do not wait for a later manual session before switching artifact ownership.
- Execution-enabled modernize runs should mirror `latest-handoff.json` and `phase-<phase_id>.handoff.json` into the target project's `.pipeline-output/modernize/` when the target directory exists.
- After the first execution handoff exists, treat the target project as the default starting point for later implementation sessions.

## Branch Mode Ownership

- `run-modernize --mode=branch` starts and stays in the current project.
- The current project owns `.pipeline-output/modernize/` and delegated `.pipeline-output/pipeline/`.
- The branch must be created before any modernize artifact is written.
- Handoff files stay in the current repo; do not mirror them to a separate target project.
- Later `/run-pipeline` continuation should run from the same repo after switching to the modernization branch.
- Branch mode isolates tracked changes in Git history. Ignored or untracked files such as `.pipeline-output/` may remain on disk after switching branches.

## If The Target Project Does Not Exist Yet

- `run-modernize` should stop before implementation handoff.
- Create the target directory manually, then run `/run-pipeline` from that target project.

## What The Handoff Files Are For

- `latest-handoff.json` -> the most recently prepared execution contract
- `phase-<phase_id>.handoff.json` -> a stable, phase-specific execution contract you can reuse later
- Source-side copies preserve the planning trail; target-local mirrored copies optimize continuation from the implementation repo.

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

### Plan on a new branch, then implement one phase

```text
/run-modernize Modernize legacy auth in place --mode=branch --execute-phase=P1 --pipeline-flag=--effort=balanced
```

Semantics:

- creates a branch such as `modernize/modernize-legacy-auth-in-place-20260626`
- writes modernize docs on that branch
- delegates one same-repo `/run-pipeline`-equivalent execution for phase `P1`
- keeps code changes, checkpoints, and pipeline artifacts in the current repo on that branch

### Plan on a named new branch without immediate implementation

```text
/run-modernize Modernize legacy auth in place --mode=branch --branch=modernize/auth-cleanup-20260626
```

Semantics:

- creates and switches to the exact branch before planning
- stops if that exact branch already exists
- writes branch-local modernize docs
- stops with a branch-local `/run-pipeline` continuation command because no `--execute-phase` was provided

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

### Continue branch-mode work later

From the same repo:

```text
git switch <modernize-branch>
/run-pipeline Implement modernization roadmap phase P1 using .pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
```

## How `/run-pipeline` Should Treat These Inputs

- Use the handoff JSON as the execution source of truth.
- Respect `phase_execution_contract` boundaries.
- Use the referenced modernize docs in `context_paths` as constraints.
- Do not expand beyond the selected phase.
- Treat the target project as the working repo for edits, tests, checkpoints, and review artifacts.
- For branch-mode handoffs, treat the current repo on the modernization branch as the working repo for edits, tests, checkpoints, and review artifacts.
- Default delegated `output_root` to the target project's `.pipeline-output/` when no explicit pipeline `--output-dir=*` override is provided.
- For branch-mode handoffs, default delegated `output_root` to the current repo's `.pipeline-output/`.
- If a delegated pipeline `--output-dir=*` override is relative, resolve it from the target project, not the source project.
- Preserve `working_project_dir` in every OpenCode `status_runtime_event` payload so the status-runtime plugin resolves relative status/checkpoint paths under the target project as well.
- Worktree-aware runtimes should also honor `working_project_dir` as the actual delegated run worktree/cwd. If they cannot, they should stop and surface the target-project handoff command instead of attempting implementation in the source repo.

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
