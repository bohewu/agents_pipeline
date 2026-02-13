# Agent Catalog

This catalog lists all agents and their roles.
Model selection is runtime-driven by OpenCode/provider configuration, not pinned per-agent in this repo.
VS Code Copilot `.agent.md` outputs are generated from `opencode/agents/*.md` via `scripts/export-copilot-agents.py` and should not be hand-edited.

| Agent | Role | Mode | Notes |
|------|------|------|-------|
| orchestrator-init | Init pipeline for greenfield projects | primary | Documentation-only outputs |
| orchestrator-ci | CI/CD planning pipeline (docs-first, optional generation) | primary | Docs-first |
| orchestrator-modernize | Modernization planning pipeline (experimental) | primary | Documentation-only outputs |
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | primary | Global handoff protocol embedded |
| orchestrator-flow | Flow orchestration with max-5 tasks and no reviewer | primary | Bounded flow, no retries |
| orchestrator-committee | Swarm committee for decision-making (experts + KISS soft-veto + judge) | primary | Decision support only |
| specifier | Convert user input into ProblemSpec JSON | subagent | hidden |
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
| executor-core | Execute one atomic task (cost-effective profile) | subagent | hidden |
| executor-advanced | Execute one atomic task (high-risk/complex profile) | subagent | hidden |
| doc-writer | Documentation specialist for design/spec/checklist/analysis outputs | subagent | hidden |
| peon | Low-cost executor for mechanical or repetitive tasks | subagent | hidden |
| generalist | General-purpose executor for mixed-scope tasks | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | subagent | hidden |
| summarizer | Produce final user-facing summary | subagent | hidden |

