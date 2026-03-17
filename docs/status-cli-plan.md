# status-cli Phase 1 Plan

## Summary

`status-cli` is an optional in-repo read-only Phase 1 companion tool for inspecting status-layer artifacts that follow this repository's status contract.

This plan keeps Phase 1 intentionally small:

- `status-cli` is **optional** and is **not required** for teams that only use the protocol docs, schemas, or validation fixtures.
- Phase 1 is **read-only**.
- Phase 1 treats `run-status.json` as the primary supported input.
- Support for `tasks/` and `agents/` files is optional enhanced behavior when present.
- Phase 1 does **not** include status writing, runtime orchestration, background services, or live update behavior.

Unless separate install docs/scripts are added alongside the implementation, treat `status-cli` as an in-repo companion rather than a broadly supported install workflow.

The source of truth for status semantics remains the existing status-layer MVP contract in:

- `opencode/protocols/PIPELINE_PROTOCOL.md`
- `opencode/protocols/PROTOCOL_SUMMARY.md`
- `opencode/protocols/STATUS_MVP_HANDOFF.md`

## Positioning and Scope Boundary

`status-cli` should be framed as a downstream consumer of the existing status-layer contract, not as part of the contract itself.

Phase 1 goals:

- help operators or developers inspect status artifacts locally
- make the required `run-status.json` easier to read in a terminal
- optionally summarize expanded task/agent detail when those files exist
- stay low-complexity and MVP-first

Out of Phase 1 scope:

- writing or mutating status files
- launching or managing runtime workers
- daemon/background watch processes
- dashboards, web UI, or service APIs
- runtime reconciliation logic
- any new protocol fields or schema changes created just for the CLI

## Phase 1 Feature List

### Required Phase 1 features

1. Read `run-status.json` from a target project or output directory.
2. Print a concise human-readable run summary.
3. Show key lifecycle fields from `RunStatus`, such as run state, timestamps, checkpoint linkage, and summary counts when available.
4. Validate basic file presence and report clear errors when the expected status path is missing.
5. Work against filesystem status artifacts without requiring a service or database.
6. Support explicit path targeting so one CLI install can inspect many projects.

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

- local development repos
- separate runtime repos that adopt this contract later
- archived or copied output directories
- operators inspecting multiple runs across different project roots

## CLI Command Design

Phase 1 should stay small and terminal-oriented.

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
- `write`
- `repair`
- `resume`
- `start`
- `stop`

Those imply runtime or mutating behavior and should stay out of the Phase 1 plan.

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
- `formatters/`: terminal output rendering only
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

- Should future runtime adoption start with run-only layout everywhere, or should some consumers write expanded task/agent files immediately?
- Should later CLI output include machine-readable export modes, or remain human-first only?
- At what point would watch/live-refresh behavior be justified, if ever?
- Should protocol-version compatibility rules be surfaced in CLI output beyond simple display?

## Recommended Next Step

Keep this document as the main planning reference for `status-cli` in this repository, while leaving actual implementation and runtime-writer behavior to a future downstream effort.
