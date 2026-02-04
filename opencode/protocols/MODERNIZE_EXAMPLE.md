# Modernize Example (Legacy Web App)

This is a concise example using the `MODERNIZE_TEMPLATES.md` structure.
Adjust content to your system.

---

## modernize/modernize-current-state.md

**System Overview**
Legacy monolith with mixed MVC + Web API layers.

**Key Dependencies**
SQL Server, legacy auth provider, on-prem file storage.

**Architecture Snapshot**
Single codebase, tightly coupled modules.

**Operational Pain Points**
Slow deploys, limited observability, brittle CI.

**Performance Bottlenecks**
Long-running report queries.

**Security/Compliance Gaps**
No centralized secrets management.

**Risks**
High coupling makes refactors risky.

**Open Questions**
Which modules can be decoupled first?

---

## modernize/modernize-target-vision.md

**Target Architecture**
Modular monolith with clear domain boundaries.

**Non-Functional Goals**
Faster deployments, improved observability, predictable scaling.

**Modularity Strategy**
Separate domain modules with explicit interfaces.

**Data Strategy**
Shared DB initially, gradual split by domain.

**Observability Strategy**
Centralized logs, metrics, and tracing.

**Tech Stack Direction**
.NET 10, Vue 3, containerized deployment.

**Key Tradeoffs**
Incremental progress vs immediate service isolation.

**Open Questions**
Can the auth provider be replaced safely?

---

## modernize/modernize-strategy.md

**Migration Strategy**
Incremental refactor with strangler pattern.

**Strangler/Incremental Plan**
Extract reporting module first.

**Refactor vs Rewrite Criteria**
Rewrite only where cost < 2x refactor.

**Dependencies Sequencing**
Auth integration before UI revamp.

**Backward Compatibility**
Maintain old routes during transition.

**Risk Mitigations**
Feature flags and parallel runs.

---

## modernize/modernize-roadmap.md

**Phase 1 Scope**
Reporting module extraction.

**Milestones**
M1 domain split, M2 new API, M3 UI updates.

**Deliverables**
New report service + monitoring.

**Dependencies**
DB schema stabilization.

**Timeline**
8–10 weeks.

**Exit Criteria**
Legacy report module retired.

---

## modernize/modernize-risks.md

**Risk Register**
Data integrity, rollout complexity.

**Operational Risks**
Deploy coordination across modules.

**Security Risks**
Legacy auth constraints.

**Data Risks**
Schema changes affecting old features.

**Mitigations**
Dual writes, progressive rollout.

**Governance**
Weekly checkpoints with stakeholders.
