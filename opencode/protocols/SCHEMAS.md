# Schemas

All JSON outputs must conform to these schemas.

| Schema File | Output Type | Used By | Notes |
|------|------|------|------|
| `./protocols/schemas/problem-spec.schema.json` | ProblemSpec | specifier | Requirements only |
| `./protocols/schemas/dev-spec.schema.json` | DevSpec (optional) | specifier / orchestrator-spec / future spec-focused stage | Human-readable + pipeline-consumable development spec |
| `./protocols/schemas/plan-outline.schema.json` | PlanOutline | planner | High-level plan |
| `./protocols/schemas/repo-findings.schema.json` | RepoFindings | repo-scout | Discovery and risks |
| `./protocols/schemas/task-list.schema.json` | TaskList / DeltaTaskList | atomizer | Atomic tasks with optional `trace_ids` |
| `./protocols/schemas/dispatch-plan.schema.json` | DispatchPlan | router | Routing and batching |
| `./protocols/schemas/review-report.schema.json` | ReviewReport | reviewer | Pass or fail |
| `./protocols/schemas/test-report.schema.json` | TestReport | test-runner | Evidence and results |
| `./protocols/schemas/context-pack.schema.json` | ContextPack | compressor | Compressed context |
| `./protocols/schemas/todo-ledger.schema.json` | TodoLedger | optional | Carryover items |
| `./protocols/schemas/modernize-exec-handoff.schema.json` | ModernizeExecHandoff (optional inter-orchestrator input) | orchestrator-modernize -> orchestrator-pipeline | Phase-scoped modernization execution contract |
