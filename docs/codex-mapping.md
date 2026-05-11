# Codex Mapping

This document defines how OpenCode agent definitions are mapped to Codex multi-agent role configuration.

## Source Of Truth

- Source: `opencode/agents/*.md`
- Generated output:
  - `<target-dir>/config.toml`
  - `<target-dir>/agents/*.toml`
- Generator: `scripts/export-codex-agents.py`
- Default target shape: a `.codex`-style directory that Codex can read as project config
- Primary/default install target: global `~/.codex` (Windows: `%USERPROFILE%\.codex`); workspace `<workspace>/.codex` installs are optional overrides

Do not manually maintain generated Codex role files as a primary source.

## Global-First Install Scope

Use a global Codex install in `~/.codex` by default so the exported roles are available across workspaces.
When the installer targets a Codex home/global directory, it now auto-merges the managed global mode note into the active global AGENTS file inside that target: prefer `AGENTS.override.md` when it exists and is non-empty, otherwise use `AGENTS.md`.
That managed note tells the current/main agent that a recognized mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization. In a fresh/new session using an explicit mode alias, first consult the installed definition in this order — `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present, otherwise `~/.codex/agents/orchestrator-<mode>.toml` — then apply that definition. After applying it, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator. If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline and should delegate those work items when separately authorized. Later in the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. It also says Codex mode simulation can ignore OpenCode-only plugin/command details that do not apply in the current runtime.
If you intentionally target `<workspace>/.codex`, the installer keeps that working and applies the optional managed `AGENTS.md` merge for that workspace only, with the same definition-precedence rule.

## Global Custom Instructions Snippet

If you use `scripts/install-codex.ps1` or `scripts/install-codex.sh` for a global `~/.codex` install, the installer now manages the equivalent of this snippet automatically in the active global AGENTS file.
Manual copy is still optional for users who are not using the installer; place it in the active global file in the Codex home (`~/.codex/AGENTS.override.md` when you intentionally keep that file non-empty, otherwise `~/.codex/AGENTS.md`) or in the equivalent Codex app setting.

```text
## Codex global mode aliases

Treat only explicit leading mode phrases from this allowlisted pattern family — `use <mode>`, `using <mode>`, `使用 <mode>`, `使用<mode>`, `用 <mode>`, `用 <mode> 做...`, `請用 <mode>`, and `請用 <mode> 去執行...` — as mode aliases for a supported mode in the current/main agent, not generic prose.
Those aliases tell the current/main agent to adopt the requested mode directly.
A mode alias changes the current/main agent's working style only. It does not automatically spawn subagents and does not override higher-priority rules for `spawn_agent` authorization.
Do NOT first spawn the same-named orchestrator role just to enter the mode.
Definition-first order for an explicit mode alias in a fresh/new session:
1. On a recognized mode alias, first consult `.codex/agents/orchestrator-<mode>.toml` in the workspace; if absent, consult `~/.codex/agents/orchestrator-<mode>.toml`; then apply that definition.
2. The current/main agent simulates that mode itself from the installed definition.
3. After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
4. If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline. It should delegate those work items when separately authorized.
5. Use subagents according to that installed definition for real work items when separately authorized.
Same-session reuse rule: repeated use of the same mode in the same session does NOT need to reload the definition when the mode, workspace, and definition source are unchanged.
Reload/re-read when the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details.
When reading the installed definition for Codex mode simulation, ignore OpenCode-only plugin/command details that are not relevant in the current Codex runtime; focus on mode behavior, task decomposition, delegation rules, and output style.

Alias map:
- `flow` / `run-flow` -> `orchestrator-flow`
- `pipeline` / `run-pipeline` -> `orchestrator-pipeline`
- `general` / `run-general` -> `orchestrator-general`
- `simple` / `run-simple` -> `orchestrator-simple`
- `spec` / `run-spec` -> `orchestrator-spec`
- `ci` / `run-ci` -> `orchestrator-ci`
- `modernize` / `run-modernize` -> `orchestrator-modernize`
- `analysis` / `run-analysis` -> `orchestrator-analysis`
- `ux` / `run-ux` -> `orchestrator-ux`
- `committee` / `run-committee` -> `orchestrator-committee`
- `monetize` / `run-monetize` -> `orchestrator-general`

