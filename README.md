# Multi-Agent Pipeline

This repository demonstrates a **Multi-Agent Pipeline**. It currently includes an implementation called **OpenCode**. See the **How To Use** section below for usage instructions.

## How To Use

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `opencode/agents/AGENTS.md`.
- Protocol and JSON schemas live in `opencode/protocols/`.
  Use `opencode/protocols/PROTOCOL_SUMMARY.md` for global instructions to reduce token usage.
- Init handoff SOP lives in `opencode/protocols/INIT_TO_PIPELINE.md`.
- Optional carryover ledger lives at `todo-ledger.json` in the project root (schema in `opencode/protocols/schemas/todo-ledger.schema.json`).
  A template is provided in `todo-ledger.example.json`.
- Use `/run-init` in `opencode/commands/run-init.md` for greenfield projects (produces init docs).
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end

## Quick Start

1) Load the orchestrator (handoff protocol is embedded for portability):
   - `opencode/agents/orchestrator-pipeline.md`
2) Run `/run-pipeline` with an optional budget flag:

```text
/run-pipeline Implement OAuth2 login --budget=medium
```
3) Optional smoke-check run:

```text
/run-pipeline Run tests only --test-only
```

## Init Pipeline

Use `/run-init` for new projects. It produces:

- `init/init-brief-product-brief.md`
- `init/init-architecture.md`
- `init/init-constraints.md`
- `init/init-structure.md`
- `init/init-roadmap.md`

These docs should be used as reference inputs when running `/run-pipeline`.

Modes:

- `/run-init --decision-only` (brief + architecture + constraints only)
- `/run-init --iterate` (one revision round after initial docs)

## Protocol Validation

Validate a JSON output against the protocol schemas:

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-list.schema.json --input path/to/task-list.json
```

If you enable custom tools, you can call the `validate-schema` tool from OpenCode
instead of running the script manually (see `opencode/tools/validate-schema.ts`).

## Config Example

An example OpenCode config is provided at `opencode.json.example`.

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

## Orchestrators

- Full: `/run-pipeline` (multi-stage pipeline with reviewer and retries)
- Short: `/run-pipeline --decision-only` (stops after planning/integration design; directional review only)
- Flow: `/run-flow` (max 5 atomic tasks; bounded parallel execution; no reviewer or retries)
- Init: `/run-init` (greenfield project initialization docs)

## Naming Convention

- Repo name (`agents-pipeline`) reflects the overall concept.
- Full pipeline uses `*-pipeline` naming (e.g. `orchestrator-pipeline.md`, `run-pipeline.md`).
- Flow pipeline uses `*-flow` naming (e.g. `orchestrator-flow.md`, `run-flow.md`).
- Init pipeline uses `*-init` naming (e.g. `orchestrator-init.md`, `run-init.md`).

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator-init | Init pipeline for greenfield projects | Implementing code |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
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
