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

When `orchestrator-pipeline` follows `orchestrator-spec`, the caller MAY provide or reference these artifacts from the selected prior run directory:

- `<run_output_dir>/spec/problem-spec.json`
- `<run_output_dir>/spec/dev-spec.json`
- `<run_output_dir>/spec/dev-spec.md`
- `<run_output_dir>/spec/plan-outline.json`

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

- `<run_output_dir>/modernize/latest-handoff.json`
- `<run_output_dir>/modernize/phase-<phase_id>.handoff.json`

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

- `<run_output_dir>/pipeline/dev-spec.json`
- `<run_output_dir>/pipeline/dev-spec.md`

When `doc-writer` is used to render the Markdown artifact, the emitted artifact block may still include a task-specific filename. The orchestrator should persist that artifact content to the canonical path `<run_output_dir>/pipeline/dev-spec.md`.

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

All pipeline artifacts MUST live under a single configurable base output root so the target project stays clean and accidental git commits are avoided.

- **Default base output root:** `.pipeline-output/`
- **Override flag:** `--output-dir=<path>` (available on all orchestrators)
- **Fresh run layout:** runtime allocates a run-specific directory at `<output_root>/<run_id>/`
- **Canonical run-local sub-directories by orchestrator:**
  - `<run_output_dir>/pipeline/` — orchestrator-pipeline intermediates
  - `<run_output_dir>/spec/` — orchestrator-spec outputs
  - `<run_output_dir>/init/` — orchestrator-init docs
  - `<run_output_dir>/ci/` — orchestrator-ci docs
  - `<run_output_dir>/modernize/` — orchestrator-modernize docs
  - `<run_output_dir>/flow/` — orchestrator-flow outputs
  - `<run_output_dir>/committee/` — orchestrator-committee outputs
- **Canonical checkpoint file:** `<run_output_dir>/checkpoint.json` (see Checkpoint Protocol below)
- **Gitignore requirement:** The target project's `.gitignore` MUST include the base output root (default `.pipeline-output/`). Orchestrators verify this in pre-flight and warn the user if it is missing.

### Canonical Filenames For `orchestrator-pipeline`

- `<run_output_dir>/pipeline/problem-spec.json`
- `<run_output_dir>/pipeline/dev-spec.json` (optional)
- `<run_output_dir>/pipeline/dev-spec.md` (optional human-readable spec)
- `<run_output_dir>/pipeline/plan-outline.json`
- `<run_output_dir>/pipeline/repo-findings.json`
- `<run_output_dir>/pipeline/task-list.json`
- `<run_output_dir>/pipeline/dispatch-plan.json`
- `<run_output_dir>/pipeline/test-report.json`
- `<run_output_dir>/pipeline/review-report.json`
- `<run_output_dir>/pipeline/context-pack.json`

### Canonical Filenames For `orchestrator-spec`

- `<run_output_dir>/spec/problem-spec.json`
- `<run_output_dir>/spec/dev-spec.json`
- `<run_output_dir>/spec/dev-spec.md`
- `<run_output_dir>/spec/plan-outline.json`

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
- **Persistence boundary:** Cross-session continuation relies on files under the selected run directory, especially `<run_output_dir>/checkpoint.json`.

- **Location:** `<run_output_dir>/checkpoint.json` (default fresh-run layout: `.pipeline-output/<run_id>/checkpoint.json`)
- **Schema:** `./protocols/schemas/checkpoint.schema.json`
- **Ownership:** runtime/plugin owns checkpoint file creation and canonical writes; orchestrators emit semantic stage-completion and run-finish events that the runtime persists.
- **Write timing:** After each stage completes successfully, runtime/plugin MUST update the checkpoint file with the stage output.
- **Resume flow:**
    1. User passes `--resume` flag
       - `--resume` may be used with a new prompt or as resume-only invocation without a new prompt.
    2. Runtime resolves the intended run directory, then loads `<run_output_dir>/checkpoint.json`
    3. Validates that the checkpoint's `orchestrator` field matches the current orchestrator
       - If resume-only invocation is used and checkpoint is valid, orchestrator reuses `checkpoint.user_prompt` as the run prompt.
   4. Displays a summary of completed stages and the next stage to run
   5. Asks user to confirm before resuming
   6. Skips completed stages and continues from the next incomplete stage
