# Multi-Agent Pipeline

Multi-agent workflows for OpenCode: init, pipeline, flow, committee, general-purpose, CI/CD planning, and modernization.
This repository demonstrates a **Multi-Agent Pipeline**. It currently includes an implementation called **OpenCode**. See the **How To Use** section below for usage instructions.

## Usage Prerequisites

This repo assumes you have configured the required model providers in OpenCode.
If no model/provider is available in your OpenCode runtime config, update `opencode.json` (or your global OpenCode config) before running any commands.

### Required Tools

- OpenCode (with model providers configured)
- VS Code with GitHub Copilot (for Copilot custom-agent usage)
- Codex CLI (optional; for Codex multi-agent usage)
- Python 3.9+ (required for `opencode/tools/validate-schema.py`, `scripts/export-copilot-agents.py`, and `scripts/export-codex-agents.py`)
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
- All platforms: `~/.copilot/agents`

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

## Install Codex Roles (Recommended)

Generate and install Codex multi-agent role config to a Codex config directory.

Default target:
- All platforms: `~/.codex`

Windows (PowerShell):

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1
```

macOS/Linux:

```bash
bash scripts/install-codex.sh
```

Preview only (no file writes):

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1 -DryRun
```

```bash
bash scripts/install-codex.sh --dry-run
```

Custom target path:

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1 -Target C:\path\to\.codex
```

```bash
bash scripts/install-codex.sh --target /path/to/.codex
```

Force overwrite when the target already contains non-generated Codex config:

```powershell
pwsh -NoProfile -File scripts/install-codex.ps1 -Target "$HOME\.codex" -Force:$true
```

```bash
bash scripts/install-codex.sh --force
```

Important Codex usage note:

- Generated roles are configured as Codex agent roles in `config.toml`.
- Use them by role name in prompts.
- Do not expect Codex CLI `/agent` to list these custom roles. In current Codex CLI builds, `/agent` is used for switching between already-created agent threads, not for browsing roles from `config.toml`.
- Example prompt: `Have reviewer inspect the risks and have orchestrator-pipeline coordinate the implementation steps.`

## Install Without Clone (Release Bundle)

Use bootstrap installers to download a release bundle and install without cloning this repo.
Bootstrap scripts verify the downloaded archive checksum against the release `SHA256SUMS` asset before install.

PowerShell tips:

- Prefer pinned tags over `main`.
- Pass `-Target` explicitly when you know the install location.
- When combining PowerShell switch flags with other arguments, prefer `-Flag:$true` form for clarity.
- Bootstrap installers create backups by default when they detect existing installed files.

Pinned version (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.9.1"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install.ps1" -OutFile .\bootstrap-install.ps1
pwsh -NoProfile -File .\bootstrap-install.ps1 -Version $tag -Target "$HOME\.config\opencode"
```

macOS/Linux:

```bash
tag="v0.9.1"
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
$tag = "v0.9.1"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-copilot.ps1" -OutFile .\bootstrap-install-copilot.ps1
pwsh -NoProfile -File .\bootstrap-install-copilot.ps1 -Version $tag -Target "$HOME\.copilot\agents"
```

macOS/Linux:

