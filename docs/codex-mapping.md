# Codex Mapping

This document defines how runtime-neutral agent definitions are mapped to Codex multi-agent role configuration.

## Source Of Truth

- Source: `agents/*.md`
- Mode routing source: `modes.json`
- Formal workflow-skill source: `skills/run-*/SKILL.md`
- Reusable capability-skill source: the five named `skills/<capability>/SKILL.md` packages listed in the README
- Generated output:
  - `<target-dir>/config.toml`
  - `<target-dir>/agents/*.toml`
- Generator: `scripts/export-codex-agents.py`
- Installed profile manager: `~/.codex/agents-pipeline/scripts/agent-profile.sh` / `.ps1`, backed by the installed `tools/agent-profile.py`
- Primary/default install target: global `~/.codex` (Windows: `%USERPROFILE%\.codex`)
- Workspace profile output: profile-specific `<workspace>/.codex/agents/*.toml`, a managed block in `<workspace>/.codex/config.toml`, and `<workspace>/.codex/.agents-pipeline-project-profile.json`

Do not manually maintain generated Codex role files as a primary source.

## Global-First Install Scope

Use a global Codex install in `~/.codex` by default so the exported roles are available across workspaces.
The default global install to `~/.codex` publishes 16 managed skills to `~/.agents/skills/`: eleven formal `run-*` workflow skills and five reusable capability skills. A custom global/test Codex home publishes skills only when `--user-skills-root` or `-UserSkillsRoot` is supplied. Projects do not need their own skill copy. Manifest-backed workflow skills adopt the global workflow definition; `$run-adaptive` selects among the existing Simple, Flow, and Pipeline definitions without adding a role. Each workflow skill runs the workspace-profile health gate before effective trusted Codex configuration may apply workspace-local model routing to dispatched roles. Direct workspace materialization never installs user skills.
When the installer targets a Codex home/global directory, it now auto-merges the managed global mode note into the active global AGENTS file inside that target: prefer `AGENTS.override.md` when it exists and is non-empty, otherwise use `AGENTS.md`.
That managed note tells the current/main agent that a recognized mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization. It reads the globally installed orchestrator definition as the workflow source and never manually adopts a repository role. The alias follows the matching formal skill's workspace-profile preflight before Codex effective config may route dispatched roles locally. After applying the definition, the current/main agent must obey its hard constraints and delegation rules. Runtime-specific adapter details for other runtimes can be ignored during Codex mode simulation.
Global Codex roles are model-free and inherit model selection from the parent session. Projects use those roles without setup. When one project needs explicit resource tiers, the normal project-specific path materializes only profile-specific role TOML plus a managed config block and manifest; global support is reused. Directly targeting `<workspace>/.codex` with an installer remains explicit full-materialization compatibility and copies the complete roles/support tree.

## Global Custom Instructions Snippet

If you use `scripts/install-codex.ps1` or `scripts/install-codex.sh` for a global `~/.codex` install, the installer now manages the equivalent of this snippet automatically in the active global AGENTS file.
Manual copy is still optional for users who are not using the installer; place it in the active global file in the Codex home (`~/.codex/AGENTS.override.md` when you intentionally keep that file non-empty, otherwise `~/.codex/AGENTS.md`) or in the equivalent Codex app setting.

