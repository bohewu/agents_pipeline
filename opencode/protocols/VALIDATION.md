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

## Plan Gate

- `milestones` must be present.
- `deliverables` must be present.

## Task Gate

- Each task must include `id`, `summary`, `primary_output`, and `definition_of_done`.
- `definition_of_done` must be non-empty.
- `dependencies` must reference existing task ids or be empty.
- If `DevSpec` is part of the run, each task must include non-empty `trace_ids` that point to valid `story-*`, `sc-*`, `ac-*`, or `tc-*` ids.

## Evidence Gate

- Executor outputs must include evidence paths or commands.
- If tests are required, test-runner output must include evidence and command list.

## Resource Gate

- Every DispatchPlan batch must include `resource_class`, `max_parallelism`, and `teardown_required`.
- Any task or batch with `teardown_required = true` must include cleanup evidence before it can pass review.
- Missing cleanup evidence for `server` or `browser` work is always a failure.
- If cleanup fails or cannot be verified, the task must not be treated as complete.

## Review Gate

- `overall_status` must be `pass` for pipeline completion.
- If `overall_status` is `fail`, required followups must be listed.

## Todo Ledger Gate (Optional)

- If `todo-ledger.json` exists in the project root, it must validate against the TodoLedger schema.
- All item `status` values must be `open`, `blocked`, `done`, or `obsolete`.

## Flags and Exceptions

- `--no-test` allows missing test evidence but reviewer must warn.
- `--loose-review` allows missing build or test evidence but reviewer must warn.
- `--decision-only` skips task execution and test evidence requirements.
