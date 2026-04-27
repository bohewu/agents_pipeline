---
description: Run monetization analysis with market research and revenue scenarios
agent: orchestrator-general
---

# Run Monetization Analysis

## Raw input

```text
$ARGUMENTS
```

## Wrapper contract

- Treat the user's prompt as the product/project context for a monetization study.
- This wrapper MUST stay analysis-only and MUST NOT implement product/business code.
- Prefer a dedicated market-research lane before synthesis when web research is needed.
- Source of truth for generic flag parsing/behavior remains `opencode/agents/orchestrator-general.md`.

## Preferred execution shape

Unless the user explicitly asks for a lighter output, prefer a two-lane structure:

1. Research lane
   - Run a dedicated market/comparable scan task, preferably via `@market-researcher`.
   - Focus on directly comparable products, pricing pages, public monetization signals, benchmark articles, and clearly cited evidence.
2. Synthesis lane
   - Use the research artifact plus user context to compare monetization models, estimate monthly USD ranges, and recommend next experiments.

If external research tools are unavailable, continue with user-provided assumptions only and make that limitation explicit.

## Required analysis shape

The workflow should aim to produce artifacts that cover:

1. Product/project assumptions
2. Comparable market scan with sources
3. Monetization model comparison
   - one-time purchase
   - subscription
   - ads
   - affiliate / partnerships
   - sponsorship / lead-gen
   - hybrid models
4. Low / base / high monthly USD scenarios
5. Key risks, constraints, and unknowns
6. Recommended next validation experiments

## Research lane guidance

- If market evidence is required, prefer a dedicated research task executed by `@market-researcher`.
- Keep the research lane and synthesis lane logically separate even if one executor ends up writing both artifacts.
- Keep research evidence separate from scenario assumptions.
- If evidence is weak, call that out explicitly instead of implying precision.
- If external research tools are unavailable, continue with user-provided assumptions and clearly label the limitation.

## Output expectations

- Default artifacts should be human-friendly Markdown.
- Monthly revenue outputs should be ranges, not single precise forecasts.
- Reports should clearly separate:
  - observed/source-backed market evidence
  - user-provided assumptions
  - derived assumptions / estimates
- If key inputs are missing, prefer explicit unknowns and reduced-confidence ranges over fake precision.

## Preferred artifact set

When the task has enough context for a full analysis, aim to produce these artifacts:

### `market-scan-<task_id>.md`

Include:

1. Project/product framing
2. Comparable products table
   - name
   - url/source
   - target user
   - monetization model
   - pricing / benchmark signal
   - notes / caveats
3. Market evidence summary
4. Evidence quality notes

### `monetization-scenarios-<task_id>.md`

Include:

1. Assumptions inventory
   - source-backed assumptions
   - user-provided assumptions
   - derived assumptions
2. Monetization model comparison table
3. Low / base / high monthly USD scenarios
4. Key levers / sensitivity notes
5. Missing data that would change the estimate most

### `monetization-report-<task_id>.md`

Include:

1. Executive summary
2. Recommended primary model
3. Recommended secondary / fallback model
4. Why the rejected models are weaker right now
5. Major risks and confidence notes
6. 30-day validation experiments

If the available context is too thin for the full set above, still produce at least one final report artifact and clearly state which artifacts were intentionally omitted.

## Revenue-scenario rules

- Use ranges (`low`, `base`, `high`) instead of a single number.
- Show the rough formula or driver chain behind each scenario.
- Do not mix source-backed evidence and guessed values without labeling the boundary.
- If a benchmark is stale, weak, or only loosely comparable, say so next to the number.
- If the product is too early-stage for meaningful USD ranges, downgrade to a assumptions-and-experiments report instead of forcing a forecast.

## Supported flags

- `--output-dir=<path>`
- `--resume`
- `--confirm`
- `--verbose`
- `--full-auto`

## Examples

```text
/run-monetize Evaluate monetization options for our AI writing SaaS
/run-monetize Assess pricing + ads + affiliate options for this open-source project
/run-monetize Estimate monthly USD scenarios for a niche newsletter tool --confirm
/run-monetize Continue previous monetization analysis --resume
```

## Guarantees

- No direct code implementation in this workflow.
- Uses the existing general-purpose orchestration path with this wrapper's analysis-only constraints.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.
- Outputs should remain explicit about evidence quality and confidence.
