# Agent Catalog

This catalog lists all agents, their primary role, and their default model.

| Agent | Role | Default Model | Mode | Notes |
|------|------|---------------|------|-------|
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | openai/gpt-5.2-codex | primary | Global handoff protocol embedded |
| orchestrator-flow | Flow orchestration with max-5 tasks and no reviewer | openai/gpt-5.2-codex | primary | Bounded flow, no retries |
| specifier | Convert user input into ProblemSpec JSON | google/antigravity-gemini-3-flash | subagent | hidden |
| planner | Produce PlanOutline JSON | openai/gpt-5.2-codex | subagent | hidden |
| repo-scout | Repo discovery and risk scanning | google/antigravity-gemini-3-flash | subagent | hidden |
| atomizer | Convert PlanOutline into atomic TaskList (DAG) | openai/gpt-5.2-codex | subagent | hidden |
| router | Build cost-aware DispatchPlan | google/antigravity-gemini-3-flash | subagent | hidden |
| executor-gemini | Execute one atomic task (cost-effective) | google/antigravity-gemini-3-pro | subagent | hidden |
| executor-gpt | Execute one atomic task (high-risk/complex) | openai/gpt-5.2-codex | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | google/antigravity-gemini-3-flash | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | openai/gpt-5.2-codex | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | google/antigravity-gemini-3-flash | subagent | hidden |
| summarizer | Produce final user-facing summary | openai/gpt-5.1-codex-mini | subagent | hidden |
