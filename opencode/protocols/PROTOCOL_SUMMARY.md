# Protocol Summary (v1.0)

This is a lightweight summary intended for global instructions to reduce token usage.
Paths are relative to the config directory (for example `~/.config/opencode`).

## Core Rules

- Handoff content is a formal contract. Do not infer missing requirements.
- Scope must not expand beyond the ProblemSpec and Acceptance Criteria.
- If `DevSpec` is present, downstream stages should preserve traceability via task `trace_ids` mapped to its story, scenario, acceptance, or test ids.
- TaskList is the single source of truth for execution scope.
- DispatchPlan batches carry required resource metadata: `resource_class`, `max_parallelism`, and `teardown_required`.
- Status layer is repo-bound and MVP-first: always keep `<output_dir>/status/run-status.json`, and add `tasks/<task_id>.json` or `agents/<agent_id>.json` only when per-task or per-agent detail is needed.
- Status entities use shared terminology: `RunStatus`, `TaskStatus`, and optional `AgentStatus`.
- Evidence is required for implementation tasks unless explicitly skipped by flags.
- Executors must not perform work outside their assigned task.
- Tasks that launch browsers, servers, watchers, temp profiles, or other lingering child-process resources must include explicit teardown; cleanup evidence is part of task completion.
- Checkpoint files remain the source of truth for completed stages on resume; status files provide run/task/agent visibility and stale-work recovery hints.

## Outputs and Schemas

- ProblemSpec: `./protocols/schemas/problem-spec.schema.json`
- DevSpec (optional): `./protocols/schemas/dev-spec.schema.json`
- PlanOutline: `./protocols/schemas/plan-outline.schema.json`
- RepoFindings: `./protocols/schemas/repo-findings.schema.json`
- TaskList: `./protocols/schemas/task-list.schema.json`
- DispatchPlan: `./protocols/schemas/dispatch-plan.schema.json`
- ReviewReport: `./protocols/schemas/review-report.schema.json`
- TestReport: `./protocols/schemas/test-report.schema.json`
- ContextPack: `./protocols/schemas/context-pack.schema.json`
- TodoLedger (optional): `./protocols/schemas/todo-ledger.schema.json`
- ModernizeExecHandoff (optional inter-orchestrator input): `./protocols/schemas/modernize-exec-handoff.schema.json`

## Todo Ledger (Optional)

If `todo-ledger.json` exists in the project root, surface it before planning and ask whether to include, defer, or mark items obsolete.

## Status Layer (MVP)

- **RunStatus:** required top-level run record with lifecycle, checkpoint linkage, layout choice, and summary counts.
- **TaskStatus:** per-`task_id` execution record covering readiness, in-progress work, completion, blocking, skip, failure, and stale reconciliation.
- **AgentStatus:** optional executor-attempt record, recommended for heavy-resource work or when separate liveness tracking is needed.
- **Run status states:** `queued`, `running`, `waiting_for_user`, `completed`, `partial`, `failed`, `aborted`, `stale`.
- **Task status states:** `pending`, `ready`, `in_progress`, `waiting_for_user`, `done`, `blocked`, `failed`, `skipped`, `stale`.
- **Agent status states:** `assigned`, `starting`, `running`, `waiting_for_user`, `done`, `blocked`, `failed`, `stale`.
- **Heavy-resource vocabulary:** reuse `resource_class` = `light | process | server | browser`; use `resource_status` = `not_required | reserved | starting | running | teardown_pending | cleaned | cleanup_failed | unknown`.
- **Writers:** orchestrator owns `RunStatus` and initial task records; executors update only their assigned task/agent records; checkpoint-aligned orchestrator reconciliation wins on resume conflicts.
- **Resume/failure rules:** incomplete in-flight work without confirmed completion becomes `stale`; cleanup failures prevent `done`; resume must summarize stale/blocked/cleanup issues before redispatch or user confirmation.
