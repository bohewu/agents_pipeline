# Schemas

All JSON outputs must conform to these schemas.

| Schema File | Output Type | Used By | Notes |
|------|------|------|------|
| `./protocols/schemas/problem-spec.schema.json` | ProblemSpec | specifier | Requirements only |
| `./protocols/schemas/flow-task-list.schema.json` | FlowTaskList | flow-splitter / orchestrator-flow | Max-5 bounded Flow tasks; `repair_budget` is `0..2` additional in-task correction cycles |
| `./protocols/schemas/dev-spec.schema.json` | DevSpec (optional) | specifier / orchestrator-spec / future spec-focused stage | Human-readable + pipeline-consumable development spec |
| `./protocols/schemas/ui-ux-bundle.schema.json` | UiUxBundle (optional conceptual artifact) | `ui-ux-workflow` / `ui-ux-designer` / doc-writer | Versioned conceptual UI/UX bundle; JSON is canonical when paired Markdown exists, with optional additive fields for communication-first redesign framing |
| `./protocols/schemas/plan-outline.schema.json` | PlanOutline | planner | High-level plan |
| `./protocols/schemas/repo-findings.schema.json` | RepoFindings | repo-scout | Discovery and risks |
| `./protocols/schemas/task-list.schema.json` | TaskList / DeltaTaskList | atomizer | Atomic tasks with optional `trace_ids` and paired reasoning class/signals |
| `./protocols/schemas/dispatch-plan.schema.json` | DispatchPlan | router | Routing, batching, required resource metadata, and optional aggregated reasoning class/signals |
| `./protocols/schemas/reasoning-policy.schema.json` | ReasoningPolicy | reasoning resolver | Versioned role/context bounds, model-tier floors, and deterministic projection matrix |
| `./protocols/schemas/reasoning-decision.schema.json` | ReasoningDecision | reasoning resolver / orchestrators | Complete bounded per-spawn decision; no prompt or source content |
| `./protocols/schemas/reasoning-task-hints.schema.json` | ReasoningTaskHints | TaskList / FlowTaskList / DispatchPlan / TaskStatus / ReasoningDecision / ReasoningObservation | Shared signal-to-minimum-class consistency rules for task and effective classes |
| `./protocols/schemas/reasoning-observation.schema.json` | ReasoningObservation | runtime-neutral status writer | Local-only terminal attempt metadata with a free-text-free decision summary under `<run_output_dir>/observations/reasoning/` |
| `./protocols/schemas/run-status.schema.json` | RunStatus | the runtime-neutral status writer / status writers | Required top-level status index at `<run_output_dir>/status/run-status.json` |
| `./protocols/schemas/task-status.schema.json` | TaskStatus | the runtime-neutral status writer / orchestrators / executors | Optional expanded status record at `<run_output_dir>/status/tasks/<task_id>.json` |
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
- Positive local observation: `./protocols/examples/reasoning-observation.valid.json`

## UI/UX contract fixture

- Positive conceptual artifact fixture: `./protocols/examples/ui-ux-bundle.valid.json`
- This fixture is a reference example for the `UiUxBundle` schema and the paired Markdown-first workflow described in `./protocols/UI_UX_WORKFLOW.md`.
