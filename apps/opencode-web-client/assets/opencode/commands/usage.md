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
- `copilot` uses live GitHub Copilot user/quota info via `gh auth` or `GH_TOKEN` / `GITHUB_TOKEN`, and also accepts a downloaded premium-request usage report
- When live lookups fail, users should fall back to `--copilot-report=<path>` or the provider UI instead of assuming the feature is broken
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