- **Missing/invalid checkpoint:** If `--resume` is set but checkpoint is missing or invalid, warn and start fresh; if no new prompt was provided (resume-only invocation), require a new prompt for the fresh run.
- **No implicit resume:** If `--resume` is not provided, the orchestrator starts a fresh run even when prior artifacts remain on disk.
- **Artifacts vs resume:** Persisted specs, handoff files, init docs, or other protocol-defined artifacts may still be read as explicit inputs or optional context, but that does not count as checkpoint resume.
- **Completion:** On successful pipeline completion, the checkpoint file MAY be retained for audit or deleted. Default: retain.

## Status Layer Contract (MVP)

### MVP-First Scope Boundary

This status layer is an adjacent, repo-bound filesystem contract for pipeline visibility and resume hygiene. It is intentionally narrow:

- Reuse existing checkpoint and `DispatchPlan` concepts instead of redefining them.
- Keep status as JSON files under `<run_output_dir>/status/`; do not introduce UI, websocket, event-bus, daemon, or external service requirements.
- Treat the status layer as operational metadata for the current repo and local run lifecycle.
- Do not broaden checkpoint semantics beyond stage resume, task ownership, and basic crash/stale cleanup guidance.

Future runtime repos MAY project the same entities into a database, API, or richer orchestration system, but this repo's contract remains the source of truth for the entity names, core fields, and state meanings.

### `status_runtime_event` Tool Contract

Use the plugin tool name literally: `status_runtime_event`.

- Fixed args:
  - `event`: string
  - `payload_json`: JSON string that decodes to exactly one object
- Base path rule: every call MUST include `payload_json.output_root` and `payload_json.run_id`.
- `output_root` is the base artifact root (for example `.pipeline-output`), not `<run_output_dir>`.
- Runtime/plugin derives `<run_output_dir>` as `<output_root>/<run_id>/` and owns resolved paths, timestamps, refs, counts, active ids, and reconciliation.

Required event vocabulary for Flow and Pipeline status/checkpoint writes:

- `run.started`
- `run.resumed`
- `stage.completed`
- `tasks.registered`
- `task.updated`
- `agent.started`
- `agent.heartbeat`
- `agent.finished`
- `run.finished`

Minimal payload skeleton guidance:

- Common envelope for every event: `{ "output_root": "...", "run_id": "..." }`
- `run.started` / `run.resumed`: add `orchestrator`; include `user_prompt` when known and `flags` when available.
- `stage.completed`: add `stage`, `name`, `status`, `artifact_key`; include `stage_artifact`, `next_stage`, and any relevant canonical artifact path fields only when they changed.
- `tasks.registered`: add `tasks` as canonical task summaries; include `task_list_path` when available.
- `task.updated`: add `task_id` plus only the changed semantic task fields, such as `status`, routing metadata, result/evidence fields, or `error`.
- `agent.started` / `agent.heartbeat` / `agent.finished`: add `agent_id`; include `agent` on start and `task_id` only when attached to a canonical task.
- `run.finished`: add terminal run `status`; include `waiting_on`, `notes`, or `last_error` only when relevant.

These event payloads are semantic deltas, not full file rewrites.

### Canonical Status Files

- Status root: `<run_output_dir>/status/`
- Required base file: `<run_output_dir>/status/run-status.json`
- Optional expanded files:
  - `<run_output_dir>/status/tasks/<task_id>.json`
  - `<run_output_dir>/status/agents/<agent_id>.json`

`run-status.json` is always the top-level index for the run. When expanded files are used, `run-status.json` SHOULD keep a lightweight summary plus references to task and agent status files rather than duplicating every live detail.

### Entity Model and Relationships

#### RunStatus

One `RunStatus` exists per orchestrator invocation.

Required fields:

- `run_id`: stable id for the run and the canonical basename of `<run_output_dir>` under the configured base output root
- `orchestrator`: orchestrator name
- `status`: current run state
- `created_at`: first write timestamp
- `updated_at`: last successful write timestamp
- `output_dir`: resolved artifact root for the run, typically `<base_output_dir>/<run_id>/`
- `checkpoint_path`: path to the checkpoint file used by the run, typically `<base_output_dir>/<run_id>/checkpoint.json`

Optional fields:

- `protocol_version`
- `user_prompt`
- `current_stage`
- `completed_stages[]`
- `next_stage`
- `task_list_path`
- `dispatch_plan_path`
- `layout`: `run-only` | `expanded`
- `task_counts`: counts by task state
- `active_task_ids[]`
- `active_agent_ids[]`
- `waiting_on`: `user` | `dependency` | `cleanup` | `resume` | `none`
- `resume_from_checkpoint`: boolean
- `last_heartbeat_at`
- `last_error`
- `notes`
- `task_refs[]`: references to `tasks/<task_id>.json` when expanded layout is used
- `agent_refs[]`: references to `agents/<agent_id>.json` when expanded layout is used

Relationship rules:

- A `RunStatus` MAY summarize many `TaskStatus` records.
- A `RunStatus` MAY reference many `AgentStatus` records.
- `RunStatus` is the authoritative parent record for lifecycle, layout choice, and checkpoint linkage.
- Multiple historical runs may coexist under a shared base output root; resume logic should pick the intended run directory explicitly or, for resume-only flows, the newest compatible run directory by modification time.

Run status vocabulary:

- `queued`: run created but execution has not started
- `running`: orchestrator is actively progressing stages or reconciling executor results
- `waiting_for_user`: paused by `--confirm`, `--verbose`, or an explicit approval gate
- `completed`: all in-scope work finished successfully
- `partial`: run finished with incomplete but non-blocking leftovers already surfaced to the user
- `failed`: run cannot continue without a fresh user decision or code/config change
- `aborted`: user or orchestrator intentionally stopped the run before normal completion
- `stale`: persisted status indicates likely abandoned execution and needs resume-or-replace handling

#### TaskStatus

One `TaskStatus` exists per `TaskList.tasks[].id` once the orchestrator has materialized executable task tracking.

Required fields:

- `run_id`
- `task_id`
- `summary`
- `status`
- `created_at`
- `updated_at`

Optional fields:

- `trace_ids[]`
- `batch_id`
- `depends_on[]`
- `assigned_agent_id`
- `assigned_executor`
- `resource_class`
- `max_parallelism`
- `teardown_required`
- `resource_status`
- `started_at`
- `completed_at`
- `last_heartbeat_at`
- `result_summary`
- `evidence_refs[]`
- `error`
- `resume_note`
- `agent_ref`

Relationship rules:

- Each `TaskStatus` belongs to exactly one `RunStatus`.
- Each `TaskStatus` maps to exactly one canonical `task_id` from `TaskList`.
- A `TaskStatus` MAY reference the currently responsible `AgentStatus`; MVP does not require full attempt history in this repo.

Task status vocabulary:

- `pending`: task exists but is not yet eligible to run
- `ready`: dependencies are satisfied and the task may be dispatched
- `in_progress`: an executor is actively working the task
- `waiting_for_user`: task is paused for feedback, approval, or missing user input
- `done`: task completed successfully, including required cleanup
- `blocked`: task cannot continue because of an external blocker or missing prerequisite
- `failed`: executor attempted the task and the run cannot treat it as complete
- `skipped`: task was intentionally not executed for this run
- `stale`: previous in-progress ownership is no longer trusted and must be reconciled before resume

#### AgentStatus

`AgentStatus` is optional in the smallest MVP layout and becomes recommended when executor-level liveness or heavy-resource detail matters.

Required fields:

- `run_id`
- `agent_id`
- `agent`
- `status`
- `created_at`
- `updated_at`

Optional fields:

- `task_id`
- `batch_id`
- `attempt`
- `started_at`
- `completed_at`
- `last_heartbeat_at`
- `resource_class`
- `resource_status`
- `teardown_required`
- `resource_handles`
- `cleanup_status`
- `result_summary`
- `evidence_refs[]`
- `error`

Relationship rules:

- Each `AgentStatus` belongs to one `RunStatus`.
- An `AgentStatus` SHOULD reference at most one active `task_id` at a time in MVP.
- `task_id` remains optional so stage-scoped or run-scoped subagents (for example repo scouting, planning, or synthesis helpers) can still be tracked even when no canonical task record exists yet.
- Multiple `AgentStatus` records for retries or re-dispatch are allowed over time, but only one should be marked active for a task at once.

Agent status vocabulary:

