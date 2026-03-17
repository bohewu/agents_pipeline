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

## Optional Input: Approved Spec Artifacts

When `orchestrator-pipeline` follows `orchestrator-spec`, the caller MAY provide or reference these artifacts under the shared output root:

- `<output_dir>/spec/problem-spec.json`
- `<output_dir>/spec/dev-spec.json`
- `<output_dir>/spec/dev-spec.md`
- `<output_dir>/spec/plan-outline.json`

Usage rules:

- `problem-spec.json` is the scope boundary.
- `dev-spec.json` is the richer behavior and traceability contract.
- `plan-outline.json` is optional planning context only.
- `dev-spec.md` is human-readable context; when JSON artifacts are available, JSON remains the source of truth.

## Optional Input: Modernize Execution Handoff

When `orchestrator-pipeline` is delegated by `orchestrator-modernize` for phase-scoped implementation, the incoming handoff payload SHOULD be represented as structured JSON and SHOULD conform to:

- `./protocols/schemas/modernize-exec-handoff.schema.json`

The orchestrator prompts remain the execution source of truth, but the schema provides a stable contract for runtime dispatch, validation, and interoperability.

Persisted handoff files may also be used for later manual `/run-pipeline` invocation after a prior `/run-modernize` session. Recommended canonical locations:

- `<output_dir>/modernize/latest-handoff.json`
- `<output_dir>/modernize/phase-<phase_id>.handoff.json`

Reference examples:
- `./protocols/examples/modernize-exec-handoff.valid.json`
- `./protocols/examples/modernize-exec-handoff.invalid.json`

Validation helper (repo script):
- `scripts/validate-modernize-handoff.py <payload.json>`

## Stage Contracts

Stage numbering in this document is a reference model. Orchestrator-specific stage maps may vary; each orchestrator prompt is the execution source of truth.

**Stage 0: Specifier**
Agent: `specifier`
Input: User task prompt
Output: `ProblemSpec` JSON
Schema: `./protocols/schemas/problem-spec.schema.json`

**Optional Stage 0.5: DevSpec Enrichment**
Agent: `specifier` or a future spec-focused stage, optionally paired with `doc-writer` for Markdown rendering
Input: `ProblemSpec`, original user task prompt, and any approved clarifications
Output: `DevSpec` JSON and optional human-readable Markdown artifact
Schema: `./protocols/schemas/dev-spec.schema.json`

Use this optional contract when the workflow needs a human-readable development spec that still remains structured enough for planning, atomic task generation, and test traceability. The `DevSpec` should preserve the original scope while adding stable ids for stories, scenarios, acceptance criteria, and planned verification.

Canonical pipeline paths when this stage is used:

- `<output_dir>/pipeline/dev-spec.json`
- `<output_dir>/pipeline/dev-spec.md`

When `doc-writer` is used to render the Markdown artifact, the emitted artifact block may still include a task-specific filename. The orchestrator should persist that artifact content to the canonical path `<output_dir>/pipeline/dev-spec.md`.

**Stage 1: Planner**
Agent: `planner`
Input: ProblemSpec, optional DevSpec
Output: `PlanOutline` JSON
Schema: `./protocols/schemas/plan-outline.schema.json`

**Stage 2: Repo Scout**
Agent: `repo-scout`
Input: Repo context
Output: `RepoFindings` JSON
Schema: `./protocols/schemas/repo-findings.schema.json`

**Stage 3: Atomizer**
Agent: `atomizer`
Input: PlanOutline, optional RepoFindings, optional DevSpec
Output: `TaskList` JSON
Schema: `./protocols/schemas/task-list.schema.json`

If `DevSpec` is present, each task SHOULD include `trace_ids[]` pointing to relevant `story-*`, `sc-*`, `ac-*`, or `tc-*` ids so execution and review can preserve spec traceability.

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
Input: TaskList, DispatchPlan, executor outputs, ProblemSpec, optional DevSpec, optional test evidence
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
  - `.pipeline-output/spec/` — orchestrator-spec outputs
  - `.pipeline-output/init/` — orchestrator-init docs
  - `.pipeline-output/ci/` — orchestrator-ci docs
  - `.pipeline-output/modernize/` — orchestrator-modernize docs
  - `.pipeline-output/flow/` — orchestrator-flow outputs
  - `.pipeline-output/committee/` — orchestrator-committee outputs
