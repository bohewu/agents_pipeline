# Commit Guard

Commit Guard is a deterministic, offline first-screen for accidental credential,
personal-path, and sensitive-file commits. It is not full SAST, a proof of secret
absence, or a new agent role. Normal checks use no model tokens and never verify
credentials against a provider API.

## Commit-capable workflow contract

This contract applies to executor (including executor-strong through its shared
contract), peon, generalist, and orchestrator version-control helper actions.

1. Check that the user authorized the version-control operation. A no-commit or
   no-push instruction wins; a successful scan never grants permission.
2. Stage only explicitly intended files, when staging is authorized. Do not scan
   the working copy instead of the index. Do not stage additional files to make
   the guard pass.
3. Immediately before committing, run `node tools/commit-guard.js check --staged
   --format json` from the target repository, using the installed tool's absolute
   path when the tool belongs to the global support tree. Inspect the effective
   profile, engine, status, coverage, and findings.
4. Exit 1 (policy block), 2 (scan/runtime failure), or 3 (invalid policy/arguments)
   stops the commit. Never bypass with `--no-verify`, edit a hook, silently select
   audit, or suppress a required backend. Audit intentionally reports without
   blocking findings, but operational failures still stop the operation.
5. The check returns `tree_oid` and rechecks HEAD/index stability during scanning.
   Confirm `git write-tree` still equals that OID immediately before committing.
   After any index-changing formatter/hook/action, rerun the check. This is not an
   atomic lock against concurrent clients or later index-mutating hooks.
6. Before an authorized push, scan the exact outgoing range with
   `node tools/commit-guard.js check --range BASE..TIP`, or use the installed
   pre-push hook, which receives Git's actual ref-update input. Unknown remote
   boundaries are not a reason to skip checks. Never claim that all collaborators
   are enforced by a local hook.
7. Keep outputs redacted. Do not copy raw findings, credential values, full source
   lines, local scanner diagnostics, or credential-bearing remote URLs into
   agent traces, review reports, handoffs, or Git-tracked baseline files. Finding
   paths are also redacted when they contain a detected sensitive value.

The CLI path above is source-relative. Existing runtime-support installation
copies `tools/` and `protocols/` and materializes protocol references. Updating
source does not update an already installed global support tree; installation is
an explicit operator action. Do not reinstall globally as an incidental fix.

## Actual CLI

```sh
node tools/commit-guard.js check --staged --profile strict
node tools/commit-guard.js check --staged --profile legacy-ratchet --format json
node tools/commit-guard.js check --range BASE..TIP --profile strict
node tools/commit-guard.js check --range EMPTY..TIP --profile audit
node tools/commit-guard.js check --pre-push --profile legacy-ratchet < ref-input.txt
node tools/commit-guard.js install --profile legacy-ratchet --local-only
node tools/commit-guard.js doctor --format json
```

These are executable Node entry points, not hypothetical `agents-pipeline`
subcommands. Node.js 18+ and Git are required. There is no `--outgoing`, `--repo`,
TOML configuration parser, archive extraction, arbitrary allowlist, or implicit
engine download in this version. `EMPTY..TIP` is a bounded all-ancestry audit, not
an unlimited history crawler.

## Profiles and scope

| Profile | Existing finding in a changed file | New/replaced/copied occurrence |
| --- | --- | --- |
| audit | Report only | Report only |
| legacy-ratchet | Allow matching occurrence | Block high-confidence finding |
| strict | Block high-confidence finding | Block high-confidence finding |

No configured profile defaults to **audit + builtin**, explicitly reported as
`default-audit`. Known skipped content and low-confidence findings are warnings,
not silent success. Exit 0 can mean audit or warnings; inspect the result payload.

The staged scope scans complete final blobs of changed indexed files, not all
unchanged repository files or the working copy. Strict therefore does not claim
that an entire historic repository is clean. Deleted files introduce no content.
Legacy compares the same path, rule, matched value, and occurrence count against
HEAD, independent of line shifts and CRLF. Values are compared via per-run HMAC
identities in memory, never by persisted unsalted password hashes. Renames are
conservatively new paths and may require manual migration. Copies, extra
occurrences, and replacing an old hard-coded password are blocked.

For ranges, every commit reachable from TIP but not BASE is scanned against its
parents. A merge may allow only the smallest existing same-path count shared by
every parent; debt removed on one parent cannot be reintroduced from another.
Side-branch introductions within the range are still scanned independently. The
range's accepted BASE policy is fixed for that range. A secret added and then
removed before a push is still a finding in the intermediate commit.

Pre-push consumes each `local-ref local-oid remote-ref remote-oid` line. Deletions
introduce no content. Multiple refs are combined. A new tag at exactly the same
commit as a branch updated in the same push uses that branch's known remote base;
the branch's outgoing commits are scanned once. Other new remote refs fall back to
all ancestry of the tip: this can rediscover historical legacy debt and blocks
when limits are exceeded. There is no automatic trusted baseline for a first
push. For legacy adoption on a new remote branch, an operator must plan the
explicit audited boundary; the tool does not infer trust or silently exclude
local outgoing branches. Missing remote objects and shallow history fail closed
instead of scanning an incomplete range.