- `assigned`: handoff accepted but live execution has not started
- `starting`: executor is initializing tools, repo context, or required resources
- `running`: executor is actively working
- `waiting_for_user`: executor is paused on requested feedback or approval
- `done`: executor finished and reported successful cleanup where required
- `blocked`: executor cannot continue without outside intervention
- `failed`: executor attempt ended unsuccessfully
- `stale`: liveness cannot be confirmed; ownership must be reconciled

### Heavy-Resource Fields and Vocabulary

Heavy-resource tracking MUST align with `DispatchPlan` metadata and stay low-complexity.

- `resource_class` reuses router vocabulary: `light` | `process` | `server` | `browser`
- `max_parallelism` and `teardown_required` SHOULD be copied from the assigned dispatch batch onto `TaskStatus` when known
- `resource_status` vocabulary for `process`, `server`, and `browser` work:
  - `not_required`: task does not hold a heavy resource
  - `reserved`: slot assigned but resource not started yet
  - `starting`: process, server, or browser launch in progress
  - `running`: resource is live and expected to exist
  - `teardown_pending`: task logic finished but cleanup is still required
  - `cleaned`: cleanup succeeded and no live resource should remain
  - `cleanup_failed`: task finished but cleanup could not be verified
  - `unknown`: persisted status cannot prove whether the resource still exists
- `resource_handles` is optional and executor-owned. It MAY include lightweight fields such as `pid`, `port`, `profile_dir`, `process_label`, or `url`, but should avoid large logs or machine-specific dumps.
- For MVP, `resource_status` lives primarily on `AgentStatus`; `TaskStatus.resource_status` SHOULD be a summarized mirror when task-level visibility is needed.

### File Layout Decision Rules

#### Recommended default: `run-status.json` only

Use a single `<run_output_dir>/status/run-status.json` when all of the following are true:

- the run is primarily stage-oriented or has only a small number of tasks
- expected task execution is mostly sequential or otherwise low-churn
- there is no need to inspect separate executor attempts in real time
- heavy-resource work is absent or limited enough that one summarized view is readable

Rationale: the single-file layout is the lowest-complexity MVP, easiest to reason about, and sufficient for manual resume/debug workflows.

#### Add `tasks/<task_id>.json`

Split out per-task files when any of the following become true:

- multiple tasks may be active or updated in close succession
- the run needs task-by-task resume triage instead of only a run summary
- dispatch batches carry heavy-resource metadata that would make a single file noisy
- reviewers or operators need stable per-task evidence and error references

In expanded layout, `run-status.json` remains the index and summary; it does not stop being required.

#### Add `agents/<agent_id>.json`

Add per-agent files when any of the following become true:

- executor attempts need separate liveness tracking from task summaries
- `browser`, `server`, or long-lived `process` work needs live `resource_status` and cleanup detail
- a task may be retried, re-assigned, or resumed by a different executor attempt

Rationale: separate agent files keep volatile execution detail out of the run summary while preserving a stable record for crash recovery and cleanup verification.

### Write and Update Responsibilities

#### Runtime/plugin responsibilities

Runtime/plugin is the only component that may create or replace canonical checkpoint/status files.

- Create `<run_output_dir>/checkpoint.json` and `<run_output_dir>/status/run-status.json` for the run.
- Persist canonical `RunStatus`, `TaskStatus`, and `AgentStatus` records from semantic events only.
- Own file creation, timestamps, refs, counts, active id lists, and reconciliation.
- Decide concrete file paths and maintain `RunStatus.layout` consistently with emitted task/agent files.
- On resume, mark previously abandoned in-flight work as `stale` before redispatch unless liveness is positively confirmed.

#### Orchestrator responsibilities

- Emit semantic stage/run events through the runtime API.
- Decide layout intent (`run-only` or `expanded`) and provide the semantic task/agent data needed for that layout.
- Provide initial task content once `TaskList` exists and dispatch metadata once routing is complete.
- Signal stage-scoped subagent visibility when no canonical `task_id` exists yet.
- Decide semantic task transitions such as `ready`, `waiting_for_user`, `skipped`, `blocked`, `done`, `failed`, or `stale` when that decision comes from orchestration logic, dependency resolution, or resume reconciliation.
- Reconcile executor-reported outcomes into terminal task and run states.

#### Executor responsibilities

Executors may only report status for the task they were assigned, and only through the runtime API.