```text
## Codex global mode aliases

Treat only explicit leading mode phrases from this allowlisted pattern family — `use <mode>`, `using <mode>`, `使用 <mode>`, `使用<mode>`, `用 <mode>`, `用 <mode> 做...`, `請用 <mode>`, and `請用 <mode> 去執行...` — as mode aliases for a supported mode in the current/main agent, not generic prose.
Those aliases tell the current/main agent to adopt the requested mode directly.
Installed `$run-adaptive` routing plus `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee` skills are the formal workflow entry points. Adaptive is skill-only and intentionally has no orchestrator role or compatibility mode alias.
Natural-language forms such as `use pipeline` and `使用 pipeline` remain compatibility aliases; `$run-pipeline` is the primary full-pipeline entry point.
Treat each recognized compatibility alias as the matching formal `$run-<mode>` skill invocation and apply that skill's preflight and workflow semantics.
Before adopting the workflow, always query the globally installed profile manager for current-workspace JSON status. A normal workspace without a profile reports global inheritance and may continue. If status cannot be verified or a configured profile's `health` is not `ok`, stop before dispatch and ask the user to rerun workspace `set` or `clear`; never bypass an unhealthy or orphaned profile. If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing.
A mode alias changes the current/main agent's working style only. It does not automatically spawn subagents and does not override higher-priority rules for `spawn_agent` authorization.
On Codex surfaces that expose `agent_type`, `model`, or `reasoning_effort`, select a registered custom role or non-parent model/reasoning configuration through the native spawn selector without a full-history fork, then verify the spawned child trace. A full-history fork may inherit the parent agent type, model, and reasoning effort; use it only when that inheritance is intentional. If the selectors are unavailable, do not claim that workspace profile routing succeeded. When the adopted definition invokes the installed reasoning policy protocol, use its shared resolver for child effort and never infer effort from workflow risk or apply a child selector to the current/main agent.
Do NOT first spawn the same-named orchestrator role just to enter the mode.
Definition-first order for an explicit mode alias in a fresh/new session:
1. On a recognized mode alias, read the globally installed `$CODEX_HOME/agents/orchestrator-<mode>.toml` (default `~/.codex/agents/orchestrator-<mode>.toml`) as the authoritative workflow definition. Do not manually adopt a repository `.codex/agents/` role; effective Codex configuration controls trusted workspace role routing.
2. The current/main agent simulates that mode itself from the installed definition.
3. After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
4. If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline. It should delegate those work items when separately authorized.
5. Use subagents according to that installed definition for real work items when separately authorized.
Same-session reuse rule: repeated use of the same mode in the same session does NOT need to reload the definition when the mode and global definition source are unchanged.
Reload/re-read when the mode changes, the globally installed definition changes, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. Recheck effective role routing and workspace profile status whenever the workspace changes.
When reading the installed definition for Codex mode simulation, focus on mode behavior, task decomposition, delegation rules, and output style; ignore adapter details for other runtimes.

Alias map:
- `flow` / `run-flow` -> `orchestrator-flow`
- `pipeline` / `run-pipeline` -> `orchestrator-pipeline`
- `general` / `run-general` -> `orchestrator-general`
- `monetize` / `run-monetize` -> `orchestrator-general`
- `simple` / `run-simple` -> `orchestrator-simple`
- `spec` / `run-spec` -> `orchestrator-spec`
- `ci` / `run-ci` -> `orchestrator-ci`
- `modernize` / `run-modernize` -> `orchestrator-modernize`
- `analysis` / `run-analysis` -> `orchestrator-analysis`
- `ux` / `run-ux` -> `orchestrator-ux`
- `committee` / `run-committee` -> `orchestrator-committee`

Higher-priority system, developer, tool, and runtime instructions override this note.
Project/workspace `AGENTS.md` files may further refine behavior for a specific repo.
```

Explicit fully materialized workspace installs under `<workspace>/.codex` can still emit the equivalent managed workspace `AGENTS.md` block. Normal workspace profiles do not duplicate that block or the global support tree; they add only their selected local role definitions and continue to use globally installed guidance and support assets.

## Frontmatter Mapping

| Neutral source key | Codex output | Rule |
|---|---|---|
| `name` | `[agents.<name>]` table key and `agents/<name>.toml:name` | copied; must match source file stem in `--strict` mode |
| `description` | `agents.<name>.description` and `agents/<name>.toml:description` | copied |
| `kind` | routing metadata only | validates as `primary` or `subagent`; not emitted into role TOML |
| body | `developer_instructions` | preserved with minimal adaptation |

## Root Config Generation

The generator writes a root `config.toml` containing:

- `[features] multi_agent = true` by default
- optional `[agents] job_max_runtime_seconds` only when explicitly requested
- one `[agents.<name>]` table per source agent role

The exporter intentionally omits `agents.max_threads` and `agents.max_depth`; machine-wide concurrency and nesting limits remain owned by the user's Codex configuration.
Codex defines the root session at depth `0`, and `max_depth = 1` allows only a direct child agent.
Formal `$run-*` skills adopt their primary workflow in the current/main agent and dispatch executor/reviewer roles as direct children. Modernize execution adopts the Pipeline definition in that same agent rather than spawning `orchestrator-pipeline`, so supported workflows remain compatible with `max_depth = 1`.

