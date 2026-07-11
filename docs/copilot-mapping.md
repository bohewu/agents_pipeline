# Copilot Mapping

GitHub Copilot is a Tier 2, best-effort export target. This document describes how the neutral agent core is adapted into Copilot `.agent.md` files; it does not promise feature parity with the Tier 1 Codex runtime.

## Source Of Truth

- Canonical agents: `agents/*.md`
- Mode aliases: `modes.json`
- Shared agent profiles: `tools/agent-profiles/*.json`
- Copilot model sets: `runtimes/copilot/model-sets/*.json`
- Generated output: `<target-dir>/*.agent.md`, normally `~/.copilot/agents/*.agent.md`
- Exporter: `scripts/export-copilot-agents.py`
- Installed profile manager: `~/.copilot/agents-pipeline/scripts/agent-profile.sh` / `.ps1`, backed by the installed `tools/agent-profile.py`
- Filename rule: `<source-stem>.agent.md`

Generated Copilot files are disposable outputs and should not become a second source tree.

## Neutral Frontmatter Mapping

| Canonical key | Copilot output | Rule |
|---|---|---|
| `name` | `name` | copied |
| `description` | `description` | copied |
| `kind` | not emitted | required by the neutral source contract |
| body `@agent` references | `agents` + coordinator tools | extracted, validated, deduplicated, and given `agent`, `read`, `search`, `edit`, and `execute` |
| body | markdown body | preserved with runtime adaptation and prompt compaction |

Neutral exports accept exactly `name`, `description`, and `kind`; runtime-specific source keys such as `model`, `provider`, `mode`, `temperature`, and `tools` are rejected. Model selection is runtime-driven unless export-time profile flags are explicitly supplied.

## Mode Manifest And Input Adaptation

Neutral orchestrator prompts express their input as `raw_input`; the Copilot adapter binds that to the user's latest message and prepends an input adapter to every orchestrator. The exporter still replaces legacy `$ARGUMENTS` tokens when it encounters an older source fixture, but current canonical agents must use `raw_input` directly.

The accepted leading slash tokens come from the exact `aliases` associated with that orchestrator in root `modes.json`. For example, `orchestrator-general` currently accepts `/general`, `/run-general`, `/monetize`, and `/run-monetize`. The exporter does not infer aliases from the agent filename.

The manifest must declare `version: 1`, a non-empty `modes` array, unique mode names, unique aliases, and one orchestrator target per entry. Every exported orchestrator must have a manifest entry in `--strict` mode. After a recognized leading alias is removed, the existing flag parsing semantics apply unchanged.

The repository manifest deliberately omits and rejects `goal`; long-running work uses the host runtime's native task/session behavior instead of a cross-runtime goal wrapper.

## Opt-In Agent Model Profiles

Per-agent model output remains opt-in. With `--agent-profile <profile> --model-set <set>`:

- The shared profile is loaded from `tools/agent-profiles/<profile>.json` and declares `runtime: "neutral"`.
- The Copilot tier catalog is loaded from `runtimes/copilot/model-sets/<set>.json` and declares `runtime: "copilot"`.
- The profile maps agents to logical tiers such as `mini`, `standard`, and `strong`.
- A Copilot tier maps to either one model-picker name or an ordered list of names.
- The selected value is written as frontmatter `model`, using a scalar or YAML list as appropriate.

Model names are emitted exactly as configured and must match names offered by the user's Copilot model picker. The exporter does not validate remote availability. Reasoning effort is not controlled by these profiles; omit the flags to keep Copilot's normal runtime selection.

After the one-time global Copilot install, use the installed profile manager. Copilot profiles are global-only:

```bash
bash "$HOME/.copilot/agents-pipeline/scripts/agent-profile.sh" set balanced --runtime copilot --scope global --model-set default
```

The interactive menu likewise exposes only global scope for Copilot. Global definitions live at `~/.copilot/agents`, support assets at `~/.copilot/agents-pipeline`, and normalized state at `~/.copilot/agents/.agents-pipeline-runtime-profile.json`. Status rejects unsafe managed filenames and reports missing output through `health`; no OpenCode setting is consulted. Global `clear` regenerates without model overrides and records runtime inheritance.

Copilot model selection lives in each complete generated `.agent.md` file, so there is no safe profile-only project overlay equivalent to Codex's `config_file` layer. The profile manager rejects Copilot workspace `set`/`clear` without writing project files. A direct target of `<project>/.github/agents` remains explicit materialization compatibility; it copies complete generated agents and support assets and is not a profile-only operation. See [Developer Install](developer-install.md#explicit-workspace-materialization-compatibility).

Profile `status` is not the workflow checkpoint/run status written by `tools/status-event.js`.

## Subagent Extraction

- The exporter scans canonical body text for `@<agent-name>` tokens.
- Direct references such as `@executor` are emitted in the generated `agents:` list.
- References are deduplicated while preserving order.
- Unresolved references fail generation in `--strict` mode.

## Fallback Agents

With the default `--emit-fallback` behavior, every `orchestrator-*` source also produces `<orchestrator-name>-solo.agent.md`.

The normal file declares its resolved `agents:` list and a bounded coordinator tool set (`agent`, `read`, `search`, `edit`, `execute`) so it can delegate, synthesize artifacts, and call local validation/status commands. The `-solo` file omits `agents:` and adds instructions to execute the same stages inline when Copilot subagents are unavailable; with no explicit tool list it inherits the runtime's normal tools. Both variants use the same manifest-derived input aliases and selected model setting.

## Status And Checkpoint Degradation

The Copilot installer synchronizes a marker-owned managed neutral support tree beside the global agent directory (normally `~/.copilot/agents-pipeline`) and rewrites generated references to that absolute location. The tree includes `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`, so its installed profile-manager wrapper supports `set`, `status`, `clear`, and `list`. Generated orchestrators use the installed status writer when the selected Copilot surface permits local command execution; if execution is unavailable, they must report that persistence is unsupported instead of claiming a write succeeded.

## Install And Bundle Layout

- Default install target: `~/.copilot/agents`
- Explicit materialization compatibility target: `<project>/.github/agents`
- Local install: `scripts/install-copilot.sh` or `scripts/install-copilot.ps1`
- Release install: `scripts/bootstrap-install-copilot.sh` or `scripts/bootstrap-install-copilot.ps1`

Installers require the neutral `agents/`, `modes.json`, `AGENTS.md`, `tools/agent-profile.py`, `tools/agent-profiles/`, and `runtimes/copilot/model-sets/` layout. Bootstrap installers consume the neutral `agents-pipeline-bundle-*` release assets and verify the required Copilot adapter files before installation. A deliberately materialized workspace release bootstrap forwards `--target <workspace>/.github/agents` (PowerShell: `-Target`) to this same installer path.

## Known Limitations

- Copilot subagent support and accepted frontmatter can vary by client version.
- Broad canonical tool capability mapping is intentionally omitted; coordinating agents receive only the bounded coordinator set required for delegation and local synthesis/verification.
- Runtime status/checkpoint tooling may not have feature parity with Codex.
- Generated agents are best-effort adapters; unsupported runtime behavior should fail clearly rather than silently broaden scope.
