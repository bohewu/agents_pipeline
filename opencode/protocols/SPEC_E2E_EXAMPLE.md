# Spec End-to-End Example

This example shows one complete path from `/run-spec` outputs to the `task-list.json` that `/run-pipeline` would execute.

## Example Artifact Set

Reference files:

- `opencode/protocols/examples/spec-to-pipeline/problem-spec.json`
- `opencode/protocols/examples/spec-to-pipeline/dev-spec.json`
- `opencode/protocols/examples/spec-to-pipeline/dev-spec.md`
- `opencode/protocols/examples/spec-to-pipeline/plan-outline.json`
- `opencode/protocols/examples/spec-to-pipeline/task-list.json`

## Flow

### 1. `/run-spec` produces the scope boundary

- `problem-spec.json` keeps the request small and explicit.
- This is the contract that prevents planning or implementation from drifting.

### 2. `/run-spec` enriches the behavior contract

- `dev-spec.json` adds user stories, BDD scenarios, acceptance criteria, and test intent.
- `dev-spec.md` renders the same contract into something a human can review quickly.

### 3. `/run-spec` emits a planning preview

- `plan-outline.json` turns the approved spec into milestones and deliverables.
- It is useful context for `/run-pipeline`, but it never overrides the approved spec.

### 4. `/run-pipeline` atomizes the work

- `task-list.json` breaks the approved behavior into atomic implementation tasks.
- Each task keeps `trace_ids` so the reviewer can trace work back to the approved spec.

## Example Invocation

```text
/run-pipeline Implement the approved workspace invite spec. Use .pipeline-output/spec/problem-spec.json as the scope boundary and .pipeline-output/spec/dev-spec.json as the behavior and traceability contract.
```

## What To Notice In `task-list.json`

- each task is implementation-sized rather than feature-sized
- each task points back to `story-*`, `sc-*`, `ac-*`, or `tc-*`
- `definition_of_done` stays behavioral, not generic
- dependencies are small and explicit

## Practical Reading Order

1. Read `dev-spec.md` for the human review version.
2. Check `problem-spec.json` if you need the hard scope boundary.
3. Use `dev-spec.json` for structured traceability.
4. Use `plan-outline.json` to understand the milestone grouping.
5. Use `task-list.json` to see exactly what `/run-pipeline` should execute.