Adaptive, Simple, Flow, and Pipeline accept `--reasoning=inherit|shadow|adaptive`; version 1 defaults to `adaptive`. Before each child spawn, the current/main agent calls the installed `tools/reasoning-policy.js` resolver, then uses a non-null returned `dispatch_effort` through the native selector in adaptive mode. A selector-unavailable, non-strict, non-exact decision returns `degraded` with null effort, so the workflow omits the selector and continues without claiming enforcement; strict or exact cases conflict. It always omits `model`, so the effective workspace/global role configuration remains authoritative for model selection. `inherit` is the rollback mode; `shadow` records the decision without applying the selector. See `protocols/REASONING_POLICY.md`.

`--review=max` is a reviewer-only per-spawn override. The current/main agent dispatches the registered `reviewer` role without a full-history fork and with `reasoning_effort = max`, while omitting `model` so the effective workspace profile continues to select the role model. Initial review and every bounded re-review use the same override; executors, test runners, and the main orchestrator do not. If a Codex surface does not expose the selector, the exact request conflicts and blocks that review rather than warning and continuing or claiming Max was enforced.

The custom `reviewer` role is not Codex's native `/review` command. The former is a cross-runtime Pipeline/ad-hoc quality-gate role with ReviewReport output; the latter is Codex's dedicated Git diff/branch/commit review experience and may use the separate `review_model` setting.

Use standalone exporter flags to adjust this output when needed:

- `--job-max-runtime-seconds=<n>`
- `--no-enable-feature-flag`

Direct exporter output and normal global Codex installs both leave `agents.max_threads` and `agents.max_depth` runtime-owned. Installs preserve existing user values, and generated configs leave both keys absent. Project profile overlays inherit the effective global values; `max_depth = 1` supports the shipped skill workflows.

## Role Config Generation

Each generated `agents/<name>.toml` file includes:

- `name`
- `description`
- `developer_instructions`

This matches the current Codex custom-agent schema from the official docs, which requires `name`, `description`, and `developer_instructions` in each standalone agent file.
Codex custom-agent files can also include other supported `config.toml` keys, but this exporter keeps generated agent files minimal unless a specific mapping is implemented explicitly.

By default, model/provider selection remains runtime-driven; source agents must not define per-agent `model` or `provider` keys.

## Opt-In Agent Model Profiles

Codex runtime model profiles are opt-in and workspace-only. Workspace `set` uses the exporter with `--agent-profile <profile> --model-set <set>`; the normal global installer rejects model-profile options and always generates model-free roles:

- The agent-to-tier profile is loaded from `tools/agent-profiles/<profile>.json`.
- The Codex tier catalog is loaded from `runtimes/codex/model-sets/<set>.json` and must have `runtime: "codex"`.
- Profiles map agents to logical tiers (`mini`, `standard`, `strong`); the Codex model set maps each tier to an object with `model` and optional `model_provider`.
- For each mapped generated role, the exporter writes only `model` and optional `model_provider` into that role file: `.codex/agents/<name>.toml`.
- The exporter does **not** write `model` or `model_provider` into root `config.toml` `[agents.<name>]` tables.
- The exporter does **not** emit `model_reasoning_effort` or `plan_mode_reasoning_effort`.

Reasoning effort is not controlled by these profiles. The child-spawn resolver uses a healthy eligible profile's logical role tier as one input, while global inheritance, uniform raw-model profiles, and unprovable mappings use `unknown`; it never guesses a tier from a model slug. Global role files still omit `model`, `model_provider`, and reasoning fields. Root/session settings own the current/main agent, and the workflow's native per-spawn selector owns only dispatched children.

After the one-time global install, the normal interactive front door is the installed wrapper:

```bash
bash "$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"
```

```powershell
pwsh -File "$HOME\.codex\agents-pipeline\scripts\agent-profile.ps1"
```

It presents numbered `set`/`status`/`clear`/`list`, runtime, scope when applicable, workspace path, profile, and model-set choices. Codex model-profile `set` is workspace-only. Global Codex `status` and `clear` remain available for installation diagnostics and legacy profile cleanup. For a non-TTY workspace profile, make every choice explicit:

```bash
profile_tool="$HOME/.codex/agents-pipeline/scripts/agent-profile.sh"
bash "$profile_tool" set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai
bash "$profile_tool" status --runtime codex --scope workspace --workspace /path/to/project --json
bash "$profile_tool" clear --runtime codex --scope workspace --workspace /path/to/project
```

