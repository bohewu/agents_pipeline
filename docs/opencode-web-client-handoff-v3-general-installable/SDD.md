# SDD — Software Design Document v3 General Installable

> This document defines the concrete implementation architecture.  
> It intentionally replaces the previous repo-hosted Next.js direction with an installable local web app architecture.

## 1. Architecture overview

```text
+--------------------------------------------------- User Machine ----------------------------------------------------+
|                                                                                                                     |
|  Installed command                                                                                                  |
|  opencode-codex-web --open                                                                                         |
|          |                                                                                                          |
|          v                                                                                                          |
|  +---------------------------------- Local Web Client Runtime ---------------------------------------------------+  |
|  | Node CLI + local HTTP server                                                                                  |  |
|  | - Serves built React static assets                                                                             |  |
|  | - Provides BFF API routes                                                                                      |  |
|  | - Manages workspace registry                                                                                   |  |
|  | - Starts/stops managed opencode serve processes                                                                |  |
|  | - Owns SSE event normalization                                                                                 |  |
|  | - Executes installed provider-usage.py                                                                         |  |
|  +-------------------------|----------------------------------------------|--------------------------------------+  |
|                            |                                              |                                         |
|                            | same-origin                                  | SDK / HTTP + Basic Auth                 |
|                            v                                              v                                         |
|  +----------------------------- Browser ------------------------+   +------------------ Workspace A Upstream ------+ |
|  | React + assistant-ui                                         |   | opencode serve                        | |
|  | - App shell                                                  |   | cwd=/Users/me/dev/project-a           | |
|  | - Workspace selector                                         |   | reads normal local OpenCode config    | |
|  | - Thread/runtime store                                       |   +-----------------------------------------+ |
|  | - Diff/files/usage/permission panels                         |   +------------------ Workspace B Upstream ------+ |
|  +--------------------------------------------------------------+   | opencode serve                        | |
|                                                                     | cwd=/Users/me/dev/project-b           | |
|                                                                     | reads normal local OpenCode config    | |
|                                                                     +-----------------------------------------+ |
|                                                                                                                     |
|  Local OpenCode config/assets                                                                                       |
|  ~/.config/opencode/                                                                                                 |
|    plugins/effort-control.js                                                                                         |
|    plugins/effort-control/state.js                                                                                   |
|    commands/usage.md                                                                                                 |
|                                                                                                                     |
|  Installed web assets                                                                                                |
|  ~/.local/share/opencode-codex-web/                                                                                  |
|    server/                                                                                                           |
|    client/                                                                                                           |
|    tools/provider-usage.py                                                                                           |
+---------------------------------------------------------------------------------------------------------------------+
```

## 2. Package layout in source repo

Default target layout:

```text
apps/opencode-web-client/
  package.json
  README.md
  tsconfig.json
  vite.config.ts
  tsup.config.ts

  bin/
    opencode-codex-web.ts

  src/
    cli/
      main.ts
      args.ts
      open-browser.ts
      shutdown.ts

    server/
      create-server.ts
      routes/
        health.ts
        diagnostics.ts
        events.ts
        workspaces.ts
        sessions.ts
        files.ts
        effort.ts
        usage.ts
      services/
        app-paths.ts
        install-manifest.ts
        opencode-binary.ts
        workspace-registry.ts
        workspace-paths.ts
        managed-server-manager.ts
        attached-server-manager.ts
        opencode-client-factory.ts
        event-broker.ts
        permission-registry.ts
        message-normalizer.ts
        diff-service.ts
        file-service.ts
        effort-service.ts
        usage-service.ts
      schemas/
        api.ts
        workspace.ts
        session.ts
        events.ts
        effort.ts
        usage.ts

    client/
      main.tsx
      App.tsx
      runtime/
        runtime-provider.tsx
        store.ts
        assistant-ui-mapper.ts
        event-reducer.ts
      components/
        app-shell/
        workspaces/
        sessions/
        thread/
        panels/
        effort/
        usage/
        diagnostics/
      lib/
        api-client.ts
        local-storage.ts
        path-display.ts

  assets/
    opencode/
      plugins/
        effort-control.js
        effort-control/
          state.js
      commands/
        usage.md
    tools/
      provider-usage.py

installer/
  install.sh
  install.ps1
  src/
    install-web-client.ts
    install-opencode-assets.ts
    uninstall-web-client.ts
    paths.ts
    manifest.ts
```

