# Modernize Example (Legacy Web App)

This is a concrete example using the `MODERNIZE_TEMPLATES.md` structure.
Demonstrates proper formatting: executive summary, section numbering, narrative prose, tables with context.

> This example is for a fictional "CorpPortal" ASP.NET MVC 5 monolith being migrated to .NET 10.

---

## modernize/modernize-source-assessment.md

```markdown
# Source Assessment — CorpPortal

> **Source:** `C:\repos\CorpPortal`
> **Target:** `C:\repos\CorpPortal-modernize`

CorpPortal is a .NET Framework 4.8 ASP.NET MVC monolith that serves as the internal employee portal for Corp Inc. The system handles authentication, employee self-service, report generation, and integrations with legacy SOAP services. Migration readiness is moderate — the core CRUD flows are straightforward, but the authentication layer is tightly coupled to Forms Authentication and the reporting module has significant performance issues.

## Table of Contents

1. [Source Project Overview](#1-source-project-overview)
2. [Architecture Snapshot](#2-architecture-snapshot)
3. [Key Dependencies](#3-key-dependencies)
4. [Operational Pain Points](#4-operational-pain-points)
5. [Performance Bottlenecks](#5-performance-bottlenecks)
6. [Security & Compliance Gaps](#6-security--compliance-gaps)
7. [Technical Debt Inventory](#7-technical-debt-inventory)
8. [Migration Readiness Score](#8-migration-readiness-score)
9. [Risks](#9-risks)
10. [Open Questions](#10-open-questions)

## 1. Source Project Overview

The solution `CorpPortal.sln` contains three projects: `CorpPortal.Web` (the MVC app), `CorpPortal.Services` (shared business logic), and `CorpPortal.Common` (utilities). All projects target .NET Framework 4.8. The application is deployed to a single IIS server using Web Deploy, with no containerization or CI/CD pipeline. The virtual directory is `/CorpPortal`, giving all routes the prefix `CorpPortal/{controller}/{action}/{id}`.

The system has been in production for approximately 7 years. The primary development team is 3 developers, with no dedicated DevOps or DBA support.

## 2. Architecture Snapshot

CorpPortal follows a classic ASP.NET MVC layered architecture. Requests enter through IIS, pass through OWIN middleware for authentication, and are routed to MVC controllers. Controllers depend on service classes in `CorpPortal.Services`, which in turn use Entity Framework 6 with EDMX models to access a SQL Server database.

Authentication uses OWIN + Forms Authentication with a custom `IPrincipal` implementation (`CorpPrincipal`) that aggregates user roles from the `user_role` and `role` tables. Session state is stored in-process. The reporting module bypasses the service layer and issues raw ADO.NET queries against a read replica.

Key entry points:
- `AccountController` — login, logout, password change
- `EmployeeController` — employee self-service (profile, leave requests)
- `ReportController` — report generation and export
- `AdminController` — user and role management
- `IntegrationController` — SOAP service proxies for HR and payroll

## 3. Key Dependencies

The following table lists external dependencies by category. Versions are from `packages.config`.

| Category | Dependency | Version | Notes |
|----------|-----------|---------|-------|
| Runtime | ASP.NET MVC | 5.2.9 | Core web framework |
| Runtime | OWIN | 4.2.2 | Middleware pipeline |
| Data | Entity Framework | 6.4.4 | EDMX + T4 code generation |
| Data | SQL Server | 2019 | Primary database |
| Auth | Microsoft.Owin.Security.Cookies | 4.2.2 | Cookie authentication |
| DI | Autofac | 6.0.0 | Dependency injection |
| Integration | WCF Client | N/A | Generated proxies for HR/payroll SOAP services |
| Reporting | EPPlus | 4.5.3 | Excel export |
| Reporting | iTextSharp | 5.5.13 | PDF generation (AGPL license concern) |

## 4. Operational Pain Points

Deployments require manual Web Deploy publish and IIS recycling, causing 2-3 minutes of downtime per deploy. There is no staging environment — changes go directly to production after local testing. Configuration is spread across `Web.config`, `appSettings`, and hardcoded connection strings in `ReportController.cs:47`.

The EDMX model (`CorpPortalModel.edmx`) is the single most fragile artifact in the codebase. Any database schema change requires regenerating the T4 templates, which frequently causes merge conflicts when multiple developers touch the model simultaneously. The EDMX file is over 3,000 lines long and includes entities for all modules regardless of whether they're needed.

## 5. Performance Bottlenecks

The reporting module (`ReportController`) materializes entire result sets into memory before applying filters. The `GenerateMonthlyReport` action (`ReportController.cs:128`) loads all employee records for the fiscal year, then filters in C# — a query that regularly takes 15-30 seconds for organizations with 5,000+ employees.

The EF6 context is created per-request via Autofac, but the `EmployeeController` creates a second context manually in `GetLeaveBalance()` (`EmployeeController.cs:89`), leading to unnecessary connection pool pressure.

## 6. Security & Compliance Gaps

- Connection strings with plaintext passwords in `Web.config:23` and `Web.config:31`.
- MD5 hashing used for password storage (`CorpPortal.Services/AuthService.cs:45`). No salt. No upgrade path.
- iTextSharp 5.x has known CVEs and an AGPL license that may conflict with proprietary deployment.
- Anti-forgery tokens are not consistently applied — `EmployeeController.UpdateProfile (POST)` lacks `[ValidateAntiForgeryToken]`.
- No Content Security Policy headers configured.

## 7. Technical Debt Inventory

| Severity | Item | Location | Impact |
|----------|------|----------|--------|
| High | MD5 password hashing, no salt | `AuthService.cs:45` | Active security vulnerability |
| High | Plaintext connection strings | `Web.config:23,31` | Credential exposure |
| High | EDMX monolith (3000+ lines) | `CorpPortalModel.edmx` | Blocks efficient schema changes |
| Medium | Manual context creation bypassing DI | `EmployeeController.cs:89` | Connection pool pressure |
| Medium | Raw ADO.NET in reporting (no parameterization check needed) | `ReportController.cs:128` | Maintainability, potential SQL injection |
| Medium | No CI/CD pipeline | N/A | Manual deployments, no automated testing |
| Low | Inconsistent null checking patterns | Throughout `CorpPortal.Services` | NullReferenceException risk |
| Low | Dead code in `IntegrationController` | `IntegrationController.cs:200-250` | Confusion, maintenance burden |

## 8. Migration Readiness Score

The following table assesses migration readiness per component. "Readiness" reflects how easily the component can be ported to ASP.NET Core.

| Component | Readiness | Rationale |
|-----------|-----------|-----------|
| AdminController (CRUD) | High | Standard MVC CRUD with minimal System.Web coupling |
| EmployeeController (self-service) | Medium | Some direct context usage to refactor; otherwise standard |
| AccountController (auth) | Low | Deeply coupled to Forms Auth, custom IPrincipal, OWIN pipeline |
| ReportController (reporting) | Low | Raw ADO.NET, EPPlus/iTextSharp dependencies, performance issues |
| IntegrationController (SOAP) | Low | WCF-generated proxies require complete rewrite |

## 9. Risks

- The custom `CorpPrincipal` implementation in `CorpPortal.Services/Security/CorpPrincipal.cs` aggregates roles from multiple tables in a non-standard way. Any migration must preserve the exact role resolution logic or risk authorization regressions.
- The EDMX model includes cross-schema references (HR schema + Portal schema in the same context). Splitting these for EF Core may surface hidden query dependencies.
- The reporting module's ADO.NET queries use `dbo.` prefix hardcoding, which may not work if the target uses a different schema strategy.

## 10. Open Questions

- Is the iTextSharp AGPL license currently compliant with Corp Inc's licensing policy? If not, we may need to replace it during migration regardless of scope.
- Are the SOAP services (HR/payroll) scheduled for their own modernization? If so, we could defer the integration migration entirely.
- What is the acceptable downtime window for the final cutover?
```