- **Checkpoint file:** `.pipeline-output/checkpoint.json` (see Checkpoint Protocol below)
- **Gitignore requirement:** The target project's `.gitignore` MUST include `.pipeline-output/`. Orchestrators verify this in the pre-flight stage and warn the user if it is missing.

### Canonical Filenames For `orchestrator-pipeline`

- `.pipeline-output/pipeline/problem-spec.json`
- `.pipeline-output/pipeline/dev-spec.json` (optional)
- `.pipeline-output/pipeline/dev-spec.md` (optional human-readable spec)
- `.pipeline-output/pipeline/plan-outline.json`
- `.pipeline-output/pipeline/repo-findings.json`
- `.pipeline-output/pipeline/task-list.json`
- `.pipeline-output/pipeline/dispatch-plan.json`
- `.pipeline-output/pipeline/test-report.json`
- `.pipeline-output/pipeline/review-report.json`
- `.pipeline-output/pipeline/context-pack.json`

### Canonical Filenames For `orchestrator-spec`

- `.pipeline-output/spec/problem-spec.json`
- `.pipeline-output/spec/dev-spec.json`
- `.pipeline-output/spec/dev-spec.md`
- `.pipeline-output/spec/plan-outline.json`

## Artifact Rules

- If a task primary_output is `design`, `plan`, `spec`, `checklist`, `notes`, or `analysis`, the executor MUST emit an artifact block.
- If a workflow emits `DevSpec`, prefer paired artifacts such as `dev-spec.json` and `dev-spec.md` under the pipeline output root so both machines and humans can consume the same contract.
- Artifact format is fixed:

```text
=== ARTIFACT: <filename> ===
<content>
=== END ARTIFACT ===
```

- Filename policy:
  - If the orchestrator defines canonical filenames (for example init/ci/modernize docs), use those fixed names.
  - If an executor artifact block uses a task-specific filename but the orchestrator defines a canonical output path, the orchestrator SHOULD persist the artifact content to that canonical path.
  - Otherwise, include `task_id` in the filename.

## Protocol Versioning

Each JSON output MAY include `protocol_version`. When present, it MUST follow `major.minor` format, for example `1.0`.

## Checkpoint Protocol

Pipeline runs support interrupt/resume via checkpoint files.

- **Session boundary:** Chat/session state is not the resume mechanism. A new session does not automatically recover in-memory progress from an earlier session.
- **Persistence boundary:** Cross-session continuation relies on files under `<output_dir>/`, especially `<output_dir>/checkpoint.json`.

- **Location:** `<output_dir>/checkpoint.json` (default: `.pipeline-output/checkpoint.json`)
- **Schema:** `./protocols/schemas/checkpoint.schema.json`
- **Write timing:** After each stage completes successfully, the orchestrator MUST update the checkpoint file with the stage output.
- **Resume flow:**
   1. User passes `--resume` flag
      - `--resume` may be used with a new prompt or as resume-only invocation without a new prompt.
   2. Orchestrator loads `<output_dir>/checkpoint.json`
   3. Validates that the checkpoint's `orchestrator` field matches the current orchestrator
      - If resume-only invocation is used and checkpoint is valid, orchestrator reuses `checkpoint.user_prompt` as the run prompt.
   4. Displays a summary of completed stages and the next stage to run
   5. Asks user to confirm before resuming
   6. Skips completed stages and continues from the next incomplete stage
