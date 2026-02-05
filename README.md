# Multi-Agent Pipeline

Multi-agent workflows for OpenCode: init, pipeline, CI/CD planning, and modernization.
This repository demonstrates a **Multi-Agent Pipeline**. It currently includes an implementation called **OpenCode**. See the **How To Use** section below for usage instructions.

## Usage Prerequisites

This repo assumes you have configured the required model providers in OpenCode.
Agent model identifiers referenced in `opencode/agents/*.md` must be resolvable in your OpenCode config.
If a model/provider is missing, update `opencode.json` (or your global OpenCode config) before running any commands.

## Public Release Checklist

- Confirm there are no secrets or private endpoints in the repo.
- Review git history for removed secrets if any (history still contains them).
- Ensure `opencode.json.example` contains no real keys.
- Verify `LICENSE` exists and matches intended usage.
- Verify README usage notes align with your public story.

## Secret Scan (Optional)

If you already have a secret scanner installed, run one of:

```text
gitleaks detect --source .
```

```text
trufflehog filesystem .
```

Use whichever tool your team prefers.

## How To Use

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `AGENTS.md`.
- Protocol and JSON schemas live in `opencode/protocols/`.
  Use `opencode/protocols/PROTOCOL_SUMMARY.md` for global instructions to reduce token usage.
- Init handoff SOP lives in `opencode/protocols/INIT_TO_PIPELINE.md`.
- Init artifact templates live in `opencode/protocols/INIT_TEMPLATES.md`.
- Init example lives in `opencode/protocols/INIT_EXAMPLE.md`.
- CI artifact templates live in `opencode/protocols/CI_TEMPLATES.md`.
- CI example for .NET + Vue lives in `opencode/protocols/CI_EXAMPLE_DOTNET_VUE.md`.
- CI generated output example lives in `opencode/protocols/CI_GENERATE_EXAMPLE.md`.
- Publish SOP lives in `opencode/protocols/PUBLISH_SOP.md`.
- Modernize templates live in `opencode/protocols/MODERNIZE_TEMPLATES.md`.
- Modernize example lives in `opencode/protocols/MODERNIZE_EXAMPLE.md`.
- Public checklist lives in `opencode/protocols/PUBLIC_CHECKLIST.md`.
- Optional carryover ledger lives at `todo-ledger.json` in the project root (schema in `opencode/protocols/schemas/todo-ledger.schema.json`).
  A template is provided in `todo-ledger.example.json`.
- Use `/run-init` in `opencode/commands/run-init.md` for greenfield projects (produces init docs).
- Use `/run-ci` in `opencode/commands/run-ci.md` for CI/CD planning (docs-first; optional generation).
- Use `/run-modernize` in `opencode/commands/run-modernize.md` for modernization planning (experimental).
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end
- Use `/run-committee` in `opencode/commands/run-committee.md` for a decision committee (experts + KISS soft-veto + judge)

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

## CI Pipeline

Use `/run-ci` to create CI/CD plans and (optionally) generate workflows.

Examples:

```
/run-ci Plan CI/CD for .NET + Vue
/run-ci Plan CI/CD --generate --github
/run-ci Plan CI/CD --generate --github --docker --deploy
```

## Modernize Pipeline (Experimental)

Use `/run-modernize` for legacy modernization planning. It produces:

- `modernize/modernize-current-state.md`
- `modernize/modernize-target-vision.md`
- `modernize/modernize-strategy.md`
- `modernize/modernize-roadmap.md`
- `modernize/modernize-risks.md`

Modes:

- `/run-modernize --decision-only` (current-state + target-vision + strategy only)
- `/run-modernize --iterate` (one revision round after initial docs)

## Workflow Guidance

New projects:

1. `/run-init` → architecture and constraints
2. `/run-ci` → CI/CD plans (docs)
3. `/run-pipeline` (or `/run-flow` for small, low-risk changes)
4. `/run-ci --generate --github --docker --deploy` when ready to publish

Iterative development:

1. `/run-pipeline` (or `/run-flow` for small changes)
2. `/run-ci` when CI/CD plan needs updates
3. Publish using `opencode/protocols/PUBLISH_SOP.md`

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
- Committee: `/run-committee` (decision support; experts + KISS soft-veto + judge)
- Init: `/run-init` (greenfield project initialization docs)
- CI: `/run-ci` (docs-first CI/CD planning; optional generation)
- Modernize: `/run-modernize` (experimental modernization planning docs)

## Choosing a Pipeline (Quick Guide)

- Use `/run-committee` when:
  - you need a recommendation/decision (architecture, tradeoffs, approach selection)
  - you want multiple perspectives + a final judge, with budget as an explicit criterion
- Use `/run-flow` when:
  - the change is small, low-risk, and you mainly want a fast execution plan (max 5 atomic tasks)
- Use `/run-pipeline` when:
  - the change is high-risk, multi-file/systemic, or needs reviewer gates + bounded retries

## Naming Convention

- Repo name (`agents-pipeline`) reflects the overall concept.
- Full pipeline uses `*-pipeline` naming (e.g. `orchestrator-pipeline.md`, `run-pipeline.md`).
- Flow pipeline uses `*-flow` naming (e.g. `orchestrator-flow.md`, `run-flow.md`).
- Init pipeline uses `*-init` naming (e.g. `orchestrator-init.md`, `run-init.md`).
- CI pipeline uses `*-ci` naming (e.g. `orchestrator-ci.md`, `run-ci.md`).
- Modernize pipeline uses `*-modernize` naming (e.g. `orchestrator-modernize.md`, `run-modernize.md`).

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator-init | Init pipeline for greenfield projects | Implementing code |
| orchestrator-ci | CI/CD planning pipeline | Implementing code |
| orchestrator-modernize | Modernization planning pipeline | Implementing code |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
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
