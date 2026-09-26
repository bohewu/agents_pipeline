# Reasoning Policy Protocol

Policy/schema version **2 / 2.0** defines deterministic reasoning selection for
**child-agent dispatches only**. It never changes the model or reasoning effort
of the already-running current/main agent.

The canonical machine-readable source is
[`reasoning-policy.json`](reasoning-policy.json). Every orchestrator calls
`tools/reasoning-policy.js` before every child spawn. Workflow documents may
describe when to call the resolver, but must not reproduce its effort mapping.

## Ownership and decision path

The decision path is:

```text
task_intent -> baseline reasoning class -> signals and role/context bounds
            -> selected role-model capability -> child-spawn effort
```

Ownership is deliberately separated:

- The effective workspace profile/runtime selects the actual registered role
  and its model/tier.
- The resolver reads the proven selected tier and selects only the dispatched
  child's effort.
- The resolver never routes a raw model, dynamically changes a role model,
  upgrades or downgrades a model, or applies effort to the current/main agent.
- `requires_model_escalation` is capability-conflict metadata. It never
  authorizes dynamic model routing.
- The separate bounded child recovery protocol may request one
  profile-approved higher tier for `executor` or `generalist` after a repeated
  material reasoning failure. It does not change this resolver's ownership or
  permit free-form model routing; see `CAPABILITY_RECOVERY.md`.

Risk, verification, approvals, retries, resources, and reasoning demand stay
separate controls.

## Task intent and classification

New task-producing workflows emit all of the following alongside the existing
artifact fields:

```json
{
  "task_intent": "execute",
  "intent_baseline_class": "routine",
  "classification_source": "task_intent",
  "reasoning_class": "routine",
  "reasoning_signals": ["fully_specified"]
}
```

Current task producers must emit these fields, but they are backward-compatible
optional extensions to TaskList, FlowTaskList, DispatchPlan, and TaskStatus.
The checkpoint's reasoning-policy flags are extended separately. Neither
change advances those artifacts' existing
`protocol_version`; the status runtime remains `PROTOCOL_VERSION = 1.0`.
Policy v2/schema 2.0 belongs to the separate ReasoningPolicy,
ReasoningDecision, and ReasoningObservation contracts.

`reasoning_class` remains a legacy-compatible artifact field. It is retained
for TaskList, FlowTaskList, DispatchPlan, TaskStatus, and older handoffs; it
does not replace `task_intent` for new production. When an intent is present,
the resolver starts from that intent's baseline and only raises it. Signals,
an explicit legacy class, role/context floors, and a qualifying reasoning
failure may raise the result; none may lower it.

| `task_intent` | Baseline | Use it for |
|---|---|---|
| `execute` | `routine` | Carrying out a known action |
| `inspect` | `routine` | Looking up or checking known facts/state |
| `diagnose` | `deliberative` | Explaining a bounded observed problem |
| `design` | `deliberative` | Choosing or shaping a bounded approach |
| `review` | `deliberative` | Ordinary quality review |
| `certify` | `assurance` | A formal accept/reject process |

`routine` means **almost no substantive decision is required**. It is not a
synonym for a small workload: a large mechanical transformation can be routine,
while a small ambiguous change can be deliberative or deep.

`assurance` is a formal accept/reject process semantic, not simply “more
thinking than deep.” Use `certify` or the `formal-assurance` context only when
the requested work is an explicit formal gate. Ordinary review remains
`review`, even when `--review=max` is used.

### Signals

Signals are bounded evidence that can only raise the intent baseline. The
policy owns the authoritative floors; this table explains their meaning.

| Minimum class | Signals |
|---|---|
| `routine` | `fully_specified`, `local_scope` |
| `deliberative` | `multi_step`, `multi_file`, `bounded_tradeoff`, `ordinary_diagnosis`, `implementation_choice`, `partial_ambiguity` |
| `deep` | `cross_module`, `cross_system`, `ambiguous_root_cause`, `architectural_tradeoff`, `architecture_tradeoff`, `non_local_invariant`, `adversarial_input`, `numerical_sensitivity`, `security_boundary`, `data_integrity`, `concurrency_or_ordering`, `migration_compatibility` |
| `assurance` | `formal_accept_reject` |

Policy floors for every signal except `formal_accept_reject` are capped at
`deep`. A strengthened policy may ask an ordinary signal to receive more
analysis, but it cannot manufacture formal accept/reject semantics.

