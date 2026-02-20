# Copilot Mapping

This document defines how OpenCode agent definitions are mapped to VS Code Copilot custom agent files.

## Source Of Truth

- Source: `opencode/agents/*.md`
- Generated output: `*.agent.md`
- Generator: `scripts/export-copilot-agents.py`
- Filename rule: generated filename uses source file stem, as `<source-stem>.agent.md`

Do not manually maintain generated `.agent.md` files as a primary source.

## Frontmatter Mapping

| OpenCode key | Copilot key | Rule |
|---|---|---|
| `name` | `name` | copied |
| `description` | `description` | copied |
| `mode` | (removed) | not emitted |
| `hidden` | (removed) | not emitted |
| `temperature` | (removed) | not emitted |
| `tools` | (removed) | not emitted |
| `model` | (removed) | not emitted (runtime-driven) |
| body `@agent` refs | `agents` | extracted and deduplicated |

## Subagent Extraction Rules

- The generator scans body text for `@<agent-name>` tokens.
- `@executor-*` is expanded into:
  - `executor-core`
  - `executor-advanced`
- In `--strict` mode, unresolved `@...` references fail generation.

## `/run-*` Input Adaptation

Copilot custom agents do not provide `$ARGUMENTS`.  
For orchestrator agents, the generator prepends an input adapter block:

- Use the user's latest message as `raw_input`.
- If it starts with the matching slash command (for example `/run-pipeline`), remove that first token.
- Apply the existing flag parsing logic unchanged.

`$ARGUMENTS` is replaced with `raw_input` in generated files.

## Fallback Strategy

When `--emit-fallback` is enabled (default), each orchestrator also gets:

- `<orchestrator-name>-solo.agent.md`

These fallback agents omit `agents:` and include instructions to execute stages inline when subagents are unavailable.

## Known Limitations

- Copilot subagents are experimental and may change behavior.
- Tool capability mapping is intentionally omitted in generated frontmatter for compatibility.
- Existing OpenCode prompt text is preserved as much as possible; only minimal adaptation is injected.
