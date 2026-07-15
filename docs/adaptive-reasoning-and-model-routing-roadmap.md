# Adaptive Reasoning And Model Routing Roadmap

## Status

This document now tracks an implementation in progress:

- Stage 1 policy, resolver, schemas, task hints, workflow flag, status fields,
  and tests are implemented in repository source.
- `adaptive` is the version 1 default for supported engineering workflows;
  `inherit` is the rollback mode and `shadow` is the diagnostic mode. Neither
  may bypass strict formal assurance, and shadow cannot satisfy exact effort.
- Stage 2 local content-free observation writing is implemented. Aggregation,
  controlled paired evaluations, and automatic model escalation remain future
  work.
- Workspace agent profiles still select models rather than effort. Their proven
  logical role tier is one input to the separate reasoning resolver.

## Goal

Add a deterministic, auditable way to select reasoning effort for child-agent
dispatches, then use local observations and controlled evaluations to decide
whether bounded model-tier escalation is justified.

The intended quality baseline is:

- no managed child-agent dispatch below `medium` reasoning
- `mini` model tiers normally start at `high`
- small-model effort compensates by at most one reasoning class
- deep or assurance work moves to a stronger model tier instead of treating
  `mini + max` as equivalent to a strong model
- formal assurance decisions use the strongest permitted model tier and the
  highest supported single-agent reasoning effort

This roadmap applies only to child dispatches. A `$run-*` skill adopts its
workflow in the current/main agent and cannot change that already-running
agent's model or reasoning effort mid-turn.

## Non-Goals

- Letting an orchestrator choose arbitrary provider model identifiers.
- Treating `ultra` as a larger scalar reasoning effort. It may change the
  delegation topology and is excluded from `highest_single_agent`.
- Uploading prompts, source code, file paths, artifacts, or observations.
- Inferring token usage when the runtime does not report it.
- Using reviewer output alone as ground truth for model quality.
- Enabling automatic model downgrades in the initial design.
- Replacing verification, review, approval, or evidence gates with more model
  reasoning.

## Design Principles

### Semantic Demand Before Runtime Effort

Task planning should describe a runtime-neutral `reasoning_class`. A shared
resolver projects that class into a runtime model tier and reasoning effort.
Task-producing agents must not emit raw Codex model names.

The four classes are:

| Class | Meaning | Typical work |
|---|---|---|
| `routine` | Complete specification, local scope, known verification | Mechanical edits, test execution, structured transformation |
| `deliberative` | Multiple steps, files, tradeoffs, or bounded diagnosis | Normal implementation, planning, synthesis, ordinary review |
| `deep` | Non-local reasoning, uncertain root cause, adversarial cases, or difficult invariants | Cross-system debugging, architecture analysis, complex correctness work |
| `assurance` | A formal accept/reject or high-confidence final decision | Release gate, security validation, attack-path validation, final judge |

`risk` and `reasoning_class` remain separate. A destructive but mechanically
simple operation primarily needs approval and verification. A reversible
algorithmic change may still need deep reasoning.

### Model Tier And Effort Are A Joint Decision

The initial Codex projection should use this conservative matrix:

| Reasoning class | `standard` or `strong` | `mini` |
|---|---|---|
| `routine` | `medium` | `high` |
| `deliberative` | `high` | `xhigh` |
| `deep` | `xhigh` | Require escalation to `standard` or `strong`; non-strict fallback may request `max` |
| `assurance` | Require `strong` plus `highest_single_agent` | Invalid; require escalation or fail |

`highest_single_agent` is a symbolic policy value. At dispatch time it resolves
to the highest supported non-`ultra` effort for the selected model and current
runtime capability. Strict assurance work fails clearly if that requirement
cannot be verified.

The exact matrix must remain versioned policy, not duplicated prose across
Simple, Flow, Pipeline, Analysis, Committee, UX, and security workflows.

### Role Policy Constrains Task Classification

Roles need semantic policies rather than permanently embedded raw effort
values. A proposed shape is:

```yaml
roles:
  test-runner:
    mode: fixed
    reasoning_class: routine

  executor:
    mode: adaptive
    floor_class: routine
    target_class: deliberative
    ceiling_class: deep

  reviewer:
    mode: adaptive
    floor_class: deliberative
    target_class: deep
    ceiling_class: assurance

dispatch_contexts:
  formal-security-validation:
    mode: fixed
    reasoning_class: assurance
    minimum_model_tier: strong
    strict: true
```

A fixed semantic class still projects differently by model tier. For example,
`test-runner: routine` becomes `medium` on a standard model and `high` on a
mini model.

Workflow dispatch context may raise a role policy but must not lower it. This
matters when the same role serves different purposes: an ad-hoc reviewer may
be `deliberative` or `deep`, while a formal security validation or release gate
is fixed `assurance` even if both dispatch the registered `reviewer` role.

### Profiles Define The Available Envelope

The existing neutral agent profile should continue to map roles to
`mini | standard | strong`. Reasoning policy should be a separate workspace
policy managed by the same profile tooling rather than new keys hidden inside
the existing model profile JSON.

A future workspace policy may define:

```yaml
reasoning_policy:
  mode: adaptive
  global_floor: medium
  mini_floor: high
  ceiling: max
  allow_ultra: false

model_routing:
  mode: profile
  allow_downgrade: false
  maximum_tier: strong
```

`mode: profile` means the workspace-selected role model remains fixed.
`mode: escalate` is a later, opt-in Stage 2 capability and may only move upward
within the workspace catalog and policy envelope.

## Deterministic Decision Contract

Classification may require model judgment, but projection and enforcement must
be deterministic.

Task-producing stages should emit:

```json
{
  "reasoning_class": "deep",
  "reasoning_signals": [
    "cross_module",
    "ambiguous_root_cause",
    "security_boundary"
  ]
}
```

Reason codes should come from a bounded vocabulary. The initial vocabulary can
include:

- `fully_specified`
- `local_scope`
- `multi_step`
- `cross_module`
- `cross_system`
- `ambiguous_root_cause`
- `architecture_tradeoff`
- `non_local_invariant`
- `adversarial_input`
- `numerical_sensitivity`
- `security_boundary`
- `data_integrity`
- `formal_accept_reject`
- `prior_reasoning_failure`
- `explicit_user_override`

The resolver then applies this order:

1. Start from the task `reasoning_class` and raise it to the authoritative
   minimum of every bounded `reasoning_signal`.
2. Apply a fixed role class, or raise to the role floor without widening a
   fixed role ceiling through dispatch context.
3. Raise one class after a concrete prior reasoning failure. Operational,
   dependency, permission, and tooling failures do not qualify.
4. Apply an explicit user override such as `--review=max`.
5. Validate workspace floors, ceilings, and role exceptions.
6. Determine the minimum required model tier.
7. Project class plus model tier to a requested reasoning effort.
8. Validate the selected model's runtime-supported effort set.
9. Record requested and observed effective settings separately.

Conceptually:

```text
required_class = max(
  task_class,
  signal_floor,
  role_floor,
  reasoning_failure_escalation,
  explicit_class_request
)

requested_effort = project(required_class, selected_model_tier, policy_version)
```

If a floor or projected class requirement is above a workspace ceiling, the
dispatch must fail; a ceiling is fail-closed and never clips effort downward.
If a strict runtime requirement cannot be enforced, the dispatch must fail
rather than silently inherit a weaker setting.

## Stage 1: Deterministic Effort Selection

Stage 1 keeps model selection owned by the effective workspace profile. It
adds effort classification, deterministic projection, traceability, and model
tier compatibility checks without automatic model overrides.

### 1.1 Contract And Schemas

- Define a versioned reasoning policy schema.
- Add optional `reasoning_class` and bounded `reasoning_signals` fields to
  TaskList and FlowTaskList during compatibility rollout.
