# Runtime-Neutral Status Writer Spec

## Goal

Provide one deterministic status/checkpoint writer that Codex, Claude Code, Copilot, and local automation can call without a runtime plugin. Orchestrators report semantic lifecycle transitions; the neutral writer projects them into canonical artifacts.

The public entry point is:

```bash
node tools/status-event.js --event <event> --payload-json '<json>'
```

`tools/status-event.js` must remain beside `tools/status-runtime/`. Runtime installers may relocate the complete `tools/` tree and rewrite the command path, but must not separate the CLI from its sibling core modules.

## Non-goals

- No hosted dashboard or control plane
- No write-back from status consumers
- No runtime-specific plugin lifecycle
- No replacement for canonical task lists, dispatch plans, or review artifacts
- No preservation of legacy ad hoc status shapes

## Output layout

For every run, the writer owns:

- `<output_root>/<run_id>/checkpoint.json`
- `<output_root>/<run_id>/status/run-status.json`
- `<output_root>/<run_id>/status/tasks/<task_id>.json`
- `<output_root>/<run_id>/status/agents/<agent_id>.json`
- `<output_root>/<run_id>/observations/reasoning/<agent_id>.json` for terminal attempts that include a ReasoningDecision

The CLI resolves relative paths against `--base-dir` (the current directory by default). When a payload includes `working_project_dir`, relative `output_root` is resolved against that project directory instead. The writer always derives `checkpoint_path` as `<output_root>/<run_id>/checkpoint.json`; caller-supplied checkpoint paths are rejected. This keeps delegated cross-repository runs inside the target project.

## CLI contract

Exactly one payload source is required:

```bash
# Inline JSON: canonical prompt/exporter form
node tools/status-event.js \
  --event run.started \
  --payload-json '{"output_root":".pipeline-output","run_id":"run-123","orchestrator":"orchestrator-flow","user_prompt":"Implement the requested change"}'

# JSON file
node tools/status-event.js \
  --event run.resumed \
  --payload-file .pipeline-output/resume-event.json

# Standard input (`--payload-file -` is equivalent)
printf '%s' '{"output_root":".pipeline-output","run_id":"run-123","status":"completed"}' \
  | node tools/status-event.js --event run.finished --stdin
```

Optional `--base-dir <path>` supplies the session/worktree anchor used for relative paths.

On success, stdout contains exactly one JSON result and the process exits `0`. Errors are written as one JSON object to stderr:

```json
{
  "error": "input_error",
  "message": "..."
}
```

Exit codes are stable:

- `0`: event applied successfully
- `2`: argument, payload-source, or JSON input error
- `3`: event validation, projection, resume-selection, or filesystem error

## Event API

Supported events are deliberately bounded:

1. `run.started`
   - required operational fields: `run_id`, `orchestrator`, `output_root`, non-empty `user_prompt`
   - optional semantic fields: `working_project_dir`, `flags`, `status`, `waiting_on`, `notes`
2. `run.resumed`
   - required `output_root` and `orchestrator`; `run_id` is optional for compatible-run discovery
   - may overlay invocation `flags`; in-flight tasks and agents are reconciled to `stale`
3. `checkpoint.updated`
   - `run_id` plus a non-empty `flags` object
   - merges derived flags without changing `current_stage` or `completed_stages`
4. `stage.completed`
   - `run_id`, `stage`, `name`, `status`, and optional artifact/flag fields
5. `tasks.registered`
   - `run_id` plus canonical task entries; policy-v2 `task_intent`, intent-baseline/source metadata, and legacy-compatible paired `reasoning_class` / `reasoning_signals` are preserved when present
6. `task.updated`
   - `run_id`, `task_id`, and canonical task patch fields
7. `agent.started`
   - `run_id`, non-empty `agent_id`, non-empty `agent`, and optional task/batch/attempt/resource/reasoning fields
8. `agent.heartbeat`
   - `run_id`, `agent_id`, and optional status/resource fields
9. `agent.finished`
   - `run_id`, `agent_id`, terminal status, and optional result/error/evidence/reasoning fields; terminal reasoning observations use a bounded summary and omit free-text agent/reason/conflict fields
10. `run.finished`
   - `run_id`, terminal `status`, and optional notes/error/waiting fields

Every event other than `run.started` must target an initialized run. A rejected pre-start update does not create a run directory, so the same `run_id` can still be started normally.

## Policy-v2 reasoning metadata

The status writer preserves and validates resolver output; it does not classify
tasks, pick a model, or select an effort itself. The status runtime continues
to use `PROTOCOL_VERSION = 1.0`; task intent fields are backward-compatible
optional extensions, not a status protocol bump. Current task-producing
workflow events carry:

- `task_intent`
- `intent_baseline_class`
- `classification_source = task_intent`
- legacy-compatible `reasoning_class` and `reasoning_signals`

The complete per-attempt ReasoningDecision attached to an agent event records
the chosen intent/source, role policy, selected model tier, requested and
observed effort, enforcement status, and bounded degradation/conflict metadata.
The effective workspace profile/runtime owns the actual role model/tier; the
resolver owns only child effort. No status payload may request raw or dynamic
model routing or current/main-agent effort.

ReasoningPolicy, ReasoningDecision, and ReasoningObservation are the separate
policy/schema-2.0 contracts. TaskStatus records retain the status runtime's
protocol version when carrying intent data, as do checkpoints carrying the
policy-v2 reasoning flags.

