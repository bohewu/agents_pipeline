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
- Claude output does not emit nested subagent dependency metadata from those references.

## Input Adaptation

OpenCode orchestrators assume `$ARGUMENTS` parsing from slash-command entrypoints. Claude Code custom subagents do not provide that variable.

For orchestrator agents, the exporter prepends a Claude-specific adapter block:

- use the user's latest message as `raw_input`
- if the message starts with the matching slash command (for example `/run-pipeline`), strip that first token before normal flag parsing
- keep the existing flag semantics after that adaptation

The exporter also replaces `$ARGUMENTS` with `raw_input` in the generated body.

## Orchestrator Limitation

Keep Claude Code orchestration expectations conservative.

- Support single-subagent execution with inline orchestration guidance
- Do not promise nested orchestrator -> subagent -> subagent execution trees
- Treat source `@agent-name` references in orchestrators as role guidance and inline responsibilities rather than nested delegation instructions

This keeps Claude Code support accurate without overstating nested subagent behavior.

## Install Targets

- Default install target: `~/.claude/agents`
- Optional project-local override: `<project>/.claude/agents`

Use `scripts/install-claude.sh` or `scripts/install-claude.ps1` for local installs, and `scripts/bootstrap-install-claude.sh` or `scripts/bootstrap-install-claude.ps1` for release-bundle installs without cloning.
