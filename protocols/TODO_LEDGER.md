# Todo Ledger / Kanban Source

The Todo Ledger captures unfinished or blocked items after a pipeline run.
It is the canonical board data for repo-level kanban / carryover state.
`kanban.md` is an optional human-readable render derived from the ledger.
It is intentionally lightweight and optional.

## Default Location

`<project-root>/todo-ledger.json`

Optional human-readable render derived from the ledger:

`<project-root>/kanban.md`

## When To Write

- Reviewer returns `fail` with required followups
- Executor reports `blocked`
- Handoff output recommends kanban updates
- Manual carryover items you want to revisit later

## When To Read

At the start of a new pipeline run, the orchestrator may surface the ledger
and ask whether to:

- include items in the new TaskList
- defer items again
- archive obsolete carryover

## Status Values

Canonical values are:

- `backlog`
- `ready`
- `doing`
- `blocked`
- `done`
- `archived`

Legacy values `open` and `obsolete` are still accepted for migration, but helper commands should normalize them.

## Archive Policy

- Only `done` items should be auto-archived.
- Default threshold: 14 days since the last meaningful update or completion timestamp.
- Do not auto-archive `backlog`, `ready`, `doing`, or `blocked` items.

## Sync Precedence

When a helper command syncs the ledger from run artifacts, prefer:

1. Explicit `kanban_updates` from handoff artifacts
2. Reviewer-required followups or final blockers
3. Final task outcomes from the run status/task list

## Schema

The ledger must conform to `./protocols/schemas/todo-ledger.schema.json`.
