# Adaptive Reasoning and Model-Capability Roadmap

The filename is retained for continuity. Policy v2 still does **not** route
models: it classifies child work, validates the profile-selected role/model
tier, and selects child-spawn reasoning effort. A separate capability-recovery
policy now permits one tightly bounded child uplift after repeated material
reasoning failure.

## Status

The reasoning-specific source contracts are policy/schema version **2 / 2.0**:

- Task producers emit `task_intent`, intent-baseline metadata, legacy
  `reasoning_class`, and bounded `reasoning_signals`.
- The shared resolver projects intent and evidence into a child effort after
  validating the selected role tier and role/context bounds.
- Flow and Pipeline persist complete per-attempt decisions and may write
  content-free local observations; Simple applies the same decision in memory.
- Workspace profiles continue to select the actual role model/tier. The
  resolver does not select, upgrade, downgrade, or otherwise route models.
- Capability-recovery policy/schema version **1 / 1.0** allows only
  `executor`/`generalist`, one tier step, once per task, within a profile
  ceiling and an existing retry opportunity.

TaskList, FlowTaskList, DispatchPlan, TaskStatus, and checkpoint records keep
their existing `protocol_version`; intent metadata is a backward-compatible
optional extension there. The status runtime remains `PROTOCOL_VERSION = 1.0`.
Only the ReasoningPolicy, ReasoningDecision, and ReasoningObservation contracts
advance to policy/schema 2 / 2.0.

The release version remains independently managed by `VERSION`; this policy
documentation does not make a release claim.

## Goal

Make child-agent reasoning selection deterministic, auditable, and semantic:

```text
Task Intent -> Reasoning Class -> Model Capability -> Effort
```

The system should explain why a child was asked for a given effort while
preserving the existing boundary between workflow rigor and runtime model
selection.

## Non-goals

- Selecting a raw provider model identifier from task prose or reasoning
  signals.
- General task-based model routing or automatic model downgrade.
- Raising or lowering the current/main agent's reasoning effort.
- Treating `ultra` as a scalar effort or a substitute for a formal process.
- Replacing verification, review, approval, resource cleanup, or evidence with
  more reasoning effort.
- Changing reviewer models; reviewer recovery remains effort-only.

## Policy v2 model

### Semantic input before effort

The task intent enum is:

| Intent | Baseline |
|---|---|
| `execute`, `inspect` | `routine` |
| `diagnose`, `design`, `review` | `deliberative` |
| `certify` | `assurance` |

The baseline only raises. Bounded signals, an existing explicit
`reasoning_class`, role/context floors, and a qualifying prior reasoning
failure may increase the class. They never reduce it.

`routine` is almost no substantive decision, not merely a small task. `deep`
means non-local or otherwise demanding reasoning. `assurance` is a formal
accept/reject process, not a larger value on the deep-thinking scale.

The detailed signal vocabulary, projection matrix, mode behavior, and
role/context constraints live in the [Reasoning Policy Protocol](../protocols/REASONING_POLICY.md).
That protocol is the single human-readable effort table; workflow documents
must not create competing maps.

### Capability is a validation boundary

The profile/runtime supplies the actual registered role model and its proven
logical tier (`mini`, `standard`, `strong`, or `unknown`). The resolver compares
the class requirement with that selected tier, then chooses effort only if the
capability is adequate.

`unknown` is deliberate when a tier cannot be proven. It is not a guess from a
model slug. It supports the routine and deliberative rows conservatively, while
deep and assurance conflict by default.

Policy v2 deliberately makes deep `mini`/`unknown` work conflict by default.
An explicit `allow_degraded_deep` compatibility input can request `max` for
deep work and records `model_tier_below_deep_requirement`; it cannot be
inferred, cannot certify work, and does not change the selected model. For an
adaptive dispatch, missing selector support, unavailable `max`, or observed
effort below `max` conflicts instead of degrading again.

### Review is not certification

The reviewer role has a deep floor, so an ordinary reviewer dispatch never
resolves below deep even when context metadata is missing. Formal workflow
dispatches still carry context to preserve their capability and assurance
semantics:

- `ad-hoc-review`: deep, non-strict.
- `pipeline-review`: deep, strong-tier minimum, non-strict.
- `formal-assurance`: fixed assurance, strong tier, strict.

`--review=max` is an exact effort override for an ordinary reviewer spawn. It
does not change the reviewer model or convert the review into certification.
A formal accept/reject gate must use `certify`, `formal_accept_reject`, or the
`formal-assurance` context.

Reviewer max may also come from a material high-consequence
security/data-integrity review or a reviewer reasoning-recovery attempt. P3,
wording/style, generic risk labels, and optional hardening do not qualify.

### Controlled enforcement modes

- `inherit` preserves v2 classification metadata but never applies an effort
  selector. Exact overrides and strict requirements conflict.
- `shadow` computes the requested effort and records it without applying a
  selector. Strict assurance conflicts; ordinary shadowed review-max remains a
  computed, not enforced, request.
- `adaptive` requests the returned child selector and verifies effective effort. A non-strict, non-exact
  selector-unavailable decision may be degraded; strict and exact requests
  conflict.

## Artifact and compatibility rollout

New TaskList, FlowTaskList, DispatchPlan, and TaskStatus producers emit these
backward-compatible optional extensions without changing their artifact
`protocol_version`:

- `task_intent`
- `intent_baseline_class`
- `classification_source = task_intent`
- legacy-compatible `reasoning_class`
- `reasoning_signals`
- explicit `allow_degraded_deep` when compatibility is requested

Older input remains usable:

- an explicit legacy class is recorded as `legacy_explicit_class`;
- no intent and no class falls back to the role target and records
  `legacy_role_target`.

Either TaskStatus legacy source carries its class/signals pair. Policy-v2
default, role, and context objects are canonical managed snapshots; unlisted
roles may use the resolver default in memory, but must be registered before a
reasoning decision is persisted in AgentStatus.

This preserves historical artifacts without asking workflows to infer a new
intent from raw model names or free-form descriptions.

The status writer continues to stamp TaskStatus and checkpoint artifacts with
`PROTOCOL_VERSION = 1.0`; their intent metadata does not create a new status
protocol version.

## Failure-aware recovery

Only a concrete `reasoning_failure` changes the next reasoning decision:

1. routine -> deliberative;
2. deliberative -> deep;
3. deep stays deep with a `recovery_boost` to `max`, never assurance.

The boost exists only when the final class remains deep. A later explicit
assurance requirement clears it and relies on assurance's own strict max rule.

Timeouts, permissions, network issues, unavailable dependencies, browser
startup failures, CLI-format errors, and tool failures remain operational.
They use their own bounded retry/recovery controls and do not escalate effort.

After the same concrete material reasoning failure repeats with no meaningful
progress, an existing Flow/Pipeline recovery opportunity may instead perform
one child capability recovery. `executor` and `generalist` alone are eligible.
The active profile supplies the next tier ceiling and raw model. The recovered
attempt reprojects normal effort for that tier, then Codex must verify both
model and effort through the local trace. Recovery never resets a budget,
changes an orchestrator, or creates assurance semantics.

## Evidence and evaluation roadmap

### Local observations

Flow and Pipeline write one terminal, local-only reasoning observation per
instrumented child attempt under:

```text
<run_output_dir>/observations/reasoning/<agent_id>.json
```

The record is intentionally content-free. It can contain versioned decision
metadata, outcome, and optional timing, but not prompts, code, paths,
commands, result bodies, evidence contents, free-text reasons, or conflict
text.

Local Codex runs also use `tools/codex-child-trace.js` as an ephemeral evidence
adapter. It reads only the child role/effort metadata needed for comparison and
the parent's effective effort at child creation; its raw output is not an
observation record. Output may include syntactically bounded observed child
role/model values independently of optional comparisons; missing or invalid
values and the parent ID remain redacted. The observed child effort is fed back
to the shared resolver, while paths and session content remain excluded.
Parent/request/child equality is explicitly indeterminate between same-value
selection and inheritance.

### Calibration without general model routing

Future evaluation can test whether the policy's effort projection is well
calibrated using fixed fixtures, deterministic acceptance checks, labeled
review findings, and traceable outcomes. It may recommend a policy-table
revision only through a deliberate policy change and validation update.

It must not turn observations into free-form dynamic model routing. If a
selected profile tier cannot meet a required class, the default outcome remains
a capability conflict unless the separate bounded recovery policy explicitly
qualifies an existing retry.

### Bounded capability recovery

Direct Simple, Flow, and Pipeline use `off` by default. Adaptive `delivery` and
`autonomous` use `auto`; other presets use `off`. `shadow` computes the same
decision without dispatch. The policy is deterministic, chooses only one
profile-approved tier step, leaves raw model/provider mapping to the workspace
profile, and fails closed when selector or trace evidence is missing.

This is recovery, not general optimization: it cannot pre-route an ordinary
task to a different model, recursively promote, lower cost by downgrade, or
spend extra retries. See
[Child Capability Recovery](../protocols/CAPABILITY_RECOVERY.md).

### Evidence gates for a future policy revision

Before changing a class floor or effort projection:

- use a fixed source snapshot and an explicit candidate matrix;
- include deterministic acceptance tests where possible;
- keep deep/assurance quality gates separate from routine throughput metrics;
- record failure modes, repair counts, and unavailable-selector cases;
- stop on critical regressions or repeated deterministic failures;
- preserve the no-raw-model-routing and no-current-main-effort boundaries.

## Open questions

- Which fixture corpus best distinguishes a workload-heavy routine task from a
  genuinely deliberative one?
- Which roles need stronger fixed semantic ceilings as more workflow types use
  task intent?
- Should non-resumable Simple runs ever gain a local observation sink, or stay
  in-memory only?
- What evidence threshold should justify a future policy-table revision without
  weakening deep or assurance safeguards?
- Which upstream Codex release first guarantees that per-spawn effort survives
  custom-role config application, allowing mismatch telemetry to become an
  exceptional guard instead of a routinely exercised compatibility check?
- Does measured recovery success justify keeping Adaptive
  `delivery`/`autonomous` on `auto`, or should either preset return to opt-in?

## Related documents

- [Reasoning Policy Protocol](../protocols/REASONING_POLICY.md)
- [Child Capability Recovery](../protocols/CAPABILITY_RECOVERY.md)
- [Materiality Gate](../protocols/MATERIALITY_GATE.md)
- [Runtime Agent Model Profiles](runtime-agent-model-profiles.md)
- [Codex Mapping](codex-mapping.md)
- [Pipeline Protocol](../protocols/PIPELINE_PROTOCOL.md)
- [Schemas](../protocols/SCHEMAS.md)
