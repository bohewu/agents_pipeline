# Status CLI Deferred Roadmap

This document parks post-Phase-1 follow-up work as later work only. The repository may include an optional read-only in-repo `status-cli`, but this roadmap does **not** expand that into dashboard, runtime-writer, polling, or service/platform scope.

Current contract sources remain:

- `opencode/protocols/PIPELINE_PROTOCOL.md`
- `opencode/protocols/STATUS_MVP_HANDOFF.md`

Any future `status-cli` work should stay downstream of those docs and should not redefine the status-layer contract on its own.

## Now / Current Baseline

- [x] The repository defines the status-layer contract, schema set, examples, validation guidance, and handoff boundaries.
- [x] The canonical status layout remains filesystem-based under `<output_dir>/status/`.
- [x] `run-status.json` remains the required top-level record.
- [x] Expanded layout stays optional via `tasks/<task_id>.json` and `agents/<agent_id>.json`.
- [x] Runtime writing, UI, dashboards, polling, websocket/event-bus delivery, and external runtime services remain out of scope here.
- [x] This roadmap is a placeholder for later follow-up, not a commitment to implement `status-cli` now.

## Later / Deferred Item (4)

### 1. Dashboard evolution after runtime adoption

- [ ] Revisit whether a future `status-cli` should remain terminal-only or act as a thin entry point into later operator-facing views.
- [ ] Keep dashboard or richer presentation work deferred until runtime status writing is stable in a separate runtime repository.
- [ ] Avoid changing the contract solely to support presentation preferences.

### 2. Packaging and install maturity

- [ ] Revisit packaging only after the first runtime consumer and basic CLI shape are stable.
- [ ] Decide later how installation should work for operators and contributors.
- [ ] Decide whether protocol/version compatibility needs an explicit packaging rule.

### 3. Expanded layout support

- [ ] Decide whether later `status-cli` support should begin with `run-status.json` only or include expanded layout from the start.
- [ ] Preserve `run-status.json` as the top-level index even if task and agent views are added later.
- [ ] Treat expanded layout support as additive follow-on work, not a prerequisite for the current contract.

### 4. Runtime integration boundary decisions

- [ ] Decide whether a future `status-cli` reads repo-bound status files directly, relies on a separate runtime implementation, or supports both modes.
- [ ] Decide where runtime-only concerns stay owned: heartbeat cadence, stale reconciliation, cleanup verification, and multi-writer behavior.
- [ ] Keep those decisions in the runtime boundary discussion unless they require a contract change in this repository first.

## Open Questions

- Which future runtime repository will be the first real consumer of the status-layer contract?
- Should later CLI work target `run-status.json` only first, or require expanded task/agent files immediately?
- What compatibility promise, if any, should exist between CLI behavior and `protocol_version`?
- At what point would packaging/install work be mature enough to justify documenting as supported workflow instead of experimental tooling?

## Implementation Followups

- [ ] Reconfirm the boundary in `STATUS_MVP_HANDOFF.md` before opening any future `status-cli` task.
- [ ] Keep any future CLI proposal explicitly scoped as a consumer of the existing status-layer contract.
- [ ] If later work needs new fields, layouts, or state meanings, update the protocol docs and schemas in this repository before runtime or CLI implementation proceeds.
- [ ] Keep broad platform, service, or UI work out of future `status-cli` tasks unless a separate runtime roadmap explicitly owns it.

## Not in Scope From This Roadmap

- Implementing `status-cli`
- Adding a dashboard in this repository
- Proposing a broad runtime platform buildout
- Changing status-layer entity names, vocabulary, or layout rules without a protocol update
