# API_CONTRACT — Local BFF API and normalized events

## 1. Conventions

All routes are served by the installed local web client server.

Base URL:

```text
http://127.0.0.1:<webPort>/api
```

Response envelope:

```ts
type ApiSuccess<T> = { ok: true; data: T }
type ApiFailure = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
    retryable?: boolean
  }
}
```

All request/response bodies are JSON unless explicitly noted.

## 2. Health / diagnostics

### GET /api/health

```ts
type HealthResponse = {
  ok: true
  version: string
  uptimeMs: number
}
```

### GET /api/diagnostics/install

Returns install/runtime diagnostics.

```ts
type InstallDiagnostics = {
  app: {
    version: string
    installed: boolean
    sourceRepoRequired: false
    dataDir: string
    configDir: string
    stateDir: string
    cacheDir: string
  }
  opencode: {
    found: boolean
    binaryPath?: string
    version?: string
    configDir: string
    configDirSource: 'default' | 'env' | 'settings' | 'installer'
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
    git: RuntimeStatus
  }
}
```

## 3. Workspaces

### GET /api/workspaces

```ts
type ListWorkspacesResponse = {
  activeWorkspaceId?: string
  workspaces: WorkspaceProfile[]
}
```

### POST /api/workspaces/validate

```ts
type ValidateWorkspaceRequest = {
  path: string
  useExactPath?: boolean
}

type ValidateWorkspaceResponse = {
  inputPath: string
  resolvedPath: string
  gitRoot?: string
  finalRoot: string
  warnings: string[]
  valid: boolean
}
```

### POST /api/workspaces/discover

```ts
type DiscoverWorkspacesRequest = {
  roots?: string[]
  maxDepth?: number
}

type DiscoverWorkspacesResponse = {
  candidates: Array<{
    root: string
    name: string
    git: boolean
    alreadyAdded: boolean
  }>
}
```

### POST /api/workspaces

```ts
type AddWorkspaceRequest = {
  path: string
  name?: string
  useExactPath?: boolean
  mode?: 'managed'
}

type AddWorkspaceResponse = {
  workspace: WorkspaceProfile
}
```

### PATCH /api/workspaces/:workspaceId

```ts
type UpdateWorkspaceRequest = {
  name?: string
  settings?: Partial<WorkspaceProfile['settings']>
}
```

### DELETE /api/workspaces/:workspaceId

Remove profile only. Does not delete files.

### POST /api/workspaces/:workspaceId/select

Returns workspace bootstrap.

```ts
type WorkspaceBootstrap = {
  workspace: WorkspaceProfile
  server: WorkspaceServerStatus
  opencode: OpenCodeBootstrap
  sessions: SessionSummary[]
  effort: EffortStateSummary
  usageSummary?: UsageBadgeSummary
}
```

### POST /api/workspaces/:workspaceId/server/start

### POST /api/workspaces/:workspaceId/server/stop

### POST /api/workspaces/:workspaceId/server/restart

Return `WorkspaceServerStatus`.

## 4. Workspace bootstrap

### GET /api/workspaces/:workspaceId/bootstrap

```ts
type OpenCodeBootstrap = {
  health: { healthy: boolean; version?: string }
  project?: { id?: string; path?: string; name?: string }
  providers: ProviderSummary[]
  models: ModelSummary[]
  agents: AgentSummary[]
  commands: CommandSummary[]
}
```

## 5. Sessions

### GET /api/workspaces/:workspaceId/sessions

```ts
type SessionSummary = {
  id: string
  title?: string
  parentId?: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
  state?: 'idle' | 'running' | 'error'
}
```

### POST /api/workspaces/:workspaceId/sessions

```ts
type CreateSessionRequest = {
  title?: string
  initialMessage?: string
  providerId?: string
  modelId?: string
  agentId?: string
}
```

### PATCH /api/workspaces/:workspaceId/sessions/:sessionId

```ts
type UpdateSessionRequest = {
  title?: string
}
```

### DELETE /api/workspaces/:workspaceId/sessions/:sessionId

Delete/archive if upstream supports. Else return unsupported.

### POST /api/workspaces/:workspaceId/sessions/:sessionId/fork

```ts
type ForkSessionRequest = {
  messageId?: string
}
```

## 6. Messages and actions

### GET /api/workspaces/:workspaceId/sessions/:sessionId/messages

```ts
type ListMessagesResponse = {
  messages: NormalizedMessage[]
}
```

### POST /api/workspaces/:workspaceId/sessions/:sessionId/chat

```ts
type ChatRequest = {
  text: string
  files?: Array<{ path: string }>
  providerId?: string
  modelId?: string
  agentId?: string
  effort?: 'medium' | 'high' | 'xhigh'
}

type ChatResponse = {
  accepted: true
  sessionId: string
}
```

Response means accepted. Streaming updates arrive through `/api/events`.

### POST /api/workspaces/:workspaceId/sessions/:sessionId/command

```ts
type CommandRequest = {
  command: string
  arguments?: string
  providerId?: string
  modelId?: string
  agentId?: string
}
```

