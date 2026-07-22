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
- If optional communication-first fields are present, they must remain conceptual and must not introduce implementation-ready behavior contracts.
- `thin_preview_handoff.machine_readable.handoff_mode` must remain `thin-read-only-preview`; editable preview/editor contracts are out of scope for this workflow.
- The contract stays conceptual: implementation-ready component APIs, runtime automation, and provider/model configuration must not be introduced under this schema.
- Reference positive fixture: `./protocols/examples/ui-ux-bundle.valid.json`.
- This task registers the contract and fixture only; adding CI enforcement or a dedicated validation harness is future work.

## Plan Gate

- `milestones` must be present.
- `deliverables` must be present.

## Task Gate

- Each task must include `id`, `summary`, `primary_output`, and `definition_of_done`.
- Current Pipeline task producers must emit `task_intent`, the matching `intent_baseline_class`, `classification_source = task_intent`, legacy-compatible paired `reasoning_class`, and non-empty bounded `reasoning_signals` as backward-compatible optional extensions. They must not advance a TaskList `protocol_version` because of policy v2.
- `definition_of_done` must be non-empty.
- `dependencies` must reference existing task ids or be empty.
- If `DevSpec` is part of the run, each task must include non-empty `trace_ids` that point to valid `story-*`, `sc-*`, `ac-*`, or `tc-*` ids.

## Flow Task Gate

- Flow task lists must validate against `./protocols/schemas/flow-task-list.schema.json`.
- Flow task lists must contain 1-5 tasks only.
- Every Flow task must include `assigned_agent`, `risk`, `task_intent`, matching intent-baseline/source metadata, paired legacy-compatible `reasoning_class` and non-empty bounded `reasoning_signals`, `verification`, `review_required`, `repair_budget`, `resource_class`, and `atomic = true`.
- Flow `repair_budget` counts only additional modify-and-verify cycles after the first implementation/content attempt and is bounded to `0..2`; operational retries and Flow-level recovery are separate controls.
- Medium-risk Flow tasks require `verification = basic | strong` and `repair_budget = 1 | 2`.
- High-risk Flow tasks require `verification = strong`, `review_required = true`, and `repair_budget = 1 | 2`.

## Evidence Gate

- Executor outputs must include evidence paths or commands.
- If tests are required, test-runner output must include evidence and command list.

## Reasoning Gate

- `./protocols/reasoning-policy.json` must validate as policy/schema version `2` / `2.0`, retain its immutable v2 intent baselines and signal/model/class-projection floors, global `medium` floor, `mini` `high` floor, and `allow_ultra = false`.
- Policy-v2 root and nested objects must use their exact supported key sets. Only `formal_accept_reject` may have an `assurance` signal floor; every other signal floor is capped at `deep`.
- Only ReasoningPolicy, ReasoningDecision, and ReasoningObservation advance to policy/schema `2` / `2.0`. TaskList, FlowTaskList, DispatchPlan, TaskStatus, and checkpoint artifacts retain their existing protocol versions; the status runtime remains `PROTOCOL_VERSION = 1.0`.
- New task/Flow/dispatch/status artifacts must carry `task_intent`, matching baseline/source metadata, legacy `reasoning_class`, and bounded signals. Existing explicit-class and role-target fallback artifacts remain valid and must record the appropriate legacy source; intent-less legacy `cross_module` retains the v1 `deliberative` floor, while intent-bearing v2 records require `deep`.
- Every intent baseline and class-defining signal must satisfy the policy's minimum class in task, Flow, dispatch, status, ReasoningDecision, ReasoningObservation, and resolver validation.
- Every enforced child spawn must come from `./tools/reasoning-policy.js`; workflow prose must not duplicate the projection table.
- Workspace profiles select the actual role model/tier. The resolver selects child effort only: it never routes a raw/dynamic model, downgrades a model, or changes current/main-agent effort.
- Deep work on `mini` or `unknown` conflicts by default. An explicit `allow_degraded_deep` compatibility input may produce only degraded deep `max` with `model_tier_below_deep_requirement`; it never permits assurance.
- `ad-hoc-review` is non-strict deep, `pipeline-review` is non-strict deep with a strong-tier minimum, and `formal-assurance` is fixed strict assurance on strong. `--review=max` remains an ordinary deep review effort override, not certification.
- `inherit` keeps classification metadata without a selector and conflicts for exact/strict requirements; `shadow` computes without applying and conflicts for strict assurance; `adaptive` requests the child selector and requires matching trace evidence before claiming the effective-effort contract was enforced. Parent/request/child equality remains selector-causality indeterminate.
- Only `reasoning_failure` raises routine to deliberative or deliberative to deep. Deep receives a max recovery boost without becoming assurance; operational failures never escalate reasoning.
- `conflict` blocks a spawn. In policy v2 it is the fixed `"conflict"` token and `conflict_reason` is the single explanatory string. `requested` is not proof of enforcement; only observed trace agreement may produce `enforced`.
- Decision, observation, and status validation must derive minimum tier and requested-effort floors from the class/tier table, reject impossible mode/state/evidence combinations and forged assurance, require exact requested/dispatch/effective equality for `enforced`, reject observed effort below dispatch, and permit `effective_effort_mismatch` degradation only in the overprovisioning direction. The resolver separately enforces the workspace ceiling against observed effort.
- Decision, observation, and status validation must treat requested/override classes as upward-only floors, bind managed role-policy and the three canonical v2 dispatch contexts to their identifiers, require managed-only AgentStatus `agent`/reasoning-role identity, and reject selector-unavailable records that claim dispatch or effective effort.
- Schema-v1 shadow/adaptive Decision, Observation, and AgentStatus reasoning must retain a non-null `effective_class`; only schema-v1 inherit records use null.
- Every explicit effort value is an exact upward floor. Legacy explicit-class records require a non-null requested class; legacy role-target records require a null requested class and may not resolve below the canonical role target. Conflict records retain selector, context, provenance, and recovery semantics.
- Strict and exact requests, including `--review=max`, become conflicts when observed effort differs, including in shadow or selector-unavailable paths; they never silently downgrade or override the selected model.
- A workspace ceiling below the projected class effort conflicts; it never clips a deliberative, deep, or assurance request downward.
- Local Codex workflows must attempt bounded child-trace verification with `./tools/codex-child-trace.js`, using V2's returned task path plus the Codex-injected current thread identity or a legacy spawn UUID; role mismatch, underprovisioning, and observed effort above the workspace ceiling block acceptance, while missing evidence stays unverified and cannot satisfy strict or exact work. V2 lookup fails closed without parent identity so repeated task paths cannot select stale traces. The helper compares parent-at-spawn effort without exposing raw role/model metadata, the V2 task name, or the parent ID: equality is inheritance-consistent but not causal proof, while a matching request distinct from the parent excludes simple inheritance. Trace discovery rejects symlinked or redirected ancestors, files, junctions, and reparse-like paths.
- Terminal ReasoningObservation files validate against their schema, omit free-text `agent`, `reasons`, and `conflict`, and contain no prompt, result summary, source, path, command, log, evidence-content, or artifact-content fields.
- Fresh `run.started` projections validate checkpoint and run-status data in memory before the status runtime creates the run directory, so a corrected retry can reuse a rejected run id.

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

