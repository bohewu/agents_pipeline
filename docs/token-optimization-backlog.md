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

## Next Candidates

| Priority | Item | Expected gain | Risk | Notes |
|---|---|---:|---:|---|
| P1 | Scope `PROTOCOL_SUMMARY.md` to orchestrators only or split a lighter subagent summary | High prompt | Medium | Still a global tax when injected into agents that do not need status/schema/todo details. |
| P2 | Extend exporter compile/minify to `RESPONSE MODE`, progress narration boilerplate, and other repeated orchestrator sections | Medium prompt | Medium | Keep source markdown readable; continue slimming exported runtime prompts only. |
| P2 | Context-aware effort control when plugin input exposes prompt/flags reliably | Medium runtime | Medium | Candidate signals: `--dry`, `--decision-only`, docs-only/copy-only/config-only, or obvious planning-only phrasing. Avoid guessing until SDK fields are stable. |
| P2 | Make compressor stage smarter about when it runs | Medium prompt/runtime | Medium | Prefer opt-in or auto-skip on trivial runs where `context-pack.json` is unlikely to be reused. |
| P3 | Split reviewer failures into format/artifact, evidence, and logic classes | Medium-High runtime | Medium-High | Avoid re-running full retry loops for artifact/evidence repair only. |
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
