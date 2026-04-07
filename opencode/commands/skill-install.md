---
description: Install a skill from a curated catalog or local path
agent: skill-curator
---

# Skill Install

## Raw input

```
$ARGUMENTS
```

## Notes

- Always invoke the `skill-manager` custom tool with `action=install`.
- Default install scope is `repo`
- Curated sources:
  - `anthropic`
  - `awesome-copilot`
- Supported flags:
  - `--scope=repo|global`
  - `--ref=<tag|sha>` for reproducible remote installs
  - `--force`
  - `--dry-run`
  - `--json`
  - `--local-path=<path>` with `local` source
 - Prefer pinned `--ref=<tag|sha>` for remote installs instead of mutable default-branch HEAD.

## Examples

```text
/skill-install anthropic webapp-testing --ref=v1.0.0
/skill-install awesome-copilot playwright-debugger --scope=repo --ref=4f3c2b1 --dry-run
/skill-install local --local-path=./.agents/skills/my-skill --scope=global
```
