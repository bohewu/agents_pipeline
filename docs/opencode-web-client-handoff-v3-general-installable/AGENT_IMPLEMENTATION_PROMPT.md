# AGENT_IMPLEMENTATION_PROMPT

You are implementing the v3 OpenCode Codex-style Web Client. Follow these instructions exactly. Do not re-analyze the product direction.

## Product correction

This is **not** a repo-hosted app tied to `agents_pipeline`. It is a **general-purpose installable local web client** for OpenCode.

`agents_pipeline` is only the source/distribution repo. After install, the user runs a local command such as:

```bash
opencode-codex-web --open
```

The installed app must work even if the source repo is moved or deleted.

## Required docs to read first

Read in this order:

1. `README.md`
2. `CHANGELOG_FROM_V2.md`
3. `INSTALLER_MODEL.md`
4. `OPENCODE_INTEGRATION.md`
5. `API_CONTRACT.md`
6. `WORKSPACE_MODEL.md`
7. `SDD.md`
8. `SPEC.md`
9. `TASK_BREAKDOWN.md`
10. `TEST_PLAN.md`

## Hard constraints

1. Do not implement `status-runtime` or any pipeline run/stage/task UI.
2. Do not use `AGENTS_PIPELINE_ROOT` as a runtime dependency.
3. Do not set `OPENCODE_CONFIG_DIR` to the source repo by default.
4. Do not read provider-usage from the source repo at runtime.
5. Do not store workspace registry in the source repo.
6. Do not let browser directly call `opencode serve`.
7. Do not parse `/usage` text output.
8. Do not use Next.js Route Handlers as the main architecture for v3.

## Required architecture

Implement a self-contained installable package, preferably:

```text
apps/opencode-web-client/
```

Use:

- React + TypeScript + Vite。
- Node local server。
- Hono or Fastify BFF; prefer Hono unless repo already uses Fastify。
- `@assistant-ui/react` with ExternalStoreRuntime。
- `@opencode-ai/sdk` on server side only。
- Zustand or equivalent frontend store。

## Required installer behavior

Add installer support:

```bash
./install.sh web-client
./install.sh web-client --dry-run
./install.sh web-client --uninstall
```

The installer must install:

1. Web runtime bundle.
2. CLI shim `opencode-codex-web`.
3. OpenCode assets into local OpenCode config:
   - `plugins/effort-control.js`
   - `plugins/effort-control/state.js`
   - `commands/usage.md`
4. Provider usage tool into installed web runtime:
   - `<dataDir>/tools/provider-usage.py`
5. Install manifest.

Installer must be idempotent.

## Required runtime behavior

The CLI must launch a local web app:

```bash
opencode-codex-web --host 127.0.0.1 --port auto --open
```

The app must:

- serve static React assets。
- expose BFF `/api/*` routes。
- manage workspaces。
- start `opencode serve` per selected workspace in managed mode。
- connect to existing OpenCode server in attached mode。
- provide diagnostics。

Managed OpenCode command:

```bash
opencode serve --hostname 127.0.0.1 --port <allocated>
```

with:

```ts
cwd = workspaceRoot
```

Do not inject source repo config.

## Required UI

Implement desktop-first UI:

- onboarding / diagnostics。
- workspace selector / add workspace。
- session sidebar。
- top bar provider/model/agent/effort/usage/status controls。
- assistant-ui thread。
- composer modes: Ask / Command / Shell。
- right drawer: Diff / Files / Usage / Permissions / Diagnostics。

## Required BFF API

Implement the routes in `API_CONTRACT.md`.

All routes must return API envelopes.

All coding routes must be workspace-scoped.

## Required effort support

- Installer installs plugin。
- BFF reads/writes selected workspace `.opencode/effort-control.sessions.json`。
- UI level `max` maps to internal `xhigh`。
- Trace read from selected workspace `.opencode/effort-control.trace.jsonl`。
- Actual OpenCode parameter mutation remains plugin responsibility。

## Required usage support

- BFF executes installed `provider-usage.py` from app data dir。
- Always use `--format json`。
- Pass `--project-root <workspaceRoot>`。
- Support Codex/Copilot and Copilot report path。

## Required acceptance checks

Before finishing, run or document results for:

1. Package build。
2. Installer dry-run。
3. Installer install。
4. Launch command。
5. Source repo independence test。
6. Add/switch two workspaces。
7. Managed OpenCode server cwd test。
8. Chat/command/shell smoke。
9. Effort write test。
10. Usage tool path test。
11. Search proves no status-runtime implementation。

## Implementation priority

Follow `TASK_BREAKDOWN.md` phases. Do not start with UI polish. First make installable runtime + diagnostics + workspace + managed server work.

## Final PR summary required

Include:

- Installed architecture summary。
- Installer behavior。
- How to launch。
- How source repo independence was verified。
- Known limitations。
- Test results。