Workspace `set` invokes the exporter from the globally installed support tree with its neutral agent sources, selected profile, and Codex model catalog, rendering complete role TOML directly into `<workspace>/.codex/agents/`. It then writes the managed local `config_file` block plus project manifest. It neither reads/copies active global role files nor creates project-local support, skills, scripts, protocols, tools, or mode guidance. `status` verifies the local roles, config references, and manifest; no workspace profile reports inheritance from the model-free global roles. `clear` removes installer-owned local roles, the managed block, and the project manifest while preserving unrelated project config and every global asset. Workspace operations never add model settings to global roles. `install` remains a deprecated alias for workspace `set`.

Project config is effective only when Codex trusts that repository. The workspace profile manager does not write `projects.<path>.trust_level`; it reads the global value and reports `project_trust` and `profile_eligibility` separately from file `health`. Eligibility covers the trust gate only; native Codex `config/read` is the source of truth for full semantic parsing and effective role registration. Actual runtime selection must be verified from the spawned child trace, including its `agent_role` and model.

Codex project config cannot select a user config profile by writing `profile` or `profiles`, and standalone custom-agent TOML requires full role fields. A managed per-role `config_file` block plus complete workspace-local role TOML is therefore the isolated native projection. Generated role references still resolve into the machine's global support installation, so the workspace profile should normally not be committed.

Sandbox mode, MCP servers, and other Codex-specific config are intentionally left unset so they inherit from the parent Codex environment unless you customize them after generation.

When Codex role bodies reference neutral assets such as `protocols/...`, `skills/...`, or `tools/...`, the installer-backed merge path rewrites those references to absolute paths under `<target-dir>/agents-pipeline/`. The marker-owned managed tree contains `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`; the installed profile-manager wrapper therefore supports `set`, `status`, `clear`, and `list` without a source clone. It does not create an `opencode/` mirror or overwrite Codex's own top-level skill/config directories. The namespaced support tree carries an ownership marker and is replaced through staging plus rollback; an existing unmarked directory is preserved and the install stops. The managed tree is regenerated on each global install and is not included in backup directories. An upgrade from an installer-managed legacy setup removes the old `<target-dir>/opencode/` support tree after generated-role ownership is confirmed.

Each managed user-skill directory carries `.agents-pipeline-skill.json` with a content digest. The installer updates the owned 16-skill collection with rollback and an atomic rename per skill directory; an unowned, corrupt-marker, linked, or junction-backed same-named target causes a safe refusal. A modified marker-owned copy is preserved outside the discovery root before repair. Known unmarked legacy capability copies can be backed up and migrated only through the explicit migration flag. `run-goal` is not installed.

## `@agent` Reference Handling

- Source bodies may contain `@planner`, `@reviewer`, `@executor`, and similar tokens.
- The generator keeps these references in `developer_instructions` and adds an adapter note telling Codex to map them to generated role names.
- In `--strict` mode, unresolved `@...` references fail generation.
- `@executor` is validated as a normal direct subagent reference.

## Role Invocation In Codex

