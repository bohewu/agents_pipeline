---
description: Inspect Codex quota windows and Copilot premium request usage
agent: usage-inspector
---

# Usage

## Raw input

```
$ARGUMENTS
```

## Notes

- Default provider mode is `auto`
- Supported providers: `codex`, `copilot`
- `codex` uses local OAuth credentials and attempts a live usage query
- `copilot` currently expects a downloaded premium-request usage report path for detailed totals
- Supported flags:
  - `--json`
  - `--copilot-report=<path>`
  - `--include-sensitive`

## Examples

```text
/usage
/usage codex
/usage --json
/usage copilot --copilot-report=~/Downloads/copilot-premium-requests.csv
```
