# Bounded Debugger Delegation

This contract applies when Simple, Flow, Pipeline, General, or the selected
Adaptive route uses the registered `debugger` role. It adds a diagnostic helper
to the existing workflow; it does not add a retry, repair, recovery, or
validation lane.

## Admission boundary

The current orchestrator may perform quick triage: preserve the reported
failure signature and history, collect the immediately available logs and
locations, classify product versus harness versus operational failure, and use
direct structural lookup to identify the affected symbols. A CodeGraph lookup
or another direct repository read is ordinary triage and does not by itself
justify a debugger dispatch.

Keep a clear, localized same-task defect with the original executor under that
task's existing repair and verification bounds. Keep a known harness or
operational failure in the bounded handling defined by
`protocols/MATERIALITY_GATE.md`; do not dispatch a debugger merely to make such
a failure receive stronger diagnosis.

Delegate to `debugger` before the orchestrator performs a broad causal
investigation when any of these applies after quick triage:

- the root cause remains materially uncertain, including within one module;
- evidence crosses module or system boundaries;
- a non-local invariant may be involved;
- logs, tests, runtime behavior, or earlier attempts conflict;
- bounded root-cause diagnosis is itself an explicit user deliverable.

For a diagnosis prompted by a failed implementation or check, first apply the
Materiality Gate and identify the unmet original requirement, evidence, and
impact. Do not dispatch after an applicable repair, retry, recovery, no-progress,
repeated-signature, or hard-stop limit is exhausted. A debugger result cannot
restart a stopped task or make a new strategy, retry, or model-uplift
opportunity.

## Authority and handoff

Higher-priority authorization for child dispatch still applies. The
orchestrator retains scope, admission, acceptance, repair, retry, recovery, and
stop decisions. The debugger is a diagnosis-only leaf: it does not edit product
files, spawn another agent, admit work, accept a fix, or change counters.

Pass the smallest self-contained diagnostic handoff:

- the original task or in-memory work-item identity and sourced requirement;
- current scope, non-goals, and validation-infrastructure authority;
- exact failure signatures, preserved attempt history, and consumed counters;
- relevant logs, evidence, locations, and approaches already tried;
- the bounded question the diagnosis must answer.

Require the result to separate established causes from hypotheses, cite the
bounded evidence and relevant locations, and recommend the smallest repair and
focused verification. The orchestrator evaluates that result; it does not treat
the recommendation as edit authorization.

## Reasoning resolution

Resolve every debugger dispatch through `protocols/REASONING_POLICY.md` and
`tools/reasoning-policy.js` with `task_intent = diagnose`. Preserve applicable
signals such as `ambiguous_root_cause`, `cross_module`, or
`non_local_invariant`; never lower or discard them to fit a role. The saved
profile and central resolver own the selected capability and existing LSA v2
projection. Workflow prose, handoffs, and the debugger source must not copy
effort tables, pin a raw model, or prescribe a model or effort for the
current/main session.

## Workflow accounting

- **Simple:** keep the diagnostic attempt in memory. An explicit diagnosis
  deliverable is an ordinary Simple work item. A post-failure diagnostic is
  part of Simple's one existing narrow same-scope recovery sequence and cannot
  be repeated for the same evidence state. If the diagnosis does not make the
  next bounded action clear, report the blocker.
- **General:** keep the diagnostic attempt in the current work item and preserve
  General's no-retry rule. Diagnosis may explain a blocker but does not authorize
  a second execution attempt.
- **Flow:** attach `agent.started` through `agent.finished` for the debugger to
  the original `task_id` and an explicit attempt number. For post-failure
  diagnosis, persist `flow_recovery_used` before the debugger starts and treat
  diagnosis plus any admitted same-task executor re-dispatch as the one existing
  Flow recovery pass. On resume, reuse the terminal debugger result; never
  dispatch it again for the same failure state or increment the recovery counter
  again.
- **Pipeline:** attach the debugger lifecycle to the original `task_id` and an
  explicit attempt number. Atomically increment that task's existing
  `retry_opportunities_used` before the debugger spawn, just as for every other
  new child dispatch. A later executor re-dispatch consumes the next existing
  opportunity. On resume, reuse a terminal debugger result for the same failure
  state and never recreate it as a free attempt.

In every route, preserve all prior failure signatures, reasoning decisions,
resolved configuration, recovery eligibility, and consumed counters in later
handoffs. The debugger AgentStatus is additive: never replace or rewrite the
terminal executor AgentStatus or its source failure-history entry, because that
record remains authoritative for later LSA recovery decisions. Leaf workers
never dispatch the debugger.
