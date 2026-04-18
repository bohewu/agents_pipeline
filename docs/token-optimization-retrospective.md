# Token Optimization Retrospective

Date: 2026-04-18
Release checkpoint: `v0.22.15`

## Executive Summary

- The recent optimization burst materially reduced prompt/runtime overhead, but the largest low-risk wins are now mostly exhausted.
- Compared with the pre-burst baseline commit `14274293`, generated Copilot/Codex/Claude outputs shrank by `10,304` bytes overall, even though source agent markdown grew by `5,243` bytes. The exporter/runtime compaction work more than paid back the extra source-side guidance.
- The biggest previously landed win remained the first major `PROTOCOL_SUMMARY.md` slimming pass, documented at roughly `~9,300 tokens/run`.
- The final `v0.22.15` pass slimmed `PROTOCOL_SUMMARY.md` again from `951` bytes to `352` bytes, worth roughly `~100-150 tokens/call` or `~1,200-1,800 tokens/run` for a typical `~12`-call run.
- Practical rough estimate after all landed work in this area: `~15% to ~25%` cumulative savings versus the earlier baseline for typical runs, with prompt-heavy/subagent-heavy runs sometimes landing closer to `~20% to ~30%`.
- Additional low-risk optimization is now in diminishing-returns territory. Future work should be driven by better telemetry or a new clearly global tax, not by continued blind trimming.

## Scope

This retrospective covers the token/runtime optimization burst that landed across `v0.22.13`, `v0.22.14`, and `v0.22.15`, especially the concentrated `perf:` work from `2026-04-18`.

Baseline used for comparison:

- Pre-burst commit: `14274293967e64e25ae659abc50d0ba06b5a6c1a`
- Final release in this burst: `v0.22.15`

## Landed Themes

### Prompt and Export Compaction

- `97d7e7f` `perf: reduce prompt overhead for low-risk runs`
- `6adf48b` `perf: slim exported orchestrator prompts and status writes`
- `44a0f7c` `perf: compact exported orchestrator progress boilerplate`
- `5b9df4d` `perf: compact exported status protocol prompts`
- `c340cd1` `perf: slim global protocol summary rules`

### Runtime and Status Write Reduction

- `6adf48b` `perf: slim exported orchestrator prompts and status writes`
- `d210cb0` `perf: batch status runtime event flushes`
- `b6426c6` `perf: coalesce status heartbeats and relax low-risk floors`
- `de99a47` `perf: tighten heartbeat emission guidance`

### Avoiding Unnecessary Work

- `85f2c20` `perf: tighten DevSpec threshold gating`
- `27aa36e` `perf: narrow retry routing for review failures`
- `a950781` `perf: inline trivial Stage 8 context packs`

### Lower Reasoning Effort on Planning Work

- `97d7e7f` `perf: reduce prompt overhead for low-risk runs`
- `b6426c6` `perf: coalesce status heartbeats and relax low-risk floors`
- `d50cae4` `perf: lower planning-only GPT-5 effort floors`

## Measured Deltas

These numbers are direct before/after measurements from exporter output sizes, not run-token telemetry.

| Metric | Baseline | Final | Delta |
|---|---:|---:|---:|
| Generated exports, all targets | `783,256 B` | `772,952 B` | `-10,304 B` |
| Generated exports, orchestrators only | `564,754 B` | `551,922 B` | `-12,832 B` |
| Source agent markdown, all | `204,433 B` | `209,676 B` | `+5,243 B` |
| Source orchestrator markdown | `133,328 B` | `137,437 B` | `+4,109 B` |

Per target:

- Copilot generated all: `-4,131 B` (`-1.19%`)
- Codex generated all: `-3,266 B` (`-1.50%`)
- Claude generated all: `-2,907 B` (`-1.32%`)
- Copilot orchestrators: `-5,265 B` (`-1.91%`)
- Codex orchestrators: `-3,526 B` (`-2.52%`)
- Claude orchestrators: `-4,041 B` (`-2.71%`)

Interpretation:

- Source prompts became slightly larger because some new heuristics and clarifications were added.
- Generated prompts still became smaller because exporter-only compaction outperformed that source growth.

## Previously Documented Large Win

The earlier report and changelog already documented the biggest low-risk token win in this space:

- First major `PROTOCOL_SUMMARY.md` slimming pass: from roughly `~974` tokens to `~200` tokens
- Estimated savings from that pass: `~9,300 tokens/run`

That change explains why the remaining `PROTOCOL_SUMMARY` opportunity by `v0.22.15` was much smaller than the original report's headline number.

## Final `PROTOCOL_SUMMARY` Pass

The final pass in `v0.22.15` kept `PROTOCOL_SUMMARY.md` limited to the two truly universal rules and moved no new contracts; it only stopped duplicating details already owned elsewhere.

Measured file delta:

- `PROTOCOL_SUMMARY.md`: `951 B -> 352 B`
- Saved: `599 B`

Rough token impact:

- `~100-150 tokens/call`
- `~1,200-1,800 tokens/run` for a typical `~12`-call run
- Rough run-level contribution: `~1% to ~3%`

## Estimated Run-Level Impact

These numbers combine direct measurements with contract-aware estimates from the landed mechanisms.

### This 1-2 Day Burst Alone

- Typical average run: `~3% to ~8%`
- Small, planning-heavy, prompt-heavy run: `~8% to ~15%`
- Large tool-output-heavy execution run: `~0% to ~5%`

Why the range is wide:

- Some wins are conditional, such as `--dry`, `--decision-only`, trivial `--compress`, and fail-path retry narrowing.
- Tool output still dominates large runs, so prompt savings get diluted there.

### Cumulative Versus the Earlier Baseline

- Conservative typical estimate: `~15% to ~25%`
- Prompt-heavy or subagent-heavy runs can plausibly reach `~20% to ~30%`
- Treat `30%+` as an upper-end case, not the default average

## Confidence Levels

### High Confidence

- Exported prompt shrinkage measured directly by before/after file sizes
- `PROTOCOL_SUMMARY.md` byte reduction measured directly
- Validation evidence exists for export correctness, status-runtime behavior, effort-control behavior, and release integrity

### Medium Confidence

- Stage 8 trivial inline `context-pack.json` bypass savings
- Planning-only GPT-5 effort suppression savings
- Review retry narrowing savings

These are real cheaper paths with tests or validator coverage, but their exact token/runtime savings depend on how often qualifying runs occur.

### Lower Confidence

- Exact end-to-end wall-clock savings for status batching, dirty writes, and heartbeat coalescing

The runtime paths are verified, but the repo does not yet include trustworthy per-run telemetry that can attribute the real savings precisely.

## Why Marginal Returns Are Flattening

- The large global tax was already removed earlier through the first `PROTOCOL_SUMMARY` reduction.
- Exporter compaction has already harvested most of the obvious repeated boilerplate.
- Remaining opportunities are now either narrower heuristics or higher-risk architectural changes.
- Further low-risk trimming is more likely to save a few hundred or low-thousands of tokens than another `~9k/run` class win.

## Recommendation

Pause additional token-usage optimization for now.

That recommendation is based on three facts:

- The current low-risk backlog is now mostly incremental.
- The largest remaining ideas are riskier (`file-first artifacts`, `checkpoint pointer/hash mode`) or have narrower upside.
- Better telemetry would now provide more value than another speculative trim pass.

If this area is revisited later, the preferred trigger should be one of these:

- New trustworthy run-level token/runtime telemetry
- A new globally injected prompt tax
- Evidence that review-failure retries or artifact payloads are dominating cost again

Until then, `v0.22.15` is a reasonable stopping point for the current optimization campaign.
