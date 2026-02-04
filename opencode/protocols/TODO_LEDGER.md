# Todo Ledger

The Todo Ledger captures unfinished or blocked items after a pipeline run.
It is intentionally lightweight and optional.

## Default Location

`<project-root>/todo-ledger.json`

## When To Write

- Reviewer returns `fail` with required followups
- Executor reports `blocked`
- Manual carryover items you want to revisit later

## When To Read

At the start of a new pipeline run, the orchestrator may surface the ledger
and ask whether to:

- include items in the new TaskList
- defer items again
- mark items obsolete

## Status Values

Allowed values are `open`, `blocked`, `done`, and `obsolete`.

## Schema

The ledger must conform to `./protocols/schemas/todo-ledger.schema.json`.