### POST /api/workspaces/:workspaceId/sessions/:sessionId/shell

```ts
type ShellRequest = {
  command: string
  cwd?: string
}
```

### POST /api/workspaces/:workspaceId/sessions/:sessionId/abort

Aborts current generation if supported.

## 7. Normalized messages

```ts
type NormalizedMessage = {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  status: 'pending' | 'streaming' | 'complete' | 'error'
  createdAt?: string
  updatedAt?: string
  content: NormalizedPart[]
  metadata?: {
    providerId?: string
    modelId?: string
    agentId?: string
    effort?: 'medium' | 'high' | 'xhigh'
    usage?: UsageSnapshot
  }
}

type NormalizedPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input?: unknown; status: ToolStatus }
  | { type: 'tool-result'; toolCallId: string; name: string; output?: unknown; error?: string; status: ToolStatus }
  | { type: 'file'; path: string; mimeType?: string }
  | { type: 'permission'; permissionId: string; request: PermissionRequest }
  | { type: 'error'; message: string; code?: string }

type ToolStatus = 'pending' | 'running' | 'complete' | 'error'
```

## 8. Permissions

### GET /api/workspaces/:workspaceId/sessions/:sessionId/permissions

```ts
type PermissionRequest = {
  id: string
  workspaceId: string
  sessionId: string
  toolName?: string
  action?: string
  title: string
  description?: string
  payload?: unknown
  createdAt: string
  state: 'pending' | 'allowed' | 'denied' | 'expired'
}
```

### POST /api/workspaces/:workspaceId/sessions/:sessionId/permissions/:permissionId

```ts
type ResolvePermissionRequest = {
  decision: 'allow' | 'allow_remember' | 'deny'
}
```

## 9. Diff / files

### GET /api/workspaces/:workspaceId/sessions/:sessionId/diff

```ts
type DiffResponse = {
  files: Array<{
    path: string
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'
    additions?: number
    deletions?: number
    diff?: string
  }>
}
```

### GET /api/workspaces/:workspaceId/files/status

```ts
type FileStatusResponse = {
  files: Array<{
    path: string
    status: string
  }>
}
```

### GET /api/workspaces/:workspaceId/files/content?path=<relativePath>

```ts
type FileContentResponse = {
  path: string
  content: string
  encoding: 'utf8'
  language?: string
}
```

### GET /api/workspaces/:workspaceId/files/find?q=<query>

Returns file search results.

## 10. Effort

### GET /api/workspaces/:workspaceId/effort?sessionId=<sessionId>

```ts
type EffortStateSummary = {
  supported: boolean
  unsupportedReason?: string
  levels: Array<'medium' | 'high' | 'max'>
  projectDefault?: 'medium' | 'high' | 'max'
  sessionOverride?: 'medium' | 'high' | 'max'
  effective?: 'medium' | 'high' | 'max'
  internalEffective?: 'medium' | 'high' | 'xhigh'
  trace: Array<{
    time: string
    session_id?: string
    source?: string
    effort?: string
    provider_id?: string
    model_id?: string
    agent?: string
  }>
}
```

### POST /api/workspaces/:workspaceId/effort

```ts
type SetEffortRequest =
  | { scope: 'project'; action: 'set'; effort: 'medium' | 'high' | 'max' }
  | { scope: 'project'; action: 'clear' }
  | { scope: 'session'; sessionId: string; action: 'set'; effort: 'medium' | 'high' | 'max' }
  | { scope: 'session'; sessionId: string; action: 'clear' }
```

## 11. Usage

### GET /api/workspaces/:workspaceId/usage?provider=auto|codex|copilot

Optional query params:

```text
copilotReportPath=<absolute path>
refresh=true|false
```

```ts
type UsageDetails = {
  generatedAt: string
  provider: 'auto' | 'codex' | 'copilot'
  codex?: {
    accounts: Array<{
      label: string
      email?: string
      planType?: string
      active?: boolean
      limits: Array<{
        name: string
        used?: number
        limit?: number
        remaining?: number
        leftPercent?: number
        resetAt?: string
        windowMinutes?: number
        summary?: string
      }>
    }>
  }
  copilot?: {
    source: 'live' | 'report' | 'cache'
    month?: string
    requestsUsed?: number
    monthlyQuota?: number
    remaining?: number
    byModel?: Record<string, number>
    byUser?: Record<string, number>
  }
  errors?: Array<{ provider: string; message: string; code?: string }>
  raw?: unknown
}
```

## 12. SSE events

### GET /api/events?workspaceId=<workspaceId>

SSE event shape:

```ts
type BffEvent = {
  id: string
  type: BffEventType
  workspaceId: string
  sessionId?: string
  time: string
  payload: unknown
}

type BffEventType =
  | 'server.health.changed'
  | 'workspace.updated'
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'message.created'
  | 'message.updated'
  | 'message.completed'
  | 'tool.started'
  | 'tool.updated'
  | 'tool.completed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'diff.updated'
  | 'effort.updated'
  | 'usage.updated'
  | 'error'
```

No event type may be prefixed with `run.`, `stage.`, `task.`, or `status-runtime`.