For backward compatibility, an intent-less legacy artifact keeps the v1
`cross_module -> deliberative` floor. Adding a supported non-null
`task_intent` activates the v2 floor and makes `cross_module` at least `deep`.
This exception exists only to preserve already-produced v0.31.1 payloads; all
current producers must emit intent metadata and must not use omission to avoid
the v2 floor.

The resolver also applies the role and dispatch-context policy in
`reasoning-policy.json`. Fixed and adaptive role rules remain authoritative
there; do not copy role-specific effort rules into workflow prose. A task that
exceeds a fixed role's ceiling must be rerouted, never relabeled downward.

### Role policy groups

Fixed roles are semantic capability bounds, not default suggestions:

- Fixed `routine`: `compressor`, `handoff-writer`, `kanban-manager`, `peon`,
  `repo-scout`, `session-guide-writer`, `summarizer`, `test-runner`.
- Fixed `deliberative`: `art-director`, `atomizer`, `committee-kiss`,
  `committee-product`, `flow-splitter`, `market-researcher`, `planner`,
  `router`, `specifier`, `ux-copy-trust`, `ux-novice`,
  `ux-visual-hierarchy`.
- Fixed `deep`: `debugger`, `executor-strong`, every `analysis-*` role,
  `committee-architect`, `committee-judge`, `committee-qa`,
  `committee-security`, `ux-judge`, and `ux-task-flow`. `committee-security`
  and `executor-strong` additionally require `strong`; `executor-strong`
  retains the shared executor task contract.

`doc-writer`, `executor`, and `generalist` are adaptive
`routine/deliberative/deep`; their target is only the legacy fallback, never a
floor when intent or adequate signals exist. `ui-ux-designer` is adaptive
`deliberative/deep/deep`. `reviewer` is adaptive
`deep/deep/assurance`, so selecting the reviewer role always requires at least
deep reasoning even when a producer omits its review context. Unlisted roles use the default adaptive
`routine/deliberative/deep` policy for in-memory decisions and observations.
Persisted AgentStatus reasoning is intentionally limited to the managed role
catalog because its schema binds `agent` to a canonical role-policy snapshot;
register a role before persisting it there. Policy-v2 default, role, and
dispatch-context objects are immutable managed snapshots, and extra role or
context policy keys are invalid. The same exact-key rule applies to the policy
root, compatibility, model-floor, class-requirement, and effort-projection
objects. A fixed role or adaptive ceiling conflict
requires reassignment to a compatible configured role; the resolver never
clips the class.

### Debugger dispatch

`debugger` is an on-demand diagnosis-only role governed by
`protocols/DEBUGGER_DELEGATION.md`. Dispatch it with `task_intent = diagnose`
through the same central resolver as every other child. Preserve diagnostic
signals such as `ambiguous_root_cause`, `cross_module`, and
`non_local_invariant`; the fixed role policy and saved profile determine the
existing projection without workflow-local effort tables or raw-model pins.
This resolution applies only to the child. It does not prescribe or change the
current/main session model or effort, and a diagnostic result does not create
repair, retry, recovery, or uplift eligibility.

### Legacy artifacts

Existing explicit `reasoning_class` input remains valid. The resolver records
`classification_source = legacy_explicit_class` when no intent is present but
an explicit class is. When neither intent nor class is present, it uses the
role target and records `classification_source = legacy_role_target`.
Legacy records use `task_intent = null` and `intent_baseline_class = null`.
An explicit-class record must retain that non-null class as `requested_class`;
a role-target record must keep `requested_class = null` and cannot resolve
below the canonical role target. These provenance rules apply to conflict
records as well as successful dispatches.
Their signal validation retains the v1 `cross_module` floor described above;
all other bounded signals retain their declared minimums.
TaskStatus records that declare either legacy classification source must carry
`reasoning_class` and `reasoning_signals` together; provenance cannot exist
without the classification it describes.

## Capability and effort projection

The selected logical tier must be proven from the profile/runtime. Use
`unknown` for global inheritance, uniform raw-model profiles, ineligible
workspace layers, or any other unprovable tier; never infer it from a model
slug.

The central projection is:

| Effective class | Minimum tier | `mini` | `standard` | `strong` | `unknown` |
|---|---:|---:|---:|---:|---:|
| `routine` | `mini` | `high` | `medium` | `medium` | `high` |
| `deliberative` | `mini` | `xhigh` | `high` | `high` | `xhigh` |
| `deep` | `standard` | conflict by default | `xhigh` | `xhigh` | conflict by default |
| `assurance` | `strong` | conflict | conflict | `max`, strict | conflict |

No policy-v2 managed child dispatch resolves below `medium`; `mini` and
`unknown` start at `high` for routine work. A role or context may require a
stronger minimum tier, but the resolver never changes the selected role model
to satisfy it.

### Versioned projections

[`reasoning-projections.json`](reasoning-projections.json) is the immutable
registry for a resolved, versioned model mapping. A new projection is usable
only when `resolved_configuration` carries a matching model-set id/version/
mapping digest, projection id/version/policy-version/digest, and proven
role/tier/model binding. The resolver recomputes both registry digests using
recursively sorted, compact UTF-8 JSON and rejects unknown or mismatched data.
Unconfigured, unknown, uniform, or ineligible inputs retain policy-v2
semantics; they never infer a projection from a model name.

| Projection | Applicable binding | Routine | Deliberative | Deep | Assurance |
|---|---|---|---|---|---|
| `openai-gpt6-v1` | GPT-6 Luna mini / Sol standard / Astra strong | `high` / `medium` / `low` | `xhigh` / `medium` / `low` | conflict / `high` / `high` | strong `max`, strict |

Only v3 projection decisions accept `low`. They carry the selected
`reasoning_projection` and model-set identity. Callers with no saved
configuration retain the base policy-v2 behavior; retired configurations do
not resolve through the active registry. The normal `openai-gpt6-v1` path
retains the LSA v2 matrix. Its reviewer deep calibration never weakens explicit
`xhigh`/`max`, high-consequence review, reviewer recovery, or assurance.

### Deep compatibility exception

Policy v2 deliberately changes deep behavior: `mini` and `unknown` deep work
now conflict by default. An explicit `allow_degraded_deep = true` compatibility
request may apply only to deep work outside `inherit` mode. It requests `max`,
records `degraded = true`, and uses
`degradation_reason = model_tier_below_deep_requirement`. It never authorizes
assurance, never changes the model, and must not be inferred by a workflow.
For an adaptive dispatch this exception is exact: an unavailable selector,
unsupported `max`, or observed effective effort below `max` is a conflict,
not a second degradation.

## Review and assurance contexts

| Context | Effective intent/class behavior | Capability and enforcement |
|---|---|---|
| `ad-hoc-review` | Raises an ordinary `review` to `deep` | Non-strict |
| `pipeline-review` | Raises an ordinary `review` to `deep` | Strong tier minimum; non-strict |
| `formal-assurance` | Fixed `assurance` formal gate | Strong tier required; strict |

These three values are the complete policy-v2 dispatch-context vocabulary.
Custom labels are invalid because they would have no canonical floor, tier, or
strictness contract. Legacy schema-v1 records retain their bounded context
string compatibility.

`--review=max` is an exact **effort-only** reviewer override. For ordinary
ad-hoc or Pipeline review it remains deep; it does not certify the work, change
the selected model/tier, or apply to non-review roles or the current/main
agent. A formal gate must be requested through `certify`,
`formal_accept_reject`, or `formal-assurance`, not through `--review=max`.
The same exact deep `max` request may be selected internally for an
evidence-backed high-consequence security/data-integrity review or a reviewer
reasoning recovery. Those paths are not user flags, do not change the reviewer
model, and do not create assurance.
At the resolver-contract level every supported `explicit_effort` value is an
upward, exact floor: class/model floors may raise it, but runtime fallback or
observed effort that differs from the resulting exact request conflicts in
either direction. Generic risk labels, wording preferences, and P3 findings do
not justify an internal max request.

## Resolver modes

Simple, Flow, Pipeline, and Adaptive use:

```text
--reasoning=inherit|shadow|adaptive
```

Policy v2 and direct Simple/Flow/Pipeline entry points default to `inherit`. A fresh
`$run-adaptive` invocation deliberately selects `adaptive` by default and passes that
normalized mode into whichever workflow it adopts; explicit flags and persisted resume
state still win.

