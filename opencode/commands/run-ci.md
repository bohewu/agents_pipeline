---
description: Run CI/CD planning pipeline (docs-first, optional generation)
agent: orchestrator-ci
---

# Run CI Pipeline

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-ci)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-ci MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-ci.md`.

### Supported flags (quick reference)

- `--generate` — enable config generation (docs-only is default)
- `--github`, `--docker`, `--e2e`, `--deploy` — generation options
- `--output-dir=<path>` — override artifact output path
- `--resume`, `--confirm`, `--verbose`

## Examples

```
/run-ci Create CI/CD plan for .NET + Vue
/run-ci Create CI/CD plan for .NET + Vue --generate --github
/run-ci Create CI/CD plan --generate --github --docker --deploy
/run-ci Continue previous run --resume
/run-ci Create CI/CD plan with review --confirm
```

## Notes

- In `--generate` mode, if `<output_dir>/ci/ci-plan.md`, `<output_dir>/ci/cd-plan.md`, `<output_dir>/ci/docker-plan.md`, and `<output_dir>/ci/runbook.md` already exist, the orchestrator will reuse them and skip re-planning.
- To refresh docs, run `/run-ci` without `--generate`, review/update, then run with `--generate`.
