# SDD — OpenCode Web Client vNext System Design

> **Scope lock:** 本 SDD 只設計 web client、local BFF、workspace-side integration 與 supporting services。  
> **OpenCode remains the execution engine**。所有 agent execution、provider/model semantics、tool runtime 不在此重新設計。

## 1. 設計目標

vNext 要在現有 `apps/opencode-web-client` 基礎上補出：

1. verify cockpit
2. git-native ship loop
3. async task control
4. context / extension visibility
5. 後續 parallel execution surface

## 1.1 Cross-cutting primitives

以下 primitive 必須在早期就存在，否則 verify / ship / async 會互相失聯：

1. `TaskEntry`
2. `ResultAnnotation`
3. `CapabilityProbe`

## 2. Architectural Positioning

```text
+------------------------------------------------ User Machine -----------------------------------------------+
|                                                                                                             |
|  Browser UI                                                                                                 |
|  - Thread / Composer / Sessions                                                                             |
|  - Verify surface                                                                                           |
|  - Ship surface                                                                                             |
|  - Task ledger                                                                                              |
|  - Context / capability surface                                                                             |
|             |                                                                                               |
|             | same-origin API + SSE                                                                         |
|             v                                                                                               |
|  Local BFF / App Server                                                                                     |
|  - Workspace runtime manager                                                                                |
|  - OpenCode client factory                                                                                  |
|  - Event normalization                                                                                      |
|  - Verification orchestrator                                                                                |
|  - Git/PR adapter                                                                                            |
|  - Task ledger persistence                                                                                  |
|  - Capability/context catalog                                                                               |
|             |                                 |                                     |                        |
|             | OpenCode HTTP / SSE              | local git/gh/npm/dev-server tools    | local app storage    |
|             v                                 v                                     v                        |
|  Upstream OpenCode per workspace        Git / gh / test / preview             state/config/cache/logs       |
|                                                                                                             |
+-------------------------------------------------------------------------------------------------------------+
```

## 3. Locked Boundaries

## 3.1 OpenCode boundary

OpenCode continues to own:

- session execution
- ask / command / shell behavior
- agent/model/provider selection semantics
- tool orchestration
- upstream message and event production

The web client may normalize, cache, enrich, and present this data, but must not fork protocol ownership away from OpenCode.

## 3.2 BFF boundary

The local BFF owns:

- browser-safe API surface
- workspace lifecycle
- security boundaries
- auxiliary local services not guaranteed by OpenCode
- app-specific persistence

Examples of auxiliary services:

- verification runs
- git / PR orchestration
- capability inventory
- persisted task ledger

## 3.3 Client boundary

The browser owns only UI state and user interaction state. It must not become the source of truth for:

- secrets
- workspace file access policy
- upstream credentials
- long-running task durability

## 3.4 Current lifecycle constraints

The current app shape matters for sequencing:

1. workspace activity is driven by workspace-scoped SSE subscriptions
2. running state today is session-centric, not full job-centric
3. inactive workspaces may auto-sleep
4. refresh/reconnect continuity is realistic earlier than full process-restart continuity

Any vNext async/task design must either respect these constraints or explicitly introduce a new server-side observation model.

## 4. Module Model

## 4.1 Existing modules to keep

- `runtime-provider.tsx`
- `store.ts`
- `event-reducer.ts`
- `opencode-client-factory.ts`
- `event-broker.ts`
- workspace registry / managed server manager

These are the right seams. vNext should extend them, not replace them wholesale.

## 4.2 New or expanded server-side modules

### VerificationOrchestrator

Purpose:

- run and persist verification attempts
- normalize evidence from build/test/lint/browser checks
- provide status summaries to client surfaces

Ownership note:

- M1 minimum should orchestrate verification around the existing OpenCode-centered execution path.
- The orchestrator may schedule, annotate, persist, and summarize runs, but should not become a second general-purpose command executor in the first slice.
- A more independent BFF-side preview/browser runtime is deferred behind `PreviewRuntime`.

Responsibilities:

