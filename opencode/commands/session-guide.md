---
description: Create or refresh the root-tracked session guide
agent: session-guide-writer
---

# Session Guide

## Raw input

```
$ARGUMENTS
```

## Notes

- Default target path: `<project-root>/session-guide.md`
- The guide is repo-owned and should stay stable enough to track in git.
- Include guidance such as architecture landmarks, conventions, recurring commands, and canonical artifact locations.
- Do NOT include ephemeral run progress or temporary blockers.
- Start from `session-guide.example.md` section order unless the repo already has a better established structure.

## Examples

```text
/session-guide initialize for this repo
/session-guide refresh after architecture changes
```
