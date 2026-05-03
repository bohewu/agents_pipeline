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
| body `@agent` refs | `agents` | extracted and deduplicated |

By default, model/provider selection remains runtime-driven; source agents must not define per-agent `model` or `provider` keys.

## Opt-In Agent Model Profiles

Copilot runtime model profiles are opt-in. When the exporter, or an installer that forwards exporter options, receives `--agent-profile <profile> --model-set <set>`:

- The agent-to-tier profile is loaded from `opencode/tools/agent-profiles/<profile>.json`.
- The Copilot tier catalog is loaded from `copilot/tools/model-sets/<set>.json` and must have `runtime: "copilot"`.
- Profiles map agents to logical tiers (`mini`, `standard`, `strong`); the Copilot model set maps each tier to either one model name or a prioritized list of model names.
- For each mapped generated agent, the exporter writes `.agent.md` frontmatter `model` as either a scalar or a YAML list matching the selected tier value.

Copilot model names are written exactly as configured and must match model names available in the VS Code/GitHub Copilot model picker. The exporter does not validate remote availability.

Reasoning effort is not controlled by these profiles; it inherits from the parent session or global Copilot/VS Code runtime configuration. Omit the profile flags to keep Copilot's normal runtime model selection.

Examples from a cloned repo:

```powershell
pwsh -NoProfile -File .\scripts\install-copilot.ps1 -AgentProfile balanced -ModelSet default
```

```bash
scripts/install-copilot.sh --agent-profile balanced --model-set default
```

## Subagent Extraction Rules

- The generator scans body text for `@<agent-name>` tokens.
- `@executor` is extracted like any other direct subagent reference.
- In `--strict` mode, unresolved `@...` references fail generation.

## `/run-*` Input Adaptation

Copilot custom agents do not provide `$ARGUMENTS`.  
For orchestrator agents, the generator prepends an input adapter block:

- Use the user's latest message as `raw_input`.
- If it starts with the matching slash command (for example `/run-pipeline`) or helper command form (for example `/kanban`), remove that first token.
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
