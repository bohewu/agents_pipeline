# External managed leaf dispatch (experimental)

For a bounded externally orchestrated Simple task using these leaves, see
[External Simple orchestration](external-simple-orchestration.md). That entry is
distinct from the native `$run-simple` workflow.

`tools/codex-external-role.py` lets an external orchestrator resolve a registered
Codex leaf role without an LLM call. It can execute `repo-scout`, `planner`,
`specifier`, `flow-splitter`, `doc-writer`, `test-runner`, `debugger`, and a bounded ad hoc `reviewer` as fresh, read-only
`codex exec` roots. It can also execute one atomic `executor` task with explicit
write opt-in. The current
workspace must have a healthy, eligible, current OpenAI profile. The tool reads its saved role
binding and calls the existing reasoning resolver; callers do not supply a
model or effort.
For a target repository other than agents_pipeline, invoke the script from the
installed support tree if it contains this version, or from a trusted
agents_pipeline source checkout. Always pass the target repository via
`--workspace`; its workspace profile does not copy this script into the target.

```bash
python3 tools/codex-external-role.py resolve-role \
  --workspace . --role planner --task-intent design \
  --signal fully_specified --signal local_scope
```

`resolve-role` accepts any installed canonical role with `kind: subagent` and
reports `dispatch_supported` separately. Primary orchestrator roles are
rejected. `enforcement_status: requested` is a routing request, not observed
execution.

For a dispatch, save a UTF-8 JSON task file outside the repository and pass its
path. A repo-scout task contains `task` and `reasoning_signals`; its intent is
`inspect`. A planner task contains `problem_spec`, `reasoning_signals`, and
`task_intent: design`. `problem_spec` follows
[`problem-spec.schema.json`](../protocols/schemas/problem-spec.schema.json).
A reviewer task uses `task_intent: review`, `review_kind: ad_hoc`, explicit
repo-relative file `targets`, `criteria`, and `reasoning_signals`. Targets must
be existing regular files within the workspace, without symlink traversal.
For `test-runner`, supply `task_intent: inspect`, `reasoning_signals`, and one
to four focused `checks` commands. It is fixed to routine reasoning and the
read-only sandbox; a check that requires repository writes may fail and should
be run independently by the orchestrator under the task's normal validation
rules. For `debugger`, supply `task_intent: diagnose`, `reasoning_signals`, a
bounded `question`, one to eight evidence strings, and one to twelve existing
repo-relative file `targets`. Its diagnosis is read-only and cannot admit a
repair or restart a stopped task.
For a Flow planning-stage experiment, `specifier` accepts `task_intent: design`,
`reasoning_signals`, and the original bounded `request`. `flow-splitter`
accepts design intent, signals, a source-aware ProblemSpec 1.1 object, and up to
eight `flow_constraints` strings. Its output is limited to five tasks and
cannot select `executor-strong` without the required first-attempt evidence.
These leaf results must still pass the existing ProblemSpec and FlowTaskList
schema validators before any status registration or task dispatch. See
[external Flow feasibility](external-flow-planning-feasibility.md).
For a Flow documentation task, `doc-writer` accepts design intent, signals, a
bounded `task_id` and `task`, `primary_output` (`design`, `plan`, `spec`,
`checklist`, or `analysis`), and one to eight `acceptance_criteria`. It runs
read-only. A completed result must contain the role's named Markdown artifact;
for this Flow entry its filename must follow `<task_id>-<short-name>.md`.
The dispatcher returns its filename and content inside `result.artifact` for
the external orchestrator to inspect and persist outside the repository.
The dispatcher's verified status attests the selected role, model, effort, and
trace, not the truth of a helper's reported check or diagnosis. Inspect the
reported commands and evidence; rerun an important check independently.

```json
{
  "task_intent": "design",
  "reasoning_signals": ["fully_specified", "local_scope"],
  "problem_spec": {
    "goal": "Plan a bounded change",
    "scope": {"in": ["The requested change"], "out": []},
    "constraints": [],
    "acceptance_criteria": [],
    "assumptions": []
  }
}
```

```bash
python3 tools/codex-external-role.py dispatch-role \
  --workspace . --role planner --task-file /tmp/planner-task.json
```

For a bounded ad hoc review, use a separate task file:

```json
{
  "task_intent": "review",
  "review_kind": "ad_hoc",
  "reasoning_signals": ["local_scope"],
  "targets": ["tools/codex-external-role.py"],
  "criteria": ["Check the explicit target for concrete correctness and compatibility defects"]
}
```

```bash
python3 tools/codex-external-role.py dispatch-role \
  --workspace . --role reviewer --task-file /tmp/reviewer-task.json
```

Read-only Simple helpers use the same dispatch command with their role and
task file, without `--allow-write`:

```json
{
  "task_intent": "inspect",
  "reasoning_signals": ["fully_specified", "local_scope"],
  "checks": ["python3 -B -m unittest tests.test_example -q"]
}
```

```json
{
  "task_intent": "diagnose",
  "reasoning_signals": ["ambiguous_root_cause"],
  "question": "Explain the observed failed check without modifying files",
  "evidence": ["Focused test exits 1 with an assertion mismatch"],
  "targets": ["scripts/example.py", "tests/test_example.py"]
}
```

Reviewer resolution uses the existing `ad-hoc-review` context. The wrapper
accepts only a deep, ordinary review result and returns `review_kind: ad_hoc`
and `formal_assurance: false`. A verified dispatch means the runtime evidence
matched the requested role instructions, model, and effort; it does not mean
the review passed. Check `result.overall_status` separately. Pipeline review
and formal assurance remain on their existing managed reviewer paths.

For an atomic implementation task, use a clean Git worktree and a task file
with one task ID, explicit writable paths, acceptance criteria, and focused
verification commands. Existing files and new files whose parent directory
already exists are accepted. Paths are relative to the worktree root and may
not traverse symlinks.

```json
{
  "task_id": "example-1",
  "task_intent": "execute",
  "reasoning_signals": ["local_scope", "implementation_choice"],
  "task": "Make one bounded change and do not commit",
  "allowed_paths": ["scripts/example.py", "tests/test_example.py"],
  "acceptance_criteria": ["The requested behavior works", "Focused tests pass"],
  "verification": ["python3 -m unittest tests.test_example -q"]
}
```

```bash
python3 tools/codex-external-role.py dispatch-role \
  --workspace /path/to/trusted-clean-worktree --role executor \
  --task-file /tmp/executor-task.json --allow-write
```

The `executor` uses the saved role binding and reasoning resolver, requests a
`workspace-write` sandbox, and checks that HEAD stayed fixed, the generated
profile remains stable, and final Git-visible changes contain only
`allowed_paths`. Git and Codex metadata cannot be listed as writable paths.
A scope or profile violation returns `unverified` and the changed paths for
inspection; the dispatcher does not discard those edits. The path list guides
the worker and checks its final Git changes, including untracked files but not
ignored files; it is not a filesystem sandbox limited to those files. Use a disposable worktree when
trying an untrusted task. Each worktree needs its own profile and effective-trust check.
For a linked worktree, Codex may resolve trust through its verified main Git checkout rather than
an entry for the worktree path. The profile manager accepts that only when Codex `config/read`
confirms the worktree's own `.codex` layer is enabled; it does not copy the source profile or grant
trust. If the Codex probe is unavailable or inconclusive, dispatch remains blocked.
`status: verified` checks execution provenance and final path scope;
`result.status` and independent tests/review determine task quality.

The dispatcher limits task and event sizes, sets a timeout, restricts the
subprocess environment, disables subagent spawning, and requests the role's
sandbox. It returns the bounded role result, runtime usage when available, and
checks from the matching single-turn session trace. `status: verified` means
the independent root used the requested model and effort and received the exact
generated role instructions. `native_managed_child: false` remains explicit;
native child role identity and selector causality are separate guarantees.

`repo-scout`, `reviewer`, `test-runner`, `debugger`, and `executor` use Codex's output schema. `planner` returns its existing
PlanOutline JSON shape, checked locally because the repository schema's
optional and dynamic fields are incompatible with Codex's strict output-schema
format. Errors and resolver conflicts return JSON with exit codes 2 and 3,
respectively. A trace or executor scope mismatch returns `status: unverified`
with exit code 3. On timeout or output overflow, the dispatcher stops the
launched process group or Windows process tree and reports uncertain cleanup
if that fails. Inspect the worktree for
partial changes before retrying.

Executor responses include `execution_started: no|yes|unknown` and
`outcome_uncertain`. A dirty-worktree preflight error means this invocation did
not start a child, but existing edits may belong to another or interrupted
invocation, so their provenance is uncertain. An error after launch can leave
partial edits even without `status: verified`; inspect the worktree and session
trace before retrying. If the dispatcher process or its transport ends before
returning JSON, no response can certify whether its child started or wrote.
Writable executor calls can opt in to the
[interruption contract](codex-external-dispatch-interruption-contract.md) with
`--attempt-id <uuid>`. The dispatcher stores a durable receipt and reserves the
worktree before launching Codex. Reusing the same ID reads the recorded state
without another launch, including when the first attempt dirtied the worktree.
Unresolved attempts retain the reservation; use a new clean worktree after
investigating an uncertain result. Calls without `--attempt-id` keep the
one-shot behavior described above.

This local entry point does not change `$run-*`, workspace routing, reviewer
gates, capability recovery, or installation output. On Windows, invoke the
same Python script with the available Python 3.11+ launcher.
