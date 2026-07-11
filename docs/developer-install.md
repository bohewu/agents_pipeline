# Developer Install From A Clone

Use these instructions when developing this repository or testing un-released changes from the current working tree. Normal users should prefer the pinned release-bundle commands in `README.md`.

## Supported targets

- **Codex** is Tier 1 and the primary install target.
- **Claude Code** and **GitHub Copilot** are Tier 2 best-effort export targets.
- The repository source is runtime-neutral: canonical roles live in `agents/`, protocols in `protocols/`, skills in `skills/`, shared tools in `tools/`, and runtime model catalogs in `runtimes/`.

OpenCode is not installed from the current tree. OpenCode users must remain on the frozen [`v0.26.1` release](https://github.com/bohewu/agents_pipeline/releases/tag/v0.26.1).

## Prerequisites

- Python 3.11 or newer for exporters, installer helpers, TOML-safe Codex configuration merging, and schema validation
- Node.js 18 or newer for the neutral status/checkpoint writer and its tests
- Bash on macOS/Linux or PowerShell 7+ on Windows
- The target runtime installed and authenticated when you want to use the generated roles

The installers generate local configuration; they do not install or authenticate Codex, Claude Code, or GitHub Copilot.

## Source layout

```text
agents/                         canonical runtime-neutral role prompts
protocols/                      schemas, examples, and workflow contracts
skills/                         reusable runtime-neutral skills
└─ run-*/                       formal Codex workflow entry skills
tools/
├─ agent-profile.py             interactive/runtime-neutral profile manager
├─ agent-profiles/              logical agent-to-tier mappings
├─ status-event.js              neutral semantic-event CLI
└─ status-runtime/              projector, registry, canonicalizer, writer
runtimes/
├─ codex/model-sets/
├─ claude/model-sets/
└─ copilot/model-sets/
scripts/
├─ agent-profile.sh / .ps1
├─ codex-project-profile.py       workspace-local Codex role/profile helper
├─ export-*-agents.py
├─ install-codex.*
├─ install-claude.*
└─ install-copilot.*
```

Generated runtime files are outputs. Edit the neutral source and regenerate them instead of editing generated files by hand.

## Codex install

Default target: `~/.codex`

Windows:

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1
```

macOS/Linux:

```bash
bash scripts/install-codex.sh
```

The Codex installer:

- generates managed role TOML under `<target>/agents/`
- merges managed agent configuration into `<target>/config.toml` while preserving unrelated settings
- synchronizes the neutral support tree to `<target>/agents-pipeline/`
- rewrites role references to that installed support tree
- removes stale files previously owned by the installer without removing unrelated user files
- manages the mode-alias block in the active global `AGENTS.md` or `AGENTS.override.md`
- for the default global target (`~/.codex`), publishes exactly ten formal mode skills under `~/.agents/skills/run-*/`; a custom Codex home publishes skills only when `--user-skills-root` / `-UserSkillsRoot` is supplied
- backs up affected Codex configuration by default

The marker-owned synchronized support tree contains `AGENTS.md`, `agents/`, `modes.json`, `protocols/`, `runtimes/`, `scripts/`, `skills/`, and `tools/`. Status-capable roles therefore call the installed copy of:

```text
<target>/agents-pipeline/tools/status-event.js
```

Because the tree also carries the runtime catalogs and wrappers, its installed `scripts/agent-profile.sh` or `scripts/agent-profile.ps1` supports `set`, `status`, `clear`, and `list` without the original source clone. `install` remains a deprecated compatibility alias for `set`.

The support tree is installer-owned through `.agents-pipeline-support.json` and is swapped through a staging directory. If the target already contains an unmarked `agents-pipeline/` directory, the installer preserves it and stops instead of deleting user files.

The support-tree update is rollback-capable and uses atomic renames for each move; each installer-managed file replacement is also atomic. The two-move tree update and full multi-file install are not single filesystem transactions; if the process is interrupted between replacements, rerun the same command to converge the managed files to one version.

Each formal user-skill directory carries `.agents-pipeline-skill.json`. The global installer performs rollback-capable updates and uses an atomic rename for each skill directory. It refuses to overwrite an unowned, corrupt, linked, or junction-backed same-named skill directory. Use `--user-skills-root` / `-UserSkillsRoot` only to redirect this user-level target for an intentional custom or test global install. Direct workspace materialization never installs user skills, and `run-goal` is never installed.

Common options:

```bash
# Preview only
bash scripts/install-codex.sh --dry-run

# Explicit Codex home
bash scripts/install-codex.sh --target /path/to/.codex

# Custom user-skill root for an isolated global-install test
bash scripts/install-codex.sh --target /path/to/.codex --user-skills-root /path/to/.agents/skills

# Skip backups
bash scripts/install-codex.sh --no-backup
```

PowerShell equivalents use `-DryRun`, `-Target`, `-WorkspaceRoot`, `-UserSkillsRoot`, and `-NoBackup`.

These global Codex install examples always generate model-free roles. Passing profile or model options to a global Codex target is rejected; use workspace `set` for normal per-project resource routing.

`--force` / `-Force` remains accepted for backward compatibility; merged installation is already the default.

## Claude Code install

Default target: `~/.claude/agents`

Windows:

```powershell
pwsh -NoProfile -File scripts/install-claude.ps1
```

macOS/Linux:

```bash
bash scripts/install-claude.sh
```

The installer generates Claude Code agent Markdown, removes stale generated files, and can inject the managed runner protocol into `CLAUDE.md`. This is a Tier 2 adapter: validate the concrete delegation, permissions, tools, and status behavior that your workflow requires.

Common options:

```bash
# Preview only
bash scripts/install-claude.sh --dry-run

# Generate agents without modifying CLAUDE.md
bash scripts/install-claude.sh --no-runner

# Skip backups
bash scripts/install-claude.sh --no-backup
```

PowerShell equivalents use `-DryRun`, `-Target`, `-ClaudeMd`, `-NoRunner`, and `-NoBackup`.

Claude Code delegation depth and tool availability differ from Codex. A successful export is not a feature-parity guarantee.

## GitHub Copilot install

Default target: `~/.copilot/agents`

Windows:

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1
```

macOS/Linux:

```bash
bash scripts/install-copilot.sh
```

The installer generates `*.agent.md` files and removes stale files previously generated by this repository. It does not modify unrelated Copilot configuration.

Common options:

```bash
# Preview only
bash scripts/install-copilot.sh --dry-run

# Explicit global target
bash scripts/install-copilot.sh --target /path/to/global/copilot/agents

# Skip backups
bash scripts/install-copilot.sh --no-backup
```

PowerShell equivalents use `-DryRun`, `-Target`, and `-NoBackup`.

Copilot is a Tier 2 adapter. Verify model availability, supported tools, delegation semantics, and permissions in the concrete Copilot surface you use.

## Explicit workspace materialization compatibility

Normal usage is one global runtime install. Codex global roles are model-free and inherit the parent session. A project either uses those roles with no action or uses the profile manager to materialize only its selected Codex role TOML. Do not run these direct installers merely to use agents_pipeline or select a profile in a new project.

The direct installers and release bootstraps still accept project targets for compatibility. This path **materializes** complete generated agents, support assets, and companion guidance inside the project:

```bash
# Codex: complete local roles/support plus a managed project AGENTS.md block
bash scripts/install-codex.sh \
  --target /path/to/project/.codex \
  --workspace-root /path/to/project

# Claude Code: complete local agents/support plus the root runner contract
bash scripts/install-claude.sh \
  --target /path/to/project/.claude/agents \
  --claude-md /path/to/project/CLAUDE.md

# Copilot: complete local agents/support
bash scripts/install-copilot.sh \
  --target /path/to/project/.github/agents
```

Equivalent release-bootstrap calls forward the same target flags:

```bash
bash bootstrap-install-codex.sh \
  --version v0.28.0 \
  --target /path/to/project/.codex \
  --workspace-root /path/to/project

bash bootstrap-install-claude.sh \
  --version v0.28.0 \
  --target /path/to/project/.claude/agents \
  --claude-md /path/to/project/CLAUDE.md

bash bootstrap-install-copilot.sh \
  --version v0.28.0 \
  --target /path/to/project/.github/agents
```

These examples assume downloaded bootstrap scripts are in the current directory. PowerShell uses `-Target`, Codex `-WorkspaceRoot`, and Claude Code `-ClaudeMd`. Codex also accepts `--global-agents-target` / `-GlobalAgentsTarget` when managed global mode guidance must be merged at an explicit non-default path. Claude accepts `--no-runner` / `-NoRunner` when another top-level runner already owns `CLAUDE.md`.

Materialized workspace output is not profile-only:

| Runtime | Project output |
|---|---|
| Codex | `.codex/agents/`, `.codex/agents-pipeline/`, `.codex/config.toml`, installer manifest, and optionally root `AGENTS.md` |
| Claude Code | `.claude/agents/`, `.claude/agents-pipeline/`, profile manifest, and optionally root `CLAUDE.md` |
| GitHub Copilot | `.github/agents/`, `.github/agents-pipeline/`, and profile manifest |

The profile manager deliberately does not expose this materialization as a Claude/Copilot workspace profile. Call a direct installer explicitly when compatibility requires it. Direct Codex workspace materialization also does not install or change the global `~/.agents/skills/run-*` collection.

## Interactive runtime and model profiles

This developer-only section uses the wrapper from the working tree to test unreleased profile changes:

```bash
bash scripts/agent-profile.sh
```

```powershell
pwsh -File scripts/agent-profile.ps1
```

Normal users invoke the installed global wrapper at `~/.codex/agents-pipeline/scripts/agent-profile.sh` or the PowerShell sibling documented in the README. In a terminal the manager presents numbered action, runtime, scope when applicable, workspace path, profile, and model-set choices. The public actions are `set`, `status`, `clear`, and `list`. Codex profile `set` is workspace-only; Codex global `status` and `clear` remain for installation diagnostics and legacy profile cleanup. Claude Code and Copilot continue to expose global profile scope only.

Non-TTY invocations never prompt. CI, pipes, and redirected input should pass the action, runtime, workspace, profile, and model set explicitly. Codex `set` defaults to workspace scope, but the explicit form below is preferred for automation; select the project with `--workspace`, not a custom `--target`:

```bash
bash scripts/agent-profile.sh set balanced --runtime codex --scope workspace --workspace /path/to/project --model-set openai
bash scripts/agent-profile.sh status --runtime codex --scope workspace --workspace /path/to/project
bash scripts/agent-profile.sh clear --runtime codex --scope workspace --workspace /path/to/project
bash scripts/agent-profile.sh list --runtime codex
bash scripts/agent-profile.sh status --runtime codex --scope workspace --workspace /path/to/project --json
```

`status` and `list` support `--json`. Profile `status` is unrelated to the workflow status/checkpoint writer in the next section. The manager never reads OpenCode configuration.

After a healthy global Codex install, workspace `set` creates only:

```text
<workspace>/.codex/config.toml
<workspace>/.codex/agents/*.toml
<workspace>/.codex/.agents-pipeline-project-profile.json
```

The manager invokes the exporter from the globally installed support tree with its installed neutral agent sources, selected profile, and Codex model catalog. It renders the selected role TOML directly into `.codex/agents/` and points the managed config block to those workspace-local roles. It neither reads/copies active global roles nor copies `agents-pipeline/`, skills, scripts, protocols, tools, or other support assets. Workspace `clear` removes installer-owned local roles, the managed block, and the project manifest while preserving unrelated project config and all global state. A workspace with no profile reports `inherit`, uses the model-free global roles, and inherits the parent session's model selection. Workspace profile operations never add model settings to global roles.

Codex ignores project `.codex/` config layers until the repository is trusted. The manager does not change trust. For deterministic tests, establish the project trust decision through Codex first, then assert workspace JSON status has `health: "ok"`, `project_trust: "trusted"`, and `profile_eligibility: "eligible"`. Use Codex `config/read` to prove effective role registration, then inspect a spawned child trace to prove its actual `agent_role` and model; eligibility and config readback alone do not prove runtime selection.

Global targets are `~/.codex`, `~/.claude/agents` with `~/.claude/CLAUDE.md`, and `~/.copilot/agents`. Codex global `status`/`clear` continue through the runtime installer only for diagnostics and legacy cleanup; global profile `set` is rejected. Claude Code and Copilot retain global `set`/`clear`. Workspace Codex profiles inherit `agents.max_threads` and `agents.max_depth` from effective global configuration; nested orchestration modes require effective `agents.max_depth >= 2`.

Codex workspace state uses `.codex/.agents-pipeline-project-profile.json`; global Codex state uses `~/.codex/.agents-pipeline-codex-manifest.json`; Claude Code and Copilot use `<global-agent-target>/.agents-pipeline-runtime-profile.json`. `install` is retained only as a deprecated compatibility alias for `set`.

## Direct optional model-profile flags

All three installers inherit runtime model selection by default. For Codex, per-agent model settings are workspace-only. The normal global Codex installer rejects profile/model options and always emits model-free roles that inherit the parent session. Direct Codex profile flags are retained only for explicit workspace materialization compatibility; normal workspace profile setup should use `agent-profile set --scope workspace`. Claude Code and Copilot retain global profile flags.

Use a logical profile together with that runtime's model set:

```bash
bash scripts/install-codex.sh \
  --target /path/to/project/.codex \
  --workspace-root /path/to/project \
  --agent-profile balanced \
  --model-set openai

bash scripts/install-claude.sh \
  --agent-profile balanced \
  --model-set default

bash scripts/install-copilot.sh \
  --agent-profile balanced \
  --model-set default
```

Profiles come from `tools/agent-profiles/`; model sets come from `runtimes/<runtime>/model-sets/`. `--agent-profile` and `--model-set` must be supplied together. `--uniform-model` is available when one model should be applied to every generated role, subject to the same Codex workspace-only restriction.

Use `--profile-dir` and `--model-set-dir` only for intentional custom catalogs. A generated model name must still exist in the target runtime.

## Runtime-neutral status writer

The semantic-event interface is local and provider-independent:

```bash
node tools/status-event.js \
  --event run.started \
  --payload-json '{"output_root":".pipeline-output","run_id":"run-123","orchestrator":"orchestrator-flow","user_prompt":"Implement the requested change"}'
```

It writes canonical checkpoint and status JSON using the sibling `tools/status-runtime/` core. Keep those paths together when testing custom packaging. See `docs/status-writer-spec.md` for the event, batch, output, error, and single-writer contracts.

All three installers copy and rewrite a namespaced support tree automatically. Claude Code and Copilot remain best-effort adapters because their selected surfaces may still restrict local execution, delegation, or status/checkpoint behavior.

## Focused developer checks

Before submitting installer or exporter changes, run the relevant dry-runs plus focused tests:

```bash
bash scripts/install-codex.sh --dry-run
bash scripts/install-claude.sh --dry-run
bash scripts/install-copilot.sh --dry-run

python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/status-runtime.test.js
node scripts/validate-status-runtime-smoke.cjs
```

On Windows, also exercise the corresponding PowerShell installer with `-DryRun`.

## Troubleshooting

- **Source directory or mode manifest missing:** run the installer from a complete clone or release bundle, not an isolated script copy.
- **Python not found or too old:** install Python 3.11+ and ensure `python3`, `python`, or the Windows `py` launcher is available.
- **Status CLI cannot start:** install Node.js 18+ and confirm `tools/status-event.js` remains beside `tools/status-runtime/`.
- **Generated model rejected:** remove the optional profile flags to inherit the runtime model, or choose names supported by that runtime.
- **Tier 2 workflow differs from Codex:** treat the generated files as adapters and simplify delegation/tool assumptions for the target runtime.
- **Release bootstrap download or verification fails:** consult `docs/external-dependencies.md`.
