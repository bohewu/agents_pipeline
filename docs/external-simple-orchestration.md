# External Simple orchestration (experimental)

An external orchestrator can own a bounded Simple task while a local Codex
installation executes only managed leaves. The orchestrator may be ChatGPT or
another agent. Its MCP/Runner must expose the same local workspace and enough
process and file operations to invoke `codex-external-role.py` from a separate
agents_pipeline support root. Merely
having an MCP connection is insufficient: a read-only or remote-only connector
cannot launch the local Codex CLI.

The existing dispatcher is a CLI, so it is independent of the MCP transport.
It resolves the saved workspace binding and reasoning policy, launches a fresh
`codex exec` root, and verifies the observed model, effort, instructions,
workspace, and completion trace. An external root is not a native Codex
managed child. The orchestrator remains responsible for task scope, independent
checks, materiality decisions, and the final answer.

Reading the installed skill and role definition supplies workflow instructions;
it does not itself apply Codex's native child selector. Use the external
dispatcher for the supported leaves so saved model/effort resolution and
trace verification remain authoritative. Apply the Simple definition's scope
and quality rules in the external orchestrator; treat its native spawn steps
as unsupported mechanics rather than imitating a native child trace.

## Current scope

This entry handles one bounded implementation with `repo-scout` for necessary
discovery, one atomic `executor`, `test-runner` for bounded routine checks,
`debugger` for admitted bounded diagnosis, and an optional ad hoc `reviewer`.
`planner` is also available for separate design work. External execution
always requests a concrete model and adaptive effort from the saved profile;
the caller does not choose either. The native Simple definition remains the
workflow reference, but this external entry does not implement every native
flag or role.

Initial `executor-strong`, `--review=max`, formal assurance, capability
recovery, and Flow/Pipeline semantics are outside this entry. Stop when a task
requires one of them or another unsupported role. Do not reclassify the task,
replace an assurance reviewer with ad hoc review, or report completion of a
formal `$run-*` workflow. A bare `$run-simple` remains the native Codex
skill entry point.

## Portable invocation prompt

Use this in a conversation that has an MCP/Runner with local process access.
Replace the path and task placeholders. The support root is either an installed
`<Codex home>/agents-pipeline` tree that contains the dispatcher, or a trusted
agents_pipeline source checkout at the intended version. Source edits do not
refresh installed support automatically; if the installed tree lacks the tool,
use a trusted source checkout or explicitly refresh the installation. The
prompt has no effect on ordinary conversations without local process access.

```text
Use external Simple for this bounded task in <target repository path>.
The agents_pipeline support root is <support root path>.

<task>

You are the orchestrator. Keep decomposition, decisions, verification, and
the final answer in this conversation. Do not start a separate coding agent
to own the whole workflow. Use the available MCP/Runner only to inspect the
workspace, run local commands, and call
<support root path>/tools/codex-external-role.py for bounded leaves. Verify
that support root contains the dispatcher and current protocol files. Do not
assume the target repository contains agents_pipeline tools or skills.

Read the target repository's AGENTS.md if present, plus
<support root path>/AGENTS.md and
<support root path>/skills/run-simple/SKILL.md. Read the effective installed
orchestrator-simple definition from the active Codex home at
<Codex home>/agents/orchestrator-simple.toml; do not treat a raw workspace
role as the effective definition. Read the applicable files under
<support root path>/protocols/, including REASONING_POLICY.md,
INITIAL_STRONG_ROUTING.md, and MATERIALITY_GATE.md when their gates apply.
Follow compatible Simple scope rules, and stop when the external dispatcher
lacks a required role, flag, assurance level, or recovery path.

Select the exact local repository and record HEAD and Git status. For an
executor, use a clean disposable worktree from an exact commit. Establish
its own workspace profile through the normal manager; verify its effective
Codex trust, health, eligibility, catalog, configuration compatibility,
roles_dir, and role bindings. Never copy source trust or edit global trust
configuration. Keep task JSON and evidence outside the repository.

Make the fewest useful in-memory work items. Resolve each supported role
with honest task intent and reasoning signals. Confirm dispatch_supported.
For a writable executor, pass a bounded task file, --allow-write, and a
fresh UUID --attempt-id. Observe the command until terminal; if transport
fails or outcome is uncertain, query the same attempt ID and inspect the
worktree before any new attempt. Accept a leaf only with status=verified
and matching observed model/effort.

Independently review the diff, scope, and focused checks. If review was
requested or the changed target is high risk, dispatch an ad hoc reviewer
with explicit targets and criteria; verify both its trace and review result.
For nontrivial verification, dispatch test-runner when its fixed routine
classification and read-only sandbox can run the check. Otherwise run the
focused check directly and record why. Use debugger only for an admitted
uncertain diagnosis under DEBUGGER_DELEGATION.md. Apply the Materiality Gate
before a repair or re-review. For an admitted same-task repair, preserve the
first attempt's diff and failure evidence, then use a fresh clean worktree at
the same baseline with the same role and acceptance criteria. Include the
prior failure and consumed budget in the narrow repair task. Use a new
attempt ID and independently recheck that worktree's profile and trust.
Stop when the one Simple repair and re-review allowance is exhausted.
Do not commit, push, or merge disposable work unless the user authorizes it.
Record runtime usage when exposed, otherwise unknown, plus elapsed time,
retries, rework, and final outcome. Do not claim token savings without a
matched comparison. Call this an external Simple result, not a formal
$run-simple run.
```

