# Status Runtime Plugin Spec

## Goal

Move status emission out of `run-*` prompt compliance and into a small runtime-owned plugin so orchestrators can focus on planning/execution while `status-cli` reads one canonical artifact shape.

## Non-goals

- No hosted dashboard or control plane
- No write-back from `status-cli`
- No attempt to preserve legacy ad hoc status formats

## Core idea

The runtime/plugin observes orchestrator and subagent lifecycle events, then writes canonical status artifacts under a run-specific directory:

- `<output_root>/<run_id>/checkpoint.json`
- `<output_root>/<run_id>/status/run-status.json`
- `<output_root>/<run_id>/status/tasks/<task_id>.json`
- `<output_root>/<run_id>/status/agents/<agent_id>.json`

The plugin owns file creation, canonical field shape, timestamps, and index reconciliation. Orchestrator prompts only need to surface semantic transitions such as stage completion, task planning, dispatch metadata, and final summaries.

When runtimes reuse a base `agent_id` across multiple visible attempts or subagents, the plugin must preserve each distinct agent record instead of overwriting the prior file/ref. The first instance may keep the requested `agent_id`; later colliding instances should receive a stable derived runtime `agent_id` (for example by suffixing attempt/task metadata) so `agent_refs` and `active_agent_ids` can represent all visible nodes.

## Ownership split

### Runtime/plugin owns

- `RunStatus` creation and replacement
- `TaskStatus` and `AgentStatus` file creation
- `task_refs`, `agent_refs`, `task_counts`, `active_task_ids`, `active_agent_ids`
- `created_at`, `updated_at`, `started_at`, `completed_at`, `last_heartbeat_at`
- stale-marking on resume when prior work was abandoned
- selecting the newest compatible run dir for resume-only invocation

### Orchestrator owns

- semantic stage boundaries
- task list content
- dispatch plan content
- final reconciliation semantics (`completed`, `partial`, `failed`, etc.)
- evidence/result summaries that should appear in task or agent records

### Subagent owns

- optional heartbeats / progress callbacks through runtime APIs only
- final success/failure payload for its own attempt

## Minimum event API

The plugin can stay small if the runtime emits a bounded set of events:

1. `run.started`
   - payload: `run_id`, `orchestrator`, `output_root`, `user_prompt`, `flags`
2. `run.resumed`
   - payload: `run_id`, `resume_from_checkpoint`, `checkpoint_path`
3. `stage.completed`
   - payload: `run_id`, `stage`, `name`, `status`, `artifact_key`, `timestamp`
4. `tasks.registered`
   - payload: canonical task list entries
5. `task.updated`
   - payload: `task_id` plus canonical task patch fields
6. `agent.started`
   - payload: `agent_id`, `agent`, optional `task_id`, optional `batch_id`, attempt
   - if the same base `agent_id` is reused for another visible attempt, runtime may emit a disambiguated canonical `agent_id` in persisted artifacts while continuing to accept the original event payload fields for matching when they remain unambiguous
7. `agent.heartbeat`
   - payload: `agent_id`, status, optional resource metadata
   - when base ids are reused concurrently, callers should also include `attempt`, `task_id`, or `batch_id` so runtime can target the intended persisted agent record
8. `agent.finished`
   - payload: `agent_id`, terminal status, result/error/evidence fields
   - same disambiguation rule as heartbeat events
9. `run.finished`
   - payload: terminal run status, notes, artifact refs

## Resume behavior

Base output root remains configurable, for example `.pipeline-output/`.

Fresh runs:

- runtime allocates `<output_root>/<run_id>/`
- all checkpoint/status/artifacts stay inside that run dir

Resume-only runs:

- if user points directly at a run dir, use it
- otherwise scan immediate children of `<output_root>/`
- choose the newest compatible run dir containing `checkpoint.json` whose checkpoint orchestrator matches the invoked orchestrator
- mark abandoned in-flight task/agent records as `stale` before redispatch unless liveness is explicitly confirmed

## Canonicality rules

The plugin must emit schema-conforming JSON only.

- no string-array `task_refs` / `agent_refs`
- no alternate field names like `agent_type`
- no stage strings where integer stage indices are required
- no extra undocumented top-level fields in status records

If runtime cannot satisfy canonical shape, it should fail the status write loudly rather than emitting partial ad hoc JSON.

## Suggested implementation shape

Small module/service with three pieces:

1. `RunRegistry`
   - resolve run dir
   - resume discovery
   - atomic writes
2. `StatusProjector`
   - map lifecycle events into canonical run/task/agent records
   - recompute refs/counts/active ids
3. `StatusWriter`
   - JSON serialization
   - temp-file + rename writes
   - optional schema validation in debug/strict mode

## Nice-to-have later

- file lock to protect against duplicate runtime writers
- event log for postmortem debugging
- optional websocket/event stream for future live viewers
- metrics on task/agent durations

## Why this is enough

This plugin is intentionally small because the viewer is a convenience feature. Its job is only to make runtime truth visible and consistent. Once runtime owns the lifecycle writes, `run-*` prompts stop carrying fragile bookkeeping responsibilities and `status-cli` can stay strict and simple.
