# status-cli Phase 1 Plan

## Summary

`status-cli` is an optional in-repo read-only Phase 1 companion tool for inspecting status-layer artifacts that follow this repository's status contract.

This plan keeps Phase 1 intentionally small:

- `status-cli` is **optional** and is **not required** for teams that only use the protocol docs, schemas, or validation fixtures.
- Phase 1 is **read-only**.
- In-repo run commands and orchestrators are expected to emit real status artifacts under `<output_dir>/status/` for the CLI to inspect.
- Phase 1 treats `run-status.json` as the primary supported input.
- Support for `tasks/` and `agents/` files is optional enhanced behavior when present.
- Phase 1 does **not** add control behavior, background services, daemon/watch behavior, or any live update mechanism other than a narrow same-process self-refresh mode for an ephemeral loopback-only localhost read-only viewer that rereads existing local files during the current viewing session.

Future read-only CLI continuation is allowed in this same repository under `status-cli/`. For roadmap wording in this repo, Phase 2 means the next in-repo read-only CLI phase, including an ephemeral loopback-only localhost read-only viewer mode or self-contained HTML export, plus a narrow same-process local polling/self-refresh mode for that same-repo viewer when it stays file-backed, local, read-only, and non-controlling during the current viewing session, while service-backed or external runtime integration remains deferred to later planning.

Unless separate install docs/scripts are added alongside the implementation, treat `status-cli` as an in-repo companion rather than a broadly supported install workflow.

The source of truth for status semantics remains the existing status-layer MVP contract in:

- `opencode/protocols/PIPELINE_PROTOCOL.md`
- `opencode/protocols/PROTOCOL_SUMMARY.md`
- `opencode/protocols/STATUS_MVP_HANDOFF.md`

## Positioning and Scope Boundary

`status-cli` should be framed as a downstream consumer of the existing status-layer contract, not as part of the contract itself.

Phase 1 goals:

- help operators or developers inspect status artifacts locally
- assume repo runs already wrote those artifacts under `<output_dir>/status/`
- make the required `run-status.json` easier to read in a terminal
- optionally summarize expanded task/agent detail when those files exist
- allow small same-repo ephemeral loopback-only localhost read-only viewer sessions or self-contained HTML exports when they remain file-backed, local, and non-controlling
- allow a narrow same-process local polling/self-refresh mode for the same-repo localhost viewer when it only rereads existing status artifacts from local disk during the current viewing session
- stay low-complexity and MVP-first

Out of Phase 1 scope:

- launching or managing runtime workers
- daemon/background watch processes
- hosted service or server platform behavior beyond an ephemeral loopback-only localhost viewer session
- browser/server-hosted dashboards, service-backed web UI, or service APIs
- any remote, control-oriented, or write-back dashboard surface
- any remote exposure or remotely delivered polling/update mechanism
- runtime reconciliation logic
- any new protocol fields or schema changes created just for the CLI

## Phase 1 Feature List

### Required Phase 1 features

1. Read `run-status.json` from a target project or output directory.
2. Print a concise human-readable run summary.
3. Show key lifecycle fields from `RunStatus`, such as run state, timestamps, checkpoint linkage, and summary counts when available.
4. Validate basic file presence and report clear errors when the expected status path is missing.
5. Work against filesystem status artifacts produced by repo runs without requiring a service or database.
6. Support explicit path targeting so one CLI install can inspect many projects.
7. Allow optional ephemeral loopback-only localhost read-only visualization, self-contained local web viewing, or HTML export of existing status artifacts without adding hosted browser/server platform behavior, service-backed, remote, write-back, or control surfaces.
8. Allow a narrow same-process local polling/self-refresh mode for the same-repo localhost viewer only when it rereads existing status artifacts from local disk during the current viewing session, stays read-only, and does not introduce watch/daemon or control behavior.

### Optional enhanced Phase 1 support

If expanded layout files exist, `status-cli` may also:

- summarize task counts from `tasks/<task_id>.json`
- inspect a specific task record
- summarize agent attempts from `agents/<agent_id>.json`
- show whether the current run is run-only layout or expanded layout

