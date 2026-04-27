# Workspace Agent Model Profiles

Workspace agent model profiles generate OpenCode agent overrides under `.opencode/agents` so different subagents can use different model tiers without modifying the canonical source agents in `opencode/agents/*.md`.

## Why This Exists

- The primary model selected in OpenCode should not automatically spill into every subagent.
- Long multi-agent runs can put pressure on token budgets and weekly quota windows.
- High-value gates such as `reviewer`, `committee-security`, architects, and judges benefit from stronger models.
- Mechanical roles such as `peon`, `repo-scout`, `summarizer`, and `compressor` can often use cheaper mini models.
- Routine execution and planning roles usually fit a standard mid-tier model.

## Architecture

- `opencode/agents/*.md` remains the canonical source of truth.
- Source agent frontmatter must not define `model:` or `provider:`.
- `opencode/tools/agent-profiles/*.json` maps agents to logical tiers: `mini`, `standard`, and `strong`.
- `opencode/tools/model-sets/*.json` maps those tiers to concrete OpenCode model IDs for a provider.
- Generated workspace overrides are copies with `model:` inserted into YAML frontmatter.
- Generated overrides live only under `<Workspace>/.opencode/agents`.
- The installer writes a manifest at `<Workspace>/.opencode/.agents-pipeline-agent-profile.json`.
- Restart OpenCode after changing profiles so workspace agents are reloaded.

This split keeps model routing stable while making model version updates cheap. When a provider renames or releases models, update one file such as `opencode/tools/model-sets/openai.json`; the `frugal`, `balanced`, and `premium` agent routing profiles do not need to change.

## Profiles

- `frugal`: lowest-cost routing that keeps review, security, and judge gates on `strong` while routing mechanical roles to `mini`.
- `balanced`: default routing for routine repository work.
- `premium`: higher-rigor routing for complex or risky work.
- `uniform`: built-in installer mode that applies one explicit model ID to every source agent; it does not use a profile JSON or model set.

## Model Sets

Bundled model sets live in `opencode/tools/model-sets`:

- `openai`: maps tiers to OpenAI model IDs.
- `anthropic`: maps tiers to Anthropic model IDs.
- `google`: maps tiers to Google model IDs.

Model IDs must match your OpenCode provider configuration. The installer does not call providers or validate remote model availability; it writes the strings from the selected model set exactly as configured.

## PowerShell Usage

```powershell
pwsh ~/.config/opencode/tools/agent-profile.ps1 list
pwsh ~/.config/opencode/tools/agent-profile.ps1 install balanced -ModelSet openai -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install frugal -ModelSet anthropic -Workspace C:\path\to\project
pwsh ~/.config/opencode/tools/agent-profile.ps1 install premium -ModelSet google -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 install uniform -Model openai/gpt-5.4 -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 status -Workspace .
pwsh ~/.config/opencode/tools/agent-profile.ps1 clear -Workspace .
```

## Bash/macOS/Linux Usage

The Bash installer uses Python 3 standard library support for deterministic JSON/frontmatter handling.

```bash
bash ~/.config/opencode/tools/agent-profile.sh list
bash ~/.config/opencode/tools/agent-profile.sh install balanced --model-set openai --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install frugal --model-set anthropic --workspace /path/to/project
bash ~/.config/opencode/tools/agent-profile.sh install premium --model-set google --workspace .
bash ~/.config/opencode/tools/agent-profile.sh install uniform --model openai/gpt-5.4 --workspace .
bash ~/.config/opencode/tools/agent-profile.sh status --workspace .
bash ~/.config/opencode/tools/agent-profile.sh clear --workspace .
```

## Safety Behavior

- `clear` deletes only files listed in the manifest's `managedFiles`.
- Unknown workspace files are not deleted.
- Existing unmanaged files in `.opencode/agents` are not overwritten unless `-Force` or `--force` is supplied.
- Previously managed files that were edited by hand are not overwritten or cleared unless `-Force` or `--force` is supplied.
- `-DryRun` and `--dry-run` write, delete, and back up nothing.
- Backups are created under `.opencode/.backup-agent-profile-<timestamp>` before overwriting or deleting managed files unless `-NoBackup` or `--no-backup` is supplied.
- Missing source agents referenced by a profile are warned and skipped.
- Missing source agent directory, invalid JSON, unknown tiers, and `uniform` without an explicit model fail clearly.

## Git Guidance

- Individual users can add `.opencode/agents` and `.opencode/.agents-pipeline-agent-profile.json` to `.gitignore`.
- Teams can commit generated overrides only when they intentionally want shared workspace model routing.
- Do not commit generated overrides as a substitute for updating canonical `opencode/agents/*.md` content.

## Troubleshooting

- Profile installed but not applied: restart OpenCode.
- Unmanaged target exists: inspect the file, then rerun with `-Force` or `--force` only if overwriting is intended.
- Missing agent warning: the profile is ahead of the local source agents; refresh the installed repo assets or ignore it if that agent is unused.
- Invalid JSON: inspect the selected profile or model set file.
- Unknown tier: update the selected model set to include the tier used by the profile.
- `uniform` install fails: provide `-Model` or `--model`.
