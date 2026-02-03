# Multi-Agent Pipeline

This repository demonstrates a **Multi-Agent Pipeline**. It currently includes an implementation called **OpenCode**. See the **How To Use** section below for usage instructions.

## How To Use

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Use the `/run-pipeline` command in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end

## Quick Start

1) Load the orchestrator (handoff protocol is embedded for portability):
   - `opencode/agents/orchestrator.md`
2) Run `/run-pipeline` with an optional budget flag:

```text
/run-pipeline Implement OAuth2 login --budget=medium
```
3) Optional smoke-check run:

```text
/run-pipeline Run tests only --test-only
```

## Flags

Use flags after the main task prompt. Tokens starting with `--` are treated as flags.

- `--dry`
  - Stop after `atomizer + router`
  - Output TaskList and DispatchPlan only
- `--no-test`
  - Skip test-runner stage
  - Reviewer must warn about missing verification
- `--test-only`
  - Only run test-runner + reviewer
- `--loose-review`
  - Reviewer does not require build/test evidence
  - Reviewer must add a warning that results are unverified
- `--budget=low|medium|high`
  - low: Prefer Gemini Flash / Pro, minimize GPT usage
  - medium: Default routing
  - high: Allow GPT-5.2-codex more freely

Flag precedence:
- `--dry` overrides `--test-only` when both are present.

Examples:
```
/run-pipeline Refactor cache layer --no-test
/run-pipeline Improve search relevance --budget=medium
```

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator | Flow control, routing, retries, synthesis | Implementing code |
| specifier | Requirement extraction | Proposing solutions |
| planner | High-level planning | Atomic task creation |
| repo-scout | Repo discovery | Design decisions |
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