| Mode | Resolution and selector behavior |
|---|---|
| `inherit` | Preserves intent/classification metadata, but never requests or applies a selector. Exact effort overrides and strict requirements conflict. |
| `shadow` | Fully computes and records the requested effort, but never applies a selector. Strict assurance conflicts. An ordinary `--review=max` can be computed and recorded as shadowed when runtime evidence is absent; any observed mismatch conflicts. |
| `adaptive` | Requests a non-null `dispatch_effort` through the native child-spawn selector. A non-strict, non-exact selector-unavailable case is degraded with no selector; strict assurance and exact overrides conflict. Only matching runtime evidence proves effective-effort contract enforcement, not selector causality. |

All modes validate intent, signals, role ceilings, and model capability.
`shadow` and `adaptive` also compute the effort and validate the workspace
ceiling. `inherit` deliberately does not project effort or apply a selector,
so exact and strict requirements conflict there. A `conflict` blocks the
spawn. `requested` is not proof of enforcement; only matching child-trace
evidence may become `enforced`.

For LSA and the calibrated Astra reviewer path in adaptive mode, selector
absence is a conflict: they cannot claim a calibrated effort was applied.
Those paths also require exact runtime support for the projected effort;
missing `low` does not silently become `medium`. Non-reviewer updated OpenAI
paths retain their v2 selector and fallback behavior.

## Failure-aware recovery

Only `prior_failure_type = reasoning_failure` can alter reasoning selection:

- `routine` becomes `deliberative`.
- `deliberative` becomes `deep`.
- `deep` remains deep, sets `recovery_boost = true`, and requests `max`; it
  never becomes assurance.

`recovery_boost` describes only a final `deep` decision. If a later explicit
class requirement produces `assurance`, the provisional boost is cleared;
assurance obtains `max` from its own strict class contract.

For an automatic `executor` or `generalist` retry, this reasoning recovery is
normally resolved before model capability recovery. The exact verified LSA v2
shortcut below is the sole exception. A strong-tier child at
`deep` plus `xhigh` therefore receives its next legal material retry at `max`
on the same model through `recovery_boost`; it does not need a user override
and must not be represented as `explicit_effort`. A
`no_higher_tier_available` capability result is not a blocker until this legal
effort-first path is exhausted.

Recovery is monotonic across attempts. Keep the task's canonical intent,
signals, and original class unchanged, but for each admitted reasoning
redispatch pass the prior attempt's `effective_class` as the new resolver
`reasoning_class` floor when it is higher. Then add
`prior_failure_type = reasoning_failure`. This attempt state is neither
`explicit_reasoning_class` nor a user override. Simple keeps it in memory;
Flow and Pipeline persist it in the attempt's ReasoningDecision and hydrate the
latest task attempt on resume.

For LSA efficiency projections, the retry input must additionally preserve the
prior `effective_class` and observed effective effort. After the ordinary
class/boost calculation, if the same model would otherwise receive the same
or lower effort, the resolver requests the next supported effort within the
workspace ceiling. Missing prior evidence, an unavailable higher runtime
effort, or an unavailable selector conflicts; it is never reported as an
applied LSA projection. A deep recovery boost still wins directly at `max`.

Operational failure types (`timeout`, `permission_denied`, `network_error`,
`dependency_unavailable`, `browser_startup_failure`, `cli_format_error`, and
`tool_failure`) do not raise the class or effort. Workflows record the actual
failure type and keep operational retry, repair, and reasoning recovery
budgets separate.

After this effort-only path has failed on the same material criterion without
meaningful progress, Flow or Pipeline may invoke the separate bounded
capability recovery policy. It may select one higher profile-approved tier for
an `executor` or `generalist`, reproject normal effort for that tier, and
consume an existing retry opportunity.

For an exact saved `openai-gpt6-v1` configuration, both resolvers consume
the same `lsa_recovery_context` and `resolveLsaRecoveryStage()` decision before
the generic deep/max boost. A verified standard-tier Sol deep/high-or-higher
source may request strong-tier Astra deep/medium only after canonical history
shows the same material reasoning failure repeated without meaningful progress.
This removes the Sol-max prerequisite only for that qualified path. It does not
change the normal LSA v2 routine/deliberative/deep matrix, and the first isolated
Sol high failure still follows the default path.

