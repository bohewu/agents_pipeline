# External Flow feasibility (experimental)

This is an experimental bounded external Flow bridge, not a completed external
`$run-flow` workflow. An external orchestrator can dispatch the registered
read-only `specifier`, `flow-splitter`, and `doc-writer` leaves, plus atomic
`executor` tasks and an optional ad hoc `reviewer`, through
`tools/codex-external-role.py`. The dispatcher resolves each role from the
target workspace profile and verifies the observed Codex root trace. The
orchestrator still owns requirement authority, schema validation, status,
resume decisions, separate worktrees, integration, and final acceptance.

Use the agents_pipeline support root separately from the target repository,
as described in [external Simple orchestration](external-simple-orchestration.md).
The target workspace profile does not install support tools. Keep task files,
leaf results, and experimental run status outside the repository unless the
user requested normal Flow output there.

## Portable bounded invocation prompt

Use this only with an MCP/Runner that can read the local target and support
root, run local commands, and observe a dispatch through completion. Replace
the placeholders; the support root and target workspace may be different
repositories.

```text
Run a bounded external Flow experiment for <original user request> in
<target workspace>. The agents_pipeline support root is <support root>.

You are the orchestrator. Read the target AGENTS.md, the support root's
skills/run-flow/SKILL.md and relevant protocols, and the effective installed
orchestrator-flow definition. Keep orchestration, source authority, status,
resume decisions, integration, and final acceptance in this conversation.
Do not launch a second Codex main orchestrator. Use the support root's
tools/codex-external-role.py only for bounded supported leaves.

Before leaves, record the exact HEAD and Git status; query the target profile
and trust. Emit run.started through the existing status-event.js into a new
run directory outside the repository. Dispatch specifier and flow-splitter
with their real task intents/signals, require status=verified and matching
observed model/effort, validate each result against its existing schema, and
reconcile every blocking criterion with the original user request or a
pre-existing contract. Persist accepted artifacts and stage events. Limit the
FlowTaskList to five atomic tasks and derive review mode from its risk fields.

Do not change an unsupported assigned role into executor. This entry supports
atomic executor writes, read-only doc-writer artifacts, and an optional ad hoc
reviewer; stop when a task needs peon, generalist, executor-strong, formal
assurance, capability recovery, or another unsupported native Flow control.
For each executor, create a separate clean disposable worktree at the same
baseline. Verify that worktree's own profile, effective trust, roles_dir, and
saved binding. Dispatch with --allow-write and a fresh attempt UUID. Leave
its edits in place until you independently inspect its diff and run focused
checks. Save the patch outside the repository; the orchestrator discards the
worktree only after evidence is captured. On uncertain transport, replay the
same attempt ID and inspect the workspace before any new dispatch.

Emit task and agent lifecycle status as the work occurs, with the complete
ReasoningDecision and observed trace evidence when those fields are required.
If a status event cannot be emitted accurately, report a partial external
run; do not backfill invented live events. On resume, validate the checkpoint
and saved FlowTaskList before skipping completed stages. Never repeat a
completed leaf or reset a consumed retry/recovery counter.

Integrate independent patches in a separate clean disposable worktree with
git apply --check, then run the aggregate focused tests and inspect the
combined diff. Apply the risk-derived ad hoc reviewer gate when required;
its result is not Pipeline assurance. This bounded entry has no commit,
merge, or push helper; stop and report if the task requires one. Remove only
disposable worktrees you created after saving evidence. Report any missing
native Flow role, flag, status, or interruption proof explicitly.
```

## Bounded planning calls

`specifier` accepts a task file shaped like:

```json
{
  "task_intent": "design",
  "reasoning_signals": ["fully_specified", "local_scope"],
  "request": "The original bounded user request"
}
```

After `status=verified`, save `result` and validate it against
`protocols/schemas/problem-spec.schema.json`. Reconcile each blocking
criterion with the original request or pre-existing repository contract. A
verified trace does not grant authority to a generated requirement.

`flow-splitter` then accepts:

