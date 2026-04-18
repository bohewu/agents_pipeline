---
description: Manage the root-tracked todo ledger and kanban view
agent: kanban-manager
---

# Kanban

## Raw input

```
$ARGUMENTS
```

## Notes

- Canonical board data lives at `<project-root>/todo-ledger.json`
- Human-readable board view lives at `<project-root>/kanban.md` and should be rendered from `todo-ledger.json`
- Do not treat `kanban.md` as canonical state; update `todo-ledger.json` instead.
- Typical actions are `init`, `sync`, `archive`, `show`, `add`, and `done`
- Archive should only move old completed work to `archived`; it should never delete history.
- Default archive threshold is 14 days for inactive `done` items.
- `sync` should prefer explicit handoff updates over inferred status guesses.

## Examples

```text
/kanban init
/kanban sync from the latest run artifacts
/kanban archive completed items older than 14 days
/kanban add Investigate flaky OAuth callback test
```
