---
description: Inspect Codex quota windows
agent: usage-inspector
---

# Usage

## Raw input

```
$ARGUMENTS
```

## Notes

- Default provider mode is `auto`
- Supported providers: `codex`
- `codex` uses local OAuth credentials and attempts a live usage query
- Supported flags:
  - `--json`
  - `--include-sensitive`

## Examples

```text
/usage
/usage codex
/usage --json
```
