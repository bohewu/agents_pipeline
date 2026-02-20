# Multi-Agent Pipeline

Multi-agent workflows for OpenCode: init, pipeline, flow, committee, general-purpose, CI/CD planning, and modernization.
This repository demonstrates a **Multi-Agent Pipeline**. It currently includes an implementation called **OpenCode**. See the **How To Use** section below for usage instructions.

## Usage Prerequisites

This repo assumes you have configured the required model providers in OpenCode.
If no model/provider is available in your OpenCode runtime config, update `opencode.json` (or your global OpenCode config) before running any commands.

### Required Tools

- OpenCode (with model providers configured)
- VS Code with GitHub Copilot (for Copilot custom-agent usage)
- Python 3.9+ (required for `opencode/tools/validate-schema.py` and `scripts/export-copilot-agents.py`)
- PowerShell 7+ (for `scripts/install.ps1` on Windows) or Bash (for `scripts/install.sh` on macOS/Linux)
- `curl` + `tar` + `sha256sum` (or `shasum`) for no-clone bootstrap install on macOS/Linux

## Install (Recommended)

Install into your local OpenCode config directory with local scripts (default target: `~/.config/opencode`):

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install.ps1
```

macOS/Linux:

```bash
bash scripts/install.sh
```

Preview only (no file writes):

```powershell
pwsh -NoProfile -File scripts/install.ps1 -DryRun
```

```bash
bash scripts/install.sh --dry-run
```

Custom target path:

```powershell
pwsh -NoProfile -File scripts/install.ps1 -Target C:\path\to\opencode-config
```

```bash
bash scripts/install.sh --target /path/to/opencode-config
```

Skip backup of existing installed files:

```powershell
pwsh -NoProfile -File scripts/install.ps1 -NoBackup
```

```bash
bash scripts/install.sh --no-backup
```

## Install Copilot Agents (Recommended)

Generate and install VS Code Copilot custom agents to your global Copilot location.

Default target:
- All platforms: `${XDG_CONFIG_HOME:-~/.config}/copilot/agents`

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1
```

macOS/Linux:

```bash
bash scripts/install-copilot.sh
```

Preview only (no file writes):

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1 -DryRun
```

```bash
bash scripts/install-copilot.sh --dry-run
```

Custom target path:

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1 -Target C:\path\to\copilot\agents
```

```bash
bash scripts/install-copilot.sh --target /path/to/copilot/agents
```

Skip backup:

```powershell
pwsh -NoProfile -File scripts/install-copilot.ps1 -NoBackup
```

```bash
bash scripts/install-copilot.sh --no-backup
```

## Install Without Clone (Release Bundle)

Use bootstrap installers to download a release bundle and install without cloning this repo.
Bootstrap scripts verify the downloaded archive checksum against the release `SHA256SUMS` asset before install.

