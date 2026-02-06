---
description: Run CI/CD planning pipeline (docs-first, optional generation)
agent: orchestrator-ci
model: openai/gpt-5.3-codex
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

### Supported flags

- `--generate`
  - Allow generation of config files (docs-only is default)

- `--github`
  - Generate GitHub Actions workflows under `.github/workflows/`

- `--docker`
  - Generate Dockerfile(s) and `docker-compose.yml`

- `--e2e`
  - Include E2E steps in plans and generated workflows

- `--deploy`
  - Include deploy workflow (self-host)

## Examples

```
/run-ci Create CI/CD plan for .NET + Vue
/run-ci Create CI/CD plan for .NET + Vue --generate --github
/run-ci Create CI/CD plan --generate --github --docker --deploy
```

## Notes

- In `--generate` mode, if `ci/ci-plan.md`, `ci/cd-plan.md`, `ci/docker-plan.md`, and `ci/runbook.md` already exist, the orchestrator will reuse them and skip re-planning.
- To refresh docs, run `/run-ci` without `--generate`, review/update, then run with `--generate`.