If the existing repo has a different package convention, keep the same module boundaries.

## 3. Runtime storage paths

Use XDG-style paths with platform fallbacks.

```ts
type AppPaths = {
  configDir: string      // ~/.config/opencode-codex-web
  dataDir: string        // ~/.local/share/opencode-codex-web
  stateDir: string       // ~/.local/state/opencode-codex-web
  cacheDir: string       // ~/.cache/opencode-codex-web
  logDir: string         // <stateDir>/logs
  workspaceRegistryFile: string // <stateDir>/workspaces.json
  installManifestFile: string   // <dataDir>/install-manifest.json
  clientStaticDir: string       // <dataDir>/client
  serverBundleDir: string       // <dataDir>/server
  toolsDir: string              // <dataDir>/tools
}
```

Do not put runtime files inside the source repo.

## 4. Local CLI lifecycle

### 4.1 Start

```text
opencode-codex-web --host 127.0.0.1 --port auto --open
```

Flow:

1. Parse args。
2. Resolve app paths。
3. Load install manifest。
4. Check lock file to avoid duplicate server on same port unless `--new-instance`。
5. Create Hono/Fastify server。
6. Register BFF API routes。
7. Serve built React assets。
8. Open browser if `--open`。
9. Handle SIGINT/SIGTERM：stop managed upstream processes then exit。

### 4.2 Args

```text
--host <host>                 default 127.0.0.1
--port <port|auto>            default auto
--open / --no-open            default --open
--workspace <path>            optional initial workspace path
--opencode-bin <path>         override opencode binary
--config-dir <path>           app config dir override, NOT OpenCode config dir
--opencode-config-dir <path>  advanced: pass OPENCODE_CONFIG_DIR to managed upstream
--debug                       verbose logs
--no-managed-autostart        do not auto-start upstream until user requests
```

## 5. Local BFF route design

All BFF routes are same-origin from browser to local app server.

Base path:

```text
/api/*
```

Browser must never receive raw upstream OpenCode base URL or password.

## 6. OpenCode client factory

```ts
type WorkspaceRuntime = {
  workspaceId: string
  mode: 'managed' | 'attached'
  baseUrl: string
  auth?: { username: string; password: string }
  projectRoot: string
  startedByApp: boolean
}
```

`opencodeClientFactory.forWorkspace(workspaceId)`:

1. Load workspace profile。
2. Ensure server runtime exists。
3. In managed mode, start server if needed。
4. Create SDK client with baseUrl and fetch wrapper adding Basic Auth if needed。
5. Return client and runtime metadata。

No global singleton OpenCode client.

## 7. Managed server manager

### 7.1 Start command

```ts
spawn(opencodeBin, [
  'serve',
  '--hostname', '127.0.0.1',
  '--port', String(port),
], {
  cwd: workspaceRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

Environment:

```ts
const env = {
  ...process.env,
  OPENCODE_SERVER_USERNAME: 'opencode-web',
  OPENCODE_SERVER_PASSWORD: generatedPassword,
}

