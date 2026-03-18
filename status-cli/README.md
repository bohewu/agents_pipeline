# status-cli

Read-only in-repo CLI for inspecting pipeline status artifacts in this repo. This README reflects the current same-repo Phase 2 usage flow: start from the run summary, then drill into run, task, and agent detail without mutating any status files. The current examples are terminal-first, but the same-repo Phase 2 boundary also allows a self-contained local web viewer or HTML export extension when it stays file-backed, read-only, narrowly bounded, and non-controlling.

Choose the terminal commands (`summary`, `dashboard`, `visual`, `run show`, `task`, `agent`) when you want direct shell output. Choose `web export` when you want a richer local HTML artifact for those same already-written status files. Choose `web serve` only when you want that same read-only viewer over loopback HTTP during a bounded local inspection session. The HTML path is still local-only and inspection-only: it reads status artifacts, writes only the explicitly requested output file, and does not host a service, take control actions, or write back into the status directory. Any live-refresh behavior in the exported HTML is limited to bounded re-reads of those same local files from the browser.

## Scope

- Read-only only
- Primary support: `run-status.json`
- Optional enhanced support: expanded-layout `task show` / `task list` and `agent show` / `agent list` commands when task and agent files exist
- Optional enhanced support: compact `dashboard` output for terminal-local triage, with optional blocked/stale/active focus modes when fixture-backed task and agent files exist
- Minimal terminal-local read-only inspection via `visual`
- Optional self-contained local HTML export via `web export`
- Optional loopback-only localhost viewer via `web serve`
- No installer support is implemented here
- No remote dashboard, non-loopback hosting, unbounded watch mode, status writing beyond explicit local HTML export, runtime worker behavior, or control actions

## Run directly with Python

From the repository root:

```bash
python status-cli/status_cli.py summary --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py dashboard --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid --focus blocked
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/status-view.html
python status-cli/status_cli.py web serve --project-dir opencode/protocols/examples/status-layout.expanded.valid --host 127.0.0.1 --port 0
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
4. `web serve` when you need the same read-only viewer over loopback HTTP so browser polling can re-read the source through a bounded localhost session.
5. `run show` or `visual` to inspect run-wide details and references.
6. `task list` to scan tasks, optionally narrowing by status.
7. `task show <task_id>` for one task record.
8. `agent list` to scan agent attempts, optionally narrowing by status or task.
9. `agent show <agent_id>` for one agent record.

Example flow:

```bash
python status-cli/status_cli.py summary --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py dashboard --project-dir opencode/protocols/examples/status-layout.expanded.valid --focus stale
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/status-view.html --focus stale
python status-cli/status_cli.py web serve --project-dir opencode/protocols/examples/status-layout.expanded.valid --host localhost --port 0 --focus stale
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
- optional `--refresh-interval 5|10|15|30|60` for bounded browser-side polling of the original local status files (`15` seconds by default, `0`/off can be chosen inside the exported viewer after export)
- live refresh stays local-file-backed and read-only: the export never hosts a service, never launches a browser, never writes back into the status directory, and never controls the pipeline
- browsers may block local file fetches for exported HTML; when that happens the viewer degrades gracefully with warnings and stops polling after a few failed attempts
- no background service, browser launch, remote watch mode, or control actions
- local/export-only: no hosted browser/server UI, remote dashboard, or controlling surface
- works for both run-only and expanded layouts
- optional `--focus blocked|stale|active` and `--theme auto|light|dark` (defaults: `focus=all`, `theme=auto`)
- missing referenced task/agent files stay non-fatal and render as warnings inside the exported HTML

```bash
python status-cli/status_cli.py web export --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json --output artifacts/run-only-status.html
python status-cli/status_cli.py web export --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json --output artifacts/run-only-status.html --refresh-interval 30
python status-cli/status_cli.py web export --project-dir opencode/protocols/examples/status-layout.expanded.valid --output artifacts/expanded-status.html --focus blocked --theme dark
```

Use `web export` only for local read-only inspection artifacts. Its bounded refresh support is for re-reading already-written local status files only. It is not a hosted app, service-backed dashboard, remote viewer, resume tool, operational control plane, or anything that mutates pipeline state.

### `web serve`

Starts a read-only localhost viewer over loopback HTTP for a bounded local inspection session.

- serves only on `127.0.0.1` or `localhost`; external interfaces are rejected
- serves the same read-only viewer shape as `web export`, but from a transient in-process HTTP server instead of an output file
- supports browser polling over HTTP via `/api/payload`, so refresh works even when a browser would block local-file fetches from exported HTML
- optional `--refresh-interval 5|10|15|30|60` controls bounded polling cadence in the browser; default is `15`, and `Off` can still be chosen inside the viewer after startup
- accepts `GET` and `HEAD` only; write-like verbs return `405 Method not allowed`
- reads existing run/task/agent artifacts only; it never writes into the status directory and closing the process shuts down the loopback socket cleanly
- use it for local inspection only; do not treat it as a remote dashboard, shared service, watch daemon, or control surface

```bash
python status-cli/status_cli.py web serve --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json --host 127.0.0.1 --port 0
python status-cli/status_cli.py web serve --project-dir opencode/protocols/examples/status-layout.expanded.valid --host localhost --port 0 --focus blocked --theme dark --refresh-interval 30
```

When the viewer starts it prints the selected loopback URL and stays in the foreground until you stop it with `Ctrl+C`. Shutdown is explicit and cleanup-safe: stopping the command closes the loopback socket and leaves the status artifacts unchanged.

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