---

## modernize/modernize-target-design.md

```markdown
# Target Design — CorpPortal

> **Source:** `C:\repos\CorpPortal`
> **Target:** `C:\repos\CorpPortal-modernize`

The target system will be a container-first ASP.NET Core MVC application on .NET 10, structured as a modular monolith with clear domain boundaries for auth, employee self-service, and administration. Phase 1 focuses on core authentication and admin CRUD — deferring reporting and SOAP integration modernization to Phase 2+. The target uses EF Core with a single application context, built-in DI, and cookie-based authentication replacing the legacy Forms Auth + custom IPrincipal stack.

## Table of Contents

1. [Target Project Overview](#1-target-project-overview)
2. [Target Architecture](#2-target-architecture)
3. [Directory Layout](#3-directory-layout)
4. [Tech Stack Choices](#4-tech-stack-choices)
5. [Non-Functional Goals](#5-non-functional-goals)
6. [Modularity Strategy](#6-modularity-strategy)
7. [Data Strategy](#7-data-strategy)
8. [Observability Strategy](#8-observability-strategy)
9. [API Contract with Source (During Migration)](#9-api-contract-with-source-during-migration)
10. [Key Tradeoffs](#10-key-tradeoffs)
11. [Open Questions](#11-open-questions)

## 1. Target Project Overview

The target project `CorpPortal-modernize` is a new ASP.NET Core application that will replace the legacy `CorpPortal` system. During migration, both systems run in parallel — the legacy system continues serving production traffic for components not yet migrated, while the target system takes over route-by-route as each migration slice is validated.

Phase 1 scope is restricted to:
- Authentication (login, logout, session management)
- Admin user/role management (CRUD)
- Application shell (home, error pages)

Explicitly excluded from Phase 1: reporting, employee self-service, SOAP integrations.

## 2. Target Architecture

The target follows a modular monolith pattern with three internal modules: `Auth`, `Admin`, and `Shell`. Each module owns its controllers, services, and EF entity configurations. All modules share a single `AppDbContext` but maintain clear ownership boundaries for their entities.

The request pipeline uses ASP.NET Core middleware for:
1. Request logging and correlation ID injection
2. Cookie authentication via `CookieAuthenticationHandler`
3. Authorization policy enforcement
4. MVC routing with `PathBase("/CorpPortal")` to preserve legacy URL structure

## 3. Directory Layout

```
CorpPortal-modernize/
├── src/
│   ├── CorpPortal.Web/           # ASP.NET Core MVC host
│   │   ├── Controllers/
│   │   │   ├── AccountController.cs
│   │   │   ├── AdminController.cs
│   │   │   ├── HomeController.cs
│   │   │   └── ErrorController.cs
│   │   ├── Views/
│   │   ├── Middleware/
│   │   └── Program.cs
│   ├── CorpPortal.Core/          # Shared domain + services
│   │   ├── Auth/
│   │   ├── Admin/
│   │   └── Common/
│   └── CorpPortal.Data/          # EF Core context + entities
│       ├── AppDbContext.cs
│       ├── Entities/
│       └── Configurations/
├── tests/
│   ├── CorpPortal.Tests.Unit/
│   └── CorpPortal.Tests.Integration/
├── Dockerfile
└── docker-compose.yml
```

## 4. Tech Stack Choices

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Runtime | .NET | 10 | LTS, container-first support |
| Web | ASP.NET Core MVC | 10 | Familiar MVC pattern for team, low learning curve |
| Data | EF Core | 10 | Direct migration path from EF6 entities |
| Auth | Cookie Authentication | Built-in | Replaces Forms Auth; custom claims replace CorpPrincipal |
| DI | Microsoft.Extensions.DI | Built-in | Replaces Autofac; simpler, fewer dependencies |
| Config | Microsoft.Extensions.Configuration | Built-in | Replaces Web.config; supports environment variables and secrets |
| Container | Docker | Latest | Standardized deployment, eliminates IIS dependency |

## 5. Non-Functional Goals

- **Startup time:** < 5 seconds cold start in container.
- **Request latency:** P95 < 200ms for auth and admin CRUD actions (excluding reporting, which is Phase 2).
- **Deployment:** Zero-downtime rolling deployment via container orchestration.
- **Security:** No plaintext secrets in config; all credentials via environment variables or secret manager.

## 6. Modularity Strategy

The application is a single deployable unit but internally organized by capability. Module boundaries are enforced by namespace convention and EF entity ownership rules:

- `Auth` module owns: `User`, `UserRole`, `Role` entities and all authentication/authorization logic.
- `Admin` module owns: user management CRUD operations. Depends on `Auth` for identity resolution.
- `Shell` module owns: Home and Error controllers. No data dependencies.

Cross-module data access is prohibited at the service layer. If Module A needs data from Module B, it calls Module B's service interface.

## 7. Data Strategy

The target shares the same SQL Server database as the legacy system during migration. No schema changes are introduced in Phase 1 — EF Core entity configurations map directly to the existing table structure.

A single `AppDbContext` replaces the legacy EDMX. Entity configurations are split by module using `IEntityTypeConfiguration<T>` to maintain ownership boundaries within the single context.

Key mapping considerations:
- The legacy `user_id` column uses `char(10)` with space-padding. EF Core value converters will trim trailing spaces transparently.
- The `security_contact` table is read-only in Phase 1 — used for auth context enrichment but not managed by any Phase 1 controller.

## 8. Observability Strategy

Structured logging via `Microsoft.Extensions.Logging` with Serilog sink for JSON output. Every request gets a correlation ID injected via middleware. Key instrumentation points:

- Auth events: login success/failure, logout, session expiry, identity change
- Admin operations: user create/edit/delete with actor and target user IDs
- Error rates: 4xx/5xx by controller and action
- DB latency: EF Core query timing via interceptor

Health checks expose `/health/live` (app running) and `/health/ready` (DB reachable).

## 9. API Contract with Source (During Migration)

During Phase 1, both systems share the same database and the same URL prefix (`/CorpPortal/`). Traffic routing is handled at the reverse proxy level:

- Migrated routes (Account, Admin, Home, Error) → target container
- Non-migrated routes (Employee, Report, Integration) → legacy IIS

There is no API-level communication between the two systems. They operate independently against the shared database with the constraint that neither system modifies schema.

## 10. Key Tradeoffs

| Tradeoff | What We Gain | What We Give Up |
|----------|-------------|-----------------|
| Single context (not per-module) | Simpler setup, easier cross-entity queries | Module isolation at the data layer |
| Shared database during migration | No data sync complexity | Schema frozen during Phase 1 |
| Cookie auth (not JWT/OAuth2) | Simpler migration from Forms Auth | Must add OAuth2 in Phase 2 |
| Deferred reporting module | Phase 1 stays focused and achievable | Reporting pain points persist longer |

## 11. Open Questions

- Should the target use Razor Pages or MVC Views? The team is familiar with MVC, but Razor Pages may be simpler for CRUD-heavy admin screens.
- Container orchestration choice (Docker Compose vs. Kubernetes) needs infrastructure team input.
```

