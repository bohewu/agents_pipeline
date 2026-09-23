# Codex GPT-6 Routing Guidance

This document records the repository's current operating recommendation for GPT-6 on Codex and the evidence required before changing model routing. It is guidance for operators and maintainers, not a new runtime policy. The canonical child mappings remain the versioned model set and reasoning projection under `runtimes/codex/model-sets/` and `protocols/reasoning-projections.json`.

## Current baseline

As of 2026-09-23, use Codex CLI 0.156.1 or newer as the recommended baseline when evaluating current GPT-6 Sol/Luna workflows. The repository's older Codex 0.145.0 minimum still describes the managed multi-agent V2 and per-spawn reasoning feature floor; the recommended GPT-6 baseline does not silently raise that historical minimum.

For long-lived orchestration, start the current/main Codex session on:

- model: `gpt-6-sol`
- reasoning effort: `medium`
- Codex speed: Standard

This is an operator recommendation, not a workspace-profile setting. The reasoning policy applies only to child dispatches and never changes the already-running current/main model or effort. Fast mode may be useful when latency matters, but it consumes more Codex credits than Standard and is not the default for cost-sensitive orchestration.

For child routing, keep the current `openai@4` mapping unless the operator explicitly selects another supported profile:

| Neutral tier | OpenAI model |
|---|---|
| mini | GPT-6 Luna |
| standard | GPT-6 Sol |
| strong | GPT-6 Astra |

`balanced` remains the normal starting workspace profile for general repository work. This document does not modify `balanced`, the GPT-6 reasoning projection, reviewer requirements, initial strong routing, or capability recovery.

## Why the main session starts on Sol

The current/main agent owns workflow control and can remain alive across decomposition, child dispatch, validation, repair, review, and synthesis. Even when each new user or child message is short, repeated orchestration turns reuse and extend a larger session context. The main model therefore optimizes for sustained orchestration efficiency rather than maximum capability on every turn.

Use Astra as a bounded high-value child when the existing role and policy require or justify it instead of paying the strong-model cost on every orchestration iteration. If a task genuinely needs the current/main agent itself to perform unusually difficult reasoning, raising its effort or starting a deliberately scoped Astra session remains an explicit operator choice.

## Luna policy: expand evidence before expanding semantics

Luna is the preferred low-cost model for the existing mini-tier contracts, including mechanical or tightly bounded helpers. Use those roles aggressively when their semantic contract honestly fits the work.

Do not relabel ambiguous, design-heavy, security-sensitive, or non-local work as `routine` merely to reach Luna. A small change can still be deliberative or deep, and the existing reasoning classifier remains authoritative.

OpenAI's published GPT-6 software-engineering results make broader Luna use worth testing, but public benchmarks are not repository-specific evidence. Before creating a broader Luna implementation route or lowering an existing standard-tier role, first run controlled comparisons on real tasks whose acceptance contract can remain identical across models.

## Astra policy: keep strong roles bounded

Keep the current strong-tier behavior until repository-specific measurements justify a narrower change. In particular, do not blanket-downgrade:

- Pipeline reviewer or formal assurance
- security-sensitive strong roles
- strong judges covered by existing profile policy
- qualified first-attempt `executor-strong`
- the existing qualified Sol-to-Astra recovery path

The goal is not to minimize strong-model calls at any cost. The goal is to minimize total completion cost while preserving required correctness, security, review, and recovery behavior.

## Tuning order

### Phase 1: operational baseline

1. Use Sol/medium on Standard speed as the normal current/main orchestration starting point.
2. Keep `openai@4`, `openai-gpt6-v1@1`, and the selected workspace profile unchanged.
3. Use Codex CLI 0.156.1 or newer for current GPT-6 routing measurements.
4. Before managed dispatch in each checkout or worktree, verify workspace profile status, health, trust eligibility, catalog state, and saved bindings.
5. After a Codex upgrade, verify the runtime actually serving the session and run one representative managed child trace. Spawn success alone does not prove role/model/effort selection.
6. Keep Ultra outside the current effort ordering. Ultra changes delegation behavior and is not treated as a simple effort level above `max` under this repository's leaf-worker architecture.

