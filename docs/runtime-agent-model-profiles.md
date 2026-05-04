# Runtime Agent Model Profiles

Runtime agent model profiles let generated agent files opt into per-agent model routing without adding `model` or `provider` fields to the canonical source agents in `opencode/agents/*.md`.

## Shared Inputs

- `opencode/tools/agent-profiles/*.json` maps agent names to logical tiers: `mini`, `standard`, and `strong`.
- Runtime-specific model-set catalogs map those tiers to runtime-valid model settings:
  - OpenCode: `opencode/tools/model-sets/*.json`
  - Codex: `codex/tools/model-sets/*.json`
  - Copilot: `copilot/tools/model-sets/*.json`
  - Claude Code: `claude/tools/model-sets/*.json`
- Codex, Copilot, and Claude Code profile output is opt-in through installer/exporter flags. If you omit the flags, generated files keep normal runtime-driven model selection.
- These profiles do not control reasoning effort; each runtime keeps its effective runtime configuration for reasoning-effort behavior.

## Runtime Comparison

| Runtime | How to opt in | Model-set catalog | Generated output | Model fields written | Key limits |
|---|---|---|---|---|---|
| OpenCode | `agent-profile.sh` / `agent-profile.ps1` install commands | `opencode/tools/model-sets` | `<workspace>/.opencode/agents/*.md` | OpenCode `model` frontmatter in workspace override copies | Existing feature is unchanged; restart OpenCode after changing profiles |
| Codex | `scripts/install-codex.sh --agent-profile balanced --model-set openai` | `codex/tools/model-sets` | `.codex/agents/<name>.toml` | `model` and optional `model_provider` in each generated agent TOML | Never writes model fields to root `[agents.<name>]`; reasoning effort comes from effective Codex runtime config; no `model_reasoning_effort` or `plan_mode_reasoning_effort` |
| Copilot | `scripts/install-copilot.sh --agent-profile balanced --model-set default` | `copilot/tools/model-sets` | `*.agent.md` | `model` frontmatter as a scalar or prioritized list | Names must match the VS Code/GitHub Copilot model picker |
| Claude Code | `scripts/install-claude.sh --agent-profile balanced --model-set default` | `claude/tools/model-sets` | `~/.claude/agents/*.md` or project `.claude/agents/*.md` | `model` frontmatter alias | Only `inherit`, `sonnet`, `opus`, and `haiku`; `opus` means the current Claude Code runtime alias |

## PowerShell Examples

```powershell
pwsh -NoProfile -File .\scripts\install-codex.ps1 -AgentProfile balanced -ModelSet openai
pwsh -NoProfile -File .\scripts\install-copilot.ps1 -AgentProfile balanced -ModelSet default
pwsh -NoProfile -File .\scripts\install-claude.ps1 -AgentProfile balanced -ModelSet default
```

## Bash Examples

```bash
scripts/install-codex.sh --agent-profile balanced --model-set openai
scripts/install-copilot.sh --agent-profile balanced --model-set default
scripts/install-claude.sh --agent-profile balanced --model-set default
```
