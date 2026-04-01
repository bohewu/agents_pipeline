# Agent Catalog

This catalog lists all agents and their roles.
Model selection is runtime-driven by OpenCode/provider configuration, not pinned per-agent in this repo.
Claude Code `.claude/agents/*.md`, VS Code Copilot `.agent.md` outputs, and Codex role configs all derive from `opencode/agents/*.md`; generated/exported outputs should not be hand-edited.

| Agent | Role | Mode | Notes |
|------|------|------|-------|
| orchestrator-init | Init pipeline for greenfield projects | primary | Documentation-only outputs |
| orchestrator-ci | CI/CD planning pipeline (docs-first, optional generation) | primary | Docs-first |
| orchestrator-modernize | Modernization planning pipeline (experimental) | primary | Documentation-only outputs |
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | primary | Global handoff protocol embedded |
| orchestrator-spec | Development spec orchestration for review-ready DevSpec outputs | primary | Docs-first |
| orchestrator-flow | Flow orchestration with max-5 tasks and no reviewer | primary | Bounded flow, no retries |
| orchestrator-committee | Swarm committee for decision-making (experts + KISS soft-veto + judge) | primary | Decision support only |
| orchestrator-general | General-purpose orchestration for non-coding tasks (planning/writing/analysis) | primary | Non-coding workflow |
| orchestrator-analysis | Post-hoc analysis pipeline with conditional expert roster and severity-ranked findings | primary | Analytical review |
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
| executor-core | Execute one atomic task (cost-effective profile) | subagent | hidden |
| executor-advanced | Execute one atomic task (high-risk/complex profile) | subagent | hidden |
| doc-writer | Documentation specialist for design/spec/checklist/analysis outputs | subagent | hidden |
| peon | Low-cost executor for mechanical or repetitive tasks | subagent | hidden |
| generalist | General-purpose executor for mixed-scope tasks | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | subagent | hidden |
| summarizer | Produce final user-facing summary | subagent | hidden |
