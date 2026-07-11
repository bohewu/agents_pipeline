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

**Supply Chain Controls**
- Pin `actions/checkout@v5` and `actions/setup-node@v5` by full commit SHA
- Set an explicit `node-version` in `actions/setup-node` for the frontend build job
- Use `persist-credentials: false` on checkout unless a later step truly needs git write access
- Verify downloaded CLI/install assets with checksums when fetched outside package managers
- Keep job `permissions` minimal and disable write scopes by default
- Prefer OIDC for cloud or registry auth over long-lived shared secrets when supported

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
Manual approval before production deploy via protected GitHub `production` environment

**Release Integrity Verification**
- Require tag/version match before release
- Publish image digest and checksum manifest with each release artifact set
- Verify artifact/image digest before promotion from `staging` to `production`
- Generate GitHub Artifact Attestations or equivalent signed provenance when supported
- If attestation is unavailable, document fallback evidence in the runbook

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

**Image Integrity**
- Pin base images by digest where feasible
- Promote immutable image digests instead of mutable tags alone
- Verify pushed image digest matches the built image before deploy
- Keep deploy inputs tied to the approved digest captured in the release job outputs

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

**Pre-Release Verification**
- Confirm release tag matches application version metadata
- Confirm checksum manifest or attestation exists for release artifacts
- Confirm deployment input references the approved image digest, not only a floating tag
- Confirm protected environment approval is recorded before production deploy

**Monitoring**
Container logs + uptime monitor

**Ownership**
App owner on-call
