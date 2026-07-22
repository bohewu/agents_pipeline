# Schemas

All JSON outputs must conform to these schemas.

| Schema File | Output Type | Used By | Notes |
|------|------|------|------|
| `./protocols/schemas/problem-spec.schema.json` | ProblemSpec | specifier | Requirements only |
| `./protocols/schemas/flow-task-list.schema.json` | FlowTaskList | flow-splitter / orchestrator-flow | Max-5 bounded Flow tasks with additive intent metadata; `repair_budget` is `0..2` additional in-task correction cycles |
| `./protocols/schemas/dev-spec.schema.json` | DevSpec (optional) | specifier / orchestrator-spec / future spec-focused stage | Human-readable + pipeline-consumable development spec |
| `./protocols/schemas/ui-ux-bundle.schema.json` | UiUxBundle (optional conceptual artifact) | `ui-ux-workflow` / `ui-ux-designer` / doc-writer | Versioned conceptual UI/UX bundle; JSON is canonical when paired Markdown exists, with optional additive fields for communication-first redesign framing |
| `./protocols/schemas/plan-outline.schema.json` | PlanOutline | planner | High-level plan |
| `./protocols/schemas/repo-findings.schema.json` | RepoFindings | repo-scout | Discovery and risks |
| `./protocols/schemas/task-list.schema.json` | TaskList / DeltaTaskList | atomizer | Atomic tasks with additive, backward-compatible intent metadata, legacy-compatible class/signals, and optional `trace_ids` |
| `./protocols/schemas/dispatch-plan.schema.json` | DispatchPlan | router | Routing, batching, resource metadata, and aggregated additive intent/class/signal metadata |
| `./protocols/schemas/reasoning-policy.schema.json` | ReasoningPolicy | reasoning resolver | Policy v2/schema 2.0 role/context bounds, selected-tier capability floors, and the deterministic child-effort matrix |
| `./protocols/schemas/reasoning-decision.schema.json` | ReasoningDecision | reasoning resolver / orchestrators | Schema-2.0 bounded policy-v2 per-spawn decision, including intent/source and selected-tier metadata; no prompt or source content |
| `./protocols/schemas/reasoning-task-hints.schema.json` | ReasoningTaskHints | TaskList / FlowTaskList / DispatchPlan / TaskStatus / ReasoningDecision / ReasoningObservation | Shared intent-baseline and signal-to-minimum-class consistency rules; legacy fields remain optional for compatibility |
| `./protocols/schemas/reasoning-observation.schema.json` | ReasoningObservation | runtime-neutral status writer | Schema-2.0 local-only terminal attempt metadata with a free-text-free decision summary under `<run_output_dir>/observations/reasoning/` |
| `./protocols/schemas/codex-child-trace.schema.json` | CodexChildTrace | local Codex trace verifier | Schema-1.2 ephemeral child model/role/effort checks and parent-at-spawn effort comparison; only an exactly matched expected model may be emitted, never an unsolicited raw model; never persisted as a ReasoningObservation |
| `./protocols/schemas/run-status.schema.json` | RunStatus | the runtime-neutral status writer / status writers | Required top-level status index at `<run_output_dir>/status/run-status.json` |
| `./protocols/schemas/task-status.schema.json` | TaskStatus | the runtime-neutral status writer / orchestrators / executors | Optional expanded status-protocol-1.0 record with additive intent metadata at `<run_output_dir>/status/tasks/<task_id>.json` |
| `./protocols/schemas/agent-status.schema.json` | AgentStatus | the runtime-neutral status writer / executors | Optional expanded executor/resource record at `<run_output_dir>/status/agents/<agent_id>.json` |
| `./protocols/schemas/review-report.schema.json` | ReviewReport | reviewer | Pass or fail |
| `./protocols/schemas/test-report.schema.json` | TestReport | test-runner | Evidence and results |
| `./protocols/schemas/context-pack.schema.json` | ContextPack | compressor | Compressed context |
| `./protocols/schemas/todo-ledger.schema.json` | TodoLedger | optional | Carryover items |
| `./protocols/schemas/handoff-pack.schema.json` | HandoffPack | handoff-writer | Cross-session continuation pack |
| `./protocols/schemas/modernize-exec-handoff.schema.json` | ModernizeExecHandoff (optional workflow-transition input) | current/main agent: Modernize -> Pipeline | Phase-scoped modernization execution contract; no primary-agent nesting |

## Status schema fixtures

- Positive run-only layout: `./protocols/examples/status-layout.run-only.valid/run-status.json`
- Positive expanded layout: `./protocols/examples/status-layout.expanded.valid/`
  - `run-status.json`
  - `tasks/*.json`
  - `agents/*.json`
- Negative contract fixture set: `./protocols/examples/status-layout.contract.invalid/`

Repository validation and CI must validate the positive fixtures against the matching status schemas and must confirm the negative fixture files fail for the intended contract violations.

## Reasoning contract fixtures