- Define role policies for stage-scoped agents that are not represented by a
  canonical task, such as specifier, planner, reviewer, and final judges.
- Extend dispatch/agent status contracts with requested and effective model
  tier and effort fields.
- Persist the effective reasoning policy mode and version in resumable
  checkpoints.
- Keep raw runtime model identifiers out of neutral task artifacts.

Reasoning decisions attach to individual spawn attempts. A DispatchPlan may
carry a batch default, but the AgentStatus or equivalent per-attempt record is
authoritative. Tasks with incompatible resolved dispatch settings must not be
silently combined into one spawn.

### 1.2 Shared Resolver

Implement one tested resolver used by every supported workflow. A conceptual
interface is:

```text
resolve_reasoning(
  role,
  reasoning_class,
  reasoning_signals,
  model_tier,
  role_policy,
  workspace_policy,
  runtime_capabilities,
  explicit_override,
  prior_attempt
) -> ReasoningDecision
```

The decision result should contain:

- policy version
- requested and effective reasoning class
- selected model tier
- requested effort
- effective effort when observable
- enforcement status: `inherited | shadow | requested | enforced | degraded | conflict`
- bounded reason codes
- conflict or degradation reason

The resolver should be a normal code path with table-driven tests. Workflow
Markdown should describe when to call it, not reimplement its mapping rules.

### 1.3 Rollout Modes

Use three modes:

- `inherit`: rollback behavior; do not apply adaptive effort, except the exact
  legacy `--review=max` override; strict formal assurance conflicts
- `shadow`: compute and record the decision but do not pass an effort override;
  strict policy and exact effort requests conflict
- `adaptive`: compute and request the per-spawn effort, then verify it when
  observable; selector-unavailable non-strict/non-exact decisions continue as
  `degraded` with no selector, while strict/exact decisions conflict

Recommended rollout:

1. Ship policy validation and unit tests.
2. Default supported engineering workflows to `adaptive` with a documented
   `--reasoning=inherit` rollback path.
3. Use `shadow` for diagnostics, comparison, and runtime capability audits.
4. Keep model escalation disabled until Stage 2 quality gates pass.

`--review=max` remains an exact reviewer-only request throughout rollout. It
must still preserve the workspace-selected reviewer model.

### 1.4 Stage 1 Exit Criteria

- No enforced child dispatch can resolve below `medium`.
- A `mini` dispatch cannot resolve below `high`.
- `assurance` requires a strong tier and verified highest single-agent effort.
- All resolver cells and conflict paths have table-driven tests.
- Resume preserves the same policy version and explicit overrides.
- Unsupported runtime selectors produce an honest status rather than a false
  enforcement claim; strict or exact requests conflict and block.
- Existing `inherit` behavior and non-Codex fallback remain available.

## Stage 2: Evidence-Gated Model Escalation

Stage 2 first collects local observations and controlled eval evidence. Model
escalation is the final Stage 2 capability, not the data collection mechanism.

### 2.1 Local Observation Record

Each instrumented Flow or Pipeline run writes one atomic local record per
terminal child attempt under its existing run output directory:

```text
<run_output_dir>/observations/reasoning/<agent_id>.json
```

No network transmission is part of this design. The output root is already a
local, normally gitignored workflow artifact boundary. Aggregation across runs
must be an explicit local command.

The canonical shape is defined by
`protocols/schemas/reasoning-observation.schema.json`; see
`protocols/examples/reasoning-observation.valid.json`. It contains run/attempt
identity, outcome, optional wall time, and a bounded ReasoningDecision summary.
Complete `reasons` and `conflict` diagnostics remain in AgentStatus. A
compact illustrative subset is:

```json
{
  "schema_version": "1.0",
  "observed_at": "2026-07-14T10:30:01.000Z",
  "run_id": "...",
  "task_id": "...",
  "agent_id": "...",
  "orchestrator": "orchestrator-pipeline",
  "attempt": 1,
  "outcome": "done",
  "wall_time_ms": 1000,
  "reasoning": {
    "policy_version": "1",
    "effective_class": "deep",
    "model_tier": "standard",
    "requested_effort": "xhigh",
    "effective_effort": "xhigh",
    "enforcement_status": "enforced"
  }
}
```

