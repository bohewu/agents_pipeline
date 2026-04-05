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
  - `--force`
  - `--dry-run`
  - `--json`
  - `--local-path=<path>` with `local` source

## Examples

```text
/skill-install anthropic webapp-testing
/skill-install awesome-copilot playwright-debugger --scope=repo --dry-run
/skill-install local --local-path=./.agents/skills/my-skill --scope=global
```
