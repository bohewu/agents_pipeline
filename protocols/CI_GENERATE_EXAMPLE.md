# CI/CD Generated Output Example (High-Level)

This example shows the typical files produced by `/run-ci --generate`.
Content varies by stack and repo layout.

## Expected Files

- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml` (when `--deploy`)
- `Dockerfile` (when `--docker`)
- `docker-compose.yml` (when `--docker`)

## Example Workflow Outline (ci.yml)

```yaml
name: ci
on: [push, pull_request]
jobs:
  build-test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<actions-checkout-v5-full-commit-sha>
        with:
          persist-credentials: false
      - name: Set up Node.js
        uses: actions/setup-node@<actions-setup-node-v5-full-commit-sha>
        with:
          node-version: <project-node-version>
          cache: <package-manager>
      - name: Set up backend/runtime
        run: echo "setup dotnet/other runtime"
      - name: Build
        run: echo "build backend + frontend"
      - name: Test
        run: echo "run tests"
```

## Example Workflow Outline (cd.yml)

```yaml
name: cd
on:
  workflow_dispatch:
  push:
    tags:
      - "v*.*.*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write
      attestations: write
    outputs:
      image_digest: ${{ steps.publish.outputs.digest }}
    steps:
      - uses: actions/checkout@<actions-checkout-v5-full-commit-sha>
        with:
          persist-credentials: false
      - name: Verify tag/version alignment
        run: echo "verify tag matches VERSION/app metadata"
      - name: Build and publish immutable artifact/image
        id: publish
        run: echo "publish and capture digest"
      - name: Generate checksum manifest
        run: echo "write SHA256SUMS for release artifacts"
      - name: Generate attestation/provenance
        run: echo "create GitHub Artifact Attestation or equivalent"

  deploy-production:
    needs: release
    runs-on: ubuntu-latest
    environment: production
    concurrency: production-release
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Verify attestation/checksum/digest before deploy
        run: echo "verify approved immutable release inputs"
      - name: Deploy approved digest
        run: echo "deploy by digest, not floating tag"
```

Generated workflows should also pin third-party actions by full commit SHA, prefer current Node 24-compatible action majors such as `actions/checkout@v5` and `actions/setup-node@v5` when applicable, keep `permissions` minimal, prefer OIDC over long-lived deploy secrets when supported, and add release-time integrity checks such as tag/version validation, checksum or digest verification, protected environment approvals, and provenance/attestation steps when the target stack supports them.
