# Agent Catalog

This catalog lists all agents and their roles.
Codex is the Tier 1, first-class runtime; normal child-model selection comes from the workspace profile while the provider remains inherited from the parent Codex session. Generated role profiles may override only the model, never the provider.
Claude Code `.claude/agents/*.md` and VS Code Copilot `.agent.md` files are Tier 2 best-effort exports without a feature-parity guarantee. OpenCode support ended at the frozen OpenCode-first release, `v0.26.1`.
Runtime-neutral source lives in `agents/`, `protocols/`, `skills/`, and `tools/`. Generated runtime outputs must not be hand-edited. Mode aliases and their orchestrator targets are defined in `modes.json`. `$run-adaptive` is intentionally a skill-only Simple/Flow/Pipeline router with route-independent execution presets, not an agent role or manifest-backed compatibility mode.
Before any Codex managed child dispatch, read `protocols/REASONING_POLICY.md` and follow its profile/tier, shared-resolver, native-selector, no-full-history, saved-configuration, trace, and result-label rules. Exported subagent roles are leaf workers and must not spawn another agent. Never claim workspace routing, selector application, a verified model, or effective effort without the evidence that protocol requires.
For an explicit request to dispatch a registered managed role outside a `$run-*` workflow, read the `Ad-hoc managed-role dispatch` section of `protocols/REASONING_POLICY.md` before spawning. Keep this path adaptive, pass tier `unknown` when the profile/runtime cannot prove it, and create no workflow artifacts; unverifiable or unhealthy profile status and resolver or selector conflicts stop dispatch.
Use the smallest implementation and verification sufficient for the stated requirement. Rigor means proving the requested behavior, not adding abstractions, checks, or polish.
Before resuming a run, editing after a failed check, or starting any repair, reviewer followup, capability recovery, or new Goal continuation round, read `protocols/MATERIALITY_GATE.md`. Apply its requirement-authority, failure-classification, validation-infrastructure, budget, stop, and resume/strategy-delta rules; only material work tied to an unmet original condition may continue.
Before capability recovery or a later recovery-stage dispatch, also read `protocols/CAPABILITY_RECOVERY.md`. Keep its effort-first default, sole qualified LSA v2 exception, eligible-role and operational-failure limits, task-scoped target binding, and existing counter rules unchanged.
Keep validation bounded to the requested delivery. Workflow-generated artifacts cannot expand scope, and validation infrastructure remains forbidden unless the original request or a pre-existing repository contract authorized it before dispatch.
Repository-specific Goal policy: do not create or activate a Goal for work in this repository unless the user's current message explicitly requests Goal mode. A `run-*` workflow request alone is not Goal consent.
For the conceptual UI/UX layer, use `ui-ux-designer`; see `protocols/UI_UX_WORKFLOW.md` plus the `ui-ux-bundle` schema/example bundle at `protocols/schemas/ui-ux-bundle.schema.json` and `protocols/examples/ui-ux-bundle.valid.json`. The same surface also covers communication-first redesign and critique work via `skills/ui-communication-designer/SKILL.md`. For frontend implementation or polish after a conceptual handoff, use `skills/frontend-aesthetic-director/SKILL.md`; it preserves the upstream wireframe/flow and focuses on visual direction, tokens, responsive behavior, accessibility, and rendered QA.

| Agent | Role | Mode | Notes |
|------|------|------|-------|
| orchestrator-ci | CI/CD planning pipeline (docs-first, optional generation) | primary | Docs-first |
| orchestrator-modernize | Modernization planning pipeline (experimental) | primary | In-place Pipeline transition for requested execution |
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | primary | Global handoff protocol embedded |
| orchestrator-spec | Development spec orchestration for review-ready DevSpec outputs | primary | Docs-first |
| orchestrator-flow | Flow orchestration with max-5 tasks and optional reviewer gate | primary | Bounded flow, no delta-task retry loops |
| orchestrator-simple | Simple build-style dispatcher with subagent delegation and no run artifacts | primary | No manifest/status writes |
| orchestrator-committee | Swarm committee for decision-making (experts + KISS soft-veto + judge) | primary | Decision support only |
| orchestrator-general | General-purpose orchestration for mixed coding, planning, writing, analysis, and maintenance tasks | primary | General dispatcher |
| orchestrator-analysis | Post-hoc analysis pipeline with conditional expert roster and severity-ranked findings | primary | Analytical review |
| orchestrator-ux | UX audit orchestration with profile-aware scoring and normal-user findings | primary | Analysis-only |
| specifier | Convert user input into ProblemSpec JSON and optional DevSpec JSON | subagent | hidden |
| planner | Produce PlanOutline JSON | subagent | hidden |
| repo-scout | Repo discovery and risk scanning | subagent | hidden |
| atomizer | Convert PlanOutline into atomic TaskList (DAG) | subagent | hidden |
| router | Build cost-aware DispatchPlan | subagent | hidden |
| committee-architect | Committee expert (architecture/maintainability) | subagent | hidden |
| committee-security | Committee expert (security/risk) | subagent | hidden |
| committee-qa | Committee expert (QA/reliability) | subagent | hidden |
| committee-product | Committee expert (product/user impact) | subagent | hidden |
| committee-kiss | Committee KISS guard (soft veto) | subagent | hidden |
| committee-judge | Committee judge (final synthesis) | subagent | hidden |
| analysis-correctness | Analysis expert (logical correctness/invariants) | subagent | hidden |
| analysis-complexity | Analysis expert (time/space complexity/efficiency) | subagent | hidden |
| analysis-robustness | Analysis expert (edge cases/error paths/adversarial inputs) | subagent | hidden |
| analysis-numerics | Analysis expert (numerical stability/precision) — conditionally dispatched | subagent | hidden |
| ux-novice | UX expert (first-time user discoverability/orientation) | subagent | hidden |
| ux-task-flow | UX expert (task flow/friction/completion) | subagent | hidden |
| ux-copy-trust | UX expert (copy/labels/trust/recovery wording) | subagent | hidden |
| ux-visual-hierarchy | UX expert (scanability/layout hierarchy across viewports) | subagent | hidden |
| ux-judge | Final UX judge (scorecard/findings/priority actions) | subagent | hidden |
| flow-splitter | Convert a Flow ProblemSpec into a max-5 bounded task list | subagent | hidden |
| market-researcher | Research specialist for web-based market scans, pricing signals, and monetization benchmarks | subagent | hidden |
| art-director | Convert raw 2D asset requests into concise briefs and reusable prompts | subagent | hidden |
| ui-ux-designer | Convert bounded UI/UX requests into conceptual workflow briefs, communication-first redesign guidance, surface maps, and handoff notes | subagent | hidden |
| executor | Execute one atomic task with bounded verification and repair controls | subagent | hidden |
| executor-strong | Execute one difficult atomic task through the shared executor contract on a profile-owned strong binding | subagent | hidden |
| doc-writer | Documentation specialist for design/spec/checklist/analysis outputs | subagent | hidden |
| peon | Low-cost executor for mechanical or repetitive tasks | subagent | hidden |
| generalist | General-purpose executor for mixed-scope tasks | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | subagent | hidden |
| debugger | On-demand diagnosis specialist for difficult, uncertain, cross-module, or conflicting-evidence failures | subagent | hidden |
| handoff-writer | Produce run-local handoff artifacts for a fresh session | subagent | hidden |
| kanban-manager | Manage the root-tracked todo ledger and kanban render | subagent | hidden |
| session-guide-writer | Create or refresh the root-tracked session guide | subagent | hidden |
| summarizer | Produce final user-facing summary | subagent | hidden |
