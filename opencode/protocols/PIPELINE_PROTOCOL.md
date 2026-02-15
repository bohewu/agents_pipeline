# Pipeline Protocol (v1.0)

This document defines the canonical inputs, outputs, and rules for the multi-agent pipeline.
All JSON outputs MUST conform to the schemas in `./protocols/schemas/` (relative to the config directory).

## Global Rules

- Handoff content is a formal contract. Do not infer missing requirements.
- Scope must not expand beyond the ProblemSpec and Acceptance Criteria.
- Evidence is required for implementation tasks unless explicitly skipped by flags.
- TaskList is the single source of truth for execution scope.
- Executors must not perform work outside their assigned task.

## Optional Input: Todo Ledger

If `todo-ledger.json` exists in the project root, the orchestrator should surface it
before planning so the user can decide to include, defer, or mark items obsolete.
The ledger must conform to `./protocols/schemas/todo-ledger.schema.json`.

## Stage Contracts

Stage numbering in this document is a reference model. Orchestrator-specific stage maps may vary; each orchestrator prompt is the execution source of truth.

**Stage 0: Specifier**
Agent: `specifier`
Input: User task prompt
Output: `ProblemSpec` JSON
Schema: `./protocols/schemas/problem-spec.schema.json`

**Stage 1: Planner**
Agent: `planner`
Input: ProblemSpec
Output: `PlanOutline` JSON
Schema: `./protocols/schemas/plan-outline.schema.json`

**Stage 2: Repo Scout**
Agent: `repo-scout`
Input: Repo context
Output: `RepoFindings` JSON
Schema: `./protocols/schemas/repo-findings.schema.json`

**Stage 3: Atomizer**
Agent: `atomizer`
Input: PlanOutline, optional RepoFindings
Output: `TaskList` JSON
Schema: `./protocols/schemas/task-list.schema.json`

**Stage 4: Router**
Agent: `router`
Input: TaskList
Output: `DispatchPlan` JSON
Schema: `./protocols/schemas/dispatch-plan.schema.json`

**Stage 5: Executors**
Agent: `executor-*`
Input: Atomic task
Output: Task result JSON plus required artifact blocks when applicable

**Stage 6: Reviewer**
Agent: `reviewer`
Input: TaskList, executor outputs, optional test evidence
Output: `ReviewReport` JSON
Schema: `./protocols/schemas/review-report.schema.json`

**Stage 7: Test Runner (Optional Validation Stage)**
Agent: `test-runner`
Input: Task scope
Output: `TestReport` JSON
Schema: `./protocols/schemas/test-report.schema.json`

**Stage 8: Compressor**
Agent: `compressor`
Input: Repo findings and outcomes
Output: `ContextPack` JSON
Schema: `./protocols/schemas/context-pack.schema.json`

**Stage 9: Summarizer**
Agent: `summarizer`
Input: Final outcomes and reviewer status
Output: User-facing summary text

## Artifact Output Convention

All pipeline artifacts MUST be written under a single root directory to keep the target project clean and prevent accidental git commits.

- **Default artifact root:** `.pipeline-output/`
- **Override flag:** `--output-dir=<path>` (available on all orchestrators)
- **Sub-directories by pipeline:**
  - `.pipeline-output/pipeline/` — orchestrator-pipeline intermediates
  - `.pipeline-output/init/` — orchestrator-init docs
  - `.pipeline-output/ci/` — orchestrator-ci docs
  - `.pipeline-output/modernize/` — orchestrator-modernize docs
  - `.pipeline-output/flow/` — orchestrator-flow outputs
  - `.pipeline-output/committee/` — orchestrator-committee outputs
- **Checkpoint file:** `.pipeline-output/checkpoint.json` (see Checkpoint Protocol below)
- **Gitignore requirement:** The target project's `.gitignore` MUST include `.pipeline-output/`. Orchestrators verify this in the pre-flight stage and warn the user if it is missing.

## Artifact Rules

- If a task primary_output is `design`, `plan`, `spec`, `checklist`, `notes`, or `analysis`, the executor MUST emit an artifact block.
- Artifact format is fixed:

```text
=== ARTIFACT: <filename> ===
<content>
=== END ARTIFACT ===
```

- Filename policy:
  - If the orchestrator defines canonical filenames (for example init/ci/modernize docs), use those fixed names.
  - Otherwise, include `task_id` in the filename.

## Protocol Versioning

Each JSON output MAY include `protocol_version`. When present, it MUST follow `major.minor` format, for example `1.0`.

## Checkpoint Protocol

Pipeline runs support interrupt/resume via checkpoint files.

- **Location:** `<output_dir>/checkpoint.json` (default: `.pipeline-output/checkpoint.json`)
- **Schema:** `./protocols/schemas/checkpoint.schema.json`
- **Write timing:** After each stage completes successfully, the orchestrator MUST update the checkpoint file with the stage output.
- **Resume flow:**
  1. User passes `--resume` flag
  2. Orchestrator loads `<output_dir>/checkpoint.json`
  3. Validates that the checkpoint's `orchestrator` field matches the current orchestrator
  4. Displays a summary of completed stages and the next stage to run
  5. Asks user to confirm before resuming
  6. Skips completed stages and continues from the next incomplete stage
- **Missing checkpoint:** If `--resume` is set but no checkpoint exists, warn the user and start fresh.
- **Completion:** On successful pipeline completion, the checkpoint file MAY be retained for audit or deleted. Default: retain.

## Confirm / Verbose Protocol

Pipeline runs support step-by-step user review via `--confirm` and `--verbose` flags.

- **Default mode** (no `--confirm` / `--verbose`): no step pauses; orchestrators may return a final concise summary only.

- **`--confirm`** (default: `false`): Pause after each **stage** for user review.
  - Prompt format: `[Stage N: <name>] Complete. Proceed? [yes / feedback / abort]`
  - `yes` -> continue to next stage
  - `feedback` -> user provides text; re-run the current stage with amended instructions
  - `abort` -> write checkpoint and stop; user can resume later with `--resume`

- **`--verbose`** (default: `false`): Implies `--confirm`. Additionally pauses after each **individual task** within execution stages.
  - Prompt format: `[Task <id>: <summary>] Complete. Continue? [yes / skip-remaining / abort]`
  - `skip-remaining` -> mark remaining tasks as SKIPPED, proceed to next stage
  - Intended for close supervision/debugging; this mode increases interaction length.

- **Flag interactions:**
  - `--verbose` automatically enables `--confirm`
  - `--dry --confirm` -> `--dry` wins (stops after atomizer+router)
  - `--resume --confirm` -> resume from checkpoint, then apply confirm mode going forward

## Validation Gates

All gates and failure conditions are defined in `./protocols/VALIDATION.md`.