The observation record must not copy:

- the user prompt
- agent prompts or responses
- source code or diffs
- file paths
- artifact bodies
- command output
- credentials or environment values
- free-text agent labels, reason strings, or conflict messages

Version 1 intentionally omits usage and content-derived fields. A later schema
may add structured runtime-reported usage, but it must use `null` when
unavailable and must never estimate tokens from text length.

### 2.2 Outcome Signals

Useful quality proxies already exist in run artifacts:

- task outcome: done, partial, blocked, or failed
- deterministic test/build/lint result
- initial and final review result
- review issue counts by category and severity
- repair attempts and orchestrator redispatches
- repeated failure signatures
- cleanup success for resource-heavy work
- wall-clock duration from lifecycle timestamps

These signals are useful for finding suspicious policy cells. They are not
causal proof that one model/effort pair is better because real tasks differ in
difficulty and reviewers are imperfect.

Optional human feedback should be an explicit local annotation command, not a
new prompt after every run. It may record a bounded outcome such as
`accepted | needed_manual_fix | rejected`, with an optional reason code and no
free-form project content.

### 2.3 Local Aggregation

A future aggregation tool should read selected run directories and emit a
sanitized summary, for example:

```text
reasoning-eval-summary.json
reasoning-eval-summary.md
```

Group results by:

- policy version
- reasoning class
- role
- model tier
- requested/effective effort
- enforcement status
- outcome and review result

The summary should expose sample size and missing-data counts. It must not
present observational correlations as quality improvements.

### 2.4 Controlled Paired Evaluations

Routing changes require paired evals in addition to run observations.

Build a sanitized fixture corpus with:

- bounded implementation tasks with deterministic acceptance tests
- review patches with labeled correctness, security, and test findings
- seeded audit targets with known findings and severity labels
- planning/routing fixtures with schema and decision-quality checks
- representative routine, deliberative, deep, and assurance classes

Compare candidate model/effort pairs against the same task contract and source
snapshot in isolated worktrees or disposable fixture repositories. Judges must
be blind to the candidate setting. Prefer deterministic acceptance checks;
where model judging is necessary, combine it with labeled expectations and a
fixed strong judge policy.

Measure:

- acceptance-test pass rate
- seeded-finding recall and false-positive rate
- escaped defects found by final review
- first-pass and final-review pass rates
- repair and redispatch counts
- completion, partial, blocked, and failure rates
- wall-clock time
- runtime-reported usage when available

Observational records identify which cells deserve an eval. Only paired evals
should authorize a routing-policy change.

### 2.5 Token And Cost Containment

Local observations do not require an additional model call. They serialize
metadata already produced by the run. A deterministic local aggregator also
adds no model tokens.

Paired evaluations are intentionally expensive and must remain separate from
production workflows:

- never duplicate every production dispatch for A/B comparison
- run evals only through an explicit developer command against fixtures
- test one disputed routing cell or policy transition at a time
- declare the candidate matrix, run count, model/effort pairs, and stop
  conditions before execution
- stop early on critical quality regressions or repeated deterministic failures
- use deterministic tests and labeled findings before adding a model judge
- reuse fixed snapshots and cached non-model setup where isolation permits
- report the measured token/runtime cost of the eval itself when the runtime
  exposes usage

Observation should narrow the eval matrix. It should not continuously spend
tokens trying every model/effort combination.

### 2.6 Decision Gates

To retain the initial adaptive default and broaden it beyond the first
supported workflows:

- every reasoning class and role class used by the policy has fixture coverage
- no candidate violates the global or model-tier floors
- routine/deliberative candidates meet a documented non-inferiority quality
  margin against the current controlled baseline
- deep and assurance fixtures show no regression in critical correctness or
  seeded high-severity finding recall