- **Missing/invalid checkpoint:** If `--resume` is set but checkpoint is missing or invalid, warn and start fresh; if no new prompt was provided (resume-only invocation), require a new prompt for the fresh run.
- **No implicit resume:** If `--resume` is not provided, the orchestrator starts a fresh run even when prior artifacts remain on disk.
- **Artifacts vs resume:** Persisted specs, handoff files, init docs, or other protocol-defined artifacts may still be read as explicit inputs or optional context, but that does not count as checkpoint resume.
- **Completion:** On successful pipeline completion, the checkpoint file MAY be retained for audit or deleted. Default: retain.

## Confirm / Verbose Protocol

Pipeline runs support step-by-step user review via `--confirm` and `--verbose` flags.

- **Default mode** (no `--confirm` / `--verbose`): no step pauses; orchestrators may return a final concise summary only.

- **`--autopilot`** (default: `false`): Run non-interactively by default.
  - Disable stage/task pauses even if `--confirm` or `--verbose` are also provided.
  - For low-risk ambiguity, choose safe defaults and continue.
  - If a task hits a non-hard blocker, continue other runnable tasks first and attempt one bounded blocker-recovery pass before surfacing the blocker.
  - Stop only on hard blockers: destructive/irreversible actions, security or billing impact, or missing required credentials/access.

- **`--full-auto`** (default: `false`): Stronger hands-off execution preset.
  - Implies `--autopilot`.
  - Defaults to `--effort=high` unless `--effort=*` is explicitly provided.
  - Defaults to `--max-retry=5` unless `--max-retry=*` is explicitly provided.
  - Prefer the strongest safe in-scope blocker recovery path before surfacing a non-hard blocker.

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
  - `--full-auto` implies `--autopilot`
  - `--autopilot` wins over `--confirm` / `--verbose` and disables interactive pauses
  - `--dry --confirm` -> `--dry` wins (stops after atomizer+router)
  - `--resume --confirm` -> resume from checkpoint, then apply confirm mode going forward

## Resource Control Protocol

Pipeline runs may launch local child processes, test harnesses, servers, or browsers. Resource cleanup is part of task completion, not an optional best effort.

- **Resource classes:**
  - `light`: analysis, docs, or edits with no long-lived child process
  - `process`: bounded build/test/script command that may spawn child processes but should exit on its own
  - `server`: local app/dev server or listener that must later be shut down
  - `browser`: Playwright or other browser automation, whether headless or headed
- **Routing defaults:**
  - Router MUST annotate each dispatch batch with `resource_class`, `max_parallelism`, `teardown_required`, and optional `timeout_hint_minutes`.
  - `browser` and `server` batches default to `max_parallelism = 1`.
  - `process` batches SHOULD stay conservative, usually `max_parallelism = 1` and at most `2` for clearly independent bounded commands.
  - `process` batches set `teardown_required = true` only when the task starts helper services, temp browsers, watchers, or other resources that need explicit shutdown; otherwise `false` is acceptable.
  - `light` batches may use normal parallelism.
- **Orchestrator responsibilities:**
  - Preserve batch resource metadata in executor handoffs.
  - Do not co-schedule more than one `browser` or `server` batch at a time unless the runtime explicitly proves isolated cleanup and budget enforcement.
  - After any batch with `teardown_required = true`, require executor evidence that cleanup completed before dispatching the next heavy batch.
- **Executor responsibilities:**
  - Track every spawned process tree, temp profile directory, local port, and browser/page/context created by the task.
  - Use bounded execution plus explicit teardown, preferably with `try/finally` or equivalent cleanup guards.
  - Do not leave background jobs, watch mode, dev servers, or browser instances running after the task completes.
  - If cleanup fails or cannot be verified, do not claim `done`; return `partial` or `blocked` with evidence and the remaining risk.
- **Validation responsibilities:**
  - Test runners should avoid watch mode by default and clean up temporary validation resources.
  - Reviewers should treat missing cleanup evidence for any batch with `teardown_required = true` as incomplete execution evidence.
  - Missing cleanup evidence for `server` or `browser` work is always a failure, even if metadata was omitted incorrectly.

## Validation Gates

All gates and failure conditions are defined in `./protocols/VALIDATION.md`.
