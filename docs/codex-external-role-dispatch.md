# External managed leaf dispatch (experimental)

`tools/codex-external-role.py` lets an external orchestrator resolve a registered
Codex leaf role without an LLM call. It can execute `repo-scout`, `planner`,
and a bounded ad hoc `reviewer` as fresh, read-only `codex exec` roots. It can
also execute one atomic `executor` task with explicit write opt-in. The current
workspace must have a healthy, eligible, current OpenAI profile. The tool reads its saved role
binding and calls the existing reasoning resolver; callers do not supply a
model or effort.

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
trying an untrusted task. Each worktree needs its own profile and trust check.
`status: verified` checks execution provenance and final path scope;
`result.status` and independent tests/review determine task quality.

The dispatcher limits task and event sizes, sets a timeout, restricts the
subprocess environment, disables subagent spawning, and requests the role's
sandbox. It returns the bounded role result, runtime usage when available, and
checks from the matching single-turn session trace. `status: verified` means
the independent root used the requested model and effort and received the exact
generated role instructions. `native_managed_child: false` remains explicit;
native child role identity and selector causality are separate guarantees.

`repo-scout`, `reviewer`, and `executor` use Codex's output schema. `planner` returns its existing
PlanOutline JSON shape, checked locally because the repository schema's
optional and dynamic fields are incompatible with Codex's strict output-schema
format. Errors and resolver conflicts return JSON with exit codes 2 and 3,
respectively. A trace or executor scope mismatch returns `status: unverified`
with exit code 3. On timeout or output overflow, the dispatcher stops the
launched process group or Windows process tree and reports uncertain cleanup
if that fails. Inspect the worktree for
partial changes before retrying.

This local entry point does not change `$run-*`, workspace routing, reviewer
gates, capability recovery, or installation output. On Windows, invoke the
same Python script with the available Python 3.11+ launcher.
