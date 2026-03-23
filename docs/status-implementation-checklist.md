# Status Implementation Checklist

Use this checklist when implementing runtime-owned status emission for `run-*` orchestration.

## Output layout

- Treat the configured output path as a base output root.
- For every fresh run, create a dedicated run directory: `<output_root>/<run_id>/`.
- Write all run artifacts inside that run directory.
- Canonical paths:
  - `<run_output_dir>/checkpoint.json`
  - `<run_output_dir>/status/run-status.json`
  - `<run_output_dir>/status/tasks/<task_id>.json`
  - `<run_output_dir>/status/agents/<agent_id>.json`

## Canonical records only

- Emit schema-conforming JSON only.
- Do not add undocumented top-level fields.
- Do not use legacy aliases such as `agent_type`.
- Do not use string-array refs; `task_refs` and `agent_refs` must be object arrays.
- If status cannot be written canonically, fail fast instead of emitting partial or guessed shapes.

## Ownership split

- Runtime/plugin owns file creation, timestamps, refs, counts, and reconciliation.
- Orchestrator owns semantic transitions: stage completion, task planning, dispatch intent, final outcomes.
- Subagents should only report their own start/heartbeat/finish payloads through runtime APIs.

## Run index maintenance

- Keep `run-status.json` authoritative and current.
- Recompute after every task or agent mutation:
  - `task_counts`
  - `active_task_ids`
  - `active_agent_ids`
  - `task_refs`
  - `agent_refs`
- Do not update only leaf files and leave the run index stale.

## Stage-scoped agents

- Create `AgentStatus` for delegated stage-scoped agents such as `repo-scout`, `planner`, and `specifier`.
- Omit `task_id` when no canonical task exists yet.
- Keep these visible in `agent_refs` and `active_agent_ids` while they are live.

## Resume behavior

- If the user targets a specific run directory, resume that run.
- If the user provides only the output root, choose the newest compatible run directory.
- Before redispatch, mark abandoned in-flight tasks or agents as `stale` unless liveness is explicitly confirmed.

## Timestamps

- Always maintain:
  - `created_at`
  - `updated_at`
- When applicable, also maintain:
  - `started_at`
  - `completed_at`
  - `last_heartbeat_at`

## Validation gates

- Validate against the canonical schemas during development or in strict runtime mode.
- Treat schema failures as implementation bugs, not viewer problems.
- `status-cli` is intentionally strict and should reject non-canonical artifacts.

## Smoke test expectations

- Fresh runs create a new run-specific directory.
- Resume-only flows pick the newest compatible run when no explicit run dir is provided.
- Stage-scoped agents appear in status views even without `task_id`.
- Non-canonical external status JSON is rejected clearly.

## Related docs

- `docs/status-runtime-plugin-spec.md`
- `opencode/protocols/PIPELINE_PROTOCOL.md`
- `opencode/protocols/schemas/run-status.schema.json`
- `opencode/protocols/schemas/task-status.schema.json`
- `opencode/protocols/schemas/agent-status.schema.json`
