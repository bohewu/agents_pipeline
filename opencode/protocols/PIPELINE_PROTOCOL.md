# Pipeline Protocol (v1.0)

This document defines the canonical inputs, outputs, and rules for the multi-agent pipeline.
All JSON outputs MUST conform to the schemas in `./protocols/schemas/` (relative to the config directory).

## Global Rules

- Handoff content is a formal contract. Do not infer missing requirements.
- Scope must not expand beyond the ProblemSpec and Acceptance Criteria.
- Evidence is required for implementation tasks unless explicitly skipped by flags.
- TaskList is the single source of truth for execution scope.
- Executors must not perform work outside their assigned task.

## Optional Input: Todo Ledger

If `todo-ledger.json` exists in the project root, the orchestrator should surface it
before planning so the user can decide to include, defer, or mark items obsolete.
The ledger must conform to `./protocols/schemas/todo-ledger.schema.json`.

## Stage Contracts

**Stage 0: Specifier**
Agent: `specifier`
Input: User task prompt
Output: `ProblemSpec` JSON
Schema: `./protocols/schemas/problem-spec.schema.json`

**Stage 1: Planner**
Agent: `planner`
Input: ProblemSpec
Output: `PlanOutline` JSON
Schema: `./protocols/schemas/plan-outline.schema.json`

**Stage 2: Repo Scout**
Agent: `repo-scout`
Input: Repo context
Output: `RepoFindings` JSON
Schema: `./protocols/schemas/repo-findings.schema.json`

**Stage 3: Atomizer**
Agent: `atomizer`
Input: PlanOutline, optional RepoFindings
Output: `TaskList` JSON
Schema: `./protocols/schemas/task-list.schema.json`

**Stage 4: Router**
Agent: `router`
Input: TaskList
Output: `DispatchPlan` JSON
Schema: `./protocols/schemas/dispatch-plan.schema.json`

**Stage 5: Executors**
Agent: `executor-*`
Input: Atomic task
Output: Task result JSON plus required artifact blocks when applicable

**Stage 6: Reviewer**
Agent: `reviewer`
Input: TaskList, executor outputs, optional test evidence
Output: `ReviewReport` JSON
Schema: `./protocols/schemas/review-report.schema.json`

**Stage 7: Test Runner**
Agent: `test-runner`
Input: Task scope
Output: `TestReport` JSON
Schema: `./protocols/schemas/test-report.schema.json`

**Stage 8: Compressor**
Agent: `compressor`
Input: Repo findings and outcomes
Output: `ContextPack` JSON
Schema: `./protocols/schemas/context-pack.schema.json`

**Stage 9: Summarizer**
Agent: `summarizer`
Input: Final outcomes and reviewer status
Output: User-facing summary text

## Artifact Rules

- If a task primary_output is `design`, `plan`, `spec`, `checklist`, `notes`, or `analysis`, the executor MUST emit an artifact block.
- Artifact format is fixed:

```text
=== ARTIFACT: <filename> ===
<content>
=== END ARTIFACT ===
```

- Filename MUST include the task_id.

## Protocol Versioning

Each JSON output MAY include `protocol_version`. When present, it MUST follow `major.minor` format, for example `1.0`.

## Validation Gates

All gates and failure conditions are defined in `./protocols/VALIDATION.md`.
