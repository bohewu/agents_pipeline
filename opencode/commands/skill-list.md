---
description: List installed skills or skills from a curated catalog
agent: skill-curator
---

# Skill List

## Raw input

```
$ARGUMENTS
```

## Notes

- Always invoke the `skill-manager` custom tool with `action=list`.
- Default source is `installed`
- Supported curated sources:
  - `anthropic`
  - `awesome-copilot`
- Supported flags:
  - `--ref=<tag|sha>` for remote catalog snapshots
  - `--json`

## Examples

```text
/skill-list
/skill-list anthropic --ref=v1.0.0
/skill-list awesome-copilot --json
```
