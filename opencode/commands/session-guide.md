---
description: Create or refresh stable root-tracked repo guidance
agent: session-guide-writer
---

# Session Guide

## Raw input

```
$ARGUMENTS
```

## Notes

- Default target path: `<project-root>/session-guide.md`
- `session-guide.md` is stable repo guidance, not run state.
- The guide is repo-owned and should stay stable enough to track in git.
- Include durable guidance such as architecture landmarks, conventions, recurring commands, and canonical artifact locations.
- Do NOT include ephemeral run progress, temporary blockers, task counts, or kanban state.
- Start from `session-guide.example.md` section order unless the repo already has a better established structure.

## Examples

```text
/session-guide initialize for this repo
/session-guide refresh after architecture changes
```