---

## modernize/modernize-migration-strategy.md

```markdown
# Migration Strategy — CorpPortal

> **Source:** `C:\repos\CorpPortal`
> **Target:** `C:\repos\CorpPortal-modernize`

We will use an incremental strangler-fig migration, building the target system route-by-route while the legacy system continues serving production traffic for non-migrated components. Each migration slice covers a controller group with independent cutover and rollback. The strategy prioritizes authentication first (highest risk, deepest System.Web coupling), followed by admin CRUD, then the application shell.

## Table of Contents

1. [Migration Approach](#1-migration-approach)
2. [Strangler Fig Boundaries](#2-strangler-fig-boundaries)
3. [Refactor vs. Rewrite Decisions](#3-refactor-vs-rewrite-decisions)
4. [Parallel-Run Strategy](#4-parallel-run-strategy)
5. [Data Migration Plan](#5-data-migration-plan)
6. [Backward Compatibility](#6-backward-compatibility)
7. [Cutover Criteria](#7-cutover-criteria)
8. [Rollback Plan](#8-rollback-plan)
9. [Dependencies Sequencing](#9-dependencies-sequencing)
10. [Risk Mitigations](#10-risk-mitigations)
11. [Open Questions](#11-open-questions)

## 1. Migration Approach

The migration follows a strangler-fig pattern: the target system grows route-by-route while the legacy system shrinks. A reverse proxy (nginx or Traefik) routes traffic between the two systems based on URL path. This was chosen over big-bang rewrite because:

- The team is small (3 developers) and cannot afford a parallel full-rewrite effort.
- The legacy system must remain operational throughout migration — there is no maintenance window for a cutover.
- Incremental migration allows validating each component independently before moving to the next.

## 2. Strangler Fig Boundaries

Traffic is split at the reverse proxy by URL path. The following table shows the planned migration order:

| Slice | Controllers/Routes | Prerequisite | Rationale |
|-------|-------------------|--------------|-----------|
| S1 | HomeController, ErrorController (`/CorpPortal/Home/*`, `/CorpPortal/Error/*`) | None | Foundation — validates routing, PathBase, and container hosting work correctly |
| S2 | AccountController (`/CorpPortal/Account/*`) | S1 stable | Core auth — must be migrated before any controller that requires authentication |
| S3 | AdminController (`/CorpPortal/Admin/*`) | S2 stable | Depends on auth; validates the full request-auth-data pipeline |

Each slice is cut over independently. S1 can be rolled back without affecting S2 or S3.

## 3. Refactor vs. Rewrite Decisions

The following table maps each legacy component to a refactor-vs-rewrite recommendation. The decision criteria are: (a) coupling to System.Web APIs, (b) complexity of business logic, (c) whether the component has known issues that justify starting fresh.

| Area | Decision | Criteria Applied | Notes |
|------|----------|-----------------|-------|
| HomeController / ErrorController | Refactor | Low coupling, simple logic | Copy view models and views; update base classes |
| AccountController business logic | Refactor | Business logic is stable and must be preserved | Keep login/role resolution logic; adapt to new auth APIs |
| Forms Auth + CorpPrincipal | Rewrite | Deep System.Web coupling, no Core equivalent | Replace with CookieAuthenticationHandler + ClaimsPrincipal |
| EDMX / T4 models | Rewrite | EDMX not supported on .NET 10 | Recreate as EF Core entity configs + POCO classes |
| AdminController CRUD | Refactor | Standard MVC CRUD, low risk | Adapt to new context and DI |
| ReportController | Defer | High complexity, known perf issues, Phase 2 scope | Leave in legacy system |
| IntegrationController (SOAP) | Defer | WCF client rewrite needed, Phase 3 scope | Leave in legacy system |

## 4. Parallel-Run Strategy

Both systems run simultaneously against the same database. The reverse proxy directs traffic based on route prefix:

- **Migrated routes** → `http://corpportal-target:8080/`
- **Legacy routes** → `http://corpportal-legacy:80/`

Auth cookies are shared between systems using the same machine key / data protection key ring. This allows a user to authenticate on the target system and have their session recognized by the legacy system (and vice versa).

## 5. Data Migration Plan

No data migration is required in Phase 1. Both systems read and write the same database. Schema changes are frozen — neither system may alter table structure without formal blocker approval.

In Phase 2+, when the reporting module migrates, we may introduce read replicas or materialized views, but that decision is deferred.

## 6. Backward Compatibility

- All existing routes under `/CorpPortal/` continue to work throughout migration.
- The URL structure does not change — the target system uses `PathBase("/CorpPortal")` to preserve the prefix.
- Auth cookies must be interoperable between legacy and target systems during the parallel-run period.
- Any client-side JavaScript that calls legacy API endpoints must continue to work unchanged.

## 7. Cutover Criteria

Each slice has measurable cutover criteria that must be met before production traffic is switched:

| Criteria | Threshold | Measurement |
|----------|-----------|-------------|
| Route parity | 100% of legacy routes respond with equivalent status codes and response structure | Automated comparison tests |
| Error rate | ≤ legacy baseline | Monitoring dashboard comparison over 48 hours |
| Latency | P95 ≤ legacy P95 + 20% | APM comparison |
| Auth parity | Login success rate ≥ legacy baseline | Auth event log comparison |
| Rollback tested | Rollback procedure executed successfully in staging | Drill record |

## 8. Rollback Plan

Each slice can be rolled back independently by changing the reverse proxy route mapping. Rollback procedure:

1. Update reverse proxy config to route affected paths back to legacy system.
2. Reload proxy config (zero-downtime reload).
3. Verify affected routes serve from legacy system.
4. Investigate and fix issues in target system.
5. Re-cutover when ready.

**Rollback triggers** (any of these triggers rollback):
- Error rate on migrated routes exceeds legacy baseline by > 2%.
- Auth cookie interoperability failures (users forced to re-login).
- Data corruption or inconsistency detected.
- Latency P95 exceeds legacy by > 50%.

## 9. Dependencies Sequencing

```
S1 (Home/Error) → S2 (Account) → S3 (Admin)
                                     ↓
                               Phase 1 Complete
```

S1 must be stable before S2 because S2 depends on the container hosting and routing infrastructure validated by S1. S2 must be stable before S3 because S3 requires authenticated requests.

## 10. Risk Mitigations

| Risk ID | Mitigation | Owner |
|---------|-----------|-------|
| R1 (secret exposure) | Move all secrets to environment variables before S1 cutover | DevOps |
| R2 (auth migration) | Build auth parity test suite comparing legacy and target login flows | QA |
| R3 (EF Core query drift) | Run query comparison tests for all core entity queries | Dev |
| R5 (scope creep) | Enforce deferred-scope list in roadmap; weekly scope review | Tech Lead |

## 11. Open Questions

- Can the reverse proxy configuration be managed via CI/CD, or does it require manual intervention?
- How will the shared auth cookie work if the legacy and target systems are on different subdomains?
```

---

## modernize/modernize-migration-roadmap.md

```markdown
# Migration Roadmap — CorpPortal

> **Source:** `C:\repos\CorpPortal`
> **Target:** `C:\repos\CorpPortal-modernize`

The migration is organized into 4 phases over approximately 10-14 weeks. Phase 0 establishes the container baseline and project scaffold. Phase 1 migrates core authentication and the admin CRUD surface in three slices. Phase 2 covers the reporting module, and Phase 3 handles SOAP integration modernization. Each phase is gated by parity verification before cutover.

## Table of Contents

1. [Phase Overview](#1-phase-overview)
2. [Phase 0: Target Scaffold](#2-phase-0-target-scaffold)
3. [Phase 1: Core Migration](#3-phase-1-core-migration)
4. [Phase 2: Reporting Module](#4-phase-2-reporting-module)
5. [Phase 3: Integration Modernization](#5-phase-3-integration-modernization)
6. [Cutover Phase](#6-cutover-phase)
7. [Parallel-Run Period](#7-parallel-run-period)
8. [Decommission Plan](#8-decommission-plan)
9. [Deferred Scope](#9-deferred-scope)
10. [Milestones](#10-milestones)
11. [Dependencies](#11-dependencies)
12. [Exit Criteria](#12-exit-criteria)
13. [Open Questions](#13-open-questions)

## 1. Phase Overview

| Phase | Focus | Duration | Key Deliverable |
|-------|-------|----------|-----------------|
| 0 | Scaffold | 1-2 weeks | Container baseline, CI/CD, project structure |
| 1 | Core auth + admin | 4-6 weeks | S1-S3 migrated, auth parity verified |
| 2 | Reporting | 3-4 weeks | Report module migrated, EPPlus/iText replaced |
| 3 | Integrations | 2-3 weeks | SOAP clients replaced with HTTP/gRPC |

## 2. Phase 0: Target Scaffold

**Duration:** 1-2 weeks

Deliverables:
- New `CorpPortal-modernize` repository with directory structure per target design
- Dockerfile and docker-compose.yml for local development
- CI pipeline: build → test → container image
- Reverse proxy configuration (dev/staging) routing all traffic to legacy
- EF Core context with entity configurations matching existing schema
- Health check endpoints (`/health/live`, `/health/ready`)

**Exit criteria:** Target app starts in container, connects to existing DB, responds to health checks.

## 3. Phase 1: Core Migration

**Duration:** 4-6 weeks (3 slices)

### Slice 1: Home/Error (Week 1-2)
- Migrate HomeController and ErrorController
- Validate PathBase routing preserves `/CorpPortal/` prefix
- Parity tests: all S1 routes return expected status codes and views

### Slice 2: Account Auth (Week 2-4)
- Implement cookie authentication replacing Forms Auth
- Map CorpPrincipal role aggregation to ClaimsPrincipal claims
- Anti-forgery token configuration
- Parity tests: login/logout/session flows match legacy behavior

### Slice 3: Admin CRUD (Week 4-6)
- Migrate AdminController with EF Core queries
- Authorization policies matching legacy role checks
- Parity tests: all admin CRUD operations produce identical results

**Exit criteria:** All S1-S3 routes serve from target system with verified parity. Rollback procedures tested in staging.

## 4. Phase 2: Reporting Module

**Duration:** 3-4 weeks (planned, not started)

Scope: Migrate ReportController, replace EPPlus/iTextSharp with licensed alternatives, optimize the monthly report query (currently 15-30 second response time).

## 5. Phase 3: Integration Modernization

**Duration:** 2-3 weeks (planned, not started)

Scope: Replace WCF-generated SOAP clients with HTTP or gRPC clients. Depends on whether the upstream HR/payroll services have REST endpoints available.

## 6. Cutover Phase

After all phases complete, the final cutover involves:
1. Route all traffic through target system
2. Run parallel monitoring for 1 week
3. Decommission legacy IIS deployment

## 7. Parallel-Run Period

During each phase, both systems run simultaneously. The parallel-run period for each slice is 1 week minimum after cutover before the next slice begins. Full parallel-run (all traffic on target, legacy on standby) lasts 2 weeks after final phase.

## 8. Decommission Plan

After the parallel-run period with zero rollbacks:
1. Remove reverse proxy routing to legacy system
2. Archive legacy IIS deployment configuration
3. Mark legacy repository as read-only
4. Retain database backup from pre-migration as recovery point

## 9. Deferred Scope

The following items are explicitly excluded from Phase 1 and scheduled for later phases. They must not be pulled into Phase 1 scope without formal approval.

| Item | Type | Rationale for Deferral | Target Phase |
|------|------|----------------------|--------------|
| ReportController | Controller | High complexity, performance issues, EPPlus/iText dependency | Phase 2 |
| EmployeeController | Controller | Large surface area, low migration risk, can wait | Phase 2 |
| IntegrationController | Controller | WCF client rewrite needed, depends on upstream service availability | Phase 3 |
| SOAP service proxies | Integration | Complete protocol rewrite required | Phase 3 |
| iTextSharp license replacement | Dependency | Blocked on legal review | Phase 2 |

**Exclusion statement:** These items are NOT part of Phase 1 delivery. The legacy system continues to serve these routes unchanged throughout Phase 1.

## 10. Milestones

| Milestone | Trigger | Gate Owner |
|-----------|---------|-----------|
| M0: Scaffold approved | Target app boots, connects to DB, passes health checks | Tech Lead |
| M1: S1 cutover | Home/Error parity tests pass, routing validated | Tech Lead |
| M2: S2 cutover | Auth parity tests pass, cookie interop validated | Security Lead |
| M3: S3 cutover | Admin CRUD parity tests pass, role authorization validated | QA Lead |
| M4: Phase 1 complete | All S1-S3 stable for 1 week, no rollbacks triggered | Tech Lead |

## 11. Dependencies

- Infrastructure team must provision container hosting environment (Phase 0 blocker).
- Security team must approve cookie auth implementation before S2 cutover.
- DBA must confirm EF Core entity mappings match existing schema (Phase 0).

## 12. Exit Criteria

The modernization is complete when:
- All legacy routes are served by the target system.
- The parallel-run period completes with zero rollbacks.
- The legacy IIS deployment is decommissioned.
- All deferred items are either migrated or formally cancelled.

## 13. Open Questions

- What is the target container hosting environment (Docker Compose on VM vs. Kubernetes)?
- Can Phase 2 and Phase 3 run in parallel, or are they sequential?
```

---

## modernize/modernize-migration-risks.md

```markdown
# Migration Risks & Governance — CorpPortal

> **Source:** `C:\repos\CorpPortal`
> **Target:** `C:\repos\CorpPortal-modernize`

The highest risks in this migration are the custom authentication migration (Forms Auth + CorpPrincipal to ASP.NET Core cookie auth + ClaimsPrincipal) and the shared-database constraint during parallel operation. A lightweight weekly review with three gate checkpoints governs scope, security, and cutover decisions. Four high-priority risks and two medium-priority risks have been identified, with plaintext secret exposure requiring immediate remediation.

## Table of Contents

1. [Risk Register](#1-risk-register)
2. [Dual-System Risks](#2-dual-system-risks)
3. [Data Consistency Risks](#3-data-consistency-risks)
4. [Cutover Risks](#4-cutover-risks)
5. [Rollback Scenarios](#5-rollback-scenarios)
6. [Operational Risks](#6-operational-risks)
7. [Security Risks](#7-security-risks)
8. [Mitigations](#8-mitigations)
9. [Governance Model](#9-governance-model)
10. [Open Questions](#10-open-questions)

## 1. Risk Register

The following table summarizes all identified risks. Each risk has a unique ID for cross-referencing in the strategy and roadmap documents.

| ID | Risk | Likelihood | Impact | Priority | Owner |
|----|------|-----------|--------|----------|-------|
| R1 | Plaintext secrets in Web.config exposed during migration | High | Critical | Critical | DevOps |
| R2 | CorpPrincipal → ClaimsPrincipal mapping loses role resolution fidelity | High | High | High | Security Lead |
| R3 | EF Core query behavior differs from EF6 for edge cases (e.g. char padding, null handling) | Medium | High | High | Dev Lead |
| R4 | Deferred modules have hidden runtime dependencies on core components | Medium | High | High | Tech Lead |
| R5 | Auth cookie interoperability fails between legacy and target during parallel run | Medium | Medium | Medium | Dev Lead |
| R6 | Scope creep pulls deferred modules into Phase 1 | High | Medium | Medium | Tech Lead |

## 2. Dual-System Risks

Running both systems simultaneously introduces operational complexity. The reverse proxy becomes a single point of failure — if the proxy misconfigures route mappings, users may be directed to the wrong system. Additionally, monitoring and alerting must cover both systems during the parallel-run period, effectively doubling the operational surface area.

The shared auth cookie is a specific interoperability risk: if the data protection key ring configuration differs between legacy and target, users will be forced to re-authenticate when traffic switches between systems.

## 3. Data Consistency Risks

Both systems read and write the same database, so there is no data replication or sync risk in Phase 1. However, if a future phase introduces schema changes, the legacy system may break. The schema-freeze constraint mitigates this, but it also means we cannot fix performance issues that require schema changes until the legacy system is fully decommissioned.

The `char(10)` user_id column with space-padding is a specific consistency risk. EF Core's default string comparison behavior differs from EF6 — queries that previously worked with padded strings may fail or return unexpected results.

## 4. Cutover Risks

The primary cutover risk is silent behavioral differences — routes that return the same HTTP status code but with subtly different response content (e.g. different error messages, different redirect targets). Automated parity tests catch structural differences but may miss semantic ones.

## 5. Rollback Scenarios

| Scenario | Trigger | Rollback Action | Recovery Time |
|----------|---------|----------------|---------------|
| S1 routing failure | 404 rate on Home/Error routes exceeds baseline + 2% | Reroute S1 paths to legacy via proxy config reload | < 2 minutes |
| S2 auth failure | Login success rate drops > 1% below baseline | Reroute Account paths to legacy; invalidate target-issued cookies | < 5 minutes |
| S3 admin data issue | Admin CRUD write produces incorrect data | Reroute Admin paths to legacy; manual data correction if needed | < 10 minutes |
| Full rollback | Multiple slice failures or data corruption | Reroute all traffic to legacy; investigate target system offline | < 2 minutes |

## 6. Operational Risks

The development team is 3 people with no dedicated DevOps. Container hosting, reverse proxy configuration, and monitoring setup are outside the team's current skillset. The infrastructure team will need to provide support for Phase 0 scaffold and ongoing operations.

## 7. Security Risks

- **R1 (Critical):** Plaintext connection strings in `Web.config:23,31` are the highest-priority item. These must be externalized to environment variables before any container deployment, as container images may be stored in registries with broader access than the legacy IIS server.
- **R2 (High):** The CorpPrincipal role aggregation logic queries multiple tables and applies custom business rules. If the ClaimsPrincipal mapping doesn't exactly reproduce this logic, users may gain or lose access to functionality. This is an authorization bypass risk.
- MD5 password hashing (`AuthService.cs:45`) must be replaced with bcrypt/Argon2, with a legacy-hash verification + upgrade-on-login path for existing passwords.

## 8. Mitigations

| Risk ID | Action | Owner | Deadline | Verification |
|---------|--------|-------|----------|-------------|
| R1 | Move all secrets to environment variables; scan for remaining hardcoded secrets | DevOps | Before Phase 0 complete | Secret scanning tool reports zero findings |
| R2 | Build claim-by-claim comparison test: legacy CorpPrincipal vs target ClaimsPrincipal for 100 representative users | Security Lead | Before S2 cutover | Test report shows 100% match |
| R3 | Run EF Core vs EF6 query comparison for all core entity queries; document and fix divergences | Dev Lead | Before S2 cutover | Query comparison report with zero divergences |
| R4 | Audit all core controllers for imports/references to deferred module namespaces | Tech Lead | Before S1 cutover | Audit report with zero cross-module references |
| R5 | Test cookie interop in staging with traffic switching between both systems | Dev Lead | Before S2 cutover | Staging test passes — user stays authenticated across switch |
| R6 | Weekly scope review against deferred-scope list in roadmap | Tech Lead | Ongoing | No deferred items appear in sprint backlog |

## 9. Governance Model

Keep governance lightweight:

- **Weekly standup (30 min):** Review migration progress, check risk register, verify scope discipline.
- **Gate reviews:** Three formal checkpoints — Phase 0 complete (scaffold), Phase 1 S2 complete (auth), Phase 1 complete (all slices). Each gate requires parity test evidence and sign-off from Tech Lead + Security Lead.
- **Escalation:** If a blocker cannot be resolved within 2 business days, escalate to Engineering Manager.
- **Scope changes:** Any request to add deferred items to Phase 1 requires written justification and approval from Tech Lead. Default answer is "no."

## 10. Open Questions

- Should we invest in automated parity testing infrastructure (comparing legacy and target responses side-by-side), or are manual test scripts sufficient for the 26-route Phase 1 scope?
- What is the on-call expectation during the parallel-run period — does the team need to cover both systems?
```
