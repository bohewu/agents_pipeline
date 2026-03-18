# Status Layer MVP Ownership and Runtime Handoff

## Summary

This document explains how the status-layer MVP artifacts in this repository fit together, what this repository owns today, what is explicitly deferred to a future runtime repository, and how the work should progress from the current Phase 0-1 MVP to a later hardened system.

The MVP in this repository is a contract-and-validation deliverable. It defines the status entities, file layout, schemas, examples, and CI checks that a future runtime implementation must consume.
This repository also includes an optional in-repo, read-only `status-cli` for local inspection of status artifacts that follow that contract, and future read-only CLI continuation may stay in this same repo under `status-cli/`, including terminal-local rendering plus a same-repo self-contained local web viewer or HTML export that stays file-backed and non-controlling.
It does **not** implement the external runtime itself.

## Repository Ownership Boundary

### Owned in this repository now

This repository owns the repo-bound status contract and its validation surface:

- protocol documentation that defines the status-layer contract
- JSON schemas for `RunStatus`, `TaskStatus`, and `AgentStatus`
- positive and negative example fixtures for the supported layouts
- validation guidance and default CI enforcement
- the optional in-repo, read-only `status-cli` for local inspection of status artifacts
- future same-repo read-only `status-cli` continuation under `status-cli/`
- this handoff document
- run-local planning artifacts in `.pipeline-output/pipeline/` for review traceability

### Deferred to a future runtime repository

The future runtime repository owns execution-time implementation work, including:

- writing real status files during orchestrated runs
- deciding how runtime code creates, updates, locks, and reconciles status records
- any database/API/service projection of the status entities
- any operational storage, retention, auth, or multi-writer controls
- any operator-facing or customer-facing runtime surfaces
- any runtime-integrated or service-backed tooling beyond the current same-repo read-only `status-cli`, including its local self-contained viewer/export boundary
- any write-back or control actions triggered from repo-local status inspection views

## Explicit MVP Exclusions

The following are **out of MVP scope for this repository** and are deferred to a future runtime repository or later system hardening work:

- browser/server-hosted UI
- service-backed dashboard
- remote dashboard surface
- polling frontend
- websocket or event-bus delivery
- external runtime implementation
- runtime database, API, or service layer
- live orchestration workers beyond the documented contract
- agent or opencode control functions triggered from status views

## MVP Artifact Map

Future implementation teams should review these touchpoints first.

| Path | Purpose | Ownership now |
|---|---|---|
| `opencode/protocols/PIPELINE_PROTOCOL.md` | Source-of-truth protocol details for canonical status files, entities, file layout, and writer responsibilities | This repo |
| `opencode/protocols/PROTOCOL_SUMMARY.md` | Condensed status-layer rules for prompt/global-instruction use | This repo |
| `opencode/protocols/SCHEMAS.md` | Schema inventory plus status fixture set | This repo |
| `opencode/protocols/VALIDATION.md` | Validation gates and required status checks | This repo |
| `opencode/protocols/schemas/run-status.schema.json` | `RunStatus` contract | This repo |
| `opencode/protocols/schemas/task-status.schema.json` | `TaskStatus` contract | This repo |
| `opencode/protocols/schemas/agent-status.schema.json` | `AgentStatus` contract | This repo |
| `opencode/protocols/examples/status-layout.run-only.valid/run-status.json` | Minimal valid run-only fixture | This repo |
| `opencode/protocols/examples/status-layout.expanded.valid/` | Valid expanded-layout fixture set | This repo |
| `opencode/protocols/examples/status-layout.contract.invalid/` | Negative fixtures that must fail validation | This repo |
| `.github/workflows/ci.yml` | Default CI enforcement for schema/example validation | This repo |
| `README.md` | Local validation entry point and contributor guidance | This repo |
| `.pipeline-output/pipeline/problem-spec.json` | Run traceability input | Trace artifact |
| `.pipeline-output/pipeline/dev-spec.json` | Run traceability input | Trace artifact |
| `.pipeline-output/pipeline/dev-spec.md` | Human-readable run traceability input | Trace artifact |
| `.pipeline-output/pipeline/plan-outline.json` | Run traceability input | Trace artifact |
| `.pipeline-output/pipeline/task-list.json` | Run traceability input | Trace artifact |
| `.pipeline-output/pipeline/dispatch-plan.json` | Run traceability input | Trace artifact |

## How the MVP Artifacts Fit Together

1. `PIPELINE_PROTOCOL.md` defines the status-layer semantics: required `run-status.json`, optional expanded `tasks/` and `agents/` files, entity vocabulary, and ownership rules.
2. `PROTOCOL_SUMMARY.md` captures the same contract in lightweight form for orchestration prompts and summaries.
3. `SCHEMAS.md` points to the machine-readable contracts that enforce those entities.
4. The schema files under `opencode/protocols/schemas/` are the normative validation artifacts for runtime consumers.
5. The example directories under `opencode/protocols/examples/` show the accepted layouts and the failure cases the contract must reject.
6. `VALIDATION.md`, `README.md`, and `.github/workflows/ci.yml` define how contributors and automation validate the contract in this repository.
7. The `.pipeline-output/pipeline/` artifacts provide traceability for why the MVP was added and what acceptance/test ids drove the work; they are review inputs, not a runtime service.

## Phase 0-1 MVP Plan (Atomic In-Repo Workstreams)

