# Reasoning Policy Protocol

This protocol controls reasoning effort for child-agent dispatches. It does not
change the model or effort of the already-running current/main agent.

The authoritative projection table and role bounds are
`protocols/reasoning-policy.json`. Workflows must use
`tools/reasoning-policy.js`; they must not reproduce the class-to-effort table
in prompt logic.

## Run Policy

Simple, Flow, Pipeline, and Adaptive accept one run-level flag:

```text
--reasoning=inherit|shadow|adaptive
```

Version 1 defaults to `adaptive`:

- `inherit`: do not apply adaptive effort. An explicit `--review=max` remains
  an exact reviewer-only override for backward compatibility. Strict policy
  such as formal assurance conflicts because inherit cannot enforce it.
- `shadow`: resolve and record the decision but omit the spawn effort selector.
  Strict policy and exact effort overrides conflict instead of proceeding
  without enforcement.
- `adaptive`: resolve the decision and pass a non-null `dispatch_effort` to the
  child spawn. When the selector is unavailable, a non-strict, non-exact
  decision instead returns `degraded` with `dispatch_effort = null`; omit the
  selector and continue without claiming enforcement. Strict or exact requests
  conflict and block.

Invalid values warn once and fall back to `adaptive`. Flow and Pipeline persist
`reasoning_mode`, `reasoning_policy_version`, and `reasoning_ceiling` in
checkpoint flags. Version 1 uses `reasoning_ceiling = max`; a future workspace
reasoning policy may lower that ceiling but may never lower the version 1
signal, global, model-tier, class-projection, or formal-assurance floors. A
ceiling below the projected requirement is fail-closed: it produces a conflict
and never clips the requested effort downward.

## Task Classification

Task-producing agents emit `reasoning_class` plus every applicable bounded
`reasoning_signals` value. They never emit a raw model name or raw effort.
Risk, verification, approval, resource class, and reasoning demand remain
separate controls.

Choose the highest applicable class:

| Class | Signals and decision rule |
|---|---|
| `routine` | Fully specified and local work with only `fully_specified` and/or `local_scope` |
| `deliberative` | `multi_step` or `cross_module`, with no deep signal |
| `deep` | Any of `cross_system`, `ambiguous_root_cause`, `architecture_tradeoff`, `non_local_invariant`, `adversarial_input`, `numerical_sensitivity`, `security_boundary`, or `data_integrity` |
| `assurance` | A formal accept/reject gate identified by `formal_accept_reject`; ordinary implementation tasks do not use this class |

The authoritative signal floors are `signal_minimum_classes` in
`protocols/reasoning-policy.json`. Task, Flow, DispatchPlan, and TaskStatus
schemas reject a class below that floor. The resolver independently reapplies
the same floor so legacy or external input cannot under-allocate effort.

When evidence supports two adjacent classes, choose the higher class. Do not
raise effort merely because a task is destructive or high risk; use approval,
verification, and review gates for that risk. Conversely, reversible work may
still be `deep` when its reasoning signals require it.

`prior_reasoning_failure` is attempt metadata, not an initial task label. Set it
only after a concrete logic, diagnosis, invariant, or review failure. Tool,
permission, dependency, timeout, and other operational failures do not qualify.

For a multi-task batch, copy the highest task class and the sorted union of its
signals into the DispatchPlan batch. Do not combine tasks when the assigned
role cannot accept that class or when their resolved spawn settings are
incompatible. The per-attempt AgentStatus decision remains authoritative.
The same compatibility rule applies before Simple and Flow dispatch: fixed
`routine` roles such as `peon` cannot receive deliberative, deep, or assurance
work. A dispatch context may raise the requested class but never widens a
fixed role's ceiling. Reroute to a semantically compatible role; never weaken
the class.

## Resolver Input

Before every child spawn, call:

```text
node tools/reasoning-policy.js --input-json '<json>' --compact
```

The input contains only fields known at dispatch time:

```json
{
  "role": "executor",
  "mode": "adaptive",
  "reasoning_class": "deep",
  "reasoning_signals": ["cross_module", "non_local_invariant"],
  "model_tier": "standard",
  "workspace_ceiling": "max",
  "selector_available": true,
  "runtime_supported_efforts": ["medium", "high", "xhigh", "max"],
  "prior_reasoning_failure": false
}
```

Use `dispatch_context = ad-hoc-review | pipeline-review | formal-assurance`
when applicable. For `--review=max`, also set `explicit_effort = max`.

Resolve `model_tier` from the healthy, eligible workspace profile's role map
when available. Use `unknown` for global inheritance, uniform raw-model
profiles, ineligible workspace layers, or any case where a logical tier cannot
be proven. Never infer a tier from a model slug. Omit
`runtime_supported_efforts` when the runtime does not publish that capability.
Set `selector_available` truthfully from the current spawn surface.

## Dispatch Rules

1. Exit code `2` is invalid policy/input and blocks the spawn.
2. Exit code `3`, or `enforcement_status = conflict`, blocks the spawn. Report
   the conflict instead of silently weakening the request.
3. In `adaptive`, pass a non-null `dispatch_effort` as the native per-spawn
   `reasoning_effort`. If a non-strict, non-exact decision is `degraded` because
   the selector is unavailable, `dispatch_effort` is null: omit the selector,
   continue with the registered role, and do not claim enforcement. Any strict
   or exact selector-unavailable decision is a blocking conflict. Always omit
   `model`, so the effective profile still owns model selection.
4. In non-strict, non-exact `shadow`, omit `reasoning_effort` even though the
   decision contains a requested effort. Strict policy or an exact effort
   override conflicts and blocks instead of running in shadow.
5. In `inherit`, omit `reasoning_effort` unless the resolver returns the exact
   explicit `--review=max` override.
6. Stage 1 never performs a model override. A non-strict
   `requires_model_escalation = true` may continue at the returned effort but
   remains `degraded`; a strict conflict stops. Upward model-tier escalation is
   a later, separately gated capability.
7. Verify the spawned child trace. When effective effort is observable, rerun
   the resolver with `observed_effective_effort` and persist the updated
   decision. Without trace evidence, keep `requested`; never relabel it
   `enforced`. A mismatch is `conflict` for strict policy or an exact explicit
   effort such as `--review=max`; non-strict adaptive requests may report
   `degraded`.

Flow and Pipeline include the complete resolver decision in `agent.started`
and later agent lifecycle payloads as `reasoning`. The status writer stores it
in AgentStatus and emits a terminal, local-only observation under:

```text
<run_output_dir>/observations/reasoning/<agent_id>.json
```

Observation creation is deterministic and makes no model call. AgentStatus
keeps the complete decision, while the observation stores a bounded summary
that omits `agent`, `reasons`, and `conflict` free text. The record uses a field
allowlist and excludes prompts, result summaries, source, paths, commands,
logs, evidence contents, and artifact contents.

Simple has no run/status artifacts, so it applies the same resolver and spawn
rules in memory without writing observations.

## Quality Floors

- No managed adaptive child dispatch resolves below `medium`.
- `mini` resolves no lower than `high`.
- `ultra` is not part of the scalar effort order.
- Override policy files may strengthen but never lower the version 1 signal,
  model, class-projection, or formal-assurance minimums.
- An exact explicit effort never silently downgrades.
- Formal assurance requires the policy's strong-tier and highest-single-agent
  constraints or stops with a conflict.