These enhanced views should remain additive. The initial user experience should still work with `run-status.json` alone.

## Cross-Project / Project-Dir Model

Phase 1 should assume `status-cli` is installed once and used across many projects.

Recommended model:

- the CLI runs from any shell location
- the user points it at a project directory, output directory, or specific status file path
- the CLI discovers `<output_dir>/status/run-status.json` from that target
- the CLI does not require installation inside each project

Preferred lookup order:

1. explicit file path to `run-status.json`
2. explicit path to a `status/` directory
3. explicit project/output directory where `status/run-status.json` can be resolved
4. current working directory only as a convenience fallback

This keeps the tool useful for:

- local development repos whose runs emit `<output_dir>/status/`
- separate runtime repos that adopt this contract later
- archived or copied output directories
- operators inspecting multiple runs across different project roots

## CLI Command Design

Phase 1 should stay small, local-only, and read-only.

### Recommended initial command set

#### `status-cli summary`

Primary Phase 1 command.

Purpose:

- read `run-status.json`
- print a compact run overview
- optionally include task/agent rollups when expanded files are present

Example shapes:

```text
status-cli summary --project-dir /path/to/project
status-cli summary --output-dir /path/to/output
status-cli summary --status-file /path/to/status/run-status.json
```

#### `status-cli run show`

Purpose:

- show a more detailed `RunStatus` view from `run-status.json`
- remain read-only and file-backed

Example shape:

```text
status-cli run show --project-dir /path/to/project
```

#### `status-cli visual`

Optional same-repo ephemeral loopback-only localhost read-only visualization slice.

Purpose:

- render existing status artifacts in a terminal-local view and leave room for an ephemeral loopback-only localhost read-only viewer mode or self-contained HTML export
- allow a narrow in-process local polling/self-refresh mode for the same-repo localhost viewer when it only rereads existing local files from disk during the current viewing session
- stay file-backed and read-only
- avoid any hosted browser/server runtime beyond the bounded loopback-only localhost viewer session, service-backed runtime, remote exposure, write-back, watch/daemon process, or control operation semantics

#### `status-cli dashboard`

Optional same-repo read-only terminal triage view.

Purpose:

- summarize blocked, stale, and active work from existing status artifacts
- support compact focus modes such as blocked, stale, or active without mutating files
- surface missing referenced task or agent files as warnings rather than converting the CLI into a repair tool
- remain terminal-local, file-backed, and explicitly non-controlling

#### `status-cli task show <task_id>`

Optional enhanced command for expanded layout only.

Purpose:

- read `tasks/<task_id>.json` when present
- report clear fallback/error text when task files are not part of the current layout

#### `status-cli agent show <agent_id>`

Optional enhanced command for expanded layout only.

Purpose:

- read `agents/<agent_id>.json` when present
- stay explicitly secondary to run-level inspection

### Commands to avoid in Phase 1

Do not include commands for:

- `watch`
- `tail`
- `serve`
- `repair`
- `resume`
- `start`
- `stop`
- any command that triggers agent, runtime, or opencode control actions

Those imply mutating, service-like, or control behavior and should stay out of the Phase 1 plan. Local read-only visualization, including an ephemeral loopback-only localhost viewer mode or self-contained HTML export, is allowed only when it does not cross into hosted browser/server platform behavior, service-backed, remote, watch/daemon, write-back, or control behavior. A narrow same-process local polling/self-refresh mode is allowed only for the same-repo localhost viewer when it rereads existing local status files directly during the current viewing session and stays read-only.

## Recommended In-Repo Directory Structure

Keep the in-repo `status-cli` implementation clearly separated from the protocol source of truth.

Recommended structure:

```text
status-cli/
  README.md
  package.json or pyproject.toml
  src/
    commands/
    readers/
    formatters/
    discovery/
    models/
  tests/
    fixtures/
    unit/
    integration/
```

Guidance for these directories:

- `commands/`: terminal command entrypoints such as `summary` and `run show`
- `readers/`: read-only filesystem loading for `run-status.json` and optional task/agent files
- `formatters/`: read-only output rendering for terminal or self-contained local export/view formats
- `formatters/` may include terminal-local views, ephemeral loopback-only localhost viewer rendering, self-contained local web/HTML rendering, and narrow same-process local polling/self-refresh that rereads existing files during the current viewing session, but not hosted browser/server platform behavior, remote exposure, or service UI surfaces
- `discovery/`: project-dir/output-dir/status-path resolution logic
- `models/`: local typed wrappers around the existing contract, without redefining it
- `tests/fixtures/`: should prefer reuse or copies of contract-valid example layouts derived from `opencode/protocols/examples/`

This keeps protocol docs in `opencode/protocols/` and any future CLI consumer implementation in a separate top-level area.

## Install Model / Future Packaging Design

If packaged install support is added later, Phase 1 should follow the repository's current paired install convention conceptually:

- provide a PowerShell install path for Windows-oriented users
- provide a Bash install path for macOS/Linux users
- support a normal local install flow and, later if justified, a bootstrap/no-clone flow
- support dry-run style behavior for installer validation before file writes
- default to a single-user install target rather than per-project installation

Recommended install design principles:

1. Install `status-cli` once per user environment.
2. Keep install separate from protocol/schema usage.
3. Do not require repository cloning just to inspect a status directory, if later packaging supports a bootstrap path.
4. Keep the install story aligned with the current repository pattern of paired `.ps1` and `.sh` scripts.
5. Avoid adding complex package-manager assumptions in the Phase 1 plan.

Possible later install shapes:

- local paired scripts if implemented in-repo later:
  - `scripts/install-status-cli.ps1`
  - `scripts/install-status-cli.sh`
- optional later bootstrap counterparts only after the CLI shape is stable:
  - `scripts/bootstrap-install-status-cli.ps1`
  - `scripts/bootstrap-install-status-cli.sh`

For Phase 1 planning purposes, the important point is the model, not the packaging mechanics: one optional user-level install, cross-project usage, and parity with existing paired install conventions.

## Data and Contract Alignment

`status-cli` Phase 1 should consume the contract as documented today.

Key alignment rules:

- `run-status.json` remains the required top-level index
- `tasks/` and `agents/` remain optional expanded layout details
- in-repo runs are expected to write those files under `<output_dir>/status/`
- status vocabulary should come from the existing protocol docs and schemas
- the CLI should not invent alternative lifecycle names or layout rules
- if future CLI needs expose a real contract gap, the protocol docs and schemas should be updated first in this repository

## Recommended User Experience Priorities

Order the first-phase experience like this:

1. make `status-cli summary` useful with `run-status.json` only
2. make path discovery predictable and explicit
3. provide readable error messages for missing or incompatible paths
4. add optional task and agent inspection only when expanded layout exists

This preserves the MVP-first contract stance already used by the status-layer documentation.

## Open Questions for Later Phases

- Should the next same-repo read-only `status-cli` phase stay focused on richer inspection of `run-status.json`, or add expanded-layout views first?
- Should future runtime adoption start with run-only layout everywhere, or should some consumers write expanded task/agent files immediately?
- Should later CLI output include machine-readable export modes, or remain human-first only?
- Is the bounded local polling/self-refresh mode sufficient, or would any broader watch/live-refresh behavior ever be justified later?
- Should protocol-version compatibility rules be surfaced in CLI output beyond simple display?

## Recommended Next Step

Keep this document as the main planning reference for `status-cli` in this repository. Future read-only CLI work may continue here under `status-cli/`, including same-repo terminal-local views, an ephemeral loopback-only localhost read-only viewer mode, self-contained HTML export behavior, and a narrow same-process local polling/self-refresh mode for that localhost viewer when it only rereads existing local status artifacts during the current viewing session. Repo runs are expected to keep producing those artifacts under `<output_dir>/status/`, while hosted services, remote surfaces, write-back/control actions, daemon/watch processes, browser/server-hosted UI beyond that bounded localhost mode, and broader platform work remain deferred to later planning and a future downstream runtime effort.
