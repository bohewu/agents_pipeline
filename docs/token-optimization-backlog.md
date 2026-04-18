# Token Optimization Backlog

Date: 2026-04-18

## Recently Landed

- Compact repeated source prompt blocks for executor/doc/test style agents.
- Shorten exporter adapters and add safe markdown whitespace compaction.
- Minify repeated orchestrator runtime sections at export time.
- Tighten `DevSpec` defaults for clearly small or mechanical runs.
- Tighten `DevSpec` further with an explicit threshold gate so small isolated fixes stay on `ProblemSpec` unless they cross multiple behavior-heavy signals or the user explicitly asks for spec-style traceability.
- Expand GPT-5 medium-floor exclusions for clearly structured low-reasoning agents.
- Reduce status-runtime cost by rewriting only touched entities.
- Add `status_runtime_event(event="batch")` so same-run deltas can be applied in order and flushed once.
- Clarify emitter-side heartbeat cadence so orchestrators/executors treat standalone heartbeats as low-frequency liveness signals instead of routine per-step updates.
- Add a low-risk first step for reviewer fail classification by prefixing `review-report` issue/followup strings with `[artifact]`, `[evidence]`, or `[logic]` so narrow repair-only failures can avoid broad retries.
- Let `orchestrator-pipeline` inline a minimal `context-pack.json` for clearly trivial successful `--compress` runs instead of always paying for a dedicated Stage 8 compressor call.

## Next Candidates

| Priority | Item | Expected gain | Risk | Notes |
|---|---|---:|---:|---|
| P1 | Scope `PROTOCOL_SUMMARY.md` to orchestrators only or split a lighter subagent summary | High prompt | Medium | Still a global tax when injected into agents that do not need status/schema/todo details. |
| P2 | Extend exporter compile/minify to `RESPONSE MODE`, progress narration boilerplate, and other repeated orchestrator sections | Medium prompt | Medium | Keep source markdown readable; continue slimming exported runtime prompts only. |
| P2 | Context-aware effort control when plugin input exposes prompt/flags reliably | Medium runtime | Medium | Candidate signals: `--dry`, `--decision-only`, docs-only/copy-only/config-only, or obvious planning-only phrasing. Avoid guessing until SDK fields are stable. |
| P3 | Extend Stage 8 trivial-pack bypass beyond the current conservative pass-only heuristic | Low-Medium runtime | Medium | Current shortcut only fires for obvious small successful runs; larger ambiguous runs still use `@compressor`. |
| P2 | Complete reviewer-failure routing beyond prefix-based classes | Medium-High runtime | Medium-High | Current prompts now classify `[artifact]` / `[evidence]` / `[logic]` without schema churn. Remaining work is making routing/executor selection even more targeted and auditable. |
| P3 | Checkpoint pointer/hash mode for `stage_artifacts` | Medium context/runtime | High | Keep canonical files as source of truth and store only pointers + hashes in checkpoint state. |
| P4 | File-first artifact protocol | High prompt | High | Replace large inline artifact echoes with `{path, summary, checksum, evidence}` metadata where runtime write capability exists. |

## Suggested Order

1. Heartbeat emitter-side debounce/coalescing.
2. `PROTOCOL_SUMMARY.md` scoping or splitting.
3. More exporter-only orchestrator compaction.
4. Context-aware effort control.

## Guardrails

- Prefer exporter/runtime optimizations over source prompt readability regressions.
- Keep schemas, canonical filenames, and slash-command contracts stable unless a change clearly pays for its migration cost.
- Treat file-first artifacts and checkpoint protocol changes as separate higher-risk workstreams.
