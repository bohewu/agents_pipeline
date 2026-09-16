# Initial Strong Executor Routing

This protocol governs automatic selection of `executor-strong` for an initial
implementation attempt. It is role selection inside the existing routing
workflow. It is not capability recovery, does not choose a raw model, and does
not control the current/main agent.

## Authoritative inputs

The routing handoff must carry the actual current-workspace profile status and
resolved role configurations produced by the installed profile manager. It
must also carry the task's canonical execution records: persisted TaskStatus
and every started or terminal AgentStatus record when they exist, plus the orchestrator-owned
in-memory dispatch record for work that has not yet been persisted. Forward
those records to `flow-splitter` or `router` as handoff context outside their
JSON output artifacts. Do not replace them with caller-supplied booleans such
as `is_first_attempt`, `use_strong`, or `history_is_empty`.

Missing, stale, unhealthy, ineligible, or otherwise unverified profile or
history context is insufficient for automatic strong selection. In that case,
retain the workflow's existing `executor` or `generalist` choice and its full
reasoning classification. If the user explicitly requires strong execution,
surface the unavailable or conflicting binding instead of silently routing to
a weaker role.

## Automatic admission

Select `executor-strong` automatically only when every condition below is
proved:

1. The user has not explicitly selected the ordinary executor path, Sol, or
   another compatible role/model constraint. Explicit user choices take
   precedence over this automatic route; preserve existing incompatibility and
   conflict handling rather than silently overriding them.
2. The work is an implementation task: `task_intent = execute` and the primary
   output includes implementation. Inspection, diagnosis, design,
   documentation, review, certification, tests-only work, and mixed non-coding
   work retain their existing roles.
3. Current-workspace status is verified, `health = ok`,
   `profile_eligibility = eligible`, `catalog_state = current`, and the named
   profile is `balanced` or `premium` under the installed LSA configuration.
4. The saved configuration contains an exact `executor-strong` role binding
   with `model_tier = strong`, workspace-profile provenance, and the same saved
   model-set mapping and reasoning-projection identities as the run.
5. Canonical and orchestrator-owned execution records prove that no
   implementation attempt has started for this task identity. A started or
   terminal `executor`, `generalist`, or `executor-strong` record attached to
   the same task is prior implementation history. Scout, routing, analysis,
   test, review, or diagnosis-only helper records do not become implementation
   attempts.
6. The task's resolved reasoning class is `deep`, and its existing bounded
   reasoning signals contain concrete evidence of genuinely difficult
   implementation. At least one evidenced signal must be one of
   `cross_system`, `architectural_tradeoff`, `architecture_tradeoff`,
   `non_local_invariant`, `adversarial_input`, `numerical_sensitivity`,
   `security_boundary`, `data_integrity`, `concurrency_or_ordering`, or
   `migration_compatibility`. The handoff must briefly tie that signal to the
   actual invariant, boundary, tradeoff, or failure risk in the task.

Task size, `multi_file`, `cross_module`, a high-risk label, or a `deep` label
alone is insufficient. Do not manufacture another signal or lower the task's
reasoning class to make a role fit. A frugal profile, another model set or
projection, an inherited or uniform profile, an ordinary task, or insufficient
difficulty evidence retains existing automatic routing.

## Pre-spawn and retry invariants

The current/main orchestrator owns the final decision. Immediately before the
spawn it must requery current-workspace status, compare the exact saved
`executor-strong` binding and configuration identities, and reread canonical
task/agent history plus its in-memory dispatch record. A mismatch or newly
observed implementation attempt cancels automatic strong admission. Do not
trust the earlier routing recommendation as authorization.

An admitted initial `executor-strong` spawn consumes the workflow's normal
initial execution attempt. It does not set recovery provenance, consume a
capability-recovery uplift, increment a retry or repair counter, reset a
budget, or receive a native-strong model uplift. Resolve its effort through the
existing reasoning resolver and let the saved profile binding select its model;
never pass a raw model for this path.

After any implementation attempt starts, preserve task and role identity. A
failed `executor` or `generalist` attempt cannot switch to `executor-strong` and
claim a fresh initial attempt. A task that began with `executor-strong` retains
that role on every permitted same-task repair or redispatch. Existing model
capability recovery remains limited to `executor` and `generalist`; this
protocol does not make `executor-strong` recovery-eligible or alter debugger
admission, hard stops, review gates, task caps, failure history, or accounting.