if (settings.advanced.opencodeConfigDirOverride) {
  env.OPENCODE_CONFIG_DIR = settings.advanced.opencodeConfigDirOverride
}
```

### 7.2 Health

Poll:

```text
GET /global/health
```

Timeout:

- start timeout: 15s
- health interval: 3s while active
- exponential backoff after failure

### 7.3 Process lifecycle policy

Default:

- Start on workspace selection。
- Keep alive while app is open。
- Stop all managed processes on app exit。

Optional settings:

- auto-stop idle workspace after N minutes。
- max concurrent managed servers。

## 8. Workspace registry

```ts
type WorkspaceProfile = {
  id: string
  name: string
  root: string
  rootRealPath: string
  mode: 'managed' | 'attached'
  attached?: {
    baseUrl: string
    username?: string
    passwordRef?: string
  }
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  lastSessionId?: string
  settings?: {
    autoStart?: boolean
    stopOnSwitch?: boolean
    preferExactPath?: boolean
  }
}
```

IDs:

```ts
workspaceId = 'ws_' + sha256(rootRealPath).slice(0, 16)
```

For attached mode without local root, require a display root or use:

```ts
workspaceId = 'ws_attached_' + sha256(baseUrl).slice(0, 16)
```

## 9. Frontend state model

Use Zustand.

```ts
type UIStore = {
  install: InstallDiagnostics | null
  workspaces: WorkspaceProfile[]
  activeWorkspaceId?: string
  workspaceBootstraps: Record<string, WorkspaceBootstrap>
  sessionsByWorkspace: Record<string, SessionSummary[]>
  activeSessionByWorkspace: Record<string, string | undefined>
  messagesBySession: Record<string, NormalizedMessage[]>
  pendingPermissions: Record<string, PermissionRequest[]> // key workspaceId:sessionId
  selectedProvider?: string
  selectedModel?: string
  selectedAgent?: string
  effortStateByWorkspace: Record<string, EffortState>
  usageByWorkspace: Record<string, UsageDetails>
  rightPanel: 'diff' | 'files' | 'usage' | 'permissions' | 'diagnostics'
  connection: Record<string, ConnectionState>
}
```

## 10. assistant-ui integration

Use `ExternalStoreRuntime`.

Responsibilities:

- Convert `NormalizedMessage` to `ThreadMessageLike`。
- `onNew` sends BFF `/chat`。
- BFF/SSE updates Zustand store。
- assistant-ui handles rendering primitives/composer; custom components render OpenCode tool cards。

Do not use assistant-ui transport as the canonical protocol.

## 11. Event architecture

### 11.1 Upstream to BFF

BFF subscribes to OpenCode events per workspace. If SDK event helper is available, use it. Else use `/global/event` SSE.

### 11.2 BFF to Browser

Browser connects to one BFF SSE endpoint:

```text
GET /api/events?workspaceId=<id>
```

BFF emits normalized events only. It must not pass raw upstream event payloads directly.

### 11.3 Event reducer

Frontend reducer applies normalized events to store:

- session.created / updated / deleted
- message.created / updated / completed
- tool.started / updated / completed
- permission.requested / resolved
- diff.updated
- usage.updated
- effort.updated
- server.health.changed
- error

No status-runtime events.

## 12. Effort service

The web client includes a compatibility implementation matching the installed plugin state shape.

```ts
type EffortLevel = 'medium' | 'high' | 'xhigh'
type EffortState = {
  version: 1
  defaults: {
    project?: { effort: EffortLevel; updatedAt?: string }
  }
  sessions: Record<string, { effort: EffortLevel; updatedAt?: string }>
}
```

Files:

```text
<workspaceRoot>/.opencode/effort-control.sessions.json
<workspaceRoot>/.opencode/effort-control.trace.jsonl
```

Do not import plugin source from `~/.config/opencode/plugins` at runtime. Use internal compatibility code and keep tests proving shape compatibility.

## 13. Usage service

Resolve installed tool path from install manifest:

```ts
const toolPath = manifest.assets.tools.providerUsagePy
```

Execute:

```ts
spawn(pythonBin, [
  toolPath,
  '--provider', provider,
  '--format', 'json',
  '--project-root', workspaceRoot,
  ...(copilotReport ? ['--copilot-report', copilotReport] : []),
])
```

Timeout default: 30s.

Output parsing:

- stdout must be valid JSON。
- stderr captured as diagnostic only。
- redact secrets before returning。

## 14. Install diagnostics service

```ts
type InstallDiagnostics = {
  app: {
    version: string
    installed: boolean
    dataDir: string
    stateDir: string
    sourceRepoRequired: false
  }
  opencode: {
    binaryPath?: string
    version?: string
    found: boolean
    configDir: string
    configDirSource: 'env' | 'default' | 'settings'
  }
  assets: {
    effortPlugin: AssetStatus
    effortStateHelper: AssetStatus
    usageCommand: AssetStatus
    providerUsageTool: AssetStatus
  }
  runtimes: {
    node: RuntimeStatus
    python: RuntimeStatus
  }
}
```

## 15. Error handling

Return all API errors using envelope:

```ts
type ApiError = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
    retryable?: boolean
  }
}
```

Never leak passwords/tokens.

## 16. Build outputs

`pnpm build` in package should produce:

```text
dist/
  bin/opencode-codex-web.js
  server/
  client/
  assets/
```

Installer copies `dist/*` to app data dir and creates executable shim.

