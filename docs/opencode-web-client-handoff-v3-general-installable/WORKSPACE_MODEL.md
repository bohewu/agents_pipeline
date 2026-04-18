# WORKSPACE_MODEL — Multi-repo support

## 1. Requirement

The installed web client must support multiple local repo folders. The user selects a workspace in the UI; all sessions, files, diff, effort, usage, and upstream server interactions are scoped to that workspace.

## 2. Workspace profile

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
    expectedRoot?: string
  }
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  lastSessionId?: string
  settings?: {
    autoStart?: boolean
    stopOnSwitch?: boolean
    preferExactPath?: boolean
    maxIdleMinutes?: number
  }
}
```

## 3. Registry

Store profiles in:

```text
$XDG_STATE_HOME/opencode-codex-web/workspaces.json
fallback: ~/.local/state/opencode-codex-web/workspaces.json
```

Shape:

```json
{
  "version": 1,
  "activeWorkspaceId": "ws_...",
  "workspaces": []
}
```

## 4. Add workspace by path

Input:

```ts
{
  path: string
  name?: string
  useExactPath?: boolean
  mode?: 'managed'
}
```

Algorithm:

1. Expand `~`。
2. Resolve absolute path。
3. `fs.realpath`。
4. Ensure path exists and is directory。
5. Reject dangerous roots unless user confirms with `allowDangerousRoot`:
   - `/`
   - `/System`
   - `/bin`
   - `/usr`
   - `/etc`
   - user home itself unless confirmed
6. If `useExactPath` false, find nearest git root upward。
7. Validate final root readable。
8. Compute workspace id from final real path。
9. Add or update registry entry。

## 5. Discover workspaces

User can configure allowed discovery roots:

```json
{
  "workspaceDiscoveryRoots": ["~/dev", "~/work"]
}
```

BFF scans max depth 4 by default and finds dirs containing `.git`.

Limits:

- max roots: 20
- max candidates: 200
- ignore: `node_modules`, `.cache`, `Library`, `.Trash`, `.venv`, `target`, `dist`

## 6. Managed server per workspace

Runtime map:

```ts
type ManagedRuntime = {
  workspaceId: string
  pid: number
  port: number
  baseUrl: string
  password: string
  startedAt: string
  lastHealthAt?: string
  state: 'starting' | 'ready' | 'unhealthy' | 'stopped'
}
```

Start policy:

- auto-start when selected unless `--no-managed-autostart`。
- restart if health fails and user sends action requiring upstream。
- stop on app exit。

Switch policy:

- Do not stop previous workspace immediately by default。
- If `stopOnSwitch` true, stop old server after switching。
- Optional max concurrent managed servers; stop least recently used if over limit。

## 7. Attached server workspace

Attached mode is for advanced use:

```ts
{
  mode: 'attached',
  attached: {
    baseUrl: 'http://127.0.0.1:4096',
    username: 'opencode',
    passwordRef: 'local-keychain-ref',
    expectedRoot: '/Users/me/dev/project-a'
  }
}
```

Requirements:

- Health check mandatory。
- If host is not `127.0.0.1`, `localhost`, or private LAN, show warning。
- If expectedRoot is set and upstream project/current differs, show warning。
- Attached server is never stopped by app.

## 8. Active selection persistence

Frontend localStorage may store last active workspace id for fast load, but source of truth is registry.

Keys:

```text
opencode-codex-web:lastActiveWorkspaceId
opencode-codex-web:<workspaceId>:lastActiveSessionId
opencode-codex-web:<workspaceId>:rightPanel
```

Do not use global session id without workspace prefix.

## 9. Workspace bootstrap

When selecting a workspace, BFF returns:

```ts
type WorkspaceBootstrap = {
  workspace: WorkspaceProfile
  server: WorkspaceServerStatus
  opencode: {
    health: { healthy: boolean; version?: string }
    project?: { id?: string; path?: string; name?: string }
    providers: ProviderSummary[]
    models: ModelSummary[]
    agents: AgentSummary[]
    commands: CommandSummary[]
  }
  sessions: SessionSummary[]
  effort: EffortStateSummary
  usageSummary?: UsageBadgeSummary
}
```

## 10. Path safety

All file APIs require:

- workspaceId。
- relative path or absolute path under workspace root。

Reject:

- `..` escaping workspace。
- symlink escaping workspace unless user explicitly enables `allowSymlinkEscape`.
- absolute paths outside workspace.

Allowed exceptions:

- app installed asset paths for usage tool execution。
- OpenCode config diagnostics paths, readonly metadata only.

## 11. Workspace-specific artifacts

Effort state:

```text
<workspaceRoot>/.opencode/effort-control.sessions.json
<workspaceRoot>/.opencode/effort-control.trace.jsonl
```

OpenCode project settings may exist:

```text
<workspaceRoot>/opencode.json
<workspaceRoot>/.opencode/
```

Web client must not write general app state into workspace except effort state if user uses effort controls.

## 12. UI behavior

No workspace selected:

- show onboarding / add workspace。
- disable chat。

Workspace selected but server starting:

- show skeleton + connection banner。

Workspace server failed:

- show retry / diagnostics。
- allow editing workspace settings。

Switch workspace while generation running:

- do not abort by default。
- keep old run in old workspace。
- display background activity badge.

