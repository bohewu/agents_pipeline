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
    steps:
      - uses: actions/checkout@v4
      - name: Set up runtime
        run: echo "setup dotnet/node"
      - name: Build
        run: echo "build backend + frontend"
      - name: Test
        run: echo "run tests"
```

This is a shape example only; use `/run-ci --generate` to create real workflows.
