# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A multi-agent orchestration framework where `opencode/agents/*.md` is the **single source of truth**. These agent definitions are exported to multiple platforms: OpenCode (primary), Claude Code, VS Code Copilot, and Codex. The agents form a pipeline that decomposes tasks through stages (spec -> plan -> scout -> atomize -> route -> execute -> review -> summarize).

## Validation & CI

There is no traditional build system. Validation is done via Python scripts and CI:

```bash
# Schema validation (requires jsonschema: pip install jsonschema)
python3 opencode/tools/validate-schema.py --schema opencode/protocols/schemas/<schema>.json --input <file>.json --require-jsonschema

# Flag contract validation
python3 scripts/validate-flag-contracts.py

# Modernize handoff validation
python3 scripts/validate-modernize-handoff.py

# Export dry-run (tests all three exporters)
python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir /tmp/test --strict --dry-run
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir /tmp/test --strict --dry-run
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir /tmp/test --strict --dry-run

# Status runtime plugin test (Node.js)
node --test opencode/plugins/status-runtime/run-registry.test.js

# Effort-control plugin test (Node.js)
node --test opencode/plugins/effort-control.test.mjs

# Status runtime smoke test
node scripts/validate-status-runtime-smoke.cjs

# README version sync check
python3 scripts/sync-readme-version.py --check

# Shell installer syntax check
bash -n scripts/install.sh
bash -n scripts/install-claude.sh
# (etc. for all scripts/*.sh)
```

Full CI runs all of the above plus frontmatter regression tests, installer dry-runs, resource-control prompt coverage assertions, and release-bundle validation. See `.github/workflows/ci.yml`.

## Architecture

### Agent Definitions (`opencode/agents/*.md`)

Each agent has YAML frontmatter + markdown body:
- **Frontmatter keys**: `name`, `description`, `mode` (primary/subagent), `hidden`, `temperature`, `tools`, `agent`
- **Primary orchestrators** (`orchestrator-*`): Control flow, delegate to subagents via `@agent-name` references
- **Subagents**: Specialized workers (specifier, planner, atomizer, router, executor, flow-splitter, reviewer, etc.)
- Agent `name` must match the filename stem

### Commands (`opencode/commands/*.md`)

Slash-command entry points (e.g., `/run-pipeline`) that route `$ARGUMENTS` to an orchestrator. Each command's `agent:` frontmatter field specifies which orchestrator handles it.

### Protocols (`opencode/protocols/`)

- `PIPELINE_PROTOCOL.md`: Full stage-by-stage contract (canonical reference, ~32KB)
- `PROTOCOL_SUMMARY.md`: Condensed global rules all agents follow
- `VALIDATION.md`: Acceptance gates per stage
- `SCHEMAS.md`: Schema file index
- `schemas/`: 15 JSON Schema files (problem-spec, dev-spec, task-list, dispatch-plan, run-status, checkpoint, etc.)
- `examples/`: Valid/invalid fixtures used in CI regression testing

### Export System

Three parallel exporters generate platform-specific agent files from the single source:
- `scripts/export-claude-agents.py` -> Claude Code `.claude/agents/*.md`
- `scripts/export-copilot-agents.py` -> VS Code Copilot `.github/copilot/agents/*.md`
- `scripts/export-codex-agents.py` -> Codex role configs

All three share the pattern: parse frontmatter, map tools, adapt body text, detect stale generated files. The `--strict` flag enforces name/filename consistency, tool mapping completeness, and `@agent-name` reference resolution against `AGENTS.md`.

### Status Runtime Plugin (`opencode/plugins/status-runtime/`)

JavaScript plugin that manages `<run_output_dir>/status/` artifacts (run-status.json, task/*.json, agents/*.json). Provides `status_runtime_event` tool for orchestrators to emit semantic events.

### Install Scripts (`scripts/`)

Two tiers: standard install (from local clone) and bootstrap install (from GitHub release bundle with SHA256 + attestation verification). Each target (OpenCode, plugin, Claude, Copilot, Codex) has its own install script pair (bash + PowerShell), plus `install-all-local` for one-step setup.

## Claude Code Pipeline Runner Protocol

In Claude Code, the top-level Claude Code instance acts as the pipeline runtime. Orchestrator agents (spawned via `@orchestrator-*`) cannot nest `Agent` calls, so they return **dispatch plans** instead of delegating directly.

### Two-Phase Execution

1. **Phase 1 — Planning**: Spawn the orchestrator (e.g., `@orchestrator-flow`). It analyzes the task and returns a JSON dispatch plan:
   ```json
   { "dispatch": [
       { "id": "T1", "agent": "executor", "prompt": "...", "deps": [] },
       { "id": "T2", "agent": "reviewer", "prompt": "...", "deps": ["T1"] },
       { "id": "T3", "agent": "orchestrator-pipeline", "prompt": "...", "deps": ["T2"], "worktree": "../target-project" }
     ]}
   ```

2. **Phase 2 — Execution**: The top-level Claude Code instance executes the plan:
   - Parse the `dispatch` JSON from the orchestrator response.
   - Tasks with no `deps` may be spawned in parallel via `Agent(subagent_type=..., prompt=...)`.
   - Tasks with `deps` wait for their dependencies to complete; include dependency results in the prompt.
   - If a task includes `worktree`, execute it in that repo/worktree when runtime support exists. If not, stop and surface the blocker instead of silently using the current repo.
   - After all tasks complete, if the orchestrator has post-dispatch stages (e.g., synthesis), send the collected results back to the orchestrator via `SendMessage`.

### When to Use

- Use `@orchestrator-flow` for daily engineering tasks (max 5 atomic tasks, no reviewer).
- Use `@orchestrator-pipeline` for CI/PR/high-risk work (full pipeline with review gates).
- For simple single-file tasks, skip the orchestrator and spawn `@executor` directly.

## Key Conventions

- `AGENTS.md` is the catalog of all agents; keep it in sync when adding/removing agents
- `VERSION` file is the single version source (SemVer); `scripts/sync-readme-version.py` enforces README references match
- Generated/exported files contain a marker comment (e.g., `<!-- Generated by scripts/export-claude-agents.py -->`) and are cleaned up automatically on re-export
- Protocol changes should update both the protocol docs and the agent prompts that reference them; CI checks resource-control prompt coverage across both
- JSON Schema fixtures in `opencode/protocols/examples/` include both valid and intentionally invalid cases for regression testing
