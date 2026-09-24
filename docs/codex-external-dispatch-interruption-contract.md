# External executor interruption contract

Status: opt-in implementation in `codex-external-role.py`. Calls without
`--attempt-id` retain the earlier one-shot behavior. A caller that loses a
one-shot response cannot infer that no child started or wrote to the worktree.

## Scope and goal

This contract applies only to an external orchestrator using `dispatch-role`
with `--role executor --allow-write`. It aims to prevent a repeated or
overlapping call from silently launching another writer in the same Git
worktree, and to leave enough local evidence to classify an interrupted call.
It does not promise exactly-once task effects, automatic rollback, or a
verified result when the execution trace is missing.

The Phase 3A retry1 incident showed why this distinction matters: a
dirty-worktree preflight error belonged to a call that had not spawned, while
a matching Codex session had written the worktree. The trace did not identify
which outer call launched that session. Later one-shot smoke and retry2 runs
verified the normal path; they did not test loss of the dispatcher response.

## Opt-in interface

- Supply a caller-generated UUID `--attempt-id` for writable executor
  dispatch. The caller records and reuses the **same** ID when checking an
  uncertain call. `task_id` identifies the work item and is not an invocation
  ID. The dispatcher stores receipts under the OS account's profile directory
  at `.agents-pipeline/external-dispatch`, outside the repository. It resolves
  that directory from the account rather than process `HOME` or `USERPROFILE`;
  an unavailable account directory fails closed. The CLI does not accept a
  caller-selected state root.
- Keep existing calls without these options compatible. They retain today's
  failure reporting and must not claim interruption-safe replay. Read-only
  roles and their reviewer assurance boundaries are unchanged. The new
  guarantee applies only when every writable caller for that worktree uses
  the opt-in interface under the same OS account.
- Bind each attempt to the canonical worktree root, verified Git common
  directory, baseline HEAD, task-file digest, role, resolved model/effort, and
  role-instruction digest. A reused ID with different inputs is a conflict.
  A worktree path reused for a different Git repository is also a conflict.
- Include the attempt ID in the Codex prompt and returned dispatcher result so
  one matching session trace can be associated with the receipt. Multiple or
  mismatched traces never satisfy verification.

```bash
python3 tools/codex-external-role.py dispatch-role \
  --workspace /path/to/trusted-clean-worktree --role executor \
  --task-file /path/outside/repo/executor-task.json --allow-write \
  --attempt-id 00000000-0000-4000-8000-000000000001
```

## Launch and recovery rules

1. Validate the canonical workspace and look up an existing attempt before
   the clean-worktree check. A replay returns its recorded state without
   launching, even if that attempt made the worktree dirty. A new attempt
   retains the existing task/path, clean-worktree, workspace-profile, trust,
   resolver, scope, and trace checks. The mechanism cannot turn an ineligible
   or dirty workspace into a new dispatch.
2. Before `Popen`, atomically reserve the canonical worktree and persist and
   flush an attempt receipt outside it. If reservation or durable recording
   fails, do not spawn. Only one writable attempt may hold a worktree
   reservation.
3. Persist `claimed` before spawn and `started` with process identity as soon
   as `Popen` succeeds. Process ID is diagnostic evidence, not proof that the
   process is still alive or that its writes are complete. A crash between
   these writes is treated as uncertain.
4. A second call with the same attempt ID reads the existing receipt and
   result with `replayed: true`; it never starts another child. A different ID
   is rejected while that worktree has a claimed, started, uncertain, or unverified attempt. An
   elapsed timeout or missing parent process does not release the reservation.
5. Write `verified` only after the existing single-turn trace, requested
   model/effort, role instructions, profile stability, HEAD, and changed-path
   checks pass. Persist the result before returning it. A failed or incomplete
   check records `uncertain` or `unverified`, including any observed changed
   paths; it must not be presented as a preflight rejection. As today,
   `verified` proves execution provenance and scope, not task quality.
6. If the outer transport ends without JSON, the caller resubmits the same
   command and attempt ID to read the receipt. A claimed, started, corrupt,
   or missing/inconclusive record never authorizes
   an automatic retry. Preserve process/trace/Git evidence. Reconciliation
   may establish that no child remains, but a diff alone cannot promote the
   attempt to `verified`. Prefer a new clean disposable worktree for a new
   execution after an unresolved attempt.

Receipts contain bounded identifiers, digests, timestamps, state, process and
trace IDs when known, and the terminal result when available. They do not
need a prompt transcript, task contents, or a telemetry service. The state
directory must be a real local directory with restricted access; links,
reparse points, unreadable state, or unsupported atomic operations fail
closed. The implementation uses atomic exclusive file creation for the
reservation and flushes receipt files before child launch. A process-lifetime
lock alone is insufficient because its owner can exit while the Codex child
continues. On Windows, directory access follows the user's profile ACL.

The reservation coordinates callers that use this dispatcher contract. It
cannot prevent another account or an unrelated process from writing to the
worktree; the existing Git and trace checks remain necessary, and unexplained
changes stay unverified. These checks do not prove sole authorship of every
changed byte. A replayed verified result describes the recorded
attempt, not the worktree's current state.

## Verification scope

Focused tests cover concurrent calls, replay, unresolved reservations, a killed
dispatcher after a started receipt, corrupt/missing receipts, binding drift,
trace marker matching, and the existing no-option/read-only behavior. The
killed-dispatcher test uses a controlled stand-in for Codex; it does not prove
Codex process-tree behavior. Run the focused suite on a native Windows runner
before claiming Windows runtime verification. A live Codex opt-in smoke is a
separate experiment and should use a new disposable worktree.

This contract does not authorize automatic repair, retry, Phase 3A resumption,
forensic-slot modification, routing changes, or a daemon.