- latency or usage claims use runtime-reported measurements, not estimates

Before enabling model escalation:

- the runtime selector can enforce and report the selected registered role,
  model, and effort
- profile and catalog validation can resolve the requested logical tier
- deep/assurance paired evals show a material quality benefit from escalation
- no downgrade path exists
- failure and resume preserve the same requested tier and policy version

Exact sample sizes and non-inferiority margins should be set with the first
fixture corpus and reported with confidence intervals. A small number of
heterogeneous production runs is not a valid release gate.

### 2.7 Upward-Only Model Escalation

Once the gates pass, add an opt-in policy:

```yaml
model_routing:
  mode: escalate
  allow_downgrade: false
  maximum_tier: strong
```

The workflow emits only `minimum_model_tier`. The runtime adapter resolves that
logical tier through the selected workspace model set. It must not accept a raw
model slug from TaskList, FlowTaskList, or DispatchPlan.

Resolution order:

1. Read the profile-selected role tier.
2. Compare it with the task/role minimum tier.
3. Keep the profile tier when it is sufficient.
4. If insufficient and escalation is enabled, choose the lowest permitted tier
   that satisfies the requirement.
5. If escalation is disabled or unavailable, reroute to a semantically
   compatible stronger role when one exists; otherwise report a capability
   conflict.
6. Verify the spawned child trace before claiming the model was applied.

Automatic downgrade remains out of scope. Workspace profiles continue to own
the expected model quality and cost envelope.

### 2.8 Stage 2 Exit Criteria

- Observation records are local-only, content-free, versioned, and optional to
  aggregate.
- Missing runtime usage remains explicit rather than estimated.
- A fixture corpus covers all enabled reasoning classes.
- Paired eval reports are reproducible from a fixed source snapshot.
- Model escalation is opt-in, upward-only, catalog-bounded, and trace-verified.
- Strict assurance never silently runs on an insufficient model or effort.

## Suggested Implementation Order

1. Completed: approve the policy vocabulary and medium/high floors.
2. Completed: add reasoning policy and observation schemas plus fixtures.
3. Completed: implement and unit-test the shared resolver.
4. Completed: add task/stage classification and adaptive/shadow decisions.
5. Completed: extend agent status/checkpoint persistence and local observations.
6. Completed in source: default supported Codex workflows to adaptive effort.
7. Build the fixture corpus and local aggregator.
8. Publish a paired eval report for the initial projection matrix.
9. Use the report to retain or revise the projection matrix and decide whether
   to expand adaptive effort to the remaining Codex workflows.
10. Implement opt-in upward-only model escalation only if the evidence gates
    pass.

## Open Questions

- Should future non-resumable Simple runs gain an explicit local observation
  sink, or remain in-memory only?
- Which roles should be fixed `routine` versus adaptive with a routine floor?
- Should ordinary Pipeline review target `deep`, or only escalate to `deep`
  when high-risk or L-complexity tasks are present?
- Which runtime capability source is authoritative when static catalog metadata
  and the live spawn selector differ?
- Should a uniform-mini workspace reject all strict assurance workflows during
  preflight, or offer a one-run profile escalation with explicit confirmation?
- What fixture corpus and non-inferiority margin are sufficient before enabling
  upward-only model escalation?

## Related Documents

- [Reasoning Policy Protocol](../protocols/REASONING_POLICY.md)
- [Runtime Agent Model Profiles](runtime-agent-model-profiles.md)
- [Codex Mapping](codex-mapping.md)
- [Pipeline Protocol](../protocols/PIPELINE_PROTOCOL.md)
- [DispatchPlan Schema](../protocols/schemas/dispatch-plan.schema.json)
- [TaskList Schema](../protocols/schemas/task-list.schema.json)
- [FlowTaskList Schema](../protocols/schemas/flow-task-list.schema.json)
- [AgentStatus Schema](../protocols/schemas/agent-status.schema.json)
- [Token Optimization Retrospective](token-optimization-retrospective.md)