- define verification presets per workspace
- execute commands or browser checks
- capture logs, duration, exit code, screenshots, console output
- write verification run metadata to state dir

### PreviewRuntime

Purpose:

- isolate preview/browser evidence complexity from command-based verification

Responsibilities:

- manage preview target registration
- represent browser evidence capability state
- later support console capture / screenshots without forcing M1 to absorb that complexity on day one

### GitOpsService

Purpose:

- expose branch / status / commit / push / PR / checks / review summaries without making browser shell out directly

Responsibilities:

- git status summary
- staged/unstaged/untracked breakdown
- commit creation
- push/upstream tracking
- GitHub PR creation and PR metadata retrieval via `gh`
- checks and review comment summaries

### TaskLedgerService

Purpose:

- persist and rehydrate task-level state beyond a single in-memory thread

Responsibilities:

- create/update task entries
- bind tasks to workspace/session
- track phase: queued/running/blocked/completed/failed/cancelled
- attach latest evidence, verification, ship state pointers
- recover from refresh/restart

### ContextCatalogService

Purpose:

- surface repo instructions and installed capability context

Responsibilities:

- discover instruction sources such as `AGENTS.md`, `.opencode`, related project-local docs
- inventory installed plugins/commands/tools relevant to the web client
- optionally inventory skills/MCP-facing assets if already present locally

## 4.3 Expanded client-side surfaces

### Verify Surface

- summary badge on thread results
- detailed drawer/page for verification evidence
- retry actions

### Ship Surface

- branch/dirty/check state
- commit and push actions
- PR creation and review/check summaries

### Task Ledger Surface

- active tasks list
- recent completed tasks
- filter by workspace/session/state

### Context Surface

- repo instructions
- installed capability inventory
- missing capability remediation

## 5. Data Model Extensions

The exact API contract can be deferred, but these domain types should exist.

```ts
type VerificationKind = 'test' | 'build' | 'lint' | 'preview' | 'browser-check'

type VerificationRun = {
  id: string
  workspaceId: string
  sessionId?: string
  taskId?: string
  kind: VerificationKind
  status: 'running' | 'passed' | 'failed' | 'cancelled'
  startedAt: string
  finishedAt?: string
  summary: string
  exitCode?: number
  artifacts: VerificationArtifact[]
}

type VerificationArtifact = {
  id: string
  kind: 'terminal-log' | 'console-log' | 'screenshot' | 'preview-url' | 'report'
  label: string
  path?: string
  url?: string
}

type GitWorkspaceStatus = {
  workspaceId: string
  branch: string
  ahead: number
  behind: number
  hasStaged: boolean
  hasUnstaged: boolean
  hasUntracked: boolean
}

type TaskEntry = {
  id: string
  workspaceId: string
  sessionId?: string
  title: string
  source: 'chat' | 'verify' | 'ship' | 'system'
  state: 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled'
  startedAt: string
  updatedAt: string
  latestSummary?: string
  verificationRunId?: string
  prUrl?: string
}

type ResultAnnotation = {
  sourceMessageId: string
  workspaceId: string
  sessionId: string
  taskId?: string
  verification: 'verified' | 'partially verified' | 'unverified'
  reviewState?: 'ready' | 'approval-needed' | 'needs-retry'
  shipState?: 'not-ready' | 'local-ready' | 'pr-ready'
}

type CapabilityEntry = {
  id: string
  category: 'instruction' | 'plugin' | 'command' | 'tool' | 'skill' | 'mcp'
  source: 'project' | 'user-global' | 'app-bundled'
  label: string
  status: 'available' | 'missing' | 'degraded'
  path?: string
  notes?: string
}

type CapabilityProbe = {
  workspaceId: string
  localGit: boolean
  ghAvailable: boolean
  ghAuthenticated: boolean
  previewTarget: boolean
  browserEvidence: boolean
}
```

## 6. State Ownership

## 6.1 Session state

- thread messages remain session-scoped
- streaming remains session-scoped
- reasoning selection remains tied to visible activity context

## 6.2 Verification state

- verification runs are workspace-scoped
- optionally linked to session and task
- latest verification summary may be projected into message/result UI, but source of truth stays in BFF persistence

