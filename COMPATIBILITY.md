# Compatibility

## Runtime support

This repository is Codex-first and uses one runtime-neutral source tree.

| Runtime | Support level | Maintained contract |
|---|---|---|
| Codex | Tier 1 / first-class | Primary installer, generated role configuration, neutral support-tree installation, workflow behavior, and CI validation |
| Claude Code | Tier 2 / best-effort | Generated agent Markdown, installer/export validation, and bounded runner guidance |
| GitHub Copilot | Tier 2 / best-effort | Generated custom-agent files plus installer/export validation |

Tier 2 means format and basic workflow adaptation, not feature parity. A successful export does not guarantee identical delegation depth, tools, permissions, sandbox behavior, runtime-native commands, model availability, or status/checkpoint integration.

OpenCode is frozen outside the current support matrix. Users who still require it must pin the last OpenCode-first release, [`v0.26.1`](https://github.com/bohewu/agents_pipeline/releases/tag/v0.26.1).

## Runtime-neutral source contract

Current canonical sources are:

- `agents/` for role prompts
- `modes.json` for supported modes and aliases
- `protocols/` for schemas, examples, and workflow contracts
- `skills/` for reusable skills
- `tools/` for shared local tooling
- `runtimes/<runtime>/model-sets/` for optional runtime model catalogs

Generated Codex TOML, Claude agent Markdown, and Copilot `*.agent.md` files are outputs and must not become competing sources of truth.

## Contributor requirements

- Python 3.11+
  - exporters, installer helpers, model-profile handling, schema validation, and Python tests
- Node.js 18+
  - neutral status/checkpoint CLI, atomic writer/projector tests, and smoke harnesses
- Bash on macOS/Linux or PowerShell 7+ on Windows
  - supported installer and release-bootstrap paths

Full cross-platform changes should exercise both shell families. Linux-only validation does not prove PowerShell argument or filesystem parity.

## Codex requirements

- A current Codex installation and valid local login
- A writable global Codex home, normally `~/.codex`
- Support for the generated role configuration used by this repository
- Node.js 18+ when status/checkpoint-capable modes invoke the installed neutral writer

The Codex installer synchronizes the marker-owned neutral support tree under `<codex-home>/agents-pipeline/` and rewrites generated references to it. The tree contains `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`; its installed profile-manager wrapper supports `set`, `status`, `clear`, and `list` without a source clone. The installer preserves unrelated Codex configuration while replacing only repository-managed definitions and marker-owned support files; an unmarked same-named support directory causes a safe refusal.

For the default global Codex target (`~/.codex`), the installer also publishes exactly ten formal workflow skills under `~/.agents/skills/run-*/`. Each carries `.agents-pipeline-skill.json`; updates are rollback-capable and replace each skill directory atomically while refusing unowned, corrupt, linked, or junction-backed targets. A custom/test Codex home publishes skills only when `--user-skills-root` / `-UserSkillsRoot` is supplied. Direct workspace materialization never installs user skills, and there is no `run-goal` skill.

The support-tree update is rollback-capable and uses atomic renames for its individual moves; every installer-managed file is written with an atomic same-directory replacement. The two-move tree update and complete multi-file install are not single filesystem transactions, so an interruption can temporarily leave a backup or mixed generated versions; rerunning the same installer is the supported idempotent recovery path.

Global Codex roles never contain generated model or provider overrides; they inherit model and reasoning selection from the parent Codex session. Codex model profiles are workspace-only, and workflow flags do not emulate Codex reasoning controls.

## Runtime profile-manager compatibility

The runtime-neutral profile manager is installed with the global support tree. The primary entrypoints are `~/.codex/agents-pipeline/scripts/agent-profile.sh` on macOS/Linux and `~/.codex/agents-pipeline/scripts/agent-profile.ps1` on Windows. In a TTY it presents numbered action, runtime, scope when applicable, a workspace path when needed, profile, and model-set choices. Codex `set` is workspace-only; Codex global `status` and `clear` are retained for installation diagnostics and legacy profile cleanup. Claude Code and Copilot profiles remain global-only. In a non-TTY it never prompts: automation must provide the action and all required runtime/scope/profile/model choices explicitly.

The supported profile behavior is:

| Runtime | Project profile behavior | Global definitions/support |
|---|---|---|
| Codex | Profile-specific `.codex/agents/*.toml`, managed `.codex/config.toml`, and `.agents-pipeline-project-profile.json`; no local support tree | Model-free `~/.codex/agents/` plus `~/.codex/agents-pipeline/`; roles inherit the parent session |
| Claude Code | Not supported by the profile manager | `~/.claude/agents/`, `~/.claude/CLAUDE.md`, and `~/.claude/agents-pipeline/` |
| GitHub Copilot | Not supported by the profile manager | `~/.copilot/agents/` and `~/.copilot/agents-pipeline/` |

Codex project `set` renders the selected roles directly into the project's `.codex/agents/` from the globally installed exporter, neutral sources, profile, and Codex model catalog, then writes a managed per-role `config_file` block that references those local files. It does not read/copy active global roles or create project-local `agents-pipeline/`, skills, scripts, protocols, tools, or another support tree. Project `clear` removes only installer-owned local roles, that managed block, and the manifest, preserving unrelated project configuration and all global assets. Workspace operations never mutate the model-free global roles. A project with no profile uses those global definitions and inherits the parent session's model selection without setup.

Codex activates the workspace layer only for a trusted repository. Profile setup never grants trust; workspace status reports file `health`, `project_trust`, and `profile_eligibility` independently. Eligibility describes the trust gate, while Codex remains authoritative for full effective-config parsing and routing.

The formal `$run-*` skills adopt the globally installed workflow definition and never manually load raw repository roles. Before dispatch, their workspace-profile preflight fails closed when status cannot be verified or file `health` is not `ok`; a healthy but ineligible profile warns and safely uses global routing. After that gate, effective Codex configuration can apply an eligible workspace profile to dispatched role names, preserving project-specific resource routing without a project-local skill copy. Managed `use <mode>` forms remain compatibility aliases and follow the same preflight.

Global Codex status uses `~/.codex/.agents-pipeline-codex-manifest.json`; global `clear` is available to regenerate model-free roles and remove legacy global profile state. Neither command selects a Codex model profile. Claude Code and Copilot use the runtime-tagged common manifest in their global agent target and retain global profile selection. Status rejects unsafe managed paths and reports missing generated output. Neither profile setup nor status reads OpenCode settings. `install` remains only a deprecated compatibility alias for `set` where `set` is supported.

Codex project profiles inherit effective global `agents.max_threads` and `agents.max_depth`, so nested orchestration modes require an effective `agents.max_depth` of at least `2`.

Direct workspace installers remain available as explicit materialization compatibility. They copy complete generated definitions and support trees into a project and are not profile-only. This is the only workspace path for Claude Code and Copilot; the Codex path still does not publish user skills.

Profile-manager `status` and `--json` describe installed role/profile state. For global Codex they report the model-free installation and any legacy state; for a Codex workspace or the Tier 2 runtimes they also describe installed model routing. They do not describe a running workflow. Workflow status remains the independent Node.js status/checkpoint contract below.

## Claude Code compatibility

- Claude Code must support project/global custom agent Markdown for the selected install target.
- Supported model-profile values use runtime aliases such as `inherit`, `haiku`, `sonnet`, and `opus`; actual model resolution belongs to Claude Code.
- Nested orchestration, tool names, permissions, and background behavior may differ from Codex.
- Validate workflows that depend on status/checkpoint writes, browser/process resources, or multi-level delegation.

## GitHub Copilot compatibility

- The selected Copilot surface must support the generated custom-agent format.
- Model names in optional profiles must match names offered by that surface.
- Copilot CLI, VS Code, and hosted agent surfaces do not necessarily expose identical tools or orchestration behavior.
- Validate workflows that depend on status/checkpoint writes, runtime-specific commands, or parallel delegation.

## Neutral status/checkpoint compatibility

`tools/status-event.js` and `tools/status-runtime/` require only Node.js and local filesystem access. The event vocabulary, JSON projection, batch format, resume selection, and exit codes are runtime-independent.

Compatibility limits:

- the current writer is single-writer per run; concurrent processes can race even though each file replacement is atomic
- output locations must be writable
- callers must serialize events or flush parallel results as one ordered batch
- consumers must use the canonical schemas in `protocols/schemas/`

See `docs/status-writer-spec.md` for the complete contract.

## Optional dependencies

- GitHub CLI (`gh`) enables release artifact attestation verification.
- The `jsonschema` Python package provides full local schema-validation parity where the lightweight validator is insufficient.
- Optional runtime model profiles require the named models to exist and be available to the authenticated account.

## Host assumptions

- macOS/Linux release bootstraps expect `curl`, `tar`, and `sha256sum` or `shasum`.
- Windows release bootstraps expect PowerShell 7+ and standard .NET archive/hash support.
- Anonymous GitHub Releases API limits apply to the supported bootstraps.
- Filesystem semantics must support creating directories and replacing files; the writer includes bounded retry handling for common Windows rename behavior.

## Common incompatibilities

- Python missing or older than 3.11
- Node.js missing or older than 18
- PowerShell 5.x instead of PowerShell 7+
- missing or expired target-runtime authentication
- unavailable model named by an optional profile
- expecting a Tier 2 export to reproduce every Codex feature
- running a generated role without its referenced support assets
- parallel status writers targeting the same run
- installing a mutable `latest` release when reproducibility requires a pinned tag

## Practical guidance

- Use the Codex installer for the fully supported path.
- Treat Claude Code and Copilot as bounded compatibility exports and test the exact workflow you rely on.
- Use `docs/developer-install.md` for clone-based development installs.
- Use `docs/external-dependencies.md` for release download, checksum, attestation, and runtime trust boundaries.
- Use the runtime-specific mapping document when adapting permissions, models, or generated file conventions.
