# Runtime Agent Model Profiles

Agent model profiles are optional runtime projections. Canonical agent Markdown never pins a model, provider, or reasoning effort. Profiles map roles to the neutral tiers `mini`, `standard`, and `strong`; a runtime model set maps those tiers to runtime model identifiers. The effective profile/runtime selects the normal role model and proves its logical tier. The versioned child-spawn resolver reads the matching registered reasoning projection to validate capability and select effort. Profiles do not contain or emit effort settings, but they may bound one temporary `executor`/`generalist` recovery tier.

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

Each support tree contains `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`. The installed wrapper therefore supports `set`, `status`, `clear`, and `list` without the source clone. For Codex, `set` is workspace-only; global `status` and `clear` are diagnostic/legacy-cleanup operations. `install` is accepted only as a deprecated compatibility alias for `set` where `set` is supported. An existing real, unmarked or unreadable `~/.codex/agents-pipeline/` support target is transactionally replaced. Its sibling backup is deleted after commit; only a cleanup failure leaves it in place, and the installer reports its path. Links, junctions/reparse points, and non-directories are refused.

The default Codex global installer additionally publishes all 16 managed discovery skills to the official Codex user-skills root, `~/.agents/skills/`: eleven formal workflow skills and five capability skills. Each carries `.agents-pipeline-skill.json` with a content digest; updates are rollback-capable and use an atomic rename per skill directory. For the 16 managed names, every existing real `run-*` or capability directory, including unmarked or corrupt-marker directories, is treated as opaque stale state, automatically replaced, and preserved in the sibling backup area. Links, junctions/reparse points, and non-directories are refused. The workflow skills stay global and adopt global workflow definitions. `$run-adaptive` selects among the existing Simple, Flow, and Pipeline definitions without adding a role, while keeping its execution preset independent from model/profile routing. Their workspace preflight stops on unverifiable or unhealthy local role state before execution; only a healthy, eligible profile proceeds to workspace-specific routing.

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

### Versioned Codex model sets

Named Codex profiles select one registered catalog/projection pair. The catalog selects the role model; the matching projection selects child effort after the central resolver has classified the task. It is not a per-run cost-routing switch.

| Model set | Tier mapping | Projection and normal limits |
| --- | --- | --- |
| `openai` | Luna / Terra / Sol | `openai-reviewer-v1` (policy v3). A named `reviewer` proven `strong` uses Astra; an ordinary adaptive deep review requests `high`. Other roles retain the normal Luna/Terra/Sol mapping. |
| `openai-luna-sol-astra` | Luna / Sol / Astra | `lsa-efficiency-v1` (policy v3). Its dedicated matrix permits Astra `low` only for adaptive `routine` and `deliberative` work; `deep` on Astra remains `high`, and formal assurance remains strong + `max` + strict. |
| `openai-legacy` | Luna / Terra / Sol | `legacy-v2` (policy v2), including the previous Sol reviewer and ordinary deep-review `xhigh` behavior. |

Use one of these mutually exclusive commands in a workspace after the matching global support bundle has been deployed:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"

bash "$profile_tool" set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai
bash "$profile_tool" set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai-luna-sol-astra
bash "$profile_tool" set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai-legacy
```

```powershell
$ProfileTool = "$HOME\.codex\agents-pipeline\scripts\agent-profile.ps1"

pwsh -File $ProfileTool set balanced --runtime codex --scope workspace --workspace C:\src\project --model-set openai
pwsh -File $ProfileTool set balanced --runtime codex --scope workspace --workspace C:\src\project --model-set openai-luna-sol-astra
pwsh -File $ProfileTool set balanced --runtime codex --scope workspace --workspace C:\src\project --model-set openai-legacy
```

The manifest saves the selected profile, catalog mapping identity, projection identity, and each resolved role binding. A resumed run must use the saved profile, mapping, and projection; changing workspace configuration stops later dispatch rather than hot-reloading a running workflow. Existing manifest-v2 Luna/Terra/Sol overlays are recognized as pinned legacy state and are never silently resolved through the newer same-named `openai` catalog. Run `set` again to intentionally refresh a workspace.

`uniform`, inherited, ineligible, and unknown configurations do not prove a tier or projection. They use existing unknown/legacy behavior; model names are never used to guess a tier. `clear` removes the workspace overlay and returns roles to parent-session inheritance. It does not select Sol or the legacy catalog.

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

For a healthy, eligible named profile, workflows can resolve one bounded recovery model without changing the profile:

```bash
bash "$HOME/.codex/agents-pipeline/scripts/agent-profile.sh" resolve-recovery \
  --runtime codex \
  --scope workspace \
  --workspace /path/to/project \
  --agent executor \
  --model-tier strong \
  --json