- Policy: `./protocols/reasoning-policy.json`
- Positive decision: `./protocols/examples/reasoning-decision.valid.json`
- Positive degraded-deep decision: `./protocols/examples/reasoning-decision.degraded-deep.valid.json`
- Positive overprovisioned decision: `./protocols/examples/reasoning-decision.overprovisioned.valid.json`
- Positive observed-ceiling conflict: `./protocols/examples/reasoning-decision.observed-ceiling-conflict.valid.json`
- Positive local observation: `./protocols/examples/reasoning-observation.valid.json`
- Positive overprovisioned local observation: `./protocols/examples/reasoning-observation.overprovisioned.valid.json`
- Negative selector/class decisions: `./protocols/examples/reasoning-decision.selector-unavailable-enforced.invalid.json` and `./protocols/examples/reasoning-decision.requested-assurance-downgraded.invalid.json`
- Negative selector-conflict records: `./protocols/examples/reasoning-decision.selector-conflict-effective.invalid.json`, `./protocols/examples/reasoning-observation.selector-conflict-effective.invalid.json`, and `./protocols/examples/agent-status.reasoning-selector-conflict-effective.invalid.json`
- Negative explicit/provenance/conflict decisions: `./protocols/examples/reasoning-decision.explicit-xhigh-downgraded.invalid.json`, `./protocols/examples/reasoning-decision.legacy-explicit-missing-request.invalid.json`, `./protocols/examples/reasoning-decision.legacy-target-underclass.invalid.json`, `./protocols/examples/reasoning-decision.formal-context-relabeled-conflict.invalid.json`, and `./protocols/examples/reasoning-decision.recovery-conflict-under-effort.invalid.json`
- Negative legacy null-class records: `./protocols/examples/reasoning-decision.legacy-adaptive-null-class.invalid.json`, `./protocols/examples/reasoning-observation.legacy-adaptive-null-class.invalid.json`, and `./protocols/examples/agent-status.reasoning-legacy-adaptive-null-class.invalid.json`
- Negative context/identity records: `./protocols/examples/reasoning-decision.custom-context.invalid.json`, `./protocols/examples/reasoning-observation.custom-context.invalid.json`, `./protocols/examples/agent-status.reasoning-custom-context.invalid.json`, `./protocols/examples/reasoning-observation.pipeline-context-forged.invalid.json`, `./protocols/examples/agent-status.reasoning-role-mismatch.invalid.json`, and `./protocols/examples/agent-status.reasoning-unlisted-role.invalid.json`
- Negative conflict-representation records: `./protocols/examples/reasoning-decision.conflict-reason-mismatch.invalid.json` and `./protocols/examples/agent-status.reasoning-conflict-reason-mismatch.invalid.json`
- Negative underprovisioning relabels: `./protocols/examples/reasoning-decision.underprovisioned-degraded.invalid.json` and `./protocols/examples/reasoning-observation.underprovisioned-degraded.invalid.json`

Current task-producing artifacts emit `task_intent`, `intent_baseline_class`,
and `classification_source` beside the legacy-compatible `reasoning_class` /
`reasoning_signals` pair as backward-compatible optional extensions. They do
not change the TaskList, FlowTaskList, DispatchPlan, TaskStatus, or checkpoint
`protocol_version`; the status runtime remains `PROTOCOL_VERSION = 1.0`.
ReasoningPolicy, ReasoningDecision, and ReasoningObservation are the separate
policy/schema-2.0 contracts. The resolver uses the selected role tier only to
validate capability and choose child effort; schemas never carry a raw
model-routing instruction.

Intent-bearing records use the policy-v2 signal floors. Intent-less legacy
records preserve the v1 `cross_module -> deliberative` floor, while every
current producer is still required to emit intent metadata. Version-2 decision
and observation schemas additionally reject incoherent enforcement evidence,
forged assurance, invalid degradation claims, and mode/state combinations that
could not be emitted by the shared resolver. They derive the minimum model tier
and requested-effort floor from the class/tier table, require exact
requested/dispatch/effective equality for `enforced`, and keep runtime or model
capability fallbacks explicitly degraded even when their observed fallback
effort matches. Managed role-policy snapshots and review contexts are bound to
their declared identities, requested/override classes cannot be lowered, and
an unavailable selector cannot coexist with dispatch or effective-effort
evidence even on conflicts. Every explicit effort is an exact upward floor;
legacy explicit-class and role-target provenance must retain the corresponding
requested class or canonical role target. AgentStatus additionally binds every
managed reasoning role to its `agent` field and rejects unlisted reasoning
roles. Unlisted roles may use the default policy for in-memory Decision and
content-free Observation records, but must be registered before AgentStatus
persistence. Policy-v2 dispatch contexts are limited to the three canonical
values; schema-v1 shadow/adaptive records retain their historical non-null
`effective_class` requirement.
Policy-v2 conflict records use `conflict = "conflict"` as a fixed state token
and store the only explanatory text in `conflict_reason`, making schema and
runtime validation equivalent without duplicating free text.

## UI/UX contract fixture

- Positive conceptual artifact fixture: `./protocols/examples/ui-ux-bundle.valid.json`
- This fixture is a reference example for the `UiUxBundle` schema and the paired Markdown-first workflow described in `./protocols/UI_UX_WORKFLOW.md`.
