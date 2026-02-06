# Agent Catalog

This catalog lists all agents, their primary role, and their default model.
Note: These defaults are documentation-only (opencode does not enforce them); update this table manually to match your runtime model until a future install CLI can provide selectable defaults.

| Agent | Role | Default Model | Mode | Notes |
|------|------|---------------|------|-------|
| orchestrator-init | Init pipeline for greenfield projects | openai/gpt-5.3-codex | primary | Documentation-only outputs |
| orchestrator-ci | CI/CD planning pipeline (docs-first, optional generation) | openai/gpt-5.3-codex | primary | Docs-first |
| orchestrator-modernize | Modernization planning pipeline (experimental) | openai/gpt-5.3-codex | primary | Documentation-only outputs |
| orchestrator-pipeline | Full pipeline orchestration with routing, retries, and synthesis | openai/gpt-5.3-codex | primary | Global handoff protocol embedded |
| orchestrator-flow | Flow orchestration with max-5 tasks and no reviewer | openai/gpt-5.3-codex | primary | Bounded flow, no retries |
| orchestrator-committee | Swarm committee for decision-making (experts + KISS soft-veto + judge) | openai/gpt-5.3-codex | primary | Decision support only |
| specifier | Convert user input into ProblemSpec JSON | google/antigravity-gemini-3-flash | subagent | hidden |
| planner | Produce PlanOutline JSON | openai/gpt-5.3-codex | subagent | hidden |
| repo-scout | Repo discovery and risk scanning | google/antigravity-gemini-3-flash | subagent | hidden |
| atomizer | Convert PlanOutline into atomic TaskList (DAG) | openai/gpt-5.3-codex | subagent | hidden |
| router | Build cost-aware DispatchPlan | google/antigravity-gemini-3-flash | subagent | hidden |
| committee-architect | Committee expert (architecture/maintainability) | google/antigravity-gemini-3-pro | subagent | hidden |
| committee-security | Committee expert (security/risk) | google/antigravity-gemini-3-pro | subagent | hidden |
| committee-qa | Committee expert (QA/reliability) | google/antigravity-gemini-3-pro | subagent | hidden |
| committee-product | Committee expert (product/user impact) | google/antigravity-gemini-3-pro | subagent | hidden |
| committee-kiss | Committee KISS guard (soft veto) | google/antigravity-gemini-3-pro | subagent | hidden |
| committee-judge | Committee judge (final synthesis) | openai/gpt-5.3-codex | subagent | hidden |
| executor-gemini | Execute one atomic task (cost-effective) | google/antigravity-gemini-3-pro | subagent | hidden |
| executor-gpt | Execute one atomic task (high-risk/complex) | openai/gpt-5.3-codex | subagent | hidden |
| doc-writer | Documentation specialist for design/spec/checklist/analysis outputs | google/antigravity-gemini-3-flash | subagent | hidden |
| peon | Low-cost executor for mechanical or repetitive tasks | google/antigravity-gemini-3-flash | subagent | hidden |
| generalist | General-purpose executor for mixed-scope tasks | google/antigravity-gemini-3-pro | subagent | hidden |
| test-runner | Run tests/builds/linters and collect evidence | google/antigravity-gemini-3-flash | subagent | hidden |
| reviewer | Review outputs and enforce quality gates | openai/gpt-5.3-codex | subagent | hidden |
| compressor | Compress repo decisions into ContextPack | google/antigravity-gemini-3-flash | subagent | hidden |
| summarizer | Produce final user-facing summary | openai/gpt-5.1-codex-mini | subagent | hidden |

## Model Config (JSON)

Edit `agent-models.json` and then sync defaults with:

```text
python scripts/update-agent-models.py --config agent-models.json --agents AGENTS.md --opencode-root opencode
```

Preview changes without writing:

```text
python scripts/update-agent-models.py --config agent-models.json --agents AGENTS.md --opencode-root opencode --dry-run
```

This script updates:
- `AGENTS.md` catalog table
- `opencode/agents/*.md` frontmatter `model`
- `opencode/commands/*.md` frontmatter `model` (based on each command's `agent`)

`supported_models` is a reference list. `discouraged_default_models` are still supported, but not recommended as defaults (typically higher cost).

## Prompt For Agent

Use this prompt when you want an agent to run the sync script:

```text
Please sync model defaults from agent-models.json by running:
python scripts/update-agent-models.py --config agent-models.json --agents AGENTS.md --opencode-root opencode
Then report which files and agents changed.
```