```

This action is read-only. It accepts only `executor` or `generalist`, requires a tier above that role's normal tier and no higher than its profile ceiling, and returns the raw model solely from the installed model set. Uniform, inherited, unhealthy, ineligible, or pinned-catalog profiles are rejected; rerun workspace `set` before recovering from an older pinned catalog.

Workspace role hashes, source-version provenance, and the role-input digest distinguish a release-only upgrade from an actual catalog change. Workspace `status` keeps `catalog_state: current` across a global agents_pipeline upgrade when the agent, profile, model-set, exporter, and catalog inputs are unchanged, even though the manifest retains its older `source_version`. It reports `pinned` when those role-generating inputs changed and returns to `current` after `set` refreshes the workspace roles. An upgrade never silently rewrites a project's selected roles. The JSON status shows configured catalog and projection evidence; it is not evidence of an actual child model or effort.

Codex applies `.codex/config.toml` only for a trusted project. The profile manager never changes global project trust. Workspace `set` and `status` read the explicit global `projects.<path>.trust_level` value and report `project_trust` plus `profile_eligibility`; file `health` remains a separate integrity result. `eligible` means the trust gate is open, not that arbitrary preserved project settings passed Codex's complete semantic parser. For `unknown` or `untrusted`, trust the project through Codex's normal prompt and rerun `status`. Official behavior is documented under [project config files](https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml).

### Workspace status and clear

- `status` validates the project manifest, managed block, workspace-local role ownership and content hashes, selected profile metadata, global Codex registration, active global mode guidance, critical support assets, and the recorded global discovery-skill collection. It separately reports whether the explicit project trust setting makes the layer eligible for Codex to load.
- A workspace with no project overlay reports `mode: inherit`, uses the model-free global definitions, and inherits model selection from the parent session.
- `clear` removes only the managed block, installer-owned workspace role files, and `.agents-pipeline-project-profile.json`.
- If `.codex/config.toml` contains unrelated settings, `clear` preserves their TOML content outside the managed block. If the generated block was the only content, the empty config file may be removed.
- `clear` never removes global agents or support assets.
- Workspace `set`, `status`, and `clear` never change the model-free global role files.

Codex workspace profiles inherit global `agents.max_concurrent_threads_per_session` and `agents.max_depth`. A full/global install supplies defaults of `8` and `1`, respectively, while preserving explicit new values and migrating numeric legacy `agents.max_threads` values. Codex 0.145.0 uses the new concurrency key and ignores `agents.max_depth` on V2. Supported Codex skills keep primary workflow control in the current/main agent, and generated subagent roles are leaf workers.

### Profile-aware workflow skills

The formal `$run-adaptive`, `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee` skills are installed globally once. Manifest-backed skills adopt the globally installed orchestrator workflow and never manually trust a raw workspace role; `$run-adaptive` selects one of the existing Simple, Flow, or Pipeline definitions in place. Every invocation queries current-workspace status: no configured profile means global inheritance, while unverifiable status, orphaned managed config, or non-`ok` file health stops before dispatch and asks for workspace `set` or `clear`. Prompt-only Adaptive generation warns instead of dispatching. A healthy but ineligible layer warns and uses global routing. A healthy, eligible layer makes the workspace-local role/model files available to Codex; runtime role selection remains owned by the active Codex surface and must be verified from the spawned child's role and model when it matters. Only `adaptive` requests an effort selector and may call a projection applied after matching child-trace evidence. `shadow` computes a proposed result only; `inherit` does not apply a selector. Neither mode proves that a projection ran.

The managed `use <mode>` forms remain compatibility aliases for manifest-backed modes. `$run-adaptive` intentionally has no compatibility alias or role. There is no `$run-goal` skill.

### Manual v3 smoke and comparison guidance

Do not run a live Astra smoke until the support bundle is deployed, the account confirms model availability, and a fresh test workspace and new session/run are ready. Then verify separately: the standard `openai` strong reviewer requests and observes Astra `high`; the experimental set resolves its three tiers; and a legal bounded strong planner example requests and observes Astra `low`. A deep reviewer must stay deep; do not lower its class merely to exercise `low`.

Treat a missing model entitlement, quota, selector capability, or mismatched trace as a failed or unverified smoke. Do not substitute Sol and report an Astra success. Status is configuration evidence only; an adaptive projection is applied only when the real child trace matches the resolved role, model, and effective effort.

Keep two comparisons separate. A pure-model comparison fixes the repository snapshot, scope, evidence, effort, and speed so a later model cannot read earlier findings. A set comparison may vary model and effort, and must report the result as a configuration comparison. Record available time, actual usage, valid findings, false positives, and rework; write unavailable usage as `unknown`. Do not infer subscription credits or billing from public price lists, and do not add telemetry, a paid evaluation job, or automatic model ranking for this manual check.

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

- `tools/agent-profiles/*.json` maps agent names to `mini`, `standard`, and `strong`, plus optional `recovery_ceiling_tiers` for `executor` and `generalist`.
- `runtimes/codex/model-sets/*.json` maps tiers to Codex `model` values plus optional `model_provider` metadata describing the expected parent provider. Codex roles inherit that parent provider; the metadata is not emitted as a role override.
- `runtimes/claude/model-sets/*.json` maps tiers to Claude Code aliases.
- `runtimes/copilot/model-sets/*.json` maps tiers to Copilot model-picker names or priority lists.

Profiles declare `"runtime": "neutral"`; model sets remain runtime-specific. These profiles never control reasoning effort. In particular, the Codex exporter does not write `model_reasoning_effort`; `protocols/REASONING_POLICY.md` resolves child-spawn effort independently. Policy v2 and direct Simple/Flow/Pipeline entry points default to inherit mode, while fresh `$run-adaptive` execution selects adaptive mode by default. A healthy eligible profile's role tier is an input to that resolver, not an effort assignment. General dynamic model routing, downgrade, reviewer model uplift, and current/main-agent changes remain forbidden. `protocols/CAPABILITY_RECOVERY.md` defines the sole exception: one profile-approved tier step for an `executor` or `generalist` child after repeated material reasoning failure. Local Codex workflows verify the recovered child model and effort from bounded trace metadata.

The built-in profiles keep upstream control and final judgment stronger than bounded leaf work:

- `frugal` uses `mini` for mechanical helpers and bounded advisory roles, keeps routing, planning, implementation, research, and deep analysis on `standard`, and reserves `strong` for review, security, and final judges.
- `balanced` retains the default cost/quality distribution without additional leaf-role reductions.
- `premium` keeps routine helpers and the KISS guard on `mini`, starts `executor` on `standard`, permits its existing bounded recovery to `strong`, and concentrates `strong` on higher-rigor analysis, planning, review, security, and judgment.

On Codex, the reasoning resolver still applies class-specific effort. Moving a fixed-deliberative role to `mini` therefore requests `xhigh`, while fixed-routine `mini` roles request `high`; the profile does not override those mappings.

| Profile | `executor` recovery ceiling | `generalist` recovery ceiling |
|---|---|---|
| `frugal` | `standard` | `standard` |
| `balanced` | `strong` | `strong` |
| `premium` | `strong` | `strong` |

| Runtime | Generated model fields | Limits |
|---|---|---|
| Codex workspace | `model` in role TOML; optional provider metadata stays in the model set | Workspace-only; provider is parent-owned; no reasoning-effort fields |
| Claude Code | `model` alias in agent frontmatter | `inherit`, `sonnet`, `opus`, or `haiku` |
| Copilot | `model` scalar or prioritized list | Values must match the host model picker |

Contributor-facing direct installer flags and catalog maintenance commands are documented in [Developer Install](developer-install.md).
