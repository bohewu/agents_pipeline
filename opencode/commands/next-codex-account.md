---
description: Rotate to the next stored local Codex account
agent: codex-account-manager
---

# Next Codex Account

## Raw input

```text
$ARGUMENTS
```

## Notes

- Always invoke the `codex-account` custom tool with `action=next`.
- Do not list first unless the tool returns an error that requires clarification.
- Supported flags:
  - `--path=<file>`
  - `--json`

## Examples

```text
/next-codex-account
/next-codex-account --json
/next-codex-account --path=C:\Users\name\.opencode\projects\foo\openai-codex-accounts.json
```
