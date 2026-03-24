# Schemas

All JSON outputs must conform to these schemas.

| Schema File | Output Type | Used By | Notes |
|------|------|------|------|
| `./protocols/schemas/problem-spec.schema.json` | ProblemSpec | specifier | Requirements only |
| `./protocols/schemas/dev-spec.schema.json` | DevSpec (optional) | specifier / orchestrator-spec / future spec-focused stage | Human-readable + pipeline-consumable development spec |
| `./protocols/schemas/plan-outline.schema.json` | PlanOutline | planner | High-level plan |
| `./protocols/schemas/repo-findings.schema.json` | RepoFindings | repo-scout | Discovery and risks |
| `./protocols/schemas/task-list.schema.json` | TaskList / DeltaTaskList | atomizer | Atomic tasks with optional `trace_ids` |
| `./protocols/schemas/dispatch-plan.schema.json` | DispatchPlan | router | Routing, batching, and required batch resource metadata (`resource_class`, `max_parallelism`, `teardown_required`) |
| `./protocols/schemas/run-status.schema.json` | RunStatus | runtime/plugin / status writers | Required top-level status index at `<run_output_dir>/status/run-status.json` |
| `./protocols/schemas/task-status.schema.json` | TaskStatus | runtime/plugin / orchestrators / executors | Optional expanded status record at `<run_output_dir>/status/tasks/<task_id>.json` |
| `./protocols/schemas/agent-status.schema.json` | AgentStatus | runtime/plugin / executors | Optional expanded executor/resource record at `<run_output_dir>/status/agents/<agent_id>.json` |
| `./protocols/schemas/review-report.schema.json` | ReviewReport | reviewer | Pass or fail |
| `./protocols/schemas/test-report.schema.json` | TestReport | test-runner | Evidence and results |
| `./protocols/schemas/context-pack.schema.json` | ContextPack | compressor | Compressed context |
| `./protocols/schemas/todo-ledger.schema.json` | TodoLedger | optional | Carryover items |
| `./protocols/schemas/modernize-exec-handoff.schema.json` | ModernizeExecHandoff (optional inter-orchestrator input) | orchestrator-modernize -> orchestrator-pipeline | Phase-scoped modernization execution contract |

## Status schema fixtures

- Positive run-only layout: `./protocols/examples/status-layout.run-only.valid/run-status.json`
- Positive expanded layout: `./protocols/examples/status-layout.expanded.valid/`
  - `run-status.json`
  - `tasks/*.json`
  - `agents/*.json`
- Negative contract fixture set: `./protocols/examples/status-layout.contract.invalid/`

Repository validation and CI must validate the positive fixtures against the matching status schemas and must confirm the negative fixture files fail for the intended contract violations.
