# Validation Gates

These gates define minimal acceptance for each stage output.

## Spec Gate

- `acceptance_criteria` must be present and non-empty.
- `scope.in` and `scope.out` must be present.
- `goal` must be non-empty.

## DevSpec Gate (Optional)

- If `dev-spec.json` is emitted, it must validate against `./protocols/schemas/dev-spec.schema.json`.
- `user_stories`, `scenarios`, and `acceptance_criteria` must each be non-empty.
- Each scenario must include non-empty `given`, `when`, and `then` steps.
- `test_plan.test_cases` must be non-empty so the spec stays executable.

## UI/UX Artifact Bundle Gate (Optional)

- If `ui-ux-bundle.json` is emitted, it must validate against `./protocols/schemas/ui-ux-bundle.schema.json`.
- `artifact_type` must be `ui-ux-bundle` and `source_of_truth_rule` must keep the JSON bundle canonical.
- The bundle must include `assessment_summary`, `wireframe_selection`, `flow_summaries`, `prompt_export`, and `thin_preview_handoff`.
- Each artifact class must include both `machine_readable` and `human_readable` payloads.
- Human-readable pairings must remain Markdown-oriented and must map cleanly to stable bundle sections.
- `thin_preview_handoff.machine_readable.handoff_mode` must remain `thin-read-only-preview`; editable preview/editor contracts are out of scope for this workflow.
- The contract stays conceptual: implementation-ready component APIs, runtime automation, and provider/model configuration must not be introduced under this schema.
- Reference positive fixture: `./protocols/examples/ui-ux-bundle.valid.json`.
- This task registers the contract and fixture only; adding CI enforcement or a dedicated validation harness is future work.

## Plan Gate

- `milestones` must be present.
- `deliverables` must be present.

## Task Gate

- Each task must include `id`, `summary`, `primary_output`, and `definition_of_done`.
- `definition_of_done` must be non-empty.
- `dependencies` must reference existing task ids or be empty.
- If `DevSpec` is part of the run, each task must include non-empty `trace_ids` that point to valid `story-*`, `sc-*`, `ac-*`, or `tc-*` ids.

## Flow Task Gate

- Flow task lists must validate against `./protocols/schemas/flow-task-list.schema.json`.
- Flow task lists must contain 1-5 tasks only.
- Every Flow task must include `assigned_agent`, `effort`, `verification`, `repair_budget`, `resource_class`, and `atomic = true`.

## Evidence Gate

- Executor outputs must include evidence paths or commands.
- If tests are required, test-runner output must include evidence and command list.

## Resource Gate

- Every DispatchPlan batch must include `resource_class`, `max_parallelism`, and `teardown_required`.
- Any task or batch with `teardown_required = true` must include cleanup evidence before it can pass review.
- Missing cleanup evidence for `server` or `browser` work is always a failure.
- If cleanup fails or cannot be verified, the task must not be treated as complete.

## Status Contract Gate

- `run-status.json` must always exist at `<run_output_dir>/status/run-status.json` and validate against `./protocols/schemas/run-status.schema.json`.
- Expanded layouts must validate each `<run_output_dir>/status/tasks/<task_id>.json` file against `./protocols/schemas/task-status.schema.json`.
- Expanded layouts must validate each `<run_output_dir>/status/agents/<agent_id>.json` file against `./protocols/schemas/agent-status.schema.json`.
- `TaskStatus.status = done` must not coexist with uncleared heavy-resource states such as `resource_status = cleanup_failed`.
- `AgentStatus.status = done` must not coexist with live or failed-cleanup resource states.
- Invalid status fixtures are expected to fail validation; CI should treat an unexpected pass as a regression.

## Repository Validation Hooks

Run the same status contract checks locally or in automation with `opencode/tools/validate-schema.py --require-jsonschema`.

Current repository coverage validates:

- `./protocols/examples/status-layout.run-only.valid/run-status.json`
- `./protocols/examples/status-layout.expanded.valid/run-status.json`
- all `./protocols/examples/status-layout.expanded.valid/tasks/*.json`
- all `./protocols/examples/status-layout.expanded.valid/agents/*.json`
- negative fixtures under `./protocols/examples/status-layout.contract.invalid/`, which must fail against the matching status schemas

This repository enforces those checks in `.github/workflows/ci.yml` so contributor changes to status schemas or fixtures are exercised in the default CI path.

## Review Gate

- `overall_status` must be `pass` for pipeline completion.
- If `overall_status` is `fail`, required followups must be listed.

## Todo Ledger Gate (Optional)

- If `todo-ledger.json` exists in the project root, it must validate against the TodoLedger schema.
- Canonical item `status` values should be `backlog`, `ready`, `doing`, `blocked`, `done`, or `archived`.
- Legacy values `open` and `obsolete` are tolerated for migration, but helper commands should rewrite them to canonical statuses when practical.

## Handoff Gate (Optional)

- If `handoff-pack.json` is emitted, it must validate against the HandoffPack schema.
- Handoff output must include a recommended next action and whether kanban sync is required.

## Flags and Exceptions

- `--no-test` allows missing test evidence but reviewer must warn.
- `--loose-review` allows missing build or test evidence but reviewer must warn.
- `--decision-only` skips task execution and test evidence requirements.