The verified same-uplift continuation requests Astra `high` after medium and
`max` after high. It retains the profile-approved target binding, carries no
second uplift, and consumes the same canonical retry budget. A requested stage
is not applied evidence: claim-before-spawn state plus a matching role, model,
tier, and effective-effort trace must verify it. Off selects no stage; shadow
returns a candidate without dispatch or counter changes; inherit does not apply
the selector. Explicit pins and strict/assurance requirements remain exact.
This recovery never applies to a reviewer, security or judge role, native
strong assignment, Simple/ad-hoc dispatch, orchestrator, operational failure,
or unverified configuration. See `CAPABILITY_RECOVERY.md` and
`MATERIALITY_GATE.md`.

## Dispatch and evidence rules

Before every child spawn, call:

```text
node tools/reasoning-policy.js --input-json '<json>' --compact
```

Provide the registered role, mode, intent/classification metadata, signals,
proven selected tier or `unknown`, selector capability, runtime-supported
efforts when known, workspace ceiling, applicable context, and retry failure
metadata. Pass reviewer `explicit_effort = max` only for explicit
`--review=max`, a material high-consequence security/data-integrity review, or
reviewer reasoning recovery.

Version-2 decisions retain the legacy aliases and add bounded
`task_intent`, `intent_baseline_class`, `classification_source`, `role_policy`,
`reasoning_class`, `selected_model_tier`, `selector_available`, `degraded`,
`degradation_reason`, `conflict_reason`, `recovery_boost`, and
`explicit_override` fields. They also retain `dispatch_context`,
`minimum_model_tier`, requested/dispatch/effective effort, `strict`, and the
legacy `model_tier`, `effective_class`, and `conflict` fields.
For schema version 2, `conflict` is only the fixed state token `"conflict"`;
the single human-readable explanation lives in `conflict_reason`. Non-conflict
records set both fields to null. Schema-v1 conflict text remains unchanged.

Assurance is successful only with selected tier `strong`, requested and
observed effective effort `max`, and `strict = true`. A pre-dispatch decision
may be `requested` while runtime evidence is pending, but it must not be
reported as an accepted/certified result until matching effective-effort
evidence is recorded; any known mismatch conflicts.

Decision and observation validation also enforces mode/state coherence:
`inherit` never carries a selector request, `shadow` never carries a dispatch
effort, `requested` has no effective-effort evidence yet, and `enforced`
requires matching requested/dispatch/effective effort. Every non-conflict
record derives its minimum tier and requested-effort floor from the effective
class and selected tier; neither value is trusted merely because the payload
declares it. Conflict records cannot claim dispatch or degradation, and
degraded deep compatibility is limited to its exact documented
class/tier/effort/reason combination.

The same validation binds classification and dispatch identity. A declared
`requested_class` or explicit class override is a floor and cannot be rewritten
downward. Managed `role_policy` snapshots must exactly match the declared role,
known review contexts retain their documented class/tier/strict constraints,
and AgentStatus accepts only managed roles and requires `agent` to match the
embedded reasoning role. In
adaptive mode, `selector_available = false` is reciprocal evidence: a
non-conflict record must remain non-strict `degraded` with
`selector_unavailable`; every adaptive state, including conflict, must carry
no dispatch effort and no effective-effort claim.

Observed effort proves what ran, not that an unmet policy requirement
disappeared. An observed effort below the dispatched effort is a conflict. An
observed effort above the workspace ceiling is also a conflict. For a
non-strict, non-exact dispatch, an observed effort above the dispatch but still
within the workspace ceiling is overprovisioning: retain it as `degraded` with
`degradation_reason = effective_effort_mismatch`. A runtime-supported fallback
remains `degraded` even when the observed effort matches that fallback, and
degraded deep compatibility remains `degraded` even when its observed effort
is `max`. None of these states may be relabeled `enforced` or described as a
complete high-assurance result.

Observed workspace-ceiling checks apply before `inherit`, `shadow`, or
selector-unavailable early returns. Likewise, an observed mismatch for strict,
exact, or degraded-deep requirements conflicts before those returns. A mode
that does not apply a selector cannot use that fact to discard contradictory
runtime evidence.

`enforced` is the resolver's observed contract-satisfaction state. It means the
required effective effort ran; it does not by itself prove that the native
selector caused that value. A child whose effective effort equals both the
request and the parent's effort could have received an explicit same-value
selector or inherited the parent, and those paths are observationally
indistinguishable.

