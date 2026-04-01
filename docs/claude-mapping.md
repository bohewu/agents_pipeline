# Claude Code Mapping

This document defines how OpenCode agent definitions map to Claude Code custom subagent files.

## Source Of Truth

- Source: `opencode/agents/*.md`
- Generated output: `<target-dir>/*.md` for Claude Code, typically `~/.claude/agents/*.md` by default or `<project>/.claude/agents/*.md` when you explicitly want repo-scoped overrides
- Generator: `scripts/export-claude-agents.py`

Do not manually maintain a separate Claude-only source tree as the primary definition set.

## Frontmatter Mapping

| OpenCode key | Claude Code output | Rule |
|---|---|---|
| `name` | `name` | copied; in `--strict` mode it must match the source file stem |
| `description` | `description` | copied |
| `tools` | `tools` | mapped to Claude tool names when enabled |
| `mode` | (removed) | not emitted |
| `hidden` | (removed) | not emitted |
| `temperature` | (removed) | not emitted |
| `model` | (removed) | not emitted; model remains runtime-driven |
| body | markdown body | preserved with minimal adaptation |

## Tool Mapping

The exporter keeps Claude tool declarations intentionally minimal:

| OpenCode tool | Claude tool |
|---|---|
| `read: true` | `Read` |
| `edit: true` | `Edit` |
| `write: true` | `Write` |
| `grep: true` | `Grep` |
| `glob: true` | `Glob` |
| `bash: true` | `Bash` |

If a source tool has no bounded Claude mapping, generation fails in `--strict` mode.

## `@agent` Reference Handling

- The exporter validates body `@agent-name` references against the source agent set and `AGENTS.md` in `--strict` mode.
- `@executor-*` is expanded to `executor-core` and `executor-advanced` for validation purposes.
- Resolved `@agent-name` references are listed in the generated delegation adapter so orchestrators know which subagents are available.

## Input Adaptation

OpenCode orchestrators assume `$ARGUMENTS` parsing from slash-command entrypoints. Claude Code custom subagents do not provide that variable.

For orchestrator agents, the exporter prepends a Claude-specific adapter block:

- use the user's latest message as `raw_input`
- if the message starts with the matching slash command (for example `/run-pipeline`), strip that first token before normal flag parsing
- keep the existing flag semantics after that adaptation

The exporter also replaces `$ARGUMENTS` with `raw_input` in the generated body.

## Orchestrator Delegation

Orchestrator agents receive the `Agent` tool in their generated `tools:` list so they can delegate to subagents natively.

The exporter prepends a delegation protocol adapter that maps `@agent-name` references to Claude Code Agent tool calls:

```
Agent(subagent_type="<agent-name>", description="<short task>", prompt="<full handoff>")
```

- Orchestrators can issue multiple Agent calls in one response for parallel stages.
- Each subagent runs in its own context window; orchestrators should pass all required inputs in the prompt.
- Subagent results return as text; orchestrators parse structured outputs (JSON) from the response.
- The adapter lists all resolved `@agent-name` references as available subagents.

## Install Targets

- Default install target: `~/.claude/agents`
- Optional project-local override: `<project>/.claude/agents`

Use `scripts/install-claude.sh` or `scripts/install-claude.ps1` for local installs, and `scripts/bootstrap-install-claude.sh` or `scripts/bootstrap-install-claude.ps1` for release-bundle installs without cloning.
