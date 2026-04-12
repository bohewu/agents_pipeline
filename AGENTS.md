# Agent Catalog

This catalog lists all agents and their roles.
Model selection is runtime-driven by OpenCode/provider configuration, not pinned per-agent in this repo.
Claude Code `.claude/agents/*.md`, VS Code Copilot `.agent.md` outputs, and Codex role configs all derive from `opencode/agents/*.md`; generated/exported outputs should not be hand-edited.
For the conceptual UI/UX layer, start with `/uiux`, which routes to the hidden subagent `ui-ux-designer`; see `opencode/protocols/UI_UX_WORKFLOW.md` plus the `ui-ux-bundle` schema/example bundle at `opencode/protocols/schemas/ui-ux-bundle.schema.json` and `opencode/protocols/examples/ui-ux-bundle.valid.json`.

| Agent | Role | Mode | Notes |
|------|------|------|-------|
| orchestrator-ci | CI/CD planning pipeline (docs-first, optional generation) | primary | Docs-first |
| orchestrator-modernize | Modernization planning pipeline (experimental) | primary | Documentation-only outputs |
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | primary | Global handoff protocol embedded |
| orchestrator-spec | Development spec orchestration for review-ready DevSpec outputs | primary | Docs-first |
| orchestrator-flow | Flow orchestration with max-5 tasks and no reviewer | primary | Bounded flow, no retry loops |
| orchestrator-committee | Swarm committee for decision-making (experts + KISS soft-veto + judge) | primary | Decision support only |
| orchestrator-general | General-purpose orchestration for non-coding tasks (planning/writing/analysis) | primary | Non-coding workflow |
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
| ui-ux-designer | Convert bounded UI/UX requests into conceptual workflow briefs, surface maps, and handoff notes | subagent | hidden |
| executor | Execute one atomic task with bounded effort/verification settings | subagent | hidden |
| doc-writer | Documentation specialist for design/spec/checklist/analysis outputs | subagent | hidden |
| peon | Low-cost executor for mechanical or repetitive tasks | subagent | hidden |
| generalist | General-purpose executor for mixed-scope tasks | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | subagent | hidden |
| handoff-writer | Produce run-local handoff artifacts for a fresh session | subagent | hidden |
| kanban-manager | Manage the root-tracked todo ledger and kanban render | subagent | hidden |
| session-guide-writer | Create or refresh the root-tracked session guide | subagent | hidden |
| codex-account-manager | List and switch local OpenCode Codex account selections | subagent | hidden |
| usage-inspector | Inspect local Codex quota windows and Copilot premium request sources | subagent | hidden |
| skill-curator | List/search/install skills from local locations and curated catalogs | subagent | hidden |
| summarizer | Produce final user-facing summary | subagent | hidden |
