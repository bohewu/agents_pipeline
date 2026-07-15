# Runtime Agent Model Profiles

Agent model profiles are optional runtime projections. Canonical agent Markdown never pins a model, provider, or reasoning effort. Profiles map roles to the neutral tiers `mini`, `standard`, and `strong`; a runtime model set maps those tiers to runtime model identifiers. The effective profile/runtime selects the actual role model and proves its logical tier. The separate policy-v2 child-spawn resolver may read that tier to validate capability and select effort, but profiles do not contain or emit effort settings.

The runtime installation is global-first, but Codex model selection is workspace-only:

1. Install each runtime once into its global home.
2. The Codex global install generates model-free roles that inherit the parent session.
3. Use the globally installed profile manager to create profile-specific roles only in a Codex workspace.
4. A new Codex project needs no setup unless it requires explicit per-role resource tiers; do not reinstall runtime support into the project.

Claude Code and GitHub Copilot profiles remain global-only through the profile manager. Their direct workspace installers remain explicit materialization compatibility for users who knowingly want complete generated agents inside a repository.

Profile status and workflow status are different surfaces:

- `agent-profile.* status` reports Codex global installation health, Codex workspace model routing, or global Claude Code/Copilot model routing.
- `tools/status-event.js` writes live workflow checkpoint, task, agent, and run status under `.pipeline-output`.

## One-time global layout

| Runtime | Generated definitions | Installed support assets |
|---|---|---|
| Codex | Model-free `~/.codex/agents/`, `~/.codex/config.toml`, and the active global `AGENTS.md` or `AGENTS.override.md`; roles inherit the parent session | `~/.codex/agents-pipeline/` |
| Claude Code | `~/.claude/agents/`, `~/.claude/CLAUDE.md` | `~/.claude/agents-pipeline/` |
| GitHub Copilot | `~/.copilot/agents/` | `~/.copilot/agents-pipeline/` |

Each support tree contains `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`. The installed wrapper therefore supports `set`, `status`, `clear`, and `list` without the source clone. For Codex, `set` is workspace-only; global `status` and `clear` are diagnostic/legacy-cleanup operations. `install` is accepted only as a deprecated compatibility alias for `set` where `set` is supported.

The default Codex global installer additionally publishes all 16 managed discovery skills under `~/.agents/skills/`: eleven formal workflow skills and five capability skills. Each carries `.agents-pipeline-skill.json` with a content digest; updates are rollback-capable and use an atomic rename per skill directory. Unowned, corrupt-marker, linked, or junction-backed targets cause a safe refusal, while a modified marker-owned copy is preserved outside the discovery root before repair. The workflow skills stay global and adopt global workflow definitions. `$run-adaptive` selects among the existing Simple, Flow, and Pipeline definitions without adding a role, while keeping its execution preset independent from model/profile routing. Their workspace preflight stops on unverifiable or unhealthy local role state before execution; only a healthy, eligible profile proceeds to workspace-specific routing.

## Interactive quick start

After the one-time global Codex bootstrap, run the installed wrapper from any directory.

macOS/Linux:

```bash
bash "$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"
```

Windows:

```powershell
pwsh -File "$HOME\.codex\agents-pipeline\scripts\agent-profile.ps1"
```

When stdin and stdout are terminals, the manager displays numbered choices in this order:

1. action: `set`, `status`, `clear`, or `list`
2. runtime: Codex (recommended), Claude Code, or GitHub Copilot
3. scope when applicable: Codex workspace for profile `set`; workspace or global diagnostics/legacy cleanup for Codex `status` and `clear`; global for Claude Code and Copilot
4. workspace path when Codex workspace scope is selected
5. profile: `balanced` first, another neutral profile, or `uniform`
6. runtime-specific model set for a named profile

Claude Code and Copilot expose only global scope in this menu. Codex does not offer global profile `set`. The menu is enabled only when both input and output are TTYs. CI, pipes, command substitution, and redirected input must pass every choice explicitly.

## Codex workspace profile

A Codex workspace profile requires a healthy global Codex install. Set it with the installed wrapper:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"

bash "$profile_tool" set balanced \
  --runtime codex \
  --scope workspace \
  --workspace /path/to/project \
  --model-set openai