Higher-priority system, developer, tool, and runtime instructions override this note.
Project/workspace `AGENTS.md` files may further refine behavior for a specific repo.
```

For workspace-local installs under `<workspace>/.codex`, the managed workspace `AGENTS.md` block uses the same wording and the same default-behavior rule because it is emitted into `AGENTS.md`: a recognized mode alias changes only the current/main agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization; in a fresh/new session, first consult `.codex/agents/orchestrator-<mode>.toml` for that workspace, then `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition. After applying it, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator, and it must not bypass helper-role scouting or implementation work inline when the applied definition routes that work to helpers; delegate those work items only when separately authorized. Later in the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details. Ignore OpenCode-only plugin/command details when they are not relevant to Codex mode simulation.

## Frontmatter Mapping

| OpenCode key | Codex output | Rule |
|---|---|---|
| `name` | `[agents.<name>]` table key and `agents/<name>.toml:name` | copied; must match source file stem in `--strict` mode |
| `description` | `agents.<name>.description` and `agents/<name>.toml:description` | copied |
| `mode` | (removed) | not emitted |
| `hidden` | (removed) | not emitted |
| `temperature` | (removed) | not emitted |
| `tools` | (removed) | not emitted as an equivalent capability contract |
| body | `developer_instructions` | preserved with minimal adaptation |

`tools` needs extra care: Codex does not expose a direct equivalent of OpenCode's per-tool allowlist for built-in capabilities such as `read`, `grep`, `glob`, `edit`, and `write`.
The current export therefore preserves tool intent only in prompt text, not as a lossless runtime boundary.

## Root Config Generation

The generator writes a root `config.toml` containing:

- `[features] multi_agent = true` by default
- `[agents] max_threads = 6`
- `[agents] max_depth = 2`
- one `[agents.<name>]` table per source agent role

This repo intentionally sets `max_depth = 2` instead of Codex's product default.
Codex defines the root session at depth `0`, and `max_depth = 1` allows only a direct child agent.
Nested orchestration paths such as `orchestrator-modernize -> orchestrator-pipeline -> executor/reviewer` need depth `2` to remain functional.

Use flags to adjust this output when needed:

- `--max-threads=<n>`
- `--max-depth=<n>`
- `--job-max-runtime-seconds=<n>`
- `--no-enable-feature-flag`

## Role Config Generation

Each generated `agents/<name>.toml` file includes:

- `name`
- `description`
- `developer_instructions`

This matches the current Codex custom-agent schema from the official docs, which requires `name`, `description`, and `developer_instructions` in each standalone agent file.
Codex custom-agent files can also include other supported `config.toml` keys, but this exporter keeps generated agent files minimal unless a specific mapping is implemented explicitly.

By default, model/provider selection remains runtime-driven; source agents must not define per-agent `model` or `provider` keys.

## Opt-In Agent Model Profiles

Codex runtime model profiles are opt-in. When the exporter, or an installer that forwards exporter options, receives `--agent-profile <profile> --model-set <set>`:

- The agent-to-tier profile is loaded from `opencode/tools/agent-profiles/<profile>.json`.
- The Codex tier catalog is loaded from `codex/tools/model-sets/<set>.json` and must have `runtime: "codex"`.
- Profiles map agents to logical tiers (`mini`, `standard`, `strong`); the Codex model set maps each tier to an object with `model` and optional `model_provider`.
- For each mapped generated role, the exporter writes only `model` and optional `model_provider` into that role file: `.codex/agents/<name>.toml`.
- The exporter does **not** write `model` or `model_provider` into root `config.toml` `[agents.<name>]` tables.
- The exporter does **not** emit `model_reasoning_effort` or `plan_mode_reasoning_effort`.

Reasoning effort is not controlled by these profiles; it is controlled by the effective Codex runtime config, such as root config, session/profile/CLI settings, or any explicit role override. Omit the profile flags to keep Codex's normal runtime model selection.

Examples from a cloned repo:

```powershell
pwsh -NoProfile -File .\scripts\install-codex.ps1 -AgentProfile balanced -ModelSet openai
```

```bash
scripts/install-codex.sh --agent-profile balanced --model-set openai
```

Sandbox mode, MCP servers, and other Codex-specific config are intentionally left unset so they inherit from the parent Codex environment unless you customize them after generation.

When Codex role bodies reference repo-managed assets such as `opencode/protocols/...` or `opencode/skills/...`, the installer-backed merge path rewrites those references to installed absolute paths under the target Codex directory and mirrors the `opencode/` tree there. This avoids broken repo-relative references in global installs such as `~/.codex` on Linux/macOS or `%USERPROFILE%\.codex` on Windows.

