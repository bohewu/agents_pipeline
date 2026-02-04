# Validation Gates

These gates define minimal acceptance for each stage output.

## Spec Gate

- `acceptance_criteria` must be present and non-empty.
- `scope.in` and `scope.out` must be present.
- `goal` must be non-empty.

## Plan Gate

- `milestones` must be present.
- `deliverables` must be present.

## Task Gate

- Each task must include `id`, `summary`, `primary_output`, and `definition_of_done`.
- `definition_of_done` must be non-empty.
- `dependencies` must reference existing task ids or be empty.

## Evidence Gate

- Executor outputs must include evidence paths or commands.
- If tests are required, test-runner output must include evidence and command list.

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
