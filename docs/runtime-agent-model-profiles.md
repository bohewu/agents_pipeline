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
| OpenCode | `agent-profile.sh install balanced --model-set openai` (default `--runtime opencode`) | `opencode/tools/model-sets` | `<workspace>/.opencode/agents/*.md` | OpenCode `model` frontmatter in workspace override copies | Existing feature is unchanged; `--target` is an alias for `--workspace`; restart OpenCode after changing profiles |
| Codex | `agent-profile.sh install balanced --runtime codex --model-set openai` or `scripts/install-codex.sh --agent-profile balanced --model-set openai` | `codex/tools/model-sets` | Via `agent-profile`: `<workspace>/.codex/agents/<name>.toml` | `model` and optional `model_provider` in each generated agent TOML | Never writes model fields to root `[agents.<name>]`; reasoning effort comes from effective Codex runtime config; no `model_reasoning_effort` or `plan_mode_reasoning_effort` |
| Copilot | `agent-profile.sh install balanced --runtime copilot --model-set default` or `scripts/install-copilot.sh --agent-profile balanced --model-set default` | `copilot/tools/model-sets` | Via `agent-profile`: `<workspace>/.copilot/agents/*.agent.md` | `model` frontmatter as a scalar or prioritized list | Names must match the VS Code/GitHub Copilot model picker |
| Claude Code | `agent-profile.sh install balanced --runtime claude --model-set default` or `scripts/install-claude.sh --agent-profile balanced --model-set default` | `claude/tools/model-sets` | Via `agent-profile`: `<workspace>/.claude/agents/*.md` | `model` frontmatter alias | Only `inherit`, `sonnet`, `opus`, and `haiku`; `opus` means the current Claude Code runtime alias |

## PowerShell Examples

```powershell
pwsh -NoProfile -File .\opencode\tools\agent-profile.ps1 list -Runtime claude
pwsh -NoProfile -File .\opencode\tools\agent-profile.ps1 install balanced -Runtime claude -ModelSet default -Workspace .
pwsh -NoProfile -File .\opencode\tools\agent-profile.ps1 install balanced -Runtime codex -ModelSet openai -Workspace .
pwsh -NoProfile -File .\scripts\install-codex.ps1 -AgentProfile balanced -ModelSet openai
pwsh -NoProfile -File .\scripts\install-copilot.ps1 -AgentProfile balanced -ModelSet default
pwsh -NoProfile -File .\scripts\install-claude.ps1 -AgentProfile balanced -ModelSet default
```

## Bash Examples

```bash
opencode/tools/agent-profile.sh list --runtime claude
opencode/tools/agent-profile.sh install balanced --runtime claude --model-set default --workspace .
opencode/tools/agent-profile.sh install balanced --runtime codex --model-set openai --workspace .
scripts/install-codex.sh --agent-profile balanced --model-set openai
scripts/install-copilot.sh --agent-profile balanced --model-set default
scripts/install-claude.sh --agent-profile balanced --model-set default
```

When invoked through `agent-profile`, runtime installs are workspace-first: omitted `--workspace` / `-Workspace` means the current directory, and omitted `--target` / `-Target` derives the runtime target from that workspace (`.claude/agents`, `.copilot/agents`, or `.codex`). Use `--target` / `-Target` only for an explicit override, such as an intentional global install to `$HOME/.claude/agents`.

Use `agent-profile.* install uniform --runtime <runtime> --uniform-model <model>` to apply one runtime model to every generated agent. For compatibility with the OpenCode profile UX, `install uniform --runtime <runtime> --model <model>` also maps to the runtime installer's uniform-model option. `status` and `clear` remain OpenCode-only actions.
