---
description: Search installed skills or curated skill catalogs
agent: skill-curator
---

# Skill Search

## Raw input

```
$ARGUMENTS
```

## Notes

- Always invoke the `skill-manager` custom tool with `action=search`.
- Default source is `all`
- Supported sources:
  - `installed`
  - `anthropic`
  - `awesome-copilot`
  - `all`
- Supported flags:
  - `--source=installed|anthropic|awesome-copilot|all`
  - `--ref=<tag|sha>` for remote catalog snapshots
  - `--json`

## Examples

```text
/skill-search ux
/skill-search audit --source=anthropic --ref=v1.0.0
/skill-search browser --source=all --json
```
