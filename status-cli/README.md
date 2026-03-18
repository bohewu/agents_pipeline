# status-cli

Read-only in-repo CLI for inspecting pipeline status artifacts in this repo. This README reflects the current same-repo Phase 2 usage flow: start from the run summary, then drill into run, task, and agent detail without mutating any status files.

## Scope

- Read-only only
- Primary support: `run-status.json`
- Optional enhanced support: expanded-layout `task show` / `task list` and `agent show` / `agent list` commands when task and agent files exist
- Minimal local visual inspection via `visual`
- No installer support is implemented here
- No dashboard, watch mode, status writing, or runtime worker behavior

## Run directly with Python

From the repository root:

```bash
python status-cli/status_cli.py summary --status-file opencode/protocols/examples/status-layout.run-only.valid/run-status.json
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
2. `run show` or `visual` to inspect run-wide details and references.
3. `task list` to scan tasks, optionally narrowing by status.
4. `task show <task_id>` for one task record.
5. `agent list` to scan agent attempts, optionally narrowing by status or task.
6. `agent show <agent_id>` for one agent record.

Example flow:

```bash
python status-cli/status_cli.py summary --project-dir opencode/protocols/examples/status-layout.expanded.valid
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