## Policy and local hooks

Tracked optional policy `.commit-guard.json` uses this exact schema:

```json
{"version": 1, "profile": "strict", "engine": "builtin"}
```

Precedence is explicit CLI, Git config `commitguard.profile` / `commitguard.engine`,
local installation record, committed HEAD/accepted-base policy, then audit/builtin.
Unstaged policy edits are not used. A staged policy addition/change/removal under an
enforcing profile is blocked until an operator explicitly uses
`--ack-policy-change`; the old policy still governs that check. This acknowledgment
is not permission for an agent to weaken policy autonomously. A successful explicit
acknowledgment writes one local, one-time record bound to the exact HEAD, index tree,
and old/new policy identities. The managed pre-commit hook consumes that record;
changing the index or policy requires a new acknowledgment. Audit remains a
non-blocking adoption mode. A staged policy blob is schema-validated even when its
change is acknowledged.

For trusted CI, pass `--policy-source cli --profile strict --engine builtin` to
ignore candidate policies and local overrides completely. The CLI profile is an
operator authority boundary, not an authorization system against a malicious
local user.

`install --profile PROFILE --local-only` is opt-in. It writes only owned
`pre-commit`, `pre-push`, and `commit-guard-local.json` under the clone's Git metadata
directory. Absolute runtime/tool paths stay in this local metadata, never in
tracked policy. Installation does not stage files, change `.git/config`, or set a
global `core.hooksPath`. Doctor is read-only; its status distinguishes missing or
tampered hooks. On POSIX it also requires the recorded runtime to be executable;
it does not perform full engine execution.

Installation preflights both hooks, recognizes owned hooks by recorded hashes,
is idempotent, and rolls back completed writes on failure. Foreign/tampered hooks,
symlink paths, existing `core.hooksPath`, and shared/linked worktrees are refused
rather than overwritten. Use explicit checks or deliberate manual composition in
those configurations. Windows command quoting is implemented, but native Windows
installation must be separately validated before rollout. Hook-only protection is
bypassable; a server without hooks needs no upgrade for this local first-screen,
but cannot compel other machines to run it.

## Engines, privacy, and limits

`builtin` scans credential literals, common provider token formats, private-key
blocks, .NET-style Password/Pwd connection strings, credential URLs, selected dotenv
assignments, and personal/workspace path patterns. Exact known placeholders are
allowed; test/docs directories are never globally exempted. Some internal service
credentials and arbitrary formats will not match these rules.

`--engine gitleaks-required` adds the fixed **8.24.2** adapter contract. Install that
binary separately, then use PATH or `--gitleaks-path EXECUTABLE` (local Git config
`commitguard.gitleaksPath` also works). Missing/incompatible binaries, timeouts,
malformed reports, or backend failures exit 2 even in audit. No automatic download
or API credential verification occurs. The adapter suppresses subprocess stdout and
stderr, uses its own default-rule config and empty ignore file, clears GITLEAKS_*
environment overrides, and ignores inline allow directives. Its temporary report
contains rule IDs and coordinates only; matched spans remain in memory. Gitleaks
ratchet identity uses the returned matched span, so a changed surrounding match can
be conservatively treated as new. Contract tests with a fake binary are not proof
of real-engine integration.

The builtin engine reads UTF-8 and BOM-marked UTF-16. Unknown encodings/binaries,
submodule contents, and symlink targets are not traversed; output marks partial
coverage. Sensitive binary filenames such as PFX/P12 still block. Archives are not
expanded. UNC and generic drive paths are warnings; personal/current-workspace
paths are higher confidence. Encoded/obfuscated secrets and paths may escape a
pattern-based first-screen. Regular system deployment paths are not blanket-blocked.

Limits: 2 MiB per blob, 200 combined commits, 2,000 changed-file scan operations,
2,000 findings, 32 MiB subprocess output, 15 seconds per subprocess (10 seconds for
a Gitleaks scan), and 64 KiB pre-push ref input. Exceeding a hard limit exits 2
(or 3 for malformed/oversized input), never partial approval. Use smaller explicit
ranges for a one-time history audit; ordinary commits scan changed indexed files.

## GitHub consumer integration

`.github/workflows/commit-guard.yml` is a reusable workflow. It checks out the
candidate repository separately from a trusted scanner source pinned to an explicit
immutable commit. The current workflow uses builtin-only screening and an explicit
CLI policy, never the candidate's scanner, ignore configuration, or policy.
See `docs/commit-guard.md` for the caller template.

A reusable workflow and scanner SHA become usable remotely only after those files
have been reviewed and published. Required status checks must be configured by the
repository administrator; this implementation does not change repository rules.
Workflow and scanner-pin modifications themselves require trusted review.

GitHub Actions run after upload. Required checks can block merge, not the first
push's disclosure. Local pre-push is best-effort; GitHub's native push protection is
a separate feature with its own coverage and bypass rules. An internal remote is
not proof that existing credentials are safe: accepted legacy debt should still
have a planned migration and credential rotation when exposure warrants it.