bash "$profile_tool" status \
  --runtime codex \
  --scope workspace \
  --workspace /path/to/project \
  --json

bash "$profile_tool" clear \
  --runtime codex \
  --scope workspace \
  --workspace /path/to/project
```

PowerShell uses the same long options:

```powershell
$ProfileTool = "$HOME\.codex\agents-pipeline\scripts\agent-profile.ps1"
pwsh -File $ProfileTool set balanced --runtime codex --scope workspace --workspace C:\src\project --model-set openai
pwsh -File $ProfileTool status --runtime codex --scope workspace --workspace C:\src\project --json
pwsh -File $ProfileTool clear --runtime codex --scope workspace --workspace C:\src\project
```

Workspace `set` uses the globally installed exporter, neutral agent sources, selected profile, and Codex model catalog under `~/.codex/agents-pipeline/` to render the selected roles directly into the workspace. It does not read or copy active global role files, and it does not require a global profile cache.

A named profile maps roles through the selected installed model catalog; a uniform profile applies the requested model while rendering the same complete role set. The project receives only:

```text
<project>/.codex/config.toml
<project>/.codex/agents/*.toml
<project>/.codex/.agents-pipeline-project-profile.json
```

The managed `config.toml` block changes each repository-managed `[agents.<name>].config_file` to the corresponding workspace-local role. Existing unrelated project settings are preserved. The manager refuses to overwrite conflicting project-defined agent tables or unrelated local role files.

It does **not** create project-local `agents-pipeline/`, `skills/`, `scripts/`, `protocols/`, `tools/`, or another support tree. Only the profile-specific role TOML is local; reusable definitions and runtime support remain installed globally once.

Codex cannot implement this as a single project `profile = "balanced"` key: project config ignores `profile` and `profiles`, while standalone custom-agent files require complete role definitions. The managed config block plus workspace-local role files provide an isolated native project profile without mutating active global roles. See the official [Codex configuration reference](https://developers.openai.com/codex/config-reference) and [custom-agent documentation](https://developers.openai.com/codex/subagents).

The generated workspace roles contain references to the current machine's global support installation. Treat the whole workspace profile layer as machine-local generated configuration rather than a portable source artifact. On another machine, run the one-time global bootstrap and `set` for that workspace again.

Workspace role hashes and source-version metadata keep an existing project profile pinned across a global agents_pipeline upgrade. Workspace `status` reports `catalog_state: pinned` when the local role set was materialized from an older catalog and `current` after `set` refreshes it to the installed catalog. Re-running `set` after an upgrade is recommended when you want the new role catalog, but an upgrade never silently rewrites a project's selected roles.

Codex applies `.codex/config.toml` only for a trusted project. The profile manager never changes global project trust. Workspace `set` and `status` read the explicit global `projects.<path>.trust_level` value and report `project_trust` plus `profile_eligibility`; file `health` remains a separate integrity result. `eligible` means the trust gate is open, not that arbitrary preserved project settings passed Codex's complete semantic parser. For `unknown` or `untrusted`, trust the project through Codex's normal prompt and rerun `status`. Official behavior is documented under [project config files](https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml).

### Workspace status and clear

- `status` validates the project manifest, managed block, workspace-local role ownership and content hashes, selected profile metadata, global Codex registration, active global mode guidance, critical support assets, and the recorded global discovery-skill collection. It separately reports whether the explicit project trust setting makes the layer eligible for Codex to load.
- A workspace with no project overlay reports `mode: inherit`, uses the model-free global definitions, and inherits model selection from the parent session.
- `clear` removes only the managed block, installer-owned workspace role files, and `.agents-pipeline-project-profile.json`.
- If `.codex/config.toml` contains unrelated settings, `clear` preserves their TOML content outside the managed block. If the generated block was the only content, the empty config file may be removed.
- `clear` never removes global agents or support assets.
- Workspace `set`, `status`, and `clear` never change the model-free global role files.

Codex workspace profiles inherit global `agents.max_threads` and `agents.max_depth`. Supported Codex skills keep primary workflow control in the current/main agent and dispatch only direct worker roles, so `agents.max_depth = 1` is sufficient.

### Profile-aware workflow skills

The formal `$run-adaptive`, `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee` skills are installed globally once. Manifest-backed skills adopt the globally installed orchestrator workflow and never manually trust a raw workspace role; `$run-adaptive` selects one of the existing Simple, Flow, or Pipeline definitions in place. Every invocation queries current-workspace status: no configured profile means global inheritance, while unverifiable status, orphaned managed config, or non-`ok` file health stops before dispatch and asks for workspace `set` or `clear`. Prompt-only Adaptive generation warns instead of dispatching. A healthy but ineligible layer warns and uses global routing. A healthy, eligible layer makes the workspace-local role/model files available to Codex; runtime role selection remains owned by the active Codex surface and must be verified from the spawned child's role and model when it matters.

The managed `use <mode>` forms remain compatibility aliases for manifest-backed modes. `$run-adaptive` intentionally has no compatibility alias or role. There is no `$run-goal` skill.

## Global Codex diagnostics and legacy cleanup

Codex does not support global profile `set`. Use `--scope global` only to inspect the global installation or remove model pins left by an older release:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"

bash "$profile_tool" status --runtime codex --scope global --json
bash "$profile_tool" clear --runtime codex --scope global
bash "$profile_tool" list --runtime codex
```

Global `status` validates the installer manifest, role registrations, generated role files, mode guidance, critical support assets, and marker/content integrity for all recorded discovery skills. Global `clear` regenerates the global roles without `model` or `model_provider`, returning them to parent-session inheritance; it is not an uninstall and does not select a profile. A normal global install already has this model-free state.

The global manifests are:

- Codex: `~/.codex/.agents-pipeline-codex-manifest.json`
- Claude Code: `~/.claude/agents/.agents-pipeline-runtime-profile.json`
- GitHub Copilot: `~/.copilot/agents/.agents-pipeline-runtime-profile.json`

Status validates manifest identity, target, managed filenames, and missing generated outputs. It never reads OpenCode configuration.

## Claude Code and Copilot profiles

Claude Code and Copilot store model selection in each complete generated agent file. Neither adapter currently has the tested workspace role/config projection used by Codex. The profile manager therefore accepts only global scope for these runtimes:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"

bash "$profile_tool" set balanced --runtime claude --scope global --model-set default
bash "$profile_tool" set balanced --runtime copilot --scope global --model-set default
```

Attempting `set` or `clear` with workspace scope for Claude Code or Copilot fails without creating project files. If complete project-local agent materialization is intentionally required, use the direct workspace installer documented in [Developer Install](developer-install.md#explicit-workspace-materialization-compatibility). That path copies generated definitions and support assets and must not be described as profile-only.

## Profile and model-set inputs

- `tools/agent-profiles/*.json` maps agent names to `mini`, `standard`, and `strong`.
- `runtimes/codex/model-sets/*.json` maps tiers to Codex `model` and optional `model_provider` values.
- `runtimes/claude/model-sets/*.json` maps tiers to Claude Code aliases.
- `runtimes/copilot/model-sets/*.json` maps tiers to Copilot model-picker names or priority lists.

Profiles declare `"runtime": "neutral"`; model sets remain runtime-specific. These profiles never control reasoning effort. In particular, the Codex exporter does not write `model_reasoning_effort`; `protocols/REASONING_POLICY.md` resolves child-spawn effort independently, defaulting supported engineering workflows to adaptive mode. A healthy eligible profile's role tier is an input to that resolver, not an effort assignment. The resolver never uses it to route a raw/dynamic model, upgrade/downgrade a model, or change the current/main agent. Global inheritance, uniform raw-model profiles, and unprovable mappings use logical tier `unknown` rather than guessing from a model slug. Local Codex workflows verify the actual child effort from bounded trace metadata because a profile/model match does not prove that a per-spawn effort request was honored.

| Runtime | Generated model fields | Limits |
|---|---|---|
| Codex workspace | `model`, optional `model_provider` in role TOML | Workspace-only; no reasoning-effort fields |
| Claude Code | `model` alias in agent frontmatter | `inherit`, `sonnet`, `opus`, or `haiku` |
| Copilot | `model` scalar or prioritized list | Values must match the host model picker |

Contributor-facing direct installer flags and catalog maintenance commands are documented in [Developer Install](developer-install.md).