In adaptive mode, request a non-null `dispatch_effort` through the selected
dispatch surface's explicit effort setting. For native managed dispatch,
normally omit `model`. The only native exception is an
`auto` CapabilityRecoveryDecision whose requested tier was resolved by the
active profile's read-only `resolve-recovery` action. On Codex multi-agent V2,
pass the registered role as `agent_type`, pass `dispatch_effort` as
`reasoning_effort`, use `fork_turns = "none"`, and pass that bounded recovery
model only for the eligible recovery spawn. On a legacy spawn surface, use the
equivalent no-history `fork_context = false`. Include the complete
ReasoningDecision in Flow/Pipeline agent lifecycle status. Selector presence
and a successful spawn prove only `requested`, not `enforced`.

### Web session agent Jobs

A ChatGPT Web current/main session may perform the selected `$run-*` workflow
itself and dispatch a registered role as a separate Codex agent Job when its
WebCodex Runner supports process execution but not native managed dispatch.
This is a second dispatch surface, not a native `agent_type` spawn. It does not
require the removed `codex-external-role.py` wrapper. The existing Codex
executable is the agent runtime; WebCodex provides Job lifecycle observation.

For a disposable detached worktree, first create or re-observe the repo-external
worktree Project, then run workspace profile `status --json` for that worktree.
An initial `health = ok`, `catalog_state = inherit`,
`profile_eligibility = not_configured`, `project_trust = unknown` result with no
local `.codex/agents/*.toml` is normal pre-materialization state, not a profile
or tool failure. If the task requires the source profile, take its profile and
model-set from a verified source profile snapshot and run workspace `set` only
in the disposable worktree; never modify the source checkout's `.codex` profile.
Recheck worktree status after `set`: require `health = ok`,
`catalog_state = current`, `profile_eligibility = eligible`,
`project_trust = trusted`, and `configuration_compatibility = current` before
reading worktree-local role TOML or resolved configurations. Guard optional
file probes with `test -f` or equivalent so expected absence exits normally.

Keep Project Sessions scoped to their Project. The source Project Session holds
source observation and cleanup evidence only. Do not pass its
`recording_session_id` to `work_on_project(mode=worktree)`. After bootstrap,
use the returned new Project and Session ID for worktree profile, Job,
validation, review, and closeout. If bootstrap returns a mismatch, timeout, or
unknown outcome while the Project might exist, list and re-observe that exact
Project and reuse it; do not create a replacement worktree. Retain the
`session_project_mismatch` fail-closed check.

Use `run_process` for one native executable with literal argv. Use `run_shell`
or an appropriate script surface for pipes, redirects, command substitution,
conditionals, here-docs, `&&`, and other shell syntax. Never pass `bash -lc` or
`sh -c` as a shell command mode to `run_process`. A tool interface rejection
before command start is not an agent Job dispatch and does not justify a
replacement Job.

Before each Job, apply the same workspace profile health, catalog, trust,
saved-configuration, task classification, and shared-resolver checks. A Job
requires a proven role model from the effective configuration; if no such
binding exists, stop this surface rather than guessing from a model name. Read
the registered role definition and give that exact role contract and bounded task
to the Codex process. Because a separate process does not inherit native role
routing, explicitly select the saved role model through a supported Codex
setting. In `adaptive`, also select the resolver's non-null `dispatch_effort`
through a supported effort setting. In `inherit` and `shadow`, omit that effort
setting as the resolver requires; observed effort is diagnostic and cannot
become an applied-selector claim. Reject an unavailable or unrecognized
required setting; do not silently fall back to the main session's model or,
in `adaptive`, effort. Preserve the workflow's sandbox, workspace, and task
scope rules.

Track one launched process through its terminal response. If WebCodex promotes
that process into a Job, observe only the returned Job ID until terminal;
promotion is not another dispatch. Record the Job ID when issued, Codex thread
ID, terminal state and exit code, selected configuration, observed model and
effort telemetry, role-contract reference, output-contract
validation, and relevant workspace/diff/test evidence. Keep process logs and
prompts out of tracked status artifacts. Recheck observed effort against the
resolver and workspace ceiling. A missing terminal result, nonzero exit,
mismatched model, `adaptive` effort mismatch, invalid role output, or
unverified worktree state blocks acceptance and downstream dispatch. Do not
retry an uncertain Job as a new process merely because observation timed out.