## 6.3 Ship state

- git status is workspace-scoped
- PR/check/review state is workspace-scoped and optionally linked to a task

## 6.4 Task state

- task ledger is persisted in app state dir
- browser reads via BFF and should not be the durable source

## 7. API Surface Groups

The existing `/api` surface should be extended, not replaced.

### Existing groups to keep

- `/api/workspaces/*`
- `/api/sessions/*`
- `/api/messages/*`
- `/api/events`
- `/api/files/*`
- `/api/usage/*`
- `/api/effort/*`

### New groups

- `/api/workspaces/:workspaceId/verify/*`
- `/api/workspaces/:workspaceId/git/*`
- `/api/workspaces/:workspaceId/tasks/*`
- `/api/workspaces/:workspaceId/context/*`

### API design rules

1. browser never receives upstream OpenCode auth
2. success/error envelopes stay normalized
3. task/verify/git state must be explicit and queryable
4. no hidden global mutable state implied only by UI

## 8. Flow Design

## 8.1 Verify flow

```text
User requests verification
  -> client calls /api/workspaces/:workspaceId/verify/run
  -> BFF creates VerificationRun + TaskEntry
  -> orchestrator executes verification preset
  -> logs/artifacts persisted
  -> task + verification summary emitted to client
  -> thread/result badge updates
```

## 8.2 Ship flow

```text
User chooses ship action
  -> client fetches CapabilityProbe + /api/workspaces/:workspaceId/git/status
  -> user commits via /api/workspaces/:workspaceId/git/commit
  -> user pushes via /api/workspaces/:workspaceId/git/push
  -> if supported, user creates PR via /api/workspaces/:workspaceId/git/pr
  -> BFF fetches checks/review summaries
  -> result linked back into task ledger
```

## 8.3 Async resume flow

```text
App restarts / page refreshes
  -> client loads workspaces + sessions + task ledger summaries
  -> BFF returns persisted running/completed tasks
  -> client restores current workspace/session/task surfaces
  -> task details lazily fetched on demand
```

Minimum guarantee: refresh/reconnect continuity.  
Deferred guarantee: full BFF-process-restart continuity for already running upstream work.

For the first async slice, reconnect-time rehydration is sufficient. Continuous server-side observation with no browser attached is a later enhancement, not a hidden assumption.

## 9. Verification Strategy

Minimum automated coverage for vNext should include:

1. state ownership tests
2. task ledger persistence tests
3. verification run normalization tests
4. git/PR route contract tests with mocked shell/gh output
5. workspace path and security tests
6. at least one browser-backed smoke path for:
   - send task
   - verify result
   - inspect ship surface

## 10. Security and Safety Constraints

1. Keep workspace path boundaries and symlink escape protection
2. Never store upstream auth or secrets in browser local storage
3. Explicit user intent required for commit / push / PR
4. Verification artifacts must avoid secret leakage in screenshots/log summaries where possible
5. Background tasks must remain attributable to workspace and session

## 11. Phasing Guidance

### Phase A

- minimal `TaskEntry`, `ResultAnnotation`, `CapabilityProbe`
- VerificationOrchestrator command-evidence slice
- verify routes
- verify client surfaces

### Phase B

- GitOpsService local-git slice
- git status / commit / push / optional PR
- foreground-only ship actions bound to current workspace/session context

### Phase C

- TaskLedgerService persistence minimum
- async task surfaces minimum
- reconnect-time rehydration for persisted task summaries

### Phase D

- GitHub-backed ship slice
- checks / review summaries

### Phase E

- ContextCatalogService
- context/inventory surfaces

### Phase F

- PreviewRuntime browser evidence slice
- isolated task lanes / worktree model

## 12. Explicit Anti-patterns

Do not do the following:

1. re-implement OpenCode session execution inside the BFF
2. create a second protocol model that diverges from normalized shared types without necessity
3. use a single global running flag for multi-session state
4. make browser state the only durable source for background tasks
5. bolt verification and shipping into generic text-only thread messages without structured state
