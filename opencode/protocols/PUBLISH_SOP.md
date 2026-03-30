# Publish SOP (CI/CD)

This SOP describes the minimal steps to release using the CI/CD planning pipeline.

## Prerequisites

- `/run-pipeline` completed with reviewer pass
- `ci/` docs exist and are up to date

## Publish Flow

1) Update CI/CD plan (if needed)
   - `/run-ci` (docs-only)
2) Generate configs (if needed)
   - `/run-ci --generate --github --docker --deploy`
3) Review generated files
4) Verify release integrity controls
   - Confirm workflow actions are pinned appropriately
   - Confirm tag/version alignment and artifact or image digest/checksum outputs
   - Confirm any provenance or attestation evidence required by the plan
   - Confirm protected environment approval requirements are satisfied before production deploy
5) Merge to `main`
6) Deploy (self-host)
   - `docker compose pull`
   - `docker compose up -d`

## Rollback

- Use previous image tag and re-run `docker compose up -d`
- Capture the incident in `ci/runbook.md`