Pinned version (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.5.2"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1
pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag
```

macOS/Linux:

```bash
tag="v0.5.2"
curl -fsSL -o ./bootstrap-install.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install.sh"
bash ./bootstrap-install.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install.sh | bash
```

## Install Copilot Without Clone (Release Bundle)

Pinned version (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.5.2"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1
pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag
```

macOS/Linux:

```bash
tag="v0.5.2"
curl -fsSL -o ./bootstrap-install-copilot.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-copilot.sh"
bash ./bootstrap-install-copilot.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-copilot.sh | bash
```

## Versioning

- Single source of truth: root `VERSION` file (SemVer without `v`, for example `0.5.2`).
- Use SemVer tags with `v` prefix (for example: `v0.5.2`).
- Stay in `0.x` while the pipeline and prompts evolve quickly.
- In `0.x`, treat **minor** bumps as potentially breaking (`v0.5.0` -> `v0.6.0`).
- Use **patch** bumps for docs/scripting fixes without intended behavior changes.
- Release CI checks `VERSION` and tag alignment (`VERSION=0.5.2` must release as `v0.5.2`).
- Track release notes in `CHANGELOG.md`.

## Release CI

- Workflow: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v0.5.2`) or manual `workflow_dispatch`
- Output assets:
  - `agents-pipeline-opencode-bundle-vX.Y.Z.tar.gz`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.zip`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.SHA256SUMS.txt`

## CI Checks

- Workflow: `.github/workflows/ci.yml`
- Trigger: `pull_request`, push to `main`, manual `workflow_dispatch`
- Checks:
  - `VERSION` format and README version-alignment check
  - schema validator script sanity check
  - Copilot export script strict dry run
  - installer script syntax and dry-run validation

Example release:

```bash
git tag v0.5.2
git push origin v0.5.2
```

## Public Release Checklist

- Confirm there are no secrets or private endpoints in the repo.
- Review git history for removed secrets if any (history still contains them).
- Ensure `opencode.json.example` contains no real keys.
- Verify `LICENSE` exists and matches intended usage.
- Verify README usage notes align with your public story.

## Secret Scan (Optional)

If you already have a secret scanner installed, run one of:

```text
gitleaks detect --source .
```

```text
trufflehog filesystem .
```

Use whichever tool your team prefers.

## How To Use

- Agent definitions live in `opencode/agents/` (one file per agent)
- Global handoff rules are embedded in `opencode/agents/orchestrator-pipeline.md` for portability. If you need to externalize them, you can extract the section into your own runtime path (e.g. under `~/.config/opencode/agents/protocols`).
- Agent catalog lives in `AGENTS.md`.
- Model selection is runtime-driven by OpenCode/provider configuration.
- This repo does not maintain per-agent default model mappings.
- VS Code Copilot `.agent.md` files are generated from OpenCode source by `scripts/export-copilot-agents.py`.
- Copilot mapping details live in `docs/copilot-mapping.md`.
- Protocol and JSON schemas live in `opencode/protocols/`.
  Use `opencode/protocols/PROTOCOL_SUMMARY.md` for global instructions to reduce token usage.
- Init handoff SOP lives in `opencode/protocols/INIT_TO_PIPELINE.md`.
- Init artifact templates live in `opencode/protocols/INIT_TEMPLATES.md`.
- Init example lives in `opencode/protocols/INIT_EXAMPLE.md`.
- CI artifact templates live in `opencode/protocols/CI_TEMPLATES.md`.
- CI example for .NET + Vue lives in `opencode/protocols/CI_EXAMPLE_DOTNET_VUE.md`.
- CI generated output example lives in `opencode/protocols/CI_GENERATE_EXAMPLE.md`.
- Publish SOP lives in `opencode/protocols/PUBLISH_SOP.md`.
- Modernize templates live in `opencode/protocols/MODERNIZE_TEMPLATES.md`.
- Modernize example lives in `opencode/protocols/MODERNIZE_EXAMPLE.md`.
- Public checklist lives in `opencode/protocols/PUBLIC_CHECKLIST.md`.
- Optional carryover ledger lives at `todo-ledger.json` in the project root (schema in `opencode/protocols/schemas/todo-ledger.schema.json`).
  A template is provided in `todo-ledger.example.json`.
- Use `/run-init` in `opencode/commands/run-init.md` for greenfield projects (produces init docs).
- Use `/run-ci` in `opencode/commands/run-ci.md` for CI/CD planning (docs-first; optional generation).
- Use `/run-modernize` in `opencode/commands/run-modernize.md` for modernization planning (experimental).
- Use `/run-pipeline` in `opencode/commands/run-pipeline.md` to execute the full pipeline end-to-end
- Use `/run-committee` in `opencode/commands/run-committee.md` for a decision committee (experts + KISS soft-veto + judge)
- Use `/run-general` in `opencode/commands/run-general.md` for non-coding general-purpose workflows (planning/writing/analysis/checklists)

## VS Code Copilot Agents

This repo can generate VS Code Copilot custom agents from `opencode/agents/*.md` with single-source maintenance.

- Generate agents directly:

```text
python scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir /path/to/copilot/agents --strict
```

- Filename rule:
  - Output filenames are generated as `<source-file-stem>.agent.md` (for example `orchestrator-pipeline.agent.md`).

- Experimental subagent mode:
  - Generated orchestrators include `agents:` references for Copilot subagent routing (experimental behavior).
- Fallback mode:
  - Generated `*-solo.agent.md` files run without subagents.
  - Example: `@orchestrator-pipeline-solo`

After install, add your generated directory to VS Code user settings:

```json
{
  "chat.agentFilesLocations": [
    "/path/to/copilot/agents"
  ]
}
```

## Quick Start

1) Load the orchestrator (handoff protocol is embedded for portability):
   - `opencode/agents/orchestrator-pipeline.md`
2) Run `/run-pipeline` with an optional budget flag:

```text
/run-pipeline Implement OAuth2 login --budget=medium
```
3) Optional smoke-check run:

```text
/run-pipeline Run tests only --test-only
```

## Init Pipeline

Use `/run-init` for new projects. It produces:

- `init/init-brief-product-brief.md`
- `init/init-architecture.md`
- `init/init-constraints.md`
- `init/init-structure.md`
- `init/init-roadmap.md`

These docs should be used as reference inputs when running `/run-pipeline`.

Modes:

- `/run-init --decision-only` (brief + architecture + constraints only)
- `/run-init --iterate` (one revision round after initial docs)

## CI Pipeline

Use `/run-ci` to create CI/CD plans and (optionally) generate workflows.

Examples:

```
/run-ci Plan CI/CD for .NET + Vue
/run-ci Plan CI/CD --generate --github
/run-ci Plan CI/CD --generate --github --docker --deploy
```

## Modernize Pipeline (Experimental)

Use `/run-modernize` for legacy modernization planning. It produces:

- `modernize/modernize-current-state.md`
- `modernize/modernize-target-vision.md`
- `modernize/modernize-strategy.md`
- `modernize/modernize-roadmap.md`
- `modernize/modernize-risks.md`

Modes:

- `/run-modernize --decision-only` (current-state + target-vision + strategy only)
- `/run-modernize --iterate` (one revision round after initial docs)

## General-Purpose Pipeline

Use `/run-general` for non-coding work such as:

- strategy/roadmap planning
- process/SOP design
- structured analysis and recommendation memos
- checklist/playbook drafting

Examples:

```text
/run-general Draft a 90-day GTM roadmap
/run-general Compare three vendor evaluation frameworks
/run-general Create an onboarding SOP for support team --confirm
```

General pipeline outputs are human-friendly by default:
- plain-language summary first
- clear Markdown sections
- actionable next steps

## Workflow Guidance

New projects:

1. `/run-init` → architecture and constraints
2. `/run-ci` → CI/CD plans (docs)
3. `/run-pipeline` (or `/run-flow` for small, low-risk changes)
4. `/run-ci --generate --github --docker --deploy` when ready to publish

Iterative development:

1. `/run-pipeline` (or `/run-flow` for small changes)
2. `/run-ci` when CI/CD plan needs updates
3. Publish using `opencode/protocols/PUBLISH_SOP.md`

## Protocol Validation

Validate a JSON output against the protocol schemas:

Python 3.9+ is required for this command.

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-list.schema.json --input path/to/task-list.json
```

If you enable custom tools, you can call the `validate-schema` tool from OpenCode
instead of running the script manually (see `opencode/tools/validate-schema.ts`).

## Config Example

An example OpenCode config is provided at `opencode.json.example`.

## Flags

Use flags after the main task prompt. Tokens starting with `--` are treated as flags.

- `--dry`
  - Stop after `atomizer + router`
  - Output TaskList and DispatchPlan only
- `--no-test`
  - Skip test-runner stage
  - Reviewer must warn about missing verification
- `--test-only`
  - Only run test-runner + reviewer
- `--loose-review`
  - Reviewer does not require build/test evidence
  - Reviewer must add a warning that results are unverified
- `--budget=low|medium|high`
  - low: Favor the smallest viable plan and fewer retries
  - medium: Balanced routing and retries
  - high: Allow deeper analysis and higher execution rigor

Flag precedence:
- `--dry` overrides `--test-only` when both are present.

Examples:
```
/run-pipeline Refactor cache layer --no-test
/run-pipeline Improve search relevance --budget=medium
```

## Orchestrators

- Full: `/run-pipeline` (multi-stage pipeline with reviewer and retries)
- Short: `/run-pipeline --decision-only` (stops after planning/integration design; directional review only)
- Flow: `/run-flow` (max 5 atomic tasks; bounded parallel execution; no reviewer or retries)
- Committee: `/run-committee` (decision support; experts + KISS soft-veto + judge)
- General: `/run-general` (non-coding execution pipeline for planning/writing/analysis)
- Init: `/run-init` (greenfield project initialization docs)
- CI: `/run-ci` (docs-first CI/CD planning; optional generation)
- Modernize: `/run-modernize` (experimental modernization planning docs)

## Choosing a Pipeline (Quick Guide)

- Use `/run-committee` when:
  - you need a recommendation/decision (architecture, tradeoffs, approach selection)
  - you want multiple perspectives + a final judge, with budget as an explicit criterion
- Use `/run-flow` when:
  - the change is small, low-risk, and you mainly want a fast execution plan (max 5 atomic tasks)
- Use `/run-general` when:
  - the objective is not code implementation
  - you need structured planning, analysis, writing, or operational documentation
- Use `/run-pipeline` when:
  - the change is high-risk, multi-file/systemic, or needs reviewer gates + bounded retries

## Naming Convention

- Repo name (`agents-pipeline`) reflects the overall concept.
- Full pipeline uses `*-pipeline` naming (e.g. `orchestrator-pipeline.md`, `run-pipeline.md`).
- Flow pipeline uses `*-flow` naming (e.g. `orchestrator-flow.md`, `run-flow.md`).
- General-purpose pipeline uses `*-general` naming (e.g. `orchestrator-general.md`, `run-general.md`).
- Init pipeline uses `*-init` naming (e.g. `orchestrator-init.md`, `run-init.md`).
- CI pipeline uses `*-ci` naming (e.g. `orchestrator-ci.md`, `run-ci.md`).
- Modernize pipeline uses `*-modernize` naming (e.g. `orchestrator-modernize.md`, `run-modernize.md`).

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator-init | Init pipeline for greenfield projects | Implementing code |
| orchestrator-ci | CI/CD planning pipeline | Implementing code |
| orchestrator-modernize | Modernization planning pipeline | Implementing code |
| orchestrator-pipeline | Flow control, routing, retries, synthesis | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
| orchestrator-general | Non-coding workflow orchestration | Implementing code |
| specifier | Requirement extraction | Proposing solutions |
| planner | High-level planning | Atomic task creation |
| repo-scout | Repo discovery | Design decisions |
| atomizer | Atomic task DAG | Implementation |
| router | Cost-aware assignment | Changing tasks |
| executor-* | Task execution | Scope expansion |
| test-runner | Tests & builds | Code modification |
| reviewer | Quality gate | Implementation |
| compressor | Context reduction | New decisions |
| summarizer | User summary | Technical decisions |

---