```bash
tag="v0.9.1"
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

## Install Codex Without Clone (Release Bundle)

Pinned version (recommended):

Windows (PowerShell):

```powershell
$tag = "v0.9.1"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1
pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex"
```

If `~/.codex` already contains an existing custom Codex config and you intend to overwrite it, use:

```powershell
$tag = "v0.9.1"
Invoke-WebRequest "https://raw.githubusercontent.com/bohewu/agents_pipeline/$tag/scripts/bootstrap-install-codex.ps1" -OutFile .\bootstrap-install-codex.ps1
pwsh -NoProfile -File .\bootstrap-install-codex.ps1 -Version $tag -Target "$HOME\.codex" -Force:$true
```

macOS/Linux:

```bash
tag="v0.9.1"
curl -fsSL -o ./bootstrap-install-codex.sh "https://raw.githubusercontent.com/bohewu/agents_pipeline/${tag}/scripts/bootstrap-install-codex.sh"
bash ./bootstrap-install-codex.sh --version "${tag}"
```

Quick one-liners (less auditable):

```powershell
irm https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/bohewu/agents_pipeline/main/scripts/bootstrap-install-codex.sh | bash
```

## Versioning

- Single source of truth: root `VERSION` file (SemVer without `v`, for example `0.9.1`).
- Use SemVer tags with `v` prefix (for example: `v0.9.1`).
- Stay in `0.x` while the pipeline and prompts evolve quickly.
- In `0.x`, treat **minor** bumps as potentially breaking (`v0.5.0` -> `v0.6.0`).
- Use **patch** bumps for docs/scripting fixes without intended behavior changes.
- Release CI checks `VERSION` and tag alignment (`VERSION=0.9.1` must release as `v0.9.1`).
- README pinned examples that include explicit release versions must use the current `VERSION` value; CI validates those exact snippets.
- Track release notes in `CHANGELOG.md`.

## Release CI

- Workflow: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v0.9.1`) or manual `workflow_dispatch`
- Output assets:
  - `agents-pipeline-opencode-bundle-vX.Y.Z.tar.gz`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.zip`
  - `agents-pipeline-opencode-bundle-vX.Y.Z.SHA256SUMS.txt`

## CI Checks

- Workflow: `.github/workflows/ci.yml`
- Trigger: `pull_request`, push to `main`, manual `workflow_dispatch`
- Checks:
  - `VERSION` format check
  - README pinned version snippet validation against root `VERSION`
  - schema validator script sanity check
  - dispatch-plan resource schema/examples validation (positive + negative cases)
  - status contract schema/examples validation (`run-status`, `task-status`, `agent-status`; positive + negative fixtures)
  - modernize execution handoff schema/examples validation (positive + negative case)
  - resource-control prompt coverage assertions for router/orchestrator/executor/reviewer docs
  - Copilot export script strict dry run
  - installer script syntax and dry-run validation

Example release:

```bash
git tag v0.9.1
git push origin v0.9.1
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
- Codex install scripts live at `scripts/install-codex.ps1`, `scripts/install-codex.sh`, `scripts/bootstrap-install-codex.ps1`, and `scripts/bootstrap-install-codex.sh`.
- Codex role mapping details live in `docs/codex-mapping.md`.
- Protocol and JSON schemas live in `opencode/protocols/`.
  Use `opencode/protocols/PROTOCOL_SUMMARY.md` for global instructions to reduce token usage.
- Init handoff SOP lives in `opencode/protocols/INIT_TO_PIPELINE.md`.
- Spec handoff SOP lives in `opencode/protocols/SPEC_TO_PIPELINE.md`.
- Spec end-to-end example lives in `opencode/protocols/SPEC_E2E_EXAMPLE.md`.
- Modernize handoff SOP lives in `opencode/protocols/MODERNIZE_TO_PIPELINE.md`.
- Modernize target bootstrap example lives in `opencode/protocols/MODERNIZE_TARGET_BOOTSTRAP_EXAMPLE.md`.
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

## Codex Agent Roles

This repo can also generate Codex multi-agent role config from `opencode/agents/*.md` with single-source maintenance.

- Generate a `.codex`-style config directory:

```text
python scripts/export-codex-agents.py --source-agents opencode/agents --target-dir /path/to/.codex --strict
```

- Output structure:
  - `/path/to/.codex/config.toml`
  - `/path/to/.codex/agents/*.toml`

- Safe overwrite behavior:
  - Generation fails if the target contains non-generated files unless you pass `--force`.

- Codex docs / mapping notes:
  - See `docs/codex-mapping.md` for the exact field mapping and adaptation rules.

