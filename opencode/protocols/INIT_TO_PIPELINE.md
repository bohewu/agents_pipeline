# Init → Pipeline Handoff

This SOP explains how to use init artifacts as reference inputs for the main pipeline.

## Expected Init Artifacts

Canonical location is `<output_dir>/init/` (default: `.pipeline-output/init/`).
Legacy root-level `init/` docs may also be used when present.

Expected files:

- `init/init-brief-product-brief.md`
- `init/init-architecture.md`
- `init/init-constraints.md`
- `init/init-structure.md`
- `init/init-roadmap.md`

## How `/run-pipeline` Should Use Them

- Treat init artifacts as constraints and reference inputs.
- Do not override architecture or constraints unless explicitly requested.
- Use roadmap to scope the initial TaskList.

## Recommended Handoff Notes

When invoking `/run-pipeline`, include a short note:

- "Use init docs in `.pipeline-output/init/` (or legacy `init/`) as constraints and scope reference."

## If Init Docs Are Missing or Outdated

- Ask the user whether to refresh init docs (`/run-init --iterate`) or proceed as-is.
- If outdated and risk is high, prefer re-running `/run-init`.
