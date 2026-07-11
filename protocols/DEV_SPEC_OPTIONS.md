# DevSpec Workflow Options

## Summary

- Recommended default: keep `DevSpec` inside the existing pipeline as an optional Stage 0.5 artifact.
- A thin `orchestrator-spec` is also available when you want a separate spec-first approval workflow.
- This keeps `ProblemSpec` as the minimum contract while adding a richer handoff for humans and downstream planning.

## Shared Goal

Both options should produce the same core outputs:

- `dev-spec.json` for planner, atomizer, reviewer, and test traceability
- `dev-spec.md` for human review and discussion
- Stable ids for stories, scenarios, acceptance criteria, and planned test cases
- No implementation design or solution sprawl at spec time

## Option A: Pipeline-Integrated DevSpec

### Flow

1. Stage 0: `specifier` creates `ProblemSpec`.
2. Stage 0.5: the pipeline expands `ProblemSpec` into `DevSpec` JSON.
3. Stage 0.6: `doc-writer` renders `dev-spec.md` from the same `DevSpec`.
4. Stage 1+: `planner`, `atomizer`, `router`, and `reviewer` consume `ProblemSpec` plus `DevSpec`.

### Suggested Output Paths

- `.pipeline-output/pipeline/dev-spec.json`
- `.pipeline-output/pipeline/dev-spec.md`

### Prompt Sketch

Use this when the main objective is still implementation:

```text
Expand the approved ProblemSpec into a DevSpec.
Keep scope fixed.
Do not propose implementation design.
Express behavior with user stories, BDD scenarios, acceptance criteria, and a test plan.
Use stable ids so downstream planning and review can trace every task back to the spec.
```

### Pros

- Lowest change cost; no new primary entrypoint needed.
- Keeps one source of truth for scope control.
- Easier to make planner and reviewer consume richer behavior definitions.
- Fits the current architecture, where primary agents orchestrate and subagents generate content.

### Cons

- Full pipeline prompt becomes a little more complex.
- Spec-only work is less explicit as a standalone workflow.
- Human approval before implementation is possible, but not as clean as a dedicated spec-first command.

## Option B: New `orchestrator-spec`

### Flow

1. `/run-spec` invokes `orchestrator-spec`.
2. `specifier` (or a future spec-focused subagent) produces `ProblemSpec` + `DevSpec`.
3. `doc-writer` produces `dev-spec.md`.
4. The workflow stops after spec generation and optional approval.
5. A later `/run-pipeline` run consumes the approved `DevSpec` as context.

### Suggested Output Paths

- `.pipeline-output/spec/problem-spec.json`
- `.pipeline-output/spec/dev-spec.json`
- `.pipeline-output/spec/dev-spec.md`

### Prompt Sketch

Use this when the main objective is specification and review:

```text
Produce a review-ready development spec.
Stop after the spec artifacts are complete.
Do not implement code.
Preserve strict scope boundaries.
Output a machine-readable DevSpec and a human-readable Markdown version from the same source content.
```

### Pros

- Best UX for a spec-first or approval-heavy workflow.
- Clear separation between discovery/specification and implementation.
- Easier to reuse one approved spec across multiple later runs.

### Cons

- Adds another primary agent and slash command to maintain.
- Risks duplicating Stage 0 behavior already present in the main pipeline.
- Needs a clean handoff contract so `orchestrator-pipeline` can trust externally generated specs.

## Comparison

| Area | Pipeline-Integrated | `orchestrator-spec` |
|---|---|---|
| Setup cost | Low | Medium |
| New prompt surface | Small | Larger |
| Spec-only UX | Good enough | Best |
| Scope control | Strong, single pipeline | Strong if handoff contract is strict |
| Risk of duplicated logic | Low | Higher |
| Best fit | Default feature work | Spec-first review workflows |

## Recommendation

Phase 1:

1. Keep `ProblemSpec` as the minimal stage contract.
2. Add optional `DevSpec` generation inside `orchestrator-pipeline`.
3. Teach `planner`, `atomizer`, and `reviewer` to prefer `DevSpec` when present.
4. Render `dev-spec.md` for human review.

Optional parallel path:

1. Add `orchestrator-spec` as a thin wrapper.
2. Reuse the same `DevSpec` schema and rendering rules.
3. Treat the approved `DevSpec` as an input artifact for later pipeline runs.

## Practical Rule Of Thumb

- If the user says "implement this", generate `DevSpec` inside the pipeline.
- If the user says "let's review the spec first" or needs approval before coding, use a dedicated spec workflow.
