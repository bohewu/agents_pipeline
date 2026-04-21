# TASK_BREAKDOWN — vNext Codex-like Implementation Order

> **Scope lock:** 本 task breakdown 只拆解 web client / local BFF / workspace-side integration 工作。  
> **OpenCode remains the execution engine**。不要在此拆出「重做 agent backend」類型任務。

## 1. 目標

本拆解把 `MILESTONES.md`、`SPEC.md`、`SDD.md` 轉成較接近實作順序的 phase/task list。

原則：

1. 先補 cross-cutting primitives
2. 先完成最小 `change -> verify -> ship`
3. 再補 async durability
4. 再補 GitHub-backed ship、context surface、browser evidence、parallel lanes

## 2. Phase 0 — Read and lock scope

1. Read `README.md`
2. Read `MILESTONES.md`
3. Read `SPEC.md`
4. Read `SDD.md`
5. Confirm implementation assumptions:
   - OpenCode stays backend
   - existing app shell/store/BFF seams are extended, not replaced
   - no second general-purpose agent runtime is introduced

Deliverable:

- short implementation note listing the chosen near-term slice and what is explicitly deferred

## 3. Phase A — Shared primitives and capability probe

### A1. Introduce minimal task identity

Add a minimal persistent model for:

- `TaskEntry`
- `ResultAnnotation`
- `CapabilityProbe`

Minimum fields:

- `taskId`
- `workspaceId`
- `sessionId`
- `sourceMessageId`
- `state`
- `latestSummary`
- optional artifact refs

### A2. Capability probe service

Implement workspace-scoped probing for:

- local git available
- `gh` available
- `gh` authenticated
- preview target available
- browser evidence available

### A3. Store/API threading

Wire the primitive types through:

- BFF state or persisted file model
- client store selectors
- normalized result annotations on assistant turns

Acceptance:

- a result can point to a stable `taskId`
- UI can differentiate unavailable capability vs generic failure

## 4. Phase B — M1a Verify Cockpit minimum

### B1. Verification command presets

Implement workspace-scoped verification presets for:

- `test`
- `build`
- `lint`

Important:

- M1 minimum should reuse existing OpenCode-centered execution where possible
- do not invent a new unconstrained command executor first

### B2. Verification run persistence

Persist:

- status
- command kind
- started/finished timestamps
- summary
- exit code
- terminal log reference

### B3. Result surfaces

Project verification state into thread/result UI:

- verification badge
- quick retry
- review / accept / recover actions

### B4. Verification panel

Add a dedicated surface for:

- latest verification runs
- summaries
- recent evidence

Acceptance:

- user can run test/build/lint from app
- assistant result can show `verified` / `partially verified` / `unverified`
- user can choose retry or recover from the same result context

## 5. Phase C — M2a Local git ship minimum

### C1. Git status surface

Add workspace-scoped git summary:

- branch
- ahead/behind
- staged/unstaged/untracked

### C2. Commit flow

Add commit action with:

- status preview
- drafted message
- failure surface for hook rejection

### C3. Push flow

Add push action with:

- upstream detection
- ahead/behind refresh
- explicit failure state

### C4. Capability-gated PR creation

If supported:

- create PR
- return PR URL

If unsupported:

- show remediation based on CapabilityProbe

Constraints:

- foreground-only
- synchronous-only
- do not imply durable background ship orchestration yet

Acceptance:

- user can complete local `status -> commit -> push`
- if `gh` is available/authenticated, user can create PR
- if not, UI explains why

## 6. Phase D — M3 Async task control minimum

### D1. Persisted task ledger

Persist task list to app state dir.

Task states:

- queued
- running
- blocked
- completed
- failed
- cancelled

### D2. Reconnect-time rehydration

On refresh/reopen:

- reload task summaries
- restore workspace/session linkage
- restore recent verification / ship references

Clarification:

- target is refresh/reconnect continuity
- not full BFF-process-restart continuity for already-running upstream work

### D3. Task UI

Add surface for:

- active tasks
- recent completed tasks
- blocked tasks
- cancel / retry / reopen

Acceptance:

- refresh does not lose task ledger
- user can reopen completed or failed task context
- task state is clearly workspace-scoped

## 7. Phase E — M2b GitHub-backed ship

### E1. Checks summary

Add:

- CI/check state summary
- failing check list

### E2. Review summary

Add:

- review comment summary
- requested changes summary

### E3. Fix handoff from ship surface

Allow user to launch a fix flow from:

- failing check
- review comment/requested changes

Acceptance:

- after PR creation, app can show checks/review summaries
- user can jump from a failing ship condition into a follow-up fix loop

## 8. Phase F — M4 Context and extension surface

### F1. Instruction visibility

Surface major instruction sources:

- `AGENTS.md`
- `.opencode`
- relevant project-local instruction files

### F2. Installed capability inventory

Inventory and label:

- plugins
- commands
- tools
- usage/effort assets
- optional skills/MCP-facing assets if cheap to surface

### F3. Remediation

For missing/degraded capability:

- explain source layer
- explain remediation

Acceptance:

- user can understand why a capability exists or is missing
- app no longer feels like a black box for advanced users

## 9. Phase G — M1b Browser evidence slice

### G1. PreviewRuntime boundary

Introduce a dedicated preview/browser evidence boundary rather than bolting it into generic verification logic.

### G2. Browser artifacts

Support:

- preview URL
- console capture
- screenshot artifacts

### G3. Browser-backed verify surface

Project browser evidence into verification results where capability is available.

Acceptance:

- browser evidence is capability-gated
- command-based verification remains usable even when browser evidence is unavailable

## 10. Phase H — M5 Parallel execution surface

### H1. Lane model

Add multi-lane task UI model tied to:

- isolated branch, or
- worktree, or
- other explicit isolated execution context

### H2. Compare-and-apply

Allow user to compare alternative results and choose one.

### H3. Verification + ship readiness per lane

Each lane should expose:

- verification summary
- ship readiness
- final selection state

Acceptance:

- user can compare at least two isolated attempts
- lane model does not replace or fork the underlying OpenCode execution engine

## 11. Suggested cuts if scope gets tight

Cut in this order:

1. screenshot-rich browser evidence
2. checks/review/autofix depth
3. context/inventory richness
4. parallel lanes

Do **not** cut these if the goal is to make the product feel complete:

1. verification minimum
2. minimal local ship
3. persisted task identity/ledger

## 12. Minimum slice that should feel meaningfully more complete

If only one compact tranche can ship, it should include:

1. Phase A shared primitives
2. Phase B verify minimum
3. Phase C local git ship minimum
4. enough of Phase D to survive refresh/reconnect

That is the smallest slice that should materially improve the product from `good coding shell` toward `codex-like complete loop`.
