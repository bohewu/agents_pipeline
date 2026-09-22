# Commit Guard: adoption and reviewer guide

The implementation is `tools/commit-guard.js`; the authoritative behavior and
limits are in `protocols/COMMIT_GUARD.md`. It is a deterministic first-screen, not
complete secret detection. This version does not introduce a validator model role.

## Try a check without installing anything

From the agents_pipeline checkout:

```sh
node tools/commit-guard.js --help
node tools/commit-guard.js check --staged --profile audit --format json
node --test tests/commit-guard.test.js
```

When checking a different repository, run the tool by its absolute location while
keeping the target repository as the current directory. Do not run it from the
tool repository and assume it will discover the intended consumer repository.
For example, set `GUARD` locally to the reviewed tool entry point; do not commit
its machine-specific value:

```sh
cd /path/to/target-repository
node "$GUARD" check --staged --profile legacy-ratchet
node "$GUARD" doctor --format json
```

The `/path/to/...` text is a placeholder, not a command to copy literally. No
check changes tracked files, the Git index, branch refs, or global configuration.
`git write-tree` may write ordinary Git tree objects while snapshotting the index.

## Legacy repository with a simple self-hosted remote

Begin with audit. Once the result is understood, explicitly opt that clone into
legacy-ratchet:

```sh
node "$GUARD" check --staged --profile audit
node "$GUARD" install --profile legacy-ratchet --local-only
node "$GUARD" doctor --format json
```

No server hooks, GitHub account, network connection, or remote API is needed for
these commands. The installer writes two local Git hooks and an owned installation
record, not a tracked policy or `.git/config`. Re-running the same installation is
idempotent. Only this clone is affected; other clones must opt in separately.

The pre-commit hook reads staged blobs. Unchanged old credentials within a modified
file are accepted, but replacement passwords, new copies, and extra occurrences
are blocked. The pre-push hook reads the actual outgoing refs and scans intermediate
commits too. A new remote branch uses a conservative all-ancestry scan and may
rediscover old secrets or exceed the 200-commit bound. Do not interpret that as a
safe reason to bypass: audit a deliberate boundary and plan adoption separately.
Existing hooksPath, foreign hooks, path redirections, or linked/shared worktrees
are refused; use explicit checks or intentional manual hook composition there.

## New GitHub repository

For a clone already reviewed as suitable for strict mode:

```sh
node "$GUARD" install --profile strict --local-only
node "$GUARD" check --staged
```

A repository-owned policy is optional:

```json
{"version": 1, "profile": "strict", "engine": "builtin"}
```

Save it as `.commit-guard.json` only when adopting the policy deliberately. After
reviewing a staged policy-only change, an operator can use
`check --staged --ack-policy-change`. Agents must not use this flag to silently
weaken policy. The current check still uses the previously committed policy. A
successful acknowledgment is bound to the exact HEAD and staged tree, then consumed
once by the managed pre-commit hook; any later index or policy change requires a new
acknowledgment. Invalid staged policy JSON/schema is rejected even when acknowledged.

### Reusable workflow caller

The scanner and reusable workflow must first be reviewed and published. Until
then there is no release SHA to put into a consumer workflow. Replace both
`<PUBLISHED_GUARD_SHA>` placeholders below with the actual reviewed immutable
40-character commit and `<TOOL_OWNER>/<TOOL_REPO>` with its repository. The tool
repository must be readable with the caller's permissions; for cross-repository
use without extra credentials it normally needs to be public.

```yaml
name: Commit Guard
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  guard:
    uses: <TOOL_OWNER>/<TOOL_REPO>/.github/workflows/commit-guard.yml@<PUBLISHED_GUARD_SHA>
    with:
      tool_repository: <TOOL_OWNER>/<TOOL_REPO>
      tool_sha: <PUBLISHED_GUARD_SHA>
      base_sha: ${{ github.event.pull_request.base.sha || github.event.before }}
      head_sha: ${{ github.event.pull_request.head.sha || github.sha }}
      profile: strict
```

The reusable job separately checks out candidate data and the trusted scanner.
It does not execute code from the candidate, use candidate `.commit-guard.json`,
or trust a candidate `.gitleaks.toml` to disable scanning. Its current backend is
explicitly builtin; Gitleaks download/setup is not silently added to CI.
Both input references and runtime arguments are validated and passed through
environment variables, not inserted into shell source. Fetch depth is zero for
the candidate, and missing required base objects fail the scan instead of silently
falling back to a smaller range.

An administrator must configure the reported `guard / validate` check as required
for protected branches and review changes to callers, profiles, and scanner pins.
No branch rule is changed automatically by installing the tool. Required checks
restrict merging; Actions run only after upload and do not undo secret disclosure.
The local pre-push hook is the pre-upload first-screen, but it is bypassable.
GitHub native push protection is separate from this workflow.

## Optional Gitleaks backend

```sh
node "$GUARD" check --staged --profile strict --engine gitleaks-required
```

This adapter expects Gitleaks **8.24.2**, not an arbitrary latest version. Provide a
locally installed binary on PATH, an explicit `--gitleaks-path`, or local
`commitguard.gitleaksPath`. The tool does not install or download a binary.
Its report contains only rule IDs and coordinates; matching text never enters
persistent report files or public command output. Missing engine, incompatible
version, malformed output, and timeouts exit 2, even under audit.

The default builtin mode is useful independently, but its coverage is narrower
than a dedicated scanner. Stub-based contract tests cover failure behavior and
redaction; real-binary compatibility must be verified before claiming a deployment
uses the Gitleaks engine successfully. Never substitute a fake PASS for an
unavailable required engine.

## Result interpretation

| Exit | Meaning |
| --- | --- |
| 0 | Check completed without blocking; may contain audit findings or warnings |
| 1 | High-confidence finding blocked by the effective profile |
| 2 | Runtime/backend/Git/scan-limit failure; no approval |
| 3 | Invalid input, policy, or unsafe installation configuration |

Always inspect `status`, `profiles`, `engines`, `policy_sources`, `coverage`, and
`findings`. Binary/unknown encoding/submodule/symlink-content omissions are explicitly
reported. Finding paths are redacted when they contain a detected sensitive value.
Unsupported archives, obfuscated values, and general semantic credential analysis are
outside v1. No scanner result authorizes a commit the user prohibited.

## Development verification

```sh
node --test tests/commit-guard.test.js
python3 scripts/validate-orchestrator-contracts.py
python3 scripts/validate-helper-contracts.py
git diff --check
```

Git fixture commits and hook installations in the Node suite are disposable and
cleaned up. They do not install hooks or modify configuration in the working
agents_pipeline checkout. Existing runtime support installation copies the tool
and protocol; no custom per-consumer copy or installer fork is needed. Generated
agent projections are regenerated through existing exporters, never hand-edited.

Upstream semantics: [Git hooks](https://git-scm.com/docs/githooks),
[Gitleaks](https://github.com/gitleaks/gitleaks),
[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows),
and [push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).