- Invocation note:
  - Ask Codex to use role names in prompts.
  - Do not expect `/agent` to display generated custom roles from `config.toml`.
  - Example: `Have reviewer inspect the patch and have generalist draft the migration notes.`

## Quick Start

1) Load the orchestrator (handoff protocol is embedded for portability):
   - `opencode/agents/orchestrator-pipeline.md`
2) Run `/run-pipeline` with an optional effort flag:

```text
/run-pipeline Implement OAuth2 login --effort=balanced
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
- `/run-modernize --init-target` (bootstrap the target project path and init docs before later implementation handoff)

Recommended execution split:

- Start `/run-modernize` in the source project.
- Keep modernization docs and handoff files under the source project's `.pipeline-output/modernize/`.
- Once implementation starts, switch to the target project for `/run-pipeline` runs.
- Keep implementation/test/review artifacts under the target project's `.pipeline-output/pipeline/`.
- If the target project does not exist yet, rerun with `--init-target` to prepare it in the same modernization flow.
- Expect `modernize-index.md` to include copyable next-step commands for bootstrap and/or target-side `/run-pipeline` continuation.

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

Modernization work:

1. `/run-modernize` from the source project
2. If the target project does not exist, either create it manually or rerun with `--init-target`
3. Review roadmap + handoff
4. `/run-pipeline` from the target project for actual implementation

## Protocol Validation

Validate a JSON output against the protocol schemas:

Python 3.9+ is required for this command.

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-list.schema.json --input path/to/task-list.json
```

Status contract fixtures follow the same validation pattern. To mirror the repository's status-layer CI checks locally, validate the positive fixtures and confirm the negative fixtures fail:

```text
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.run-only.valid/run-status.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/run-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/run-status.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-doc-summary.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-process-build.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-local-server-smoke.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/task-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/tasks/task-browser-resume.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-doc-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-process-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-server-01.json --require-jsonschema
python opencode/tools/validate-schema.py --schema opencode/protocols/schemas/agent-status.schema.json --input opencode/protocols/examples/status-layout.expanded.valid/agents/agent-browser-02.json --require-jsonschema
```

See `opencode/protocols/SCHEMAS.md` and `opencode/protocols/VALIDATION.md` for the status layout fixture set and the negative-fixture expectations enforced in CI.

If you enable custom tools, you can call the `validate-schema` tool from OpenCode
instead of running the script manually (see `opencode/tools/validate-schema.ts`).

## Config Example

An example OpenCode config is provided at `opencode.json.example`.

## Flags

Use flags after the main task prompt. Tokens starting with `--` are treated as flags.
For resume-only flows, `--resume` can be used without a new prompt.

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
- `--effort=low|balanced|high`
  - low: Favor the smallest viable plan and fewer retries
  - balanced: Practical default depth with standard validation
  - high: Allow deeper analysis and higher execution rigor
- `--resume`
  - Resume from `<output_dir>/checkpoint.json`
  - Can be used without a new prompt (reuses `checkpoint.user_prompt` when valid)
- `--confirm`
  - Pause after each stage for review
- `--verbose`
  - Implies `--confirm`, plus per-task pauses during execution
- `--autopilot`
  - Run non-interactively
  - Overrides `--confirm` / `--verbose` pauses
  - Continues other runnable work first, then attempts one bounded blocker-recovery pass for non-hard blockers
  - Stops only on hard blockers (destructive/irreversible actions, security/billing impact, missing credentials)
- `--full-auto`
  - Hands-off preset for stronger execution
  - Implies `--autopilot`
  - For `/run-flow`, defaults to `--force-scout` unless you override scout mode
  - Defaults to `--effort=high` and `--max-retry=5` unless you override them explicitly
  - Prefers the strongest safe in-scope blocker recovery path before surfacing a non-hard blocker

Flag precedence:
- `--dry` overrides `--test-only` when both are present.
- `--full-auto` implies `--autopilot`.
- `--autopilot` overrides interactive pauses from `--confirm` / `--verbose`.