## Minimum local MCP/Runner capability

The transport must let the orchestrator:

1. Identify one exact repository and, if used, one exact disposable worktree.
   Its commands must run in that workspace with a known filesystem path.
2. Read repository files and the installed global Simple definition, including
   content rather than a filename or hash alone.
3. Execute the local profile manager, Git, tests, and dispatcher with literal
   arguments; create small task files and evidence outside the repository.
4. Observe a long command's stable execution identity through completion.
   A timeout or dropped connection is an uncertain outcome, not proof that
   the child did not start.

These are capabilities, not required MCP method names. A connector may expose
structured process calls, jobs, or an authenticated shell. The same trust,
profile, attempt-receipt, and trace checks apply regardless of transport.
Do not use an MCP coding-agent delegation call to hand off orchestration.

## Local dispatch sequence

1. Read the installed Simple definition and query
   `python3 <support root>/tools/agent-profile.py status --runtime codex
   --scope workspace --workspace <target path> --json` for the source and
   disposable target worktree independently. Pass each exact workspace path;
   running the command from the support checkout does not select the target.
   A target executor workspace must be clean, trusted, healthy, eligible,
   current, and configuration-compatible. Its `roles_dir` must be its own
   `.codex/agents`. Workspace `set` does not grant trust; linked-worktree
   trust still needs the Codex effective-configuration probe described in
   [developer install](developer-install.md).
2. Use `resolve-role` with the task's actual intent and signals. Confirm
   `dispatch_supported=true`. For reviewer resolution also pass
   `--task-intent review --dispatch-context ad-hoc-review`. The task-file
   formats and dispatch commands are in
   [external leaf dispatch](codex-external-role-dispatch.md). Invoke that
   dispatcher from the same verified support root, always with the target
   `--workspace`.
3. Dispatch the executor from a clean worktree with
   `--allow-write --attempt-id <uuid>`. Preserve that task file and ID.
   `status=verified` proves the external-root trace and Git-visible final
   path scope, not task quality, ignored-file safety, or native child identity.
   Follow the [interruption contract](codex-external-dispatch-interruption-contract.md)
   for any nonterminal or uncertain call.
4. Inspect the diff and run the smallest relevant tests independently, or use
   `test-runner` for routine read-only checks and inspect its command evidence.
   An ad hoc reviewer returns `formal_assurance=false`; its
   `status=verified` and `result.overall_status=pass` are separate checks.
5. Save evidence outside the repository. Remove only a disposable worktree
   created for this task after its diff and results have been captured.
   Preserve pre-existing, user-owned, and forensic worktrees.

A failed writable attempt may leave its worktree dirty. The dispatcher does
not launch another executor there, even for a repair. Inspect and preserve
that attempt first; a fresh clean worktree from the same baseline is the
supported repair route. Reconstructing the candidate change may cost more
than an in-place edit, but it keeps the clean-worktree and attempt-provenance
checks intact.

No run manifest, TaskList, checkpoint, status file, or new orchestration
engine is needed for this bounded entry. One tested transport used WebCodex
project selection, a managed worktree, structured process calls, and Job
observation. Other MCP/Runner transports are eligible only when they expose
the minimum capabilities above and pass the same live checks.
