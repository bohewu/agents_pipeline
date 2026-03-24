# Status CLI Deferred Roadmap

This document parks post-Phase-1 follow-up work as later work only. The repository may continue read-only `status-cli` work in this same repo under `status-cli/`, including terminal-local rendering plus an ephemeral loopback-only localhost read-only viewer mode or HTML export and a narrow same-process local polling/self-refresh mode for that same-repo viewer when it only rereads existing files from local disk during the current viewing session, but this roadmap does **not** expand that into hosted service or server platform behavior, remote exposure, write-back/control actions, daemon/watch behavior, browser/server-hosted runtime beyond that bounded localhost mode, or broader service/platform scope. Runtime/plugin is expected to emit the filesystem status artifacts that `status-cli` reads under `<run_output_dir>/status/`.

Current contract sources remain:

- `opencode/protocols/PIPELINE_PROTOCOL.md`
- `opencode/protocols/STATUS_MVP_HANDOFF.md`

Any future `status-cli` work should stay downstream of those docs and should not redefine the status-layer contract on its own.

## Now / Current Baseline

- [x] The repository defines the status-layer contract, schema set, examples, validation guidance, and handoff boundaries.
- [x] The canonical status layout remains filesystem-based under `<run_output_dir>/status/`.
- [x] `run-status.json` remains the required top-level record.
- [x] Expanded layout stays optional via `tasks/<task_id>.json` and `agents/<agent_id>.json`.
- [x] Runtime/plugin is expected to write real status artifacts under `<run_output_dir>/status/` for local inspection.
- [x] Service-backed UI, browser/server-hosted dashboards, remote surfaces, websocket/event-bus delivery, external runtime services, write-back/control actions, and any polling beyond a narrow same-process local file-backed self-refresh mode for an ephemeral loopback-only localhost viewer remain out of scope here.
- [x] This roadmap allows future same-repo read-only `status-cli` continuation without changing the read-only viewer boundary.

## Phase 2 / Same-Repo Read-Only CLI Continuation

Phase 2 in this repository means the next read-only CLI phase under `status-cli/` in this same repo.

- [ ] Continue `status-cli/` as an in-repo read-only contract consumer for local inspection.
- [ ] Keep Phase 2 focused on filesystem-backed inspection of `run-status.json` and optional expanded layout files.
- [ ] Allow terminal-local read-only rendering plus an ephemeral loopback-only localhost read-only viewer mode or self-contained HTML export behavior only when it remains file-backed, local, and non-controlling during the current viewing session.
- [ ] Allow a narrow same-process local polling/self-refresh mode for the same-repo localhost viewer only when it rereads existing local status artifacts and does not introduce watch/daemon, hosted server/platform, remote, write-back, or control behavior.
- [ ] Avoid adding background services, browser/server-hosted UI beyond the bounded localhost viewer mode, service-backed dashboards, remote exposure, or platform/service responsibilities.

## Phase 3 / Later Planning Boundary

Phase 3 is later planning only. It is where follow-on decisions can be prepared before any separate runtime implementation begins.

- [ ] Reconfirm the handoff boundary before proposing any service-backed or remote-integrated work.
- [ ] Decide what the first separate runtime consumer should adopt from this contract.
- [ ] Keep any Phase 3 discussion framed as planning, not as current runtime writing work in this repository.

## Later / Deferred Item (4)

### 1. Dashboard evolution after runtime adoption

- [ ] Revisit whether a future `status-cli` should remain terminal-first plus bounded ephemeral loopback-only localhost viewing with only bounded local self-refresh, or act as a thin entry point into later operator-facing views.
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

- [ ] Decide whether a future `status-cli` reads repo-bound status files directly, reads status from a separate runtime implementation, or supports both modes.
- [ ] Decide where runtime-only concerns stay owned: heartbeat cadence, stale reconciliation, cleanup verification, and multi-writer behavior.
- [ ] Keep those decisions in the runtime boundary discussion unless they require a contract change in this repository first.

## Open Questions

- Which future runtime repository will be the first external consumer of the status-layer contract after Phase 3 planning is complete?
- Should later CLI work target `run-status.json` only first, or require expanded task/agent files immediately?
- What compatibility promise, if any, should exist between CLI behavior and `protocol_version`?
- At what point would packaging/install work be mature enough to justify documenting as supported workflow instead of experimental tooling?

## Implementation Followups

- [ ] Reconfirm the boundary in `STATUS_MVP_HANDOFF.md` before opening any future `status-cli` task.
- [ ] Keep any future CLI proposal explicitly scoped as a same-repo consumer of the existing status-layer contract unless a separate runtime plan says otherwise.
- [ ] If later work needs new fields, layouts, or state meanings, update the protocol docs and schemas in this repository before runtime or CLI implementation proceeds.
- [ ] Keep broad platform, hosted server behavior, browser/server-hosted UI beyond bounded localhost viewing, remote surface, service, watch/daemon, write-back, or control-surface work out of future `status-cli` tasks unless a separate runtime roadmap explicitly owns it.

## Not in Scope From This Roadmap

- Implementing `status-cli`
- Adding a service-backed or remote dashboard in this repository
- Proposing a broad runtime platform buildout
- Changing status-layer entity names, vocabulary, or layout rules without a protocol update