Legacy class-only inputs remain valid when they record
`legacy_explicit_class`; absent intent and class may record
`legacy_role_target`. Either legacy provenance value requires its
`reasoning_class` and `reasoning_signals` pair. A terminal observation is a strict content-free summary,
not a replacement for the complete AgentStatus decision. Intent-less legacy
records retain the v1 `cross_module -> deliberative` floor; a non-null task
intent activates the v2 `cross_module -> deep` floor.

AgentStatus reasoning is restricted to the managed role catalog and requires
`agent` to equal the embedded reasoning role. The resolver's default adaptive
policy remains available for unlisted in-memory decisions and content-free
observations, but those roles must be registered before AgentStatus persistence.
Policy-v2 reasoning accepts only the three managed dispatch contexts. Legacy
schema-v1 shadow/adaptive reasoning retains its non-null `effective_class`
invariant; null remains specific to legacy inherit mode.

Callers may omit `timestamp`; the core supplies an ISO 8601 timestamp.
Provided timestamps must be RFC 3339 date-time strings. `run_id`, `task_id`, and `agent_id` are safe 1–128 character basenames containing only letters, digits, dots, underscores, and hyphens; they cannot start or end with punctuation.

## Batch API

Use `--event batch` when several transitions for the same run are ready together:

```bash
node tools/status-event.js --event batch --payload-json '{
  "shared_payload": {
    "output_root": ".pipeline-output",
    "run_id": "run-123"
  },
  "events": [
    {"event":"tasks.registered","payload":{"tasks":[{"task_id":"task-a","summary":"Implement"}]}},
    {"event":"task.updated","payload":{"task_id":"task-a","status":"done"}}
  ]
}'
```

`shared_payload` is optional. Each event may place its delta under `payload` or inline beside `event`. Per-event fields override shared fields. Every event must resolve to the same `output_root` and `run_id`; otherwise the complete batch fails before persistence.

Batching loads state once and performs one final dirty-entity flush. Prefer it for related transitions and final reconciliation.

## Ownership split

### Neutral writer owns

- run-directory resolution and resume discovery
- canonical `RunStatus`, `TaskStatus`, `AgentStatus`, and checkpoint projection
- timestamps, refs, counts, active IDs, and resume reconciliation
- stable JSON serialization and temp-file-plus-rename writes
- collision-safe persisted agent IDs when a base `agent_id` is reused
- redundant heartbeat coalescing within the debounce window

### Orchestrator owns

- semantic stage boundaries
- task and dispatch intent
- when to emit events or batches
- final run outcome (`completed`, `partial`, `failed`, and so on)
- evidence, result summaries, and resource-cleanup truth

### Subagent owns

- reporting its attempt's start/progress/final evidence to the orchestrator
- including `attempt`, `task_id`, or `batch_id` when a reused base agent ID would be ambiguous

## Single-writer rule

Atomic rename prevents torn JSON files, but the current core does not implement a cross-process transaction or file lock. Callers must serialize CLI invocations for a given run. Parallel subagents should return semantic deltas to their orchestrator; the orchestrator then emits one ordered batch.

Launching multiple `status-event.js` processes concurrently against the same run can lose an update because each process loads and projects its own snapshot.

## Resume behavior

With `run_id`, `run.resumed` targets `<output_root>/<run_id>/` only after the checkpoint and run-status agree on both run identity and orchestrator. Without `run_id`, the registry scans the output root (including the root itself), rejects malformed or orchestrator-incompatible candidates, and chooses the newest checkpoint-backed compatible run. Modification time is the primary order and run-directory name breaks ties.

`run.started` refuses to reuse an existing run directory. Resume it explicitly or choose a new `run_id`; this prevents stale task and agent projections from leaking into a fresh run.

Before redispatch, prior in-flight tasks and agents become `stale`; uncertain resource and cleanup states become `unknown` unless already terminal.

## Canonicality rules

The writer emits schema-conforming JSON only:

- object refs, never string-array `task_refs` or `agent_refs`
- `agent`, never legacy `agent_type`
- integer stage indices
- documented top-level fields only
- deterministic field ordering and one trailing newline

For reasoning-bearing records, task intent/baseline/source and the legacy
class/signal fields must agree with the policy-v2 schemas. A status write must
not silently downgrade a class, erase a signal, or turn an unresolved request
into enforced effort.

Invalid semantic transitions fail loudly. The writer does not persist guessed partial records.

## Implementation shape

The runtime-neutral core lives under `tools/status-runtime/`:

- `index.js`: event validation, batch application, dirty tracking, heartbeat coalescing
- `run-registry.js` and `run-resolution.js`: run creation/loading/resume discovery
- `status-projector.js`: lifecycle-event projection and index reconciliation
- `status-writer.js`: canonicalization and atomic JSON writes
- `schema-lite.js`, `constants.js`, and `utils.js`: bounded validation and shared helpers

The CLI is a thin adapter over this core. Runtime exporters and installers should rewrite only the path to `tools/status-event.js`; event and payload semantics stay identical across runtimes.

## Verification

Run the focused checks:

```bash
node --test tests/status-runtime.test.js
node scripts/status-runtime-smoke.mjs
node scripts/status-resume-smoke.mjs
node scripts/status-trace-negative.mjs
```

The legacy command below remains a temporary compatibility wrapper that invokes the three neutral smoke scripts:

```bash
node scripts/validate-status-runtime-smoke.cjs
```

## Future hardening

- per-run file lock or append-only event journal for safe multi-process writers
- strict full-schema validation mode
- optional event stream for live viewers
- duration and write-contention metrics
