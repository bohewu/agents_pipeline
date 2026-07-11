# Status Writer Implementation Checklist

Use this checklist when wiring a runtime or generated orchestrator to the neutral status/checkpoint writer.

## Install and command boundary

- Install `tools/status-event.js` together with the complete `tools/status-runtime/` directory.
- Rewrite only the installed CLI path; do not fork event names or payload shapes per runtime.
- Use the canonical inline form in generated prompts:

  ```bash
  node tools/status-event.js --event <event> --payload-json '<json>'
  ```

- For large or quote-heavy payloads, use `--payload-file <path>` or `--stdin`.
- Set `--base-dir <worktree>` when the caller's current directory is not the intended session/worktree anchor.
- Treat exit `2` as an input/command bug and exit `3` as an event, resume, projection, or write failure.
- Parse stdout as a single JSON result; errors arrive as a single JSON object on stderr.

## Output layout

- Treat `output_root` as a base output root.
- Include `working_project_dir` for delegated cross-repository work so relative `output_root` resolves in the target project.
- Do not send `checkpoint_path`; the writer derives it and rejects caller overrides.
- Give every fresh run a dedicated `<output_root>/<run_id>/` directory.
- Use a new safe-basename `run_id` for every fresh start; use `run.resumed` for an existing run.
- Keep canonical artifacts at:
  - `<run_output_dir>/checkpoint.json`
  - `<run_output_dir>/status/run-status.json`
  - `<run_output_dir>/status/tasks/<task_id>.json`
  - `<run_output_dir>/status/agents/<agent_id>.json`

## Event order

- Emit `run.started` with a non-empty `user_prompt` before any stage, task, or agent event.
- Emit `tasks.registered` before updating or assigning a task.
- Pair every `agent.started` with `agent.finished` unless the run is interrupted.
- Emit `run.finished` only after task, agent, evidence, and cleanup truth has been reconciled.
- Use `--event batch` for several ordered transitions on the same run.
- Put common `output_root`, `run_id`, and optional `working_project_dir` in `shared_payload`.
- Never mix output roots or run IDs inside one batch.

## Single-writer discipline

- Serialize CLI invocations for each run.
- Do not let parallel subagents independently launch writers against the same run.
- Collect subagent deltas in the orchestrator and flush them as one ordered batch.
- Remember that atomic rename prevents torn files but does not prevent snapshot races between processes.

## Canonical records

- Emit schema-conforming JSON only.
- Do not add undocumented top-level fields.
- Use `agent`, not `agent_type`.
- Keep `task_refs` and `agent_refs` as object arrays, never string arrays.
- Let the writer own timestamps, refs, counts, active IDs, and deterministic field ordering.
- Fail the run's status write instead of emitting partial or guessed shapes.

## Run index maintenance

- Treat `status/run-status.json` as the canonical run index.
- Confirm every task/agent mutation recomputes:
  - `task_counts`
  - `active_task_ids`
  - `active_agent_ids`
  - `task_refs`
  - `agent_refs`
- Verify dirty tracking rewrites only touched entities while keeping the index current.

## Agent identity

- Provide non-empty `agent_id` and `agent` fields for `agent.started`.
- Include `task_id`, `batch_id`, or `attempt` when reusing a base agent ID.
- Accept collision-safe persisted IDs from the writer; do not assume every persisted ID equals the requested base ID.
- Use enough disambiguating metadata on heartbeat/finish events to select one active attempt.

## Heartbeats and resources

- Send standalone heartbeats only for long-running active work.
- Keep heartbeat cadence coarse (approximately 15 seconds or more).
- Skip a heartbeat when a final batched outcome is imminent.
- Include authoritative resource, teardown, and cleanup fields when they change.
- Do not mark a run complete while required cleanup remains pending, failed, or unknown.

## Resume

- To resume a known run, provide its parent `output_root` and `run_id`.
- To discover a run, omit `run_id` and provide `output_root` plus an optional `orchestrator` compatibility filter.
- Confirm discovery chooses the newest checkpoint-backed compatible candidate.
- Confirm abandoned in-flight tasks and agents become `stale` before redispatch.
- Confirm uncertain active resource/cleanup states become `unknown`.
- Overlay invocation flags without dropping unrelated persisted/derived flags.

## Error handling

- Reject unsupported events and malformed JSON as input errors (`2`).
- Reject invalid transitions, unknown tasks/agents, ambiguous reused agent IDs, incompatible resume candidates, and filesystem failures as runtime errors (`3`).
- Require empty stdout on failure and parse the stderr JSON envelope.
- Surface status failures; do not silently continue with non-canonical state.

## Focused verification

- Core and CLI unit coverage:

  ```bash
  node --test tests/status-runtime.test.js
  ```

- Fresh lifecycle, batch, and artifact layout:

  ```bash
  node scripts/status-runtime-smoke.mjs
  ```

- Newest-compatible checkpoint resume and stale reconciliation:

  ```bash
  node scripts/status-resume-smoke.mjs
  ```

- Unsupported event, malformed input, invalid agent event, and mixed-run batch rejection:

  ```bash
  node scripts/status-trace-negative.mjs
  ```

- Temporary compatibility entry point:

  ```bash
  node scripts/validate-status-runtime-smoke.cjs
  ```

## Related files

- `docs/status-writer-spec.md`
- `tools/status-event.js`
- `tools/status-runtime/`
- `protocols/PIPELINE_PROTOCOL.md`
- `protocols/schemas/checkpoint.schema.json`
- `protocols/schemas/run-status.schema.json`
- `protocols/schemas/task-status.schema.json`
- `protocols/schemas/agent-status.schema.json`
