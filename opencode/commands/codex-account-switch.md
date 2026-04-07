---
description: Switch the active local Codex account used by OpenCode
agent: codex-account-manager
---

# Codex Account Switch

## Raw input

```text
$ARGUMENTS
```

## Notes

- Always invoke the `codex-account` custom tool with `action=switch`.
- Require one of:
  - `--email=<address-or-label>`
  - `--index=<n>`
- Supported flags:
  - `--path=<file>`
  - `--json`

## Examples

```text
/codex-account-switch --email=bohewu@gmail.com
/codex-account-switch --index=2
/codex-account-switch --path=C:\Users\name\.opencode\projects\foo\openai-codex-accounts.json --email=bohewu@gmail.com
```