This evidence supports a **role-directed Job result**, not native managed-role
identity. Runtime model and effort telemetry do not prove that `agent_type` was
applied or that the role prompt was obeyed; the orchestrator must check the
role's output contract and task result. Do not run `codex-child-trace.js` on a
Job ID or claim native `role_matches`. Existing Flow/Pipeline AgentStatus
`enforced` records remain native-trace-only. For a Job, retain the pre-dispatch
reasoning decision (`requested`, `inherited`, or `shadow` as applicable) in
canonical status and use `evidence_refs` to point to bounded run-local Job
evidence. Clearly report the observed model and
effort separately from the unverified native-role identity. Exact effort
overrides, formal assurance, trace-gated recovery, and any gate whose schema
requires native `enforced` evidence stop on this surface until a separate
validated evidence contract supports them. Ordinary non-strict workflow work
may continue after the Job result and required task checks pass.

For focused validation of a new file, require
`git status --porcelain=v1 --untracked-files=all` to match exactly the expected
changed paths, then independently compare exact bytes and the final newline.
Ordinary `git diff --check` checks tracked or index-aware changes; it does not
cover a purely untracked file. Check each expected untracked new file with
`git diff --no-index --check -- /dev/null <file>`. Its exit 1 can mean the
expected content difference: accept exit 0 or 1 only when whitespace
diagnostics are empty, and keep exact-content and bounded-diff checks separate.
Explain these no-index exit semantics in the reviewer handoff.

While the disposable worktree still exists, complete focused validation,
review, bounded diff/evidence preservation, and its Session closeout
observation. A single expected untracked delivery file is a known delivery
state or hygiene warning, not unknown workspace contamination. Classify a
real actionable tool failure separately from an expected, correctly handled
probe or diff exit. Only then clean up from the source/coordinator scope.
After cleanup, do not call Git-backed `show_changes` or finish closeout on the
deleted worktree Project. Verify only the source HEAD and status, restoration
of the original worktree list, and retained repo-external evidence from the
source Project Session; a post-cleanup inspection of a deleted Git path is an
invalid observation, not a new Job or profile failure.

### Ad-hoc managed-role dispatch

When the user explicitly requests a registered managed role outside a
`$run-*` workflow, use this policy as a lightweight spawn preflight rather than
adopting a workflow. Query current-workspace profile status first. A configured,
healthy, eligible profile with `catalog_state = current` keeps its registered role routing, but supplies a logical
model tier only when the profile/runtime proves that tier. A uniform raw-model
profile or any other unprovable mapping keeps eligible workspace role routing and
passes tier `unknown`; never infer a tier from the model slug. An unconfigured
workspace or an ineligible profile uses global role routing with tier `unknown`,
with a warning for the ineligible case. Unverifiable or unhealthy status stops
the dispatch. A configured pinned or retired catalog also stops dispatch until
an explicit workspace `set --model-set openai` or `clear`.

Classify only the bounded requested task, resolve it with `mode = adaptive`, and
pass the non-null `dispatch_effort` as `reasoning_effort`. Never choose effort
directly from the role name or perceived simplicity. A role ceiling, capability,
workspace ceiling, or selector conflict stops the spawn; do not weaken the class
or silently reassign an explicitly requested role. Spawn with `agent_type`, no
`model`, and `fork_turns = "none"`, then verify the role and effective effort.
Pass an expected model to the trace helper only when the eligible workspace
profile proves it; otherwise expose only the helper's bounded observed model and
do not claim profile routing. This preflight creates no workflow artifacts,
decomposition, status records, retry loop, or recovery behavior.

For native managed dispatch on local Codex, before accepting the terminal
child result, inspect the child trace using the identifier returned by the
active spawn surface. V2 returns a
task path:

```text
node tools/codex-child-trace.js --task-name '<task-name>' --expected-role '<role>' --expected-model '<configured-model>' --expected-effort '<dispatch-effort>' --wait-ms 5000 --compact
```

Legacy surfaces return an agent UUID:

```text
node tools/codex-child-trace.js --agent-id '<agent-id>' --expected-role '<role>' --expected-model '<configured-model>' --expected-effort '<dispatch-effort>' --wait-ms 5000 --compact
```

