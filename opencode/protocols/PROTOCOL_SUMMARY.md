# Protocol Summary (v1.0)

This is a lightweight summary intended for global instructions to reduce token usage.
Paths are relative to the config directory (for example `~/.config/opencode`).

## Core Rules

- Handoff content is a formal contract. Do not infer missing requirements.
- Scope must not expand beyond the ProblemSpec and Acceptance Criteria.
- TaskList is the single source of truth for execution scope.
- Evidence is required for implementation tasks unless explicitly skipped by flags.
- Executors must not perform work outside their assigned task.

## Outputs and Schemas

- ProblemSpec: `./protocols/schemas/problem-spec.schema.json`
- PlanOutline: `./protocols/schemas/plan-outline.schema.json`
- RepoFindings: `./protocols/schemas/repo-findings.schema.json`
- TaskList: `./protocols/schemas/task-list.schema.json`
- DispatchPlan: `./protocols/schemas/dispatch-plan.schema.json`
- ReviewReport: `./protocols/schemas/review-report.schema.json`
- TestReport: `./protocols/schemas/test-report.schema.json`
- ContextPack: `./protocols/schemas/context-pack.schema.json`
- TodoLedger (optional): `./protocols/schemas/todo-ledger.schema.json`

## Todo Ledger (Optional)

If `todo-ledger.json` exists in the project root, surface it before planning and ask whether to include, defer, or mark items obsolete.
