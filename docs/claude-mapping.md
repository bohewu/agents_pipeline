# Claude Code Mapping

Claude Code is a Tier 2, best-effort export target. This document describes how the neutral agent core is adapted into Claude Code custom subagent files; it does not promise feature parity with the Tier 1 Codex runtime.

## Source Of Truth

- Canonical agents: `agents/*.md`
- Mode aliases: `modes.json`
- Shared agent profiles: `tools/agent-profiles/*.json`
- Claude model sets: `runtimes/claude/model-sets/*.json`
- Generated output: `<target-dir>/*.md`, normally `~/.claude/agents/*.md`
- Exporter: `scripts/export-claude-agents.py`
- Installed profile manager: `~/.claude/agents-pipeline/scripts/agent-profile.sh` / `.ps1`, backed by the installed `tools/agent-profile.py`

Generated Claude files are disposable outputs and should not become a second source tree.

## Neutral Frontmatter Mapping

| Canonical key | Claude Code output | Rule |
|---|---|---|
| `name` | `name` | copied; in `--strict` mode it must match the source file stem |
| `description` | `description` | copied |
| `kind` | not emitted | identifies the neutral role kind; orchestration adapters are selected for `orchestrator-*` agents |
| body | markdown body | preserved with runtime adaptation and prompt compaction |

Neutral exports accept exactly `name`, `description`, and `kind`; runtime-specific source keys such as `model`, `provider`, `mode`, `temperature`, and `tools` are rejected. Model selection is runtime-driven unless export-time profile flags are explicitly supplied.

## Mode Manifest And Input Adaptation

Neutral orchestrator prompts express their input as `raw_input`; the Claude adapter binds that to the user's latest message and prepends an input adapter to every orchestrator. The exporter still replaces legacy `$ARGUMENTS` tokens when it encounters an older source fixture, but current canonical agents must use `raw_input` directly.

The accepted leading slash tokens come from the exact `aliases` associated with that orchestrator in root `modes.json`. For example, `orchestrator-general` currently accepts `/general`, `/run-general`, `/monetize`, and `/run-monetize`. The exporter does not infer aliases from the agent filename.

The manifest must declare `version: 1`, a non-empty `modes` array, unique mode names, unique aliases, and one orchestrator target per entry. Every exported orchestrator must have a manifest entry in `--strict` mode. After a recognized leading alias is removed, the existing flag parsing semantics apply unchanged.

The repository manifest deliberately omits and rejects `goal`; long-running work uses the host runtime's native task/session behavior instead of a cross-runtime goal wrapper.

## Opt-In Agent Model Profiles

Per-agent model output remains opt-in. With `--agent-profile <profile> --model-set <set>`:

- The shared profile is loaded from `tools/agent-profiles/<profile>.json` and declares `runtime: "neutral"`.
- The Claude tier catalog is loaded from `runtimes/claude/model-sets/<set>.json` and declares `runtime: "claude"`.
- The profile maps agents to logical tiers such as `mini`, `standard`, and `strong`.
- The Claude model set maps each tier to one supported Claude Code alias: `inherit`, `sonnet`, `opus`, or `haiku`.
- The selected alias is written as frontmatter `model` for each mapped generated subagent.

Versioned Claude model IDs such as `claude-...` are rejected. Reasoning effort is not controlled by these profiles; omit the profile flags to inherit Claude Code's normal runtime selection.

After the one-time global Claude Code install, use the installed profile manager. Claude profiles are global-only:

```bash
bash "$HOME/.claude/agents-pipeline/scripts/agent-profile.sh" set balanced --runtime claude --scope global --model-set default
```

The interactive menu likewise exposes only global scope for Claude Code. Global output lives at `~/.claude/agents`, the runner block at `~/.claude/CLAUDE.md`, and support assets at `~/.claude/agents-pipeline`. The installer records normalized profile state in `~/.claude/agents/.agents-pipeline-runtime-profile.json`. Status rejects unsafe managed filenames and reports missing outputs through `health`; no OpenCode setting is consulted. Global `clear` regenerates without model overrides and records runtime inheritance.

Claude custom-agent model selection lives in each complete generated agent file, so there is no safe profile-only project overlay equivalent to Codex's `config_file` layer. The profile manager rejects Claude workspace `set`/`clear` without writing project files. A direct target of `<project>/.claude/agents` plus root `<project>/CLAUDE.md` remains explicit materialization compatibility; it copies complete generated agents and support assets and is not a profile-only operation. See [Developer Install](developer-install.md#explicit-workspace-materialization-compatibility).

Profile `status` is not the workflow checkpoint/run status written by `tools/status-event.js`.

## `@agent` References And Delegation

- Body `@agent-name` references are validated against the canonical source set and root `AGENTS.md` in `--strict` mode.
- Resolved references are listed in the generated delegation adapter.
- Claude Code subagents cannot nest `Agent` calls. An orchestrator launched as the main agent could otherwise inherit `Agent`, so generated orchestrators explicitly set `disallowedTools: Agent` to keep this adapter runner-only.
- When delegation is needed, an orchestrator returns a fenced JSON block containing `dispatch` tasks plus a self-contained `continuation` contract.
- The top-level runner executes each dispatch block atomically and, when continuation is required, starts a fresh invocation of the named orchestrator with the prior response and keyed results. It never relies on agent-team-only messaging or on resuming a completed subagent instance.

The installer injects the managed runner protocol into `CLAUDE.md` by default. Use `--no-runner` or `-NoRunner` only when another top-level runner already implements that contract.

## Status And Checkpoint Degradation

The Claude installer synchronizes a marker-owned managed neutral support tree beside the global agent directory (normally `~/.claude/agents-pipeline`) and rewrites generated references to that absolute location. The tree includes `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`, so its installed profile-manager wrapper supports `set`, `status`, `clear`, and `list`. Generated orchestrators use the installed status writer when the runtime permits local command execution; if execution is unavailable, they must report that persistence is unsupported instead of claiming a write succeeded.

## Install And Bundle Layout

- Default install target: `~/.claude/agents`
- Explicit materialization compatibility target: `<project>/.claude/agents`
- Explicit materialization runner target: root `<project>/CLAUDE.md`
- Local install: `scripts/install-claude.sh` or `scripts/install-claude.ps1`
- Release install: `scripts/bootstrap-install-claude.sh` or `scripts/bootstrap-install-claude.ps1`

Installers require the neutral `agents/`, `modes.json`, `AGENTS.md`, `tools/agent-profile.py`, `tools/agent-profiles/`, and `runtimes/claude/model-sets/` layout. Bootstrap installers consume the neutral `agents-pipeline-bundle-*` release assets and verify the required Claude adapter files before installation. A deliberately materialized workspace release bootstrap forwards `--target <workspace>/.claude/agents --claude-md <workspace>/CLAUDE.md` (PowerShell: `-Target` and `-ClaudeMd`) to this same installer path.
