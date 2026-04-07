---
description: List or switch local Codex accounts used by OpenCode
agent: codex-account-manager
---

# Codex Account

## Raw input

```text
$ARGUMENTS
```

## Notes

- Always invoke the `codex-account` custom tool.
- Default action is `list`.
- Treat a bare email-like argument as `action=switch` for that account.
- Supported flags:
  - `--path=<file>`
  - `--email=<address-or-label>`
  - `--index=<n>`
  - `--json`

## Examples

```text
/codex-account
/codex-account bohewu@gmail.com
/codex-account switch --email=bohewu@gmail.com
/codex-account switch --path=C:\Users\name\.opencode\projects\foo\openai-codex-accounts.json --index=2
/codex-account --json
```
