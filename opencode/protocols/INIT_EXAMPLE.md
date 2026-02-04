# Init Example (Generic Web App)

This is a concise example using the `INIT_TEMPLATES.md` structure.
Adjust content to your project.

---

## init/init-brief-product-brief.md

**Problem Statement**
Provide a simple customer portal for account management.

**Target Users**
Existing customers and support staff.

**Goals**
Reduce support tickets and improve self-service.

**Non-Goals**
Billing and payments in phase 1.

**Success Metrics**
20% reduction in support tickets within 3 months.

**Assumptions**
Existing auth system can be reused.

**Open Questions**
Which support workflows need to be exposed?

---

## init/init-architecture.md

**System Overview**
Monolithic web app with modular backend and SPA frontend.

**System Boundaries**
Integrates with existing auth and CRM.

**Core Components**
API, UI, Auth integration, CRM sync.

**Data Flow**
UI -> API -> CRM; async job for sync.

**Tech Stack Choices**
.NET 10, Vue 3 (Vite), PostgreSQL.

**Deployment Topology**
Single container per service, self-hosted.

**Key Tradeoffs**
Faster delivery vs smaller service isolation.

**Risks**
Legacy CRM API rate limits.

**Open Questions**
SLA requirements for sync jobs?

---

## init/init-constraints.md

**Functional Constraints**
Must use existing auth system.

**Non-Functional Requirements**
P95 < 300ms for core endpoints.

**Security & Compliance**
Must meet internal security review.

**Performance Targets**
500 concurrent users.

**Cost Constraints**
Self-hosted, no managed DB.

**Operational Constraints**
Single ops team on-call.

**Risks**
Peak traffic spikes during campaigns.

---

## init/init-structure.md

**Repository Layout**
`/src/Web`, `/src/Api`, `/src/Shared`.

**Naming Conventions**
PascalCase for projects, kebab-case for scripts.

**Environment Strategy**
`dev`, `staging`, `prod`.

**Build/Test/Run Commands**
`dotnet build`, `dotnet test`, `npm run build`.

**Dependency Management**
NuGet + npm.

**Initial Modules**
Accounts, Profile, Support Tickets.

**Repo Standard Files**
- `.gitignore`
- `.env.example`

---

## init/init-roadmap.md

**Phase 1 Scope**
Account profile + support tickets.

**Milestones**
M1 auth integration, M2 UI scaffold, M3 ticket flow.

**Deliverables**
Working portal, docs, CI.

**Dependencies**
CRM API access.

**Timeline**
6 weeks.

**Exit Criteria**
UAT signoff and metrics baseline.