Use a unique V2 `task_name` for each dispatch. The helper binds task-name lookup
to the `CODEX_THREAD_ID` that Codex injects into the current shell; an external
diagnostic may pass the same parent UUID explicitly with `--parent-id`. Without
that parent identity, task-name lookup fails instead of accepting a potentially
stale trace. Pass `--expected-model` only when effective Codex configuration
provides a bounded OpenAI model name for the selected role. Omit
`--expected-effort` when no effort was dispatched. This verification attempt is
mandatory when the installed helper is available. A role mismatch
blocks acceptance because it means the configured role was not applied. When
the helper reports an effective effort, rerun the same resolver input with
`observed_effective_effort` and use that updated decision for the next lifecycle
event and final acceptance. If trace evidence is unavailable, keep the decision
`requested`/unverified; never convert it to `enforced`. Formal assurance and an
exact effort override cannot complete successfully without matching evidence.
Ordinary non-strict work may continue only with an explicit unverified warning.

The trace helper reads local Codex V1 or V2 session metadata plus the parent
session's last effective effort at child creation. Parent observation also
accepts `low`, allowing a policy-controlled child at `medium` or above to prove
it did not merely inherit a lower main-session effort. `selector_evidence =
distinct_from_parent` rules out simple parent-effort inheritance but does not
attest Codex's internal implementation path. `matches_parent` means a
same-value selector and inheritance cannot be distinguished; `mismatch` means
the requested effort was not observed. `inheritance_consistent` is likewise
observational, not causal. For role and model verification, the helper emits
only observed values that match the same bounded patterns accepted by
`--expected-role` and `--expected-model`. Optional expected values produce
`role_matches` and `model_matches`; without them, the comparisons are null
while safe observed values remain visible. Missing or invalid role/model
metadata is redacted to null. All other output remains limited to the child ID,
closed effort values, and boolean/enum comparisons; the parent ID is always
redacted. Do not copy parent comparison fields into a
ReasoningObservation, and never persist trace paths or session contents. Simple
follows the same contract in memory and writes no status artifact. Searches
fail closed when the Codex home, a parent directory, or a candidate trace is
reached through a symlink, Windows junction, or other path redirection.

Child-result presentation is controlled by the conversational
`child_result_display=auto|always|exceptions` preference. This is an in-session
presentation preference, not a CLI flag or persisted configuration. It defaults
to `auto`. If the user supplies an invalid value, report that visibly and use
`auto`; do not persist any value across sessions unless the user explicitly asks
for persistence.

- `auto` may suppress only a normal adjacent selection line, and only when the
  user or runtime explicitly confirms that the current client is the official
  Codex Desktop UI and that UI natively displays the child model. Codex CLI and
  unknown client capability retain the full line.
- `always` emits the full adjacent selection line for every child and overrides
  `auto` suppression.
- `exceptions` is an explicit user choice to suppress normal lines independent
  of client UI capability while retaining every exceptional line or warning.

A native managed result is normal only when trace evidence matches the
registered role and expected model, supplies an effective effort matching the dispatched effort,
and the decision is neither degraded nor conflicted and used no recovery
attempt. Inherit and shadow decisions are not silently treated as enforced.
The Desktop UI's model label is not evidence of effective effort. Presentation
never changes the mandatory trace attempt, resolver update, acceptance rules,
or role/model/effort verification.

Missing, unverified, unknown, mismatched, degraded, or conflicted role, model,
or effort states, every recovery attempt, and every error or terminal blocker
remain visible under all three preferences. When a selection line is required,
print one compact adjacent line before the result summary:

```text
reviewer · model=gpt-6-astra (verified) · effort=high (effective)
```

Use the registered role name. Show `(verified)` only when `model_matches = true`;
otherwise show the configured model as `(unverified)` or `model=unknown`. Show
`(effective)` only when the trace supplied `effective_effort`; otherwise label the
effort `(requested)` or `(inherited; unverified)` as applicable. A mismatch must be
visible and continues to follow the workflow's acceptance rules. Emit one required
selection line per child dispatch, including repeated dispatches of the same role. Never merge
multiple dispatches by slash-joining effort values such as `effort=max/high`. If a
single child has different requested, dispatched, or effective values, show separate
named fields, for example:

```text
executor · model=gpt-6-sol (unverified) · requested=max · dispatch=high
```

Do not ask the child to self-report runtime metadata, repeat the child body, or
combine model and effort into one opaque label.

Terminal Flow/Pipeline attempts may write a content-free local observation at:

```text
<run_output_dir>/observations/reasoning/<agent_id>.json
```

Observations retain bounded decision metadata but omit prompts, source, paths,
commands, results, evidence contents, free-text reasons, and conflict text.
