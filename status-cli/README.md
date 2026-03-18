# status-cli

Minimal Phase 1 read-only CLI for inspecting pipeline status artifacts in this repo.

## Scope

- Read-only only
- Primary support: `run-status.json`
- Optional enhanced support: `task show` and `agent show` when expanded-layout files exist
- Minimal local visual inspection via `visual`
- No installer support is implemented here
- No dashboard, watch mode, status writing, or runtime worker behavior

## Run directly with Python

From the repository root:

```bash
python status-cli/status_cli.py summary --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py run show --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py task show task-local-server-smoke --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py agent show agent-server-01 --project-dir opencode/protocols/examples/status-layout.expanded.valid
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

Shows a self-contained local visual inspection as an ASCII tree. It stays explicitly read-only, only reads existing status artifacts, and does not launch services or write files. Use `--select` to inspect details for an existing run, task, or agent node while keeping the visual tree as context.

```bash
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid
python status-cli/status_cli.py visual --project-dir opencode/protocols/examples/status-layout.expanded.valid --select task:task-local-server-smoke
```

### `task show <task_id>`

Reads `tasks/<task_id>.json` when present. If the current layout does not include task files, the CLI returns a clear read-only error.

```bash
python status-cli/status_cli.py task show task-doc-summary --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

### `agent show <agent_id>`

Reads `agents/<agent_id>.json` when present. If the current layout does not include agent files, the CLI returns a clear read-only error.

```bash
python status-cli/status_cli.py agent show agent-browser-02 --project-dir opencode/protocols/examples/status-layout.expanded.valid
```

## Tests

Run the bounded fixture-driven tests with:

```bash
python -m unittest discover -s status-cli/tests -v
```
