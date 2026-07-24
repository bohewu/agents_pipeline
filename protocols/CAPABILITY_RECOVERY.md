# Child Capability Recovery

Capability recovery is a bounded child-only fallback for repeated material
reasoning failures. It is separate from the reasoning-effort resolver:

- `tools/reasoning-policy.js` classifies work and selects child effort.
- `tools/capability-recovery.js` decides whether one temporary model-tier
  uplift is allowed.
- The active workspace profile sets the normal tier, recovery ceiling, and raw
  runtime model mapping.

Neither resolver changes the current/main agent or an `orchestrator-*` role.
There is no model downgrade, committee vote, free-form raw-model choice, or
assurance upgrade.

## Modes

Workflows expose:

```text
--capability-recovery=off|shadow|auto
```

- `off` never selects a recovery model.
- `shadow` computes one eligible tier uplift but does not dispatch it.
- `auto` applies one eligible uplift through a native per-spawn model selector
  and requires matching local trace evidence.

Direct Simple, Flow, and Pipeline runs default to `off`. Fresh Adaptive
`delivery` and `autonomous` presets default to `auto`; `balanced`, `careful`,
and `interactive` default to `off`. An explicit flag overrides the preset, and
resume keeps the persisted effective mode.

Simple does not perform model recovery. Its Adaptive wrapper may still use the
flag when it selects Flow or Pipeline.

## Eligibility

The shared resolver permits only `executor` and `generalist`. A workflow may
request recovery only when all of these are true:

1. the same concrete reasoning failure has repeated;
2. the failure passes `MATERIALITY_GATE.md`;
3. the preceding retry made no meaningful progress;
4. the task has not used model recovery before;
5. the active profile proves a higher tier within the role's recovery ceiling;
6. the failure is not operational.

The uplift is one tier step and one task-scoped use. It consumes an existing
Flow/Pipeline recovery or retry opportunity and never creates or resets a
budget.

Profile ceilings are:

| Profile | `executor` | `generalist` |
|---|---|---|
| `frugal` | `standard` | `standard` |
| `balanced` | `strong` | `strong` |
| `premium` | `strong` | `strong` |

The ceiling may equal the normal tier. In that case no model uplift exists.

## Recovery sequence

The normal reasoning failure path remains first: routine may become
deliberative, deliberative may become deep, and deep may receive `max` without
becoming assurance.

When a later repeated material failure qualifies for model recovery:

1. Resolve the next tier with `tools/capability-recovery.js`.
2. Resolve that tier to the profile-approved raw runtime model with the
   installed profile manager's `resolve-recovery` action.
3. Re-run the reasoning resolver using the prior effective class and the
   requested recovery tier, without carrying the prior model's
   `recovery_boost`. This reprojects normal effort for the stronger tier.
4. For Pipeline `auto`, atomically claim the attempt with one `task.updated`
   event that changes `capability_recovery_used` to `true` and increments
   `retry_opportunities_used` by exactly one. Await the canonical task write
   before spawning. The claim must fit under the persisted
   `max_retry_rounds`; `shadow` does not claim or consume an attempt.
5. Spawn the same registered child role with the resolved `model` and returned
   reasoning effort.
6. Verify both model and effort through `tools/codex-child-trace.js`.
7. Re-run the capability resolver with `model_matches` and the trace-proven
   effective tier before accepting the result. `model_matches = false` is an
   explicit conflict; a mismatched raw model is never inferred or exposed.

Pipeline resume hydrates both task fields from canonical `TaskStatus`. A true
`capability_recovery_used` forbids another uplift for that task. Every later
Stage 7 redispatch increments the same `retry_opportunities_used` counter, so a
promoted attempt reduces that task's remaining Pipeline retries instead of
creating a new budget.

If the promoted attempt fails and the workflow still has an existing reasoning
retry opportunity, it may retry the promoted tier at the reasoning resolver's
normal recovery effort. It may not select another model tier. A failure at the
profile ceiling with maximum effort stops and reports the blocker.

Operational errors use operational retries or a corrected tool invocation.
They never request model recovery and never consume repair budget.

## Profile resolution

For a healthy, eligible Codex workspace profile:

```text
python tools/agent-profile.py resolve-recovery \
  --runtime codex \
  --scope workspace \
  --workspace . \
  --agent executor \
  --model-tier strong \
  --json
```

The command is read-only. It rejects inherited, uniform, unhealthy, untrusted,
pinned-catalog, unlisted, below-base, or above-ceiling requests. Its raw model
output comes only from the selected installed model set.

## Reviewer boundary

Reviewer recovery is effort-only. Ordinary review uses strong plus `xhigh`.
An explicit `--review=max`, a workflow-selected material
security/data-integrity review, or reviewer reasoning recovery may request
strong plus `max` while remaining deep. Formal acceptance/rejection alone uses
assurance, strong, `max`, and strict enforcement.

Generic risk labels, P3 findings, wording preferences, and optional hardening
do not justify reviewer max or model recovery.