- When work starts, report the assigned `TaskStatus` as `in_progress` and the corresponding `AgentStatus` as `assigned`, `starting`, or `running`.
- If the delegated work is stage-scoped and has no canonical `task_id`, report only the corresponding `AgentStatus` while the orchestrator keeps `RunStatus` aligned.
- Maintain `updated_at` and, when practical, `last_heartbeat_at` through runtime heartbeats while the task is active.
- Copy or confirm heavy-resource fields (`resource_class`, `resource_status`, `teardown_required`, `resource_handles`) for browser/server/process work.
- Before reporting success, move heavy-resource work through `teardown_pending` to `cleaned` when cleanup succeeds.
- If task execution fails, report `failed` or `blocked` with a concise `error` and any evidence references.
- If cleanup fails, do not report `done`; set `resource_status = cleanup_failed` and return `partial`, `blocked`, or `failed` according to task impact.

#### Shared write rule

MVP prefers one active writer per entity at a time:

- runtime/plugin owns canonical file writes for all status entities
- orchestrator owns semantic run/task transitions
- executor owns only its live semantic attempt/task updates through runtime APIs

If a conflict is detected during resume or reconciliation, the orchestrator's latest confirmed checkpoint-aligned write wins.

### Failure, Stale, Cleanup, and Resume Rules

These rules are intentionally simple and repo-bound.

- **Stale detection (MVP rule):** if a `TaskStatus` or `AgentStatus` is `in_progress`/`running` and no `updated_at` or `last_heartbeat_at` change is observed by the orchestrator across a resume or recovery check, the orchestrator SHOULD mark it `stale` rather than assuming success.
- **Crash recovery (MVP rule):** after an orchestrator or executor crash, the next `--resume` flow MUST trust `checkpoint.json` for completed stages and trust status files only as hints for incomplete work. Any in-flight task without confirmed completion is treated as `stale` until explicitly re-dispatched or manually cleared.
- **Cleanup failure (MVP rule):** if `teardown_required = true` and cleanup cannot be verified, the related `TaskStatus` must not be `done`, and the `RunStatus` should end as `partial` or `failed` unless the user explicitly accepts the residual risk.
- **Resume behavior (MVP rule):** on resume, the orchestrator SHOULD summarize `stale`, `blocked`, and `cleanup_failed` entries before continuing, then either (a) redispatch stale work as a new executor attempt or (b) leave it blocked for user confirmation. It MUST not silently flip stale work to `done`.
- **Manual cleanup note:** when `resource_status` is `cleanup_failed` or `unknown`, the status record SHOULD include a short `notes`, `error`, or `resume_note` entry describing what may still need manual shutdown.

### Repo Boundary: Now vs Later

For this repo now:

- define the status contract in documentation
- keep the design filesystem-based and local to `<output_dir>`
- align terminology with checkpoint files, task ids, and dispatch metadata already defined here

For a future runtime repo:

- the same entities may be backed by stronger storage, locking, or APIs
- richer attempt history, archival, and automation MAY be added later
- detailed runtime handoff mechanics are explicitly out of scope for this task and this MVP section

### MVP to Hardened Roadmap

Near-term hardening MAY later add schemas, examples, stricter conflict handling, and richer attempt history for status files. This document deliberately stops at the MVP contract so the repo can standardize terminology and responsibilities before adding higher-complexity runtime behavior.

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
  - Disables interactive pauses.
  - Defaults to `--effort=high` unless `--effort=*` is explicitly provided.
  - Defaults to `--max-retry=5` unless `--max-retry=*` is explicitly provided.
  - Prefer the strongest safe bounded in-scope blocker recovery path before surfacing a non-hard blocker.
  - Still stops on hard blockers and does not permit scope expansion or leaving resources running.

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
  - Explicit flags override preset defaults from `--full-auto`
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
  - `--autopilot` and `--full-auto` do not relax cleanup requirements.
  - If cleanup fails or cannot be verified, do not claim `done`; return `partial` or `blocked` with evidence and the remaining risk.
- **Validation responsibilities:**
  - Test runners should avoid watch mode by default and clean up temporary validation resources.
  - Reviewers should treat missing cleanup evidence for any batch with `teardown_required = true` as incomplete execution evidence.
  - Missing cleanup evidence for `server` or `browser` work is always a failure, even if metadata was omitted incorrectly.

## Validation Gates

All gates and failure conditions are defined in `./protocols/VALIDATION.md`.
