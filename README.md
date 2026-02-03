# OpenCode Multi-Agent Pipeline

## How To Use

- Agent definitions live in `.opencode/agents/` (one file per agent)
- Global handoff rules are defined in `.opencode/agents/handoff-protocol.md`
- Use the `/run` command in `.opencode/agents/run.md` to execute the full pipeline end-to-end

## Quick Start

1) Load the orchestrator and handoff protocol:
   - `.opencode/agents/orchestrator.md`
   - `.opencode/agents/handoff-protocol.md`
2) Run `/run` with an optional budget flag:

```text
/run --budget=medium
```

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator | Flow control, routing, retries, synthesis | Implementing code |
| specifier | Requirement extraction | Proposing solutions |
| planner | High-level planning | Atomic task creation |
| explore | Repo discovery | Design decisions |
| atomizer | Atomic task DAG | Implementation |
| router | Cost-aware assignment | Changing tasks |
| executor-* | Task execution | Scope expansion |
| test-runner | Tests & builds | Code modification |
| reviewer | Quality gate | Implementation |
| compressor | Context reduction | New decisions |
| summarizer | User summary | Technical decisions |

---

## MISSING PIECES CHECKLIST (95% TARGET)

- [x] Multi-agent pipeline
- [x] Cost-aware routing
- [x] Atomic DAG tasks
- [x] Evidence-first review
- [x] Retry / delta mechanism
- [x] Test runner
- [x] Context compression
- [x] One-command entrypoint
- [x] Handoff contracts
- [ ] Persistent long-term memory (optional)
- [ ] External CI integration (optional)
