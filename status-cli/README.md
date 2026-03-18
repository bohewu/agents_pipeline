# status-cli

Read-only in-repo CLI for inspecting pipeline status artifacts in this repo. This README reflects the current same-repo Phase 2 usage flow: start from the run summary, then drill into run, task, and agent detail without mutating any status files. The current examples are terminal-first, but the same-repo Phase 2 boundary also allows a self-contained local web viewer or HTML export extension when it stays file-backed, read-only, and non-controlling.

Choose the terminal commands (`summary`, `dashboard`, `visual`, `run show`, `task`, `agent`) when you want direct shell output. Choose `web export` when you want a richer local HTML artifact for those same already-written status files. The HTML path is still local-only and inspection-only: it reads status artifacts, writes only the explicitly requested output file, and does not host a service, take control actions, or write back into the status directory.

## Scope

- Read-only only
- Primary support: `run-status.json`
- Optional enhanced support: expanded-layout `task show` / `task list` and `agent show` / `agent list` commands when task and agent files exist
- Optional enhanced support: compact `dashboard` output for terminal-local triage, with optional blocked/stale/active focus modes when fixture-backed task and agent files exist
- Minimal terminal-local read-only inspection via `visual`
- Optional self-contained local HTML export via `web export`
- No installer support is implemented here
- No service-backed or remote dashboard, watch mode, status writing beyond explicit local HTML export, runtime worker behavior, or control actions

## Run directly with Python

From the repository root:

```bash
python status-cli/status_cli.py summary --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py dashboard --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid --focus blocked
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/status-view.html
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py run show --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py task list --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py task show task-local-server-smoke --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py agent show agent-server-01 --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py agent list --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

## Path options

The CLI supports explicit path targeting with:

- `--status-file`: path to `run-status.json`
- `--status-dir`: path to a `status/` directory containing `run-status.json`
- `--output-dir`: path to an output directory; the CLI tries `status/run-status.json` first, then `run-status.json`
- `--project-dir`: path to a project or fixture directory; the CLI tries predictable direct locations first, then a bounded recursive fallback when there is a single match

Lookup priority is:

1. `--status-file`
2. `--status-dir`
3. `--output-dir`
4. `--project-dir`
5. current working directory fallback

## Commands

## Phase 2 usage flow

Use the CLI as a bounded read-only inspection flow:

1. `summary` to confirm the run, layout, and top-level status.
2. `dashboard` when you want a compact terminal-local triage view of blocked, stale, active, and hotspot information without leaving the shell.
3. `web export` when you want a richer self-contained local HTML view with graph-like run, task, and agent inspection.
4. `run show` or `visual` to inspect run-wide details and references.
5. `task list` to scan tasks, optionally narrowing by status.
6. `task show <task_id>` for one task record.
7. `agent list` to scan agent attempts, optionally narrowing by status or task.
8. `agent show <agent_id>` for one agent record.

Example flow:

```bash
python status-cli/status_cli.py summary --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid --focus stale
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/status-view.html --focus stale
python status-cli/status_cli.py task list --project-dir opencode/protocols/examples/status-layout.expanded.valid --status done
python status-cli/status_cli.py agent list --project-dir opencode/protocols/examples/status-layout.expanded.valid --status blocked --task-id task-local-server-smoke
```

### `summary`

Shows a compact run summary that works with `run-status.json` alone.

```bash
python status-cli/status_cli.py summary --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
```

### `run show`

Shows a more detailed run view from `run-status.json`.

```bash
python status-cli/status_cli.py run show --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

### `visual`

Shows a self-contained terminal-local read-only dashboard-style inspection as an ASCII tree. It stays explicitly read-only, only reads existing status artifacts, and does not launch services, write files, or trigger control actions. Use `--select` to inspect details for an existing run, task, or agent node while keeping the visual tree as context.

```bash
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid --select task:task-local-server-smoke
```

### `dashboard`

Shows a compact terminal-local read-only dashboard for operator triage. This is still file-backed and local to the shell: it only reads existing status artifacts, never writes files, never starts background processes, and is not a control surface.

Use it when you want a faster overview than `run show` and a more status-oriented summary than `visual`:

- run-only layout: count-focused blocked/stale/active summary when only `run-status.json` exists
- expanded layout: blocked, stale, and active task sections plus agent hotspot rollups
- optional `--focus blocked|stale|active`: narrow the triage view without mutating any status artifacts
- missing referenced task/agent files stay non-fatal and surface as warnings in the dashboard output

```bash
python status-cli/status_cli.py dashboard --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid --focus active
```

Use `dashboard` for local read-only inspection only. Do not treat it as a hosted browser/server UI, service-backed dashboard, remote dashboard, watch mode, resume tool, or operational control surface.

### `web export`

Writes a self-contained local HTML viewer with inline CSS/JS/SVG for a more visual read-only run overview.

- requires explicit `--output <path>`; only that file is written
- the parent directory for `--output` must already exist
- reads existing run/task/agent artifacts only; no write-back to status files
- no background service, browser launch, watch mode, or control actions
- local/export-only: no hosted browser/server UI, remote dashboard, or controlling surface
- works for both run-only and expanded layouts
- optional `--focus blocked|stale|active` and `--theme auto|light|dark` (defaults: `focus=all`, `theme=auto`)
- missing referenced task/agent files stay non-fatal and render as warnings inside the exported HTML

```bash
python status-cli/status_cli.py web export --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json --output artifacts/run-only-status.html
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/expanded-status.html --focus blocked --theme dark
```

Use `web export` only for local read-only inspection artifacts. It is not a live dashboard, hosted app, watch mode, remote viewer, resume tool, or operational control plane.

### `task show <task_id>`

Reads `tasks/<task_id>.json` when present. If the current layout does not include task files, the CLI returns a clear read-only error.

```bash
python status-cli/status_cli.py task show task-doc-summary --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

### `task list`

Lists expanded-layout tasks in a compact, human-readable format. Optional `--status` narrows the output without changing any files. Missing referenced task files are surfaced as warnings.

```bash
python status-cli/status_cli.py task list --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py task list --project-dir opencode/protocols/examples/status-layout.expanded.valid --status blocked
```

If task files are not part of the current layout, the CLI returns a clear read-only error instead of guessing or writing anything.

### `agent show <agent_id>`

Reads `agents/<agent_id>.json` when present. If the current layout does not include agent files, the CLI returns a clear read-only error.

```bash
python status-cli/status_cli.py agent show agent-browser-02 --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

### `agent list`

Lists expanded-layout agents in a compact, human-readable format. Optional `--status` and `--task-id` filters narrow the output without changing any files. Missing referenced agent files are surfaced as warnings.

```bash
python status-cli/status_cli.py agent list --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py agent list --project-dir opencode/protocols/examples/status-layout.expanded.valid --status blocked --task-id task-local-server-smoke
```

If agent files are not part of the current layout, the CLI returns a clear read-only error instead of guessing or writing anything.

## Tests

Run the bounded fixture-driven tests with:

```bash
python -m unittest discover -s status-cli/tests -v
```
