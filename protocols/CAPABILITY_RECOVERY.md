# Child Capability Recovery

Capability recovery is a bounded child-only fallback for repeated material
reasoning failures. The default path remains effort-first. The exact
`openai-gpt6-v1` projection carries the LSA v2 strategy for qualified execution
recovery; it does not change other projections. Capability recovery is separate
from the reasoning-effort resolver:

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

Selecting the `openai` model set does not enable `auto`. The
workflow preset or explicit flag still owns the mode.

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

## Default recovery sequence

Reasoning-effort recovery is mandatory before model capability recovery on the
default path. The qualified LSA v2 path below is the sole exception. For an
admitted material reasoning failure on the default path, re-run the reasoning
resolver first:

- `routine` may become `deliberative`;
- `deliberative` may become `deep`;
- `deep` remains `deep` and receives `max` through `recovery_boost`, without
  becoming assurance.

This automatic path does not use `explicit_effort`. When it raises the
requested effort, spend the next legal retry opportunity on the same role and
model at that effort. Do not call capability recovery for that redispatch.
`no_higher_tier_available` is not a terminal blocker while a legal
reasoning-effort recovery has not yet run.

Repeat that resolver step for each later admitted reasoning failure while it
can still raise the class or effort. Preserve the task's original reasoning
hints, but use the prior attempt's `effective_class` as the next attempt's
`reasoning_class` floor so recovery cannot restart from the canonical base
class. Only after a `deep` plus `max` attempt still fails the same material
criterion without meaningful progress may a later existing retry opportunity
qualify for model recovery:

1. Resolve the next tier with `tools/capability-recovery.js`.
2. Resolve that tier to the profile-approved raw runtime model with the
   installed profile manager's `resolve-recovery` action.
3. Re-run the reasoning resolver using the prior effective class and the
   requested recovery tier, without carrying the prior model's
   `recovery_boost`. This reprojects normal effort for the stronger tier. The
   destination call carries its newly resolved, digest-bound configuration;
   it must not reuse the source projection or source effort. For example, a
   legal LSA Sol `deep` plus `max` recovery can become Astra `deep` plus
   `high`. The class and failure history remain intact, while the source boost
   is cleared.
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
   explicit conflict; only a bounded observed mismatch is exposed, while
   invalid raw model metadata remains redacted.

Pipeline resume hydrates both task fields from canonical `TaskStatus`. A true
`capability_recovery_used` forbids another uplift for that task. Every later
Stage 7 redispatch increments the same `retry_opportunities_used` counter, so a
promoted attempt reduces that task's remaining Pipeline retries instead of
creating a new budget.

If the promoted attempt fails and the workflow still has an existing reasoning
retry opportunity, it may retry the promoted tier at the reasoning resolver's
normal recovery effort. It may not select another model tier. At the profile recovery ceiling,
a material deep failure must receive its legal `max` effort-first attempt
before the workflow stops and reports the blocker.

## Qualified LSA v2 sequence

The `lsa-qualified-execution-v2@2` strategy applies only when all normal trust,
health, profile ceiling, selector, budget, and materiality checks pass and the
saved configuration exactly verifies `openai-gpt6-v1@1`. The workflow must
be Flow, Pipeline, or Adaptive routed to one of them, with reasoning `adaptive`
and capability recovery `auto`. The role must be `executor` or `generalist`.

The source is a verified standard-tier Sol deep attempt at `high` or higher.
Canonical history must show the same material `reasoning_failure` at least
twice with no meaningful progress, ending at the verified source trace. A
single high failure, a different failure signature, P3 or non-material work,
operational failure, or caller-supplied history does not qualify. Explicit
effort or model pins, strict or assurance requirements, missing runtime
support, and mismatched identity, binding, stage, counter, or trace evidence
also block the exception.

For a qualified first uplift, the profile-approved strong binding is dispatched
as the same role at deep `medium`; a Sol `max` attempt is not a prerequisite.
That is a stage-specific recovery effort, not the normal strong/deep projection
and not `explicit_effort`. The same task can then advance through `medium ->
high -> max` only after each new material reasoning failure is admitted. There
is no `xhigh` stage and no second model uplift.

Each actual stage consumes one existing retry opportunity. The sequence does
not promise three extra attempts: with one retry remaining, only the initial
Astra medium attempt can run. Success, non-blocking remaining work, exhausted
budget, or failure at Astra max stops the ladder. The canonical pre-spawn claim
must be written before dispatch, and resume must reconstruct the exact strategy,
binding, verified effort, failure history, stage, uplift use, and retry count.

Later Astra high/max attempts retain the already approved task-scoped target
binding and do not call `resolve-recovery` as a new uplift. Changing recovery
mode to `off` or `shadow` stops new applied LSA stages but preserves the upgraded
binding and consumed counters; it does not downgrade the task to Sol or refund
budget. Shadow candidates never dispatch or change counters.

The destination resolver configuration may use the
`capability_recovery` provenance marker only for `executor` or `generalist`,
with workspace-profile provenance and a strictly higher target tier. This
marker records a recovery already authorized by `tools/capability-recovery.js`;
it does not authorize a retry, enlarge its budget, or make reviewer recovery
legal. A pinned legacy catalog remains ineligible for recovery under the
workspace resolver's existing contract.

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

For LSA v2, use this action for the initial standard-to-strong authorization.
Continuation uses the verified saved target binding and shared stage decision;
it is not a second profile uplift request.

## Reviewer boundary

Reviewer recovery is effort-only. Policy-v2 ordinary review uses strong plus
`xhigh`; the verified `openai-gpt6-v1` projection calibrates
ordinary deep review to `high`. An explicit `--review=max`, a workflow-selected material
security/data-integrity review, or reviewer reasoning recovery may request
strong plus `max` while remaining deep. Formal acceptance/rejection alone uses
assurance, strong, `max`, and strict enforcement.

Generic risk labels, P3 findings, wording preferences, and optional hardening
do not justify reviewer max or model recovery.
