# TASK_BREAKDOWN — Implementation order

## Phase 0 — Read and lock scope

1. Read `README.md`。
2. Read `CHANGELOG_FROM_V2.md`。
3. Confirm implementation is general installable local web client。
4. Search existing repo for any previous `web/` v2 implementation and remove/replace wrong assumptions。
5. Confirm no `status-runtime` feature is added.

Deliverable: short implementation note in PR summary.

## Phase 1 — Package scaffold

Create self-contained package:

```text
apps/opencode-web-client/
```

Tasks:

- package.json with scripts:
  - `dev`
  - `build`
  - `typecheck`
  - `test`
  - `lint`
- Vite React app。
- Node server entry。
- CLI entry `opencode-codex-web`。
- build output layout `dist/bin`, `dist/server`, `dist/client`, `dist/assets`。

Acceptance:

```bash
pnpm --filter opencode-web-client build
node apps/opencode-web-client/dist/bin/opencode-codex-web.js --no-open --port 45678
curl http://127.0.0.1:45678/api/health
```

## Phase 2 — Installer integration

Implement installer component:

- `install.sh web-client`
- dry-run。
- force。
- uninstall。
- install manifest。
- OpenCode assets install。
- executable shim。

Acceptance:

```bash
./install.sh web-client --dry-run
./install.sh web-client
opencode-codex-web --help
```

## Phase 3 — App paths and diagnostics

Implement:

- app path resolver。
- install manifest loader。
- diagnostics route。
- OpenCode binary discovery。
- Python/Git discovery。
- asset status checks。

Acceptance:

```bash
curl http://127.0.0.1:<port>/api/diagnostics/install
```

Must include `sourceRepoRequired: false`.

## Phase 4 — Workspace registry

Implement:

- list/add/validate/discover/select/remove。
- path canonicalization。
- git root detection。
- dangerous root guard。
- local state persistence。

Acceptance:

- add two different repos。
- switch active workspace。
- restart app and registry persists。

## Phase 5 — Managed OpenCode server manager

Implement:

- opencode binary discovery/override。
- free port allocation。
- spawn `opencode serve` with workspace cwd。
- Basic Auth random password。
- health polling。
- stop/restart。
- logs captured to state log dir。

Acceptance:

- selecting workspace starts server。
- health returns version。
- diagnostics show cwd/root。
- no `OPENCODE_CONFIG_DIR` source repo injection。

## Phase 6 — OpenCode service wrappers

Implement BFF wrappers:

- bootstrap providers/models/agents/commands。
- sessions list/create/update/fork/delete where supported。
- messages list。
- chat/command/shell/abort。
- diff/files。
- permissions。
- event subscription。

Acceptance:

- wrappers normalize all responses。
- no raw upstream shape leaks to client components。

## Phase 7 — SSE event broker

Implement:

- upstream event subscription per workspace。
- normalized BFF SSE `/api/events?workspaceId=`。
- keepalive comments every 20s。
- reconnect support using last-event-id if easy。
- event reducer tests。

Acceptance:

- browser receives normalized message/tool/permission/diff events。
- no run/stage/task/status-runtime events.

## Phase 8 — Frontend app shell

Implement:

- chat-first empty thread state。
- diagnostics panel。
- workspace selector/add dialog。
- top bar selectors。
- session sidebar。
- assistant-ui thread with ExternalStoreRuntime。
- composer modes。
- right drawer tabs。

Acceptance:

- no workspace state still lands in the main shell。
- no workspace state shows inline CTA inside thread/composer area。
- selecting workspace loads sessions。
- selecting a workspace with no history creates a new chat session automatically。
- chat UI sends through BFF。

## Phase 9 — Tool cards / permissions / diff / files

Implement custom renderers:

- Bash tool card。
- File read/write/edit cards。
- Generic tool card。
- Permission inline card。
- Permissions panel。
- Diff panel。
- Files panel。

Acceptance:

- permission flow works through BFF。
- changed files visible。

## Phase 10 — Effort

Implement:

- installed plugin assets。
- compatibility state module in web client。
- GET/POST effort routes。
- Effort popover UI。
- trace reader。

Acceptance:

- set project default writes workspace `.opencode/effort-control.sessions.json`。
- set session override writes session key。
- UI `max` writes `xhigh` internally。
- source repo not used.

## Phase 11 — Usage-details

Implement:

- bundle `provider-usage.py` into installed tools。
- usage service executes installed tool。
- normalized Codex/Copilot response。
- Usage badge。
- Usage drawer。
- Copilot report path support。

Acceptance:

- usage route works even after source repo is moved。
- no parsing `/usage` text。

## Phase 12 — Tests and hardening

Tests:

- unit tests for path resolver, registry, effort, usage normalizer。
- integration tests for local server routes with mocked OpenCode upstream。
- e2e smoke using fake upstream if real OpenCode unavailable。
- installer dry-run/update/uninstall tests。

Hardening:

- redact tokens。
- path traversal tests。
- workspace switch during running message。
- missing OpenCode/Python diagnostics。

## Phase 13 — Documentation

Add user docs:

- install。
- launch。
- add workspace。
- update/uninstall。
- troubleshooting。
- security model。

Docs must not instruct users to set `OPENCODE_CONFIG_DIR` to source repo.