Phase 1 changes documentation and operating practice only. It does not change model routing.

### Phase 2: controlled measurements

Run small, independent comparisons before changing any profile or projection. Prefer real repository tasks over synthetic prompts.

#### A. Luna versus Sol on bounded work

Choose tasks where the exact same bounded task contract and acceptance criteria can honestly be used by both candidates. Favor mechanical implementation, structured transformation, or tightly specified local work. Do not weaken task classification to make Luna eligible.

The purpose is to answer whether an additional explicit Luna route would reduce total usage without increasing rework or missed requirements. This is not authority to change the existing `executor` mapping to mini.

#### B. Sol versus Astra for analysis

Compare bounded analysis or diagnosis work where both configurations can be exercised without weakening an existing formal gate. General correctness or robustness analysis is a better experiment target than the Pipeline reviewer's strong-tier guarantee.

Do not use this comparison to silently redefine formal assurance, Pipeline review, security boundaries, or judge contracts.

#### C. Sol effort versus qualified Astra recovery

For a task that reaches an eligible material reasoning failure, compare whether additional Sol effort produces meaningful progress versus the existing qualified Astra uplift. Preserve existing recovery admission and retry budgets during the comparison.

The useful question is not whether Sol is cheaper per call. Measure whether additional Sol reasoning lowers total task cost after retries and rework. If the same material failure repeats without progress, do not keep spending on Sol merely to avoid a justified Astra uplift.

## Measurement rules

Each comparison must:

1. start from fresh independent sessions/runs;
2. pin the same repository commit;
3. keep task scope, prompt intent, starting inputs, acceptance criteria, permissions, and relevant runtime speed fixed unless the comparison explicitly studies one of those variables;
4. prevent a later run from reading earlier findings or artifacts that would reveal the answer;
5. record the observed child role, model, and effective effort when trace evidence is available;
6. record total usage when the Codex surface exposes it, otherwise record `unknown`;
7. record retries, repair/rework, valid findings, false positives, elapsed time, and final task result;
8. distinguish a pure-model comparison from a configuration comparison when effort or speed also changes.

Use Codex `/usage` or other runtime-provided accounting only as observation. Do not add a telemetry framework or infer subscription-credit consumption from public API pricing.

## Adoption criteria

A routing change is justified only when repeated repo-specific evidence shows that it preserves the relevant quality floor and improves total completion efficiency. Evaluate:

- acceptance-criteria completion;
- correctness and missed requirements;
- valid versus false-positive findings for analytical roles;
- retry and repair counts;
- operator intervention;
- elapsed time when latency matters;
- total observed usage, not only the selected model's per-call rate.

A cheaper first attempt that causes more retries or misses a material requirement is not automatically a cost improvement. Likewise, a stronger model that materially reduces retries may be more efficient despite a higher single-call rate.

When evidence supports a routing change, update the smallest owning surface: neutral role profile only for a cross-runtime tier decision, OpenAI model set/projection only for OpenAI-specific model or effort behavior, and role contracts only when their semantics intentionally change. Version and test the affected configuration rather than editing generated workspace files.

## Non-goals

This tuning plan does not:

- automatically rank models;
- add persistent usage telemetry;
- use public benchmark scores as automatic routing inputs;
- blanket-downgrade reviewer, security, judge, or assurance roles;
- make Luna a general replacement for the standard executor;
- remove the qualified Astra recovery path without comparison evidence;
- add Ultra to the current `low -> medium -> high -> xhigh -> max` effort model.

## Reference material

- Codex releases: <https://github.com/openai/codex/releases>
- Codex pricing and credits: <https://developers.openai.com/codex/pricing>
- Codex speed controls: <https://developers.openai.com/codex/speed>
- Codex subagents: <https://developers.openai.com/codex/subagents>
- GPT-6 Sol and Luna announcement and published evaluations: <https://openai.com/index/introducing-gpt-6-sol-and-luna/>
