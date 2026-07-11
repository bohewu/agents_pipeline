# Token Optimization Backlog

Date: 2026-04-18

## Recently Landed

- Compact repeated source prompt blocks for executor/doc/test style agents.
- Shorten exporter adapters and add safe markdown whitespace compaction.
- Minify repeated orchestrator runtime sections at export time.
- Tighten `DevSpec` defaults for clearly small or mechanical runs.
- Tighten `DevSpec` further with an explicit threshold gate so small isolated fixes stay on `ProblemSpec` unless they cross multiple behavior-heavy signals or the user explicitly asks for spec-style traceability.
- Retire runtime-specific reasoning-floor tuning from the neutral workflow; current profiles route model tiers only and inherit runtime reasoning controls.
- Reduce status-runtime cost by rewriting only touched entities.
- Add `node tools/status-event.js --event batch` so same-run deltas can be applied in order and flushed once.
- Clarify emitter-side heartbeat cadence so orchestrators/executors treat standalone heartbeats as low-frequency liveness signals instead of routine per-step updates.
- Add a low-risk first step for reviewer fail classification by prefixing `review-report` issue/followup strings with `[artifact]`, `[evidence]`, or `[logic]` so narrow repair-only failures can avoid broad retries.
- Let `orchestrator-pipeline` inline a minimal `context-pack.json` for clearly trivial successful `--compress` runs instead of always paying for a dedicated Stage 8 compressor call.
- Compact repeated orchestrator checkpoint and run-status boilerplate at export time so generated Copilot/Codex/Claude prompts stay shorter without changing source markdown contracts.
- Slim `PROTOCOL_SUMMARY.md` again so the global instruction file keeps only the two universal rules and leaves task/evidence/resource specifics in the local agent or protocol docs that already own them.

## Next Candidates

| Priority | Item | Expected gain | Risk | Notes |
|---|---|---:|---:|---|
| P3 | Extend exporter compile/minify beyond the current handoff/response/checkpoint/status coverage | Low-Medium prompt | Medium | Keep source markdown readable; remaining gains are smaller unless we also trim Claude delegation boilerplate. |
| P3 | Calibrate risk-derived verification/review defaults with behavioral evals | Medium runtime | Medium | Keep workflow rigor explicit and separate from runtime model reasoning; do not restore a global effort control. |
| P3 | Extend Stage 8 trivial-pack bypass beyond the current conservative pass-only heuristic | Low-Medium runtime | Medium | Current shortcut only fires for obvious small successful runs; larger ambiguous runs still use `@compressor`. |
| P2 | Complete reviewer-failure routing beyond prefix-based classes | Medium-High runtime | Medium-High | Current prompts now classify `[artifact]` / `[evidence]` / `[logic]` without schema churn. Remaining work is making routing/executor selection even more targeted and auditable. |
| P3 | Checkpoint pointer/hash mode for `stage_artifacts` | Medium context/runtime | High | Keep canonical files as source of truth and store only pointers + hashes in checkpoint state. |
| P4 | File-first artifact protocol | High prompt | High | Replace large inline artifact echoes with `{path, summary, checksum, evidence}` metadata where runtime write capability exists. |

## Suggested Order

1. Heartbeat emitter-side debounce/coalescing.
2. More exporter-only orchestrator compaction.
3. Behavioral evals for risk-derived review and repair defaults.

## Guardrails

- Prefer exporter/runtime optimizations over source prompt readability regressions.
- Keep schemas, canonical filenames, orchestrator flags, and `modes.json` aliases stable unless a change clearly pays for its migration cost.
- Treat file-first artifacts and checkpoint protocol changes as separate higher-risk workstreams.