Run the same status contract checks locally or in automation with `tools/validate-schema.py --require-jsonschema`.

Run the helper artifact contract checks locally or in automation with `python3 scripts/validate-helper-contracts.py`.

Current repository coverage validates:

- `./protocols/examples/codex-child-trace.valid.json`
- `./protocols/reasoning-policy.json`
- `./protocols/examples/reasoning-decision.valid.json`
- `./protocols/examples/reasoning-observation.valid.json`
- `./protocols/examples/status-layout.run-only.valid/run-status.json`
- `./protocols/examples/status-layout.expanded.valid/run-status.json`
- all `./protocols/examples/status-layout.expanded.valid/tasks/*.json`
- all `./protocols/examples/status-layout.expanded.valid/agents/*.json`
- negative fixtures under `./protocols/examples/status-layout.contract.invalid/`, which must fail against the matching status schemas
- `kanban.example.md` as a faithful human-readable render of `todo-ledger.example.json`
- `session-guide.example.md` against the stable top-level section order from the session-guide template and the non-ephemeral helper rules

This repository enforces those checks in `.github/workflows/ci.yml` so contributor changes to status schemas or fixtures are exercised in the default CI path.

## Review Gate

- `overall_status` must be `pass` for pipeline completion.
- If `overall_status` is `fail`, required followups must be listed.

## Todo Ledger Gate (Optional)

- If `todo-ledger.json` exists in the project root, it must validate against the TodoLedger schema.
- `todo-ledger.json` remains the canonical kanban / carryover board data when present.
- If `kanban.md` exists in the project root, it should remain a human-readable render derived from `todo-ledger.json`, not a second source of truth.
- The helper contract check expects every ledger item to appear exactly once under the mapped kanban section (`open -> Ready`, `obsolete -> Archived` when encountered).
- Canonical item `status` values should be `backlog`, `ready`, `doing`, `blocked`, `done`, or `archived`.
- Legacy values `open` and `obsolete` are tolerated for migration, but helper commands should rewrite them to canonical statuses when practical.

## Session Guide Gate (Optional)

- If `session-guide.md` exists in the project root, it should remain stable repo guidance only.
- Stable starter section order is: `Repo Purpose`, `Working Rules`, `Architecture Landmarks`, `Canonical Artifacts`, `Common Commands`, and `Known Long-Lived Risks`.
- `session-guide.md` should not store transient run progress, temporary blockers, task counts, or kanban state.
- The repository-local helper validator enforces that section contract and rejects kanban headings, kanban item bullets, and checklist/task-state markers in session-guide helper output.

## Handoff Gate (Optional)

- If `handoff-pack.json` is emitted, it must validate against the HandoffPack schema.
- Handoff output must include a recommended next action and whether kanban sync is required.

## Flags and Exceptions

- `--no-test` allows missing test evidence but reviewer must warn.
- `--loose-review` allows missing build or test evidence but reviewer must warn.
- `--decision-only` skips task execution and test evidence requirements.