Examples:
```
/run-pipeline Refactor cache layer --no-test
/run-pipeline Improve search relevance --effort=balanced
/run-flow --resume
/run-pipeline --resume --autopilot
/run-flow Ship login improvements --full-auto
/run-pipeline Ship migration end-to-end --full-auto
```

## When to Use `--autopilot` vs `--full-auto`

| Scenario | Recommended flag | Why |
|----------|-----------------|-----|
| Quick task, low risk, you just want no pauses | `--autopilot` | Runs non-interactively with default effort/retries; stops on hard blockers |
| You want to walk away and let the pipeline finish | `--full-auto` | Max effort, max retries, strongest blocker recovery — true hands-off |
| You want non-interactive but lower cost | `--autopilot --effort=low` | Autopilot suppresses pauses; effort=low keeps retries minimal |
| You want full-auto but cap retries | `--full-auto --max-retry=2` | full-auto sets the baseline; explicit flags still override |
| Flow task, want forced repo scouting | `--full-auto` | Flow full-auto defaults to `--force-scout` |
| Modernize full-exec, no supervision | `--full-auto` | Defaults depth to `deep`, forwards `--full-auto` to delegated pipeline phases |

**Rule of thumb:**
- `--autopilot` = "don't ask me questions, use safe defaults"
- `--full-auto` = "don't ask me questions, try your hardest to finish everything"

Both flags stop on **hard blockers** (destructive actions, security/billing impact, missing credentials). The difference is that `--full-auto` also cranks up effort, retries, and blocker recovery before giving up on non-hard blockers.

Explicit flags always win: `--full-auto --effort=low --max-retry=1` gives you full-auto's blocker recovery but with low effort and only 1 retry.

### Execution Resource Control

- Dispatch plans annotate every batch with `resource_class`, `max_parallelism`, `teardown_required`, and optional timeout hints.
- Browser and local-server tasks are routed conservatively and should run one at a time by default.
- Process-class tasks stay conservative; `teardown_required` is only set when explicit shutdown is still needed after the command.
- Executors and test runners must tear down Node.js, Playwright, browser, and other background resources before reporting success.
- Missing teardown evidence for heavy tasks should be treated as incomplete execution, not a clean pass.

### Session vs Checkpoint Behavior

- A new chat/session does not automatically inherit prior runtime state or stage progress.
- Cross-session continuation works through persisted files under `<output_dir>/` (default: `.pipeline-output/`), especially `<output_dir>/checkpoint.json`.
- To continue an interrupted Flow or Pipeline run, use `--resume` from the same project and output root.
- If `--resume` is not provided, the orchestrator starts a fresh run even if older artifacts still exist.
- Persisted artifacts may still be reused as inputs when the prompt explicitly references them or when the protocol treats them as optional context, but that is not the same as checkpoint resume.

## Orchestrators

- Full: `/run-pipeline` (multi-stage pipeline with reviewer and retries)
- Short: `/run-pipeline --decision-only` (stops after planning/integration design; directional review only)
- Spec: `/run-spec` (review-ready development spec for humans first, pipeline-ready handoff second)
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
- Use `/run-spec` when:
  - you want to review a development spec before implementation starts
  - you want a human-readable `DevSpec` plus a machine-readable handoff for later `/run-pipeline` execution
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
- Spec pipeline uses `*-spec` naming (e.g. `orchestrator-spec.md`, `run-spec.md`).
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
| orchestrator-spec | Development spec orchestration | Implementing code |
| orchestrator-flow | Flow orchestration with max-5 tasks | Implementing code |
| orchestrator-committee | Decision committee orchestration (experts + KISS soft-veto + judge) | Implementing code |
| orchestrator-general | Non-coding workflow orchestration | Implementing code |
| specifier | ProblemSpec / DevSpec extraction | Proposing solutions |
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
