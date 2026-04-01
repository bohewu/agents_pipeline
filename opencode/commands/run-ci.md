---
description: Run CI/CD planning pipeline (docs-first, optional generation)
agent: orchestrator-ci
---

# Run CI Pipeline

## Purpose

- `/run-ci` is the docs-first command for helping a repository adopt or improve CI/CD.
- By default it produces planning artifacts only: CI plan, CD plan, Docker plan, and runbook.
- With `--generate`, it may also generate CI/CD config such as GitHub Actions workflows, Docker files, and deploy workflow scaffolding.
- It is for CI/CD design and setup, not application feature implementation.

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

- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- In `--generate` mode, if `<run_output_dir>/ci/ci-plan.md`, `<run_output_dir>/ci/cd-plan.md`, `<run_output_dir>/ci/docker-plan.md`, and `<run_output_dir>/ci/runbook.md` already exist, the orchestrator will reuse them and skip re-planning.
- To refresh docs, run `/run-ci` without `--generate`, review/update, then run with `--generate`.

## Security Expectations

- `/run-ci` MUST treat software supply chain integrity as a first-class CI/CD design concern, especially for release, publish, and deploy flows.
- The paired `orchestrator-ci` prompt requires plans and generated configs to account for integrity controls such as pinned third-party GitHub Actions, least-privilege permissions, verification of downloaded tools/dependencies, immutable artifact or image digests/checksums, and release gates that validate publish inputs before deployment.
- When provenance, SBOM, or signed attestation support is feasible for the target stack, the plan should include it; when it is not feasible, the gap and fallback controls should be documented explicitly.