- The primary workflow entry points are `$run-adaptive`, `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee`.
- `$run-adaptive` is a skill-only Flow-biased router that normalizes a route-independent `balanced`, `autonomous`, `careful`, `delivery`, or `interactive` policy, selects and adopts Simple, Flow, or Pipeline in place, then maps that policy to the selected workflow. It never emits an Adaptive role/profile entry; `--prompt=on` performs read-only route selection and emits a pinned next Adaptive prompt without executing.
- Every Adaptive preset remains Simple-eligible. Simple uses a bounded outer wrapper for explicitly requested scout/reviewer/handoff/kanban/commit behavior without adding planning/status artifacts; Flow and Pipeline receive equivalent native flags. Preset and explicit overrides survive in-place promotion and are persisted with expanded effective flags once a resumable Flow/Pipeline run begins.
- Manifest-backed skills adopt the globally installed orchestrator workflow and never manually read a raw repository role; `$run-adaptive` reads and adopts the selected installed Simple, Flow, or Pipeline definition. Every invocation queries current-workspace status, so an unconfigured workspace safely inherits global routing while unverifiable status, orphaned managed config, or non-`ok` file health stops before dispatch. Adaptive prompt-only generation warns instead of dispatching. A healthy ineligible layer warns and falls back to global routing. Only after this preflight may effective trusted Codex configuration apply workspace-local model routing to dispatched roles.
- A formal skill adopts its selected global definition in the current/main agent; it does not spawn a primary orchestrator merely to enter the workflow.
- Codex docs describe custom roles via `[agents.<name>]` config and prompt-driven routing.
- Explicit leading `use <mode>` forms after adding the managed AGENTS note are compatibility aliases for the matching formal `$run-*` skill, including the same profile preflight. They tell the current/main agent to adopt that orchestrator mode directly; they do not first spawn the same-named orchestrator role just to enter the mode, do not automatically spawn subagents, and do not override higher-priority `spawn_agent` authorization.
- For explicit mode aliases in fresh/new sessions, read the globally installed `$CODEX_HOME/agents/orchestrator-<mode>.toml` (default `~/.codex/agents/orchestrator-<mode>.toml`) and never manually adopt a repository role.
- After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
- If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline; it should delegate those work items when separately authorized.
- Use subagents according to that installed definition for real work items when separately authorized.
- In the same session, repeated use of the same mode does not need to reload that definition unless the mode or global definition changes, the user explicitly asks, or the agent is no longer confident. Recheck effective role routing and profile status when the workspace changes.
- Direct role-name prompts may ask Codex to use a generated role, but selection remains runtime- and surface-owned. Do not treat the task/thread name or final prose as proof that the custom role loaded; verify the spawned child's `agent_role` and model when role-specific routing matters.
- When the Codex spawn surface exposes `agent_type`, `model`, or `reasoning_effort`, select registered custom roles or non-parent model/reasoning configurations through native spawn selectors without full-history forks, then verify the spawned child trace. For managed workflows, resolve effort through `protocols/REASONING_POLICY.md` and never relabel a merely requested selector as enforced. Full-history forks may inherit the parent's role and model configuration and are not proof of custom-role/profile routing.
- When reading the installed definition for Codex mode simulation, focus on mode behavior, task decomposition, delegation rules, and output style; ignore adapter details for other runtimes.
- In current Codex CLI builds, `/agent` is for switching between existing agent threads and may show no custom roles from `config.toml`.
- Recommended prompt style: `$run-pipeline coordinate this PR path`. Use `use pipeline ...` only when compatibility with the managed natural-language alias surface is useful, or name a role directly when you explicitly want a generated role rather than current-agent workflow adoption.

## Mode Input Adaptation

Neutral orchestrator prompts express their input as `raw_input`; the Codex adapter binds that to the user's latest message.

`goal` remains reserved for host-runtime native behavior and is not emitted as an agents-pipeline slash or natural-language mode alias.

For orchestrator agents, the generator prepends a Codex input adapter block:

- Use the user's latest message as `raw_input`.
- Recognize only matching slash aliases plus the same allowlisted natural-language mode-alias family used by the managed AGENTS note.
- Treat a recognized compatibility alias as the matching formal `$run-*` skill, including its workspace-profile preflight.
- Read the globally installed orchestrator definition and never manually adopt a repository `.codex/agents/` role. If profile status is unverifiable or unhealthy, stop before dispatch; if it is healthy but ineligible, warn and use global routing. Only after that gate may effective Codex configuration apply workspace routing.
- A recognized mode alias changes only the current agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization.
- After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
- If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline; it should delegate those work items when separately authorized.
- If it starts with one of those aliases, remove only that leading token/phrase after applying the definition.
- Apply the existing flag parsing logic unchanged.

Legacy `$ARGUMENTS` tokens, if encountered in an older source fixture, are replaced with `raw_input` in generated `developer_instructions`.

## Safety Guard For Existing Configs

- When you run `scripts/export-codex-agents.py` directly, generation fails by default if the target already contains files not previously generated by this script.
- Use `--force` with the exporter only when you intend to overwrite an existing Codex config directory.
- The higher-level install scripts create backups by default, preserve non-agent Codex settings, replace only the managed Codex agent sections, and remove stale managed agent files.

## Known Limitations

- Codex agent roles are experimental and may evolve.
- The generator does not install files into `~/.codex/` for you; it only generates them.
- Neutral prompt text is preserved as much as possible; only minimal Codex-specific adaptation is injected.
- Codex-specific sandbox, MCP, web-search, and skill configuration are not emitted automatically by this exporter.
