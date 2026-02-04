# CI/CD Example (.NET 10 + Vue 3 Vite)

This is a concrete example using the `CI_TEMPLATES.md` structure.
Paths and commands are illustrative; adjust to your repo layout.

---

## ci/ci-plan.md

**Target Platforms**
Ubuntu latest (GitHub Actions)

**Build Matrix**
.NET 10 SDK, Node 20 LTS

**Lint**
- Backend: `dotnet format --verify-no-changes`
- Frontend: `npm run lint` (if ESLint configured)

**Unit Tests**
- Backend: `dotnet test -c Release`
- Frontend: `npm run test` (Vitest)

**Integration Tests**
N/A (add when API integration suite exists)

**E2E Tests**
Optional: Playwright on `main` or nightly

**Caching Strategy**
- `~/.nuget/packages`
- `~/.npm`

**Artifacts**
- Build logs
- Test reports (if configured)

**Failure Policy**
- Lint or test failures block merge

---

## ci/cd-plan.md

**Release Triggers**
Merge to `main` and manual `workflow_dispatch`

**Environments**
`staging` (optional), `production`

**Promotion Strategy**
Promote `staging` image tag to `production`

**Rollback Strategy**
Re-deploy previous image tag

**Secrets Management**
GitHub Actions secrets for registry and SSH

**Approvals**
Manual approval before production deploy

**Risk Notes**
Deployment depends on self-host availability

---

## ci/docker-plan.md

**Images**
- `app-web` (ASP.NET Core)
- `app-frontend` (Nginx + Vite build output)

**Build Strategy**
Multi-stage Dockerfiles, build on CI

**Runtime Configuration**
Environment variables for API URLs and auth

**Ports**
Web: 8080, Frontend: 80

**Volumes**
N/A (add for persistent storage)

**Health Checks**
HTTP GET `/health`

**Registry**
GitHub Container Registry

---

## ci/runbook.md

**Manual Deploy Steps**
1. `docker compose pull`
2. `docker compose up -d`

**Smoke Checks**
- Open landing page
- Call `/health`

**Rollback Steps**
1. Pin previous image tag
2. `docker compose up -d`

**Monitoring**
Container logs + uptime monitor

**Ownership**
App owner on-call