Phase 0-1 is intentionally limited to repo-owned artifacts and validation.

| Workstream ID | Phase | Atomic outcome | Primary touchpoints |
|---|---|---|---|
| WS-DOCS | Phase 0 | Document the status-layer MVP contract, entity names, layout rules, and ownership boundaries | `opencode/protocols/PIPELINE_PROTOCOL.md`, `opencode/protocols/PROTOCOL_SUMMARY.md` |
| WS-SCHEMAS | Phase 0 | Add machine-readable schemas for `RunStatus`, `TaskStatus`, and `AgentStatus` | `opencode/protocols/schemas/run-status.schema.json`, `opencode/protocols/schemas/task-status.schema.json`, `opencode/protocols/schemas/agent-status.schema.json` |
| WS-EXAMPLES | Phase 0 | Add reviewable positive and negative fixtures for run-only, expanded, and contract-invalid layouts | `opencode/protocols/examples/status-layout.run-only.valid/`, `opencode/protocols/examples/status-layout.expanded.valid/`, `opencode/protocols/examples/status-layout.contract.invalid/` |
| WS-VALIDATION | Phase 1 | Enforce local and CI validation against the status schemas and fixtures | `opencode/protocols/VALIDATION.md`, `README.md`, `.github/workflows/ci.yml` |
| WS-HANDOFF | Phase 1 | Publish implementation handoff guidance that separates repo ownership from deferred runtime responsibilities | `opencode/protocols/STATUS_MVP_HANDOFF.md`, `.pipeline-output/pipeline/` |

### Phase 0 exit condition

Phase 0 is complete when the status contract is documented and machine-readable:

- docs describe the entities and layout rules
- schemas exist for all three status records
- fixtures cover valid and invalid examples

### Phase 1 exit condition

Phase 1 is complete when the contract is consumable and reviewable:

- local validation commands are documented
- CI validates the positive fixtures and rejects the negative fixtures
- implementation handoff guidance exists for a separate runtime team

## Future Runtime Repo Responsibilities

When a separate implementation team starts runtime work, it should treat this repository as the contract source and do the following in its own repo:

1. Read and adopt the schema contracts from `opencode/protocols/schemas/`.
2. Use the positive and negative fixtures as contract-test inputs.
3. Implement real writers for `<output_dir>/status/run-status.json` and, when needed, `tasks/<task_id>.json` and `agents/<agent_id>.json`.
4. Decide runtime-specific behavior for concurrency control, heartbeat updates, stale reconciliation, cleanup verification, and operational storage.
5. Add its own implementation tests without changing MVP scope in this repository.

That runtime repo may later project the same entities into richer systems, but any such implementation should preserve the entity names, required fields, status vocabulary, and layout rules already defined here.

## MVP-to-Hardened Roadmap

### Phase 0-1: Contracted MVP in this repository

Deliver only repo-owned documentation, schemas, fixtures, validation, and handoff material.

### Phase 2: Next same-repo read-only CLI phase

Continue optional read-only `status-cli` work in this repository under `status-cli/` as a local contract consumer only. Keep it file-backed and read-only. Same-repo terminal-local rendering plus a self-contained local web viewer or HTML export are allowed only when they do not become browser/server-hosted, service-backed, or remote surfaces and do not add write-back or control behavior.

### Phase 3: Later planning for separate runtime adoption

Use a later planning phase to decide how the first separate runtime implementation should adopt the contract. This phase is for planning and boundary confirmation, not for runtime writing work in this repository.

### Phase 4: First runtime adoption in a separate runtime repository

Use the repo contract to implement real status writing for orchestrated runs. Keep the output file layout aligned with the current schemas and examples.

### Phase 5: Runtime hardening in the runtime repository

Add operational concerns that are intentionally deferred from the MVP, such as:

- stronger reconciliation and stale-run recovery behavior
- retention and storage policies
- runtime-specific contract tests and failure-injection coverage
- projection into durable stores or service APIs, if needed

### Phase 6: Optional operator-facing surfaces in the runtime repository

Only after runtime writing is stable should a later system consider optional presentation or delivery layers such as:

- dashboards or other UI
- polling frontends
- websocket or event-bus integrations
- external reporting or API consumers

The current in-repo `status-cli` remains a local, read-only contract consumer, including any later same-repo read-only CLI continuation, terminal-local rendering, and self-contained local web viewer or HTML export behavior; richer runtime-facing or service-backed surfaces stay deferred.

These are later consumers of the contract, not part of the MVP contract work in this repository.

## Guidance for Future Reviews

For any future implementation review, check the work in this order:

1. `opencode/protocols/PIPELINE_PROTOCOL.md`
2. `opencode/protocols/PROTOCOL_SUMMARY.md`
3. `opencode/protocols/SCHEMAS.md`
4. `opencode/protocols/schemas/*.schema.json`
5. `opencode/protocols/examples/status-layout.*`
6. `opencode/protocols/VALIDATION.md`
7. `.github/workflows/ci.yml`
8. `.pipeline-output/pipeline/` trace artifacts

If a proposed runtime implementation requires changing the entity contract, layout rules, or validation expectations, update this repository first and treat the runtime repo as downstream.

## Open Followups

- Decide which future runtime repository will be the first consumer of this contract after the later planning phase.
- Decide whether runtime adoption begins with `run-status.json` only or with the expanded layout from day one.
- Keep future runtime UX and transport decisions out of MVP contract updates unless they require a contract change.