```json
{
  "task_intent": "design",
  "reasoning_signals": ["multi_step", "local_scope"],
  "problem_spec": {
    "protocol_version": "1.1",
    "goal": "The bounded goal",
    "scope": {"in": ["One authorized item"], "out": []},
    "constraints": [],
    "acceptance_criteria": [
      {"id": "ac-one", "statement": "One verifiable result", "source": "explicit_user"}
    ],
    "assumptions": []
  },
  "flow_constraints": []
}
```

Validate its `result` against
`protocols/schemas/flow-task-list.schema.json`, then check that every task's
`trace_ids` names a sourced ProblemSpec criterion and its assigned role is
actually dispatchable. Do not rewrite an unsupported assignment to a cheaper
or currently supported role. Initial `executor-strong` is unavailable in this
entry because the dispatcher is not given the canonical attempt history and
saved binding evidence required by `INITIAL_STRONG_ROUTING.md`.

## Observed boundary

A local planning experiment on 2026-09-24 used a healthy, eligible `balanced`
workspace at commit `65b60672b2e4dd48cabb88d86dc1d9d66c02a45b`.
Both leaves returned `status=verified` with observed `gpt-6-sol / medium`.
Their ProblemSpec and FlowTaskList passed the existing JSON schemas. The
splitter chose one `doc-writer` planning task. A follow-up read-only dispatch
returned `status=verified`, `result.status=done`, and a named Markdown plan
artifact, with observed `gpt-6-sol / high`. The artifact was inspected and
saved outside the repository; no executor task was substituted and no product
implementation was dispatched. The
orchestrator sends the task id, description, primary output, Definition of
Done, and unchanged reasoning signals. It must check `status=verified`,
`result.status=done`, artifact content, and the original acceptance criteria
before recording completion. The dispatcher does not write the artifact into
the target repository.

The existing `status-event.js` accepted a separate replay of `run.started`,
Stage 1 and Stage 2 completion, and `run.resumed` using records outside the
repository. The checkpoint retained completed stages `[1, 2]` and their
flags. This smoke proves status persistence and resume projection for those
records. It does not prove that an external orchestrator skips a stage after
a real transport interruption.

For a real run, create only the output root before `run.started`; the status
runtime creates the run directory and rejects a reused or precreated run ID.
Emit `run.started` before any leaf call, then persist each stage after its
result is accepted. On resume, read the checkpoint and validated
`flow/task-list.json` before deciding which stage to skip. A `run.resumed`
event does not itself make that orchestration decision.

An approved throwaway two-task implementation exercise then started a new
external run at `af0974ed0497747c7b805fcb1f4172be20a17111`. Its
`run.started` event preceded the leaf calls. The `specifier` and
`flow-splitter` both had verified Sol/medium traces; their accepted outputs
passed the existing schemas and mapped the two sourced requests to two
independent `executor` tasks. After Stage 1, the orchestrator reloaded the
checkpoint and validated its saved ProblemSpec, emitted `run.resumed`, and
skipped a second `specifier` call. This was an intentional pause, not a
transport interruption.

Each executor used its own clean linked worktree with independently verified
profile, effective trust, role binding, and attempt receipt. Both accepted
attempts had verified Sol/medium traces and passed their scope/profile checks.
The first Task A handoff ambiguously said not to retain its throwaway change,
so the leaf restored its files before independent inspection. One corrected
handoff reran the same task and left a reviewable diff; Task B needed no retry.
The orchestrator inspected both diffs, independently ran 7 and 18 focused
tests, then applied the saved patches to a third disposable worktree. All 25
focused tests and `git diff --check` passed there. The three worktrees were
removed after their evidence was saved outside the repository; nothing was
committed, merged, or pushed from the throwaway exercise.

That run is recorded as `partial`: task and stage status was emitted, but live
`agent.started` / `agent.finished` records were not. A real transport
interruption with resume was also not exercised. The next bounded validation
should cover those two lifecycle points without creating a second
orchestration engine. Other native Flow roles and flags remain outside this
entry. Do not label this a complete external Flow workflow or claim native
`$run-flow` parity.