## `@agent` Reference Handling

- Source bodies may contain `@planner`, `@reviewer`, `@executor`, and similar tokens.
- The generator keeps these references in `developer_instructions` and adds an adapter note telling Codex to map them to generated role names.
- In `--strict` mode, unresolved `@...` references fail generation.
- `@executor` is validated as a normal direct subagent reference.

## Role Invocation In Codex

- Codex docs describe custom roles via `[agents.<name>]` config and prompt-driven routing.
- Explicit leading aliases after adding the managed AGENTS note tell the current/main agent to adopt that orchestrator mode directly; they do not first spawn the same-named orchestrator role just to enter the mode, do not automatically spawn subagents, and do not override higher-priority `spawn_agent` authorization.
- For explicit mode aliases in fresh/new sessions, first consult `.codex/agents/orchestrator-<mode>.toml` for the current workspace when present; otherwise consult `~/.codex/agents/orchestrator-<mode>.toml`, then apply that definition.
- After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
- If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline; it should delegate those work items when separately authorized.
- Use subagents according to that installed definition for real work items when separately authorized.
- In the same session, repeated use of the same mode does not need to reload that definition unless the mode changes, the workspace changes, the definition source changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, the user explicitly asks to reload/refresh/re-read, or the agent is no longer confident it still has the relevant mode details.
- Direct role-name prompts still work when you explicitly want a generated role, such as `Have reviewer inspect the diff` or `Have orchestrator-pipeline coordinate the implementation plan.`
- When reading the installed definition for Codex mode simulation, ignore OpenCode-only plugin/command details that are not relevant in the current Codex runtime; focus on mode behavior, task decomposition, delegation rules, and output style.
- In current Codex CLI builds, `/agent` is for switching between existing agent threads and may show no custom roles from `config.toml`.
- Recommended prompt styles: `use pipeline to coordinate this PR path` for direct mode adoption, or `Have reviewer inspect the diff and have orchestrator-pipeline coordinate the implementation plan.` when you explicitly want named roles.

## `/run-*` Input Adaptation

OpenCode orchestrator prompts rely on `$ARGUMENTS` parsing. Codex roles do not provide that variable.

For orchestrator agents, the generator prepends a Codex input adapter block:

- Use the user's latest message as `raw_input`.
- Recognize only matching slash aliases plus the same allowlisted natural-language mode-alias family used by the managed AGENTS note.
- On a recognized mode alias, first consult `.codex/agents/orchestrator-<mode>.toml` for the workspace; if absent, consult `~/.codex/agents/orchestrator-<mode>.toml`; then apply that definition.
- A recognized mode alias changes only the current agent's working style, does not automatically spawn subagents, and does not override higher-priority `spawn_agent` authorization.
- After applying that definition, the current/main agent must obey that definition's hard constraints and delegation rules as if it were that orchestrator.
- If the applied definition forbids direct implementation or routes scouting/implementation to helper roles, the current/main agent must not bypass those helpers by doing that work inline; it should delegate those work items when separately authorized.
- If it starts with one of those aliases, remove only that leading token/phrase after applying the definition.
- Apply the existing flag parsing logic unchanged.

`$ARGUMENTS` is replaced with `raw_input` in generated `developer_instructions`.

## Safety Guard For Existing Configs

- When you run `scripts/export-codex-agents.py` directly, generation fails by default if the target already contains files not previously generated by this script.
- Use `--force` with the exporter only when you intend to overwrite an existing Codex config directory.
- The higher-level install scripts create backups by default, preserve non-agent Codex settings, replace only the managed Codex agent sections, and remove stale managed agent files.

## Known Limitations

- Codex agent roles are experimental and may evolve.
- The generator does not install files into `~/.codex/` for you; it only generates them.
- Existing OpenCode prompt text is preserved as much as possible; only minimal Codex-specific adaptation is injected.
- OpenCode `tools:` frontmatter is not an equivalent Codex mapping today. This is a capability-boundary drift, not a lossless translation.
- Codex can express some partial substitutes through normal config keys such as `sandbox_mode = "read-only"`, `[features].shell_tool = false`, `web_search`, `mcp_servers`, and `skills.config`, but those are narrower than OpenCode's source tool matrix and are not emitted automatically by this exporter.
