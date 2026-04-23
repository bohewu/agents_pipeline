import { describe, expect, it, vi } from 'vitest'
import { createApp } from './create-server.js'
import type { VerificationRun, WorkspaceGitStatusResult, WorkspaceProfile } from '../shared/types.js'

describe('createApp verification routes', () => {
  it('routes workspace context catalog requests through the context catalog service', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-context-route',
      name: 'Context route test',
      rootPath: '/tmp/ws-context-route',
      addedAt: '2026-04-22T00:00:00.000Z',
    }
    const getContextCatalog = vi.fn(async () => ({
      workspaceId: workspace.id,
      collectedAt: '2026-04-22T00:00:00.000Z',
      instructionSources: [
        {
          id: 'project-local:agents-file',
          category: 'agents-file',
          sourceLayer: 'project-local',
          label: 'Workspace AGENTS.md',
          status: 'available',
          path: '/tmp/ws-context-route/AGENTS.md',
          detail: 'Readable file detected.',
        },
        {
          id: 'project-local:opencode-dir',
          category: 'opencode-dir',
          sourceLayer: 'project-local',
          label: 'Workspace .opencode directory',
          status: 'missing',
          path: '/tmp/ws-context-route/.opencode',
          detail: 'Expected directory was not found.',
          remediation: 'Create /tmp/ws-context-route/.opencode in the workspace root to surface project-local OpenCode instruction assets.',
        },
      ],
      capabilityEntries: [
        {
          id: 'project-local:plugins',
          category: 'plugin',
          sourceLayer: 'project-local',
          label: 'Project-local OpenCode plugins',
          status: 'degraded',
          path: '/tmp/ws-context-route/opencode/plugins',
          detail: 'EACCES: permission denied, access \'/tmp/ws-context-route/opencode/plugins\'',
          remediation: 'Fix permissions or replace /tmp/ws-context-route/opencode/plugins so project-local plugin assets can be read safely.',
        },
        {
          id: 'user-global:provider-usage-tool',
          category: 'usage-asset',
          sourceLayer: 'user-global',
          label: 'User-global provider usage tool asset',
          status: 'missing',
          path: '/tmp/opencode/tools/provider-usage.py',
          detail: 'Expected file was not found.',
          remediation: 'Install or restore /tmp/opencode/tools/provider-usage.py so the user-global provider usage tool is available.',
        },
        {
          id: 'app-bundled:skills',
          category: 'skill',
          sourceLayer: 'app-bundled',
          label: 'Bundled skill catalog',
          status: 'available',
          path: '/opt/app/assets/opencode/skills',
          detail: '2 supported items discovered.',
          itemCount: 2,
          items: ['repo-scout', 'planner'],
        },
      ],
    }))

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: () => workspace,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({ listMessages: async () => [] }),
      } as any,
      sessionService: {} as any,
      effortService: {} as any,
      usageService: {} as any,
      configService: {} as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn() } as any,
      capabilityProbeService: {} as any,
      contextCatalogService: {
        getContextCatalog,
      } as any,
      workspaceShipService: {
        getStatus: async () => ({ outcome: 'degraded', issues: [] }),
      } as any,
      taskLedgerService: {
        listRecords: () => [],
      } as any,
      verificationService: {
        listRuns: () => [],
        runPreset: vi.fn(),
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
      } as any,
    })

    const response = await app.request(`http://localhost/api/workspaces/${workspace.id}/context/catalog`)
    const payload = await response.json()

    expect(payload.ok).toBe(true)
    expect(payload.data).toEqual(expect.objectContaining({
      workspaceId: workspace.id,
      instructionSources: expect.arrayContaining([
        expect.objectContaining({
          id: 'project-local:agents-file',
          category: 'agents-file',
          sourceLayer: 'project-local',
          status: 'available',
        }),
        expect.objectContaining({
          id: 'project-local:opencode-dir',
          category: 'opencode-dir',
          sourceLayer: 'project-local',
          status: 'missing',
          remediation: expect.stringContaining('.opencode'),
        }),
      ]),
      capabilityEntries: expect.arrayContaining([
        expect.objectContaining({
          id: 'project-local:plugins',
          category: 'plugin',
          sourceLayer: 'project-local',
          status: 'degraded',
          remediation: expect.stringContaining('plugin assets'),
        }),
        expect.objectContaining({
          id: 'user-global:provider-usage-tool',
          category: 'usage-asset',
          sourceLayer: 'user-global',
          status: 'missing',
        }),
        expect.objectContaining({
          id: 'app-bundled:skills',
          category: 'skill',
          sourceLayer: 'app-bundled',
          status: 'available',
          itemCount: 2,
          items: ['repo-scout', 'planner'],
        }),
      ]),
    }))
    expect(payload.data.capabilityEntries.some((entry: { id: string; status: string }) => entry.id === 'project-local:plugins' && entry.status === 'available')).toBe(false)
    expect(getContextCatalog).toHaveBeenCalledWith(workspace.id, workspace.rootPath, workspace.opencodeConfigDir)
  })

  it('routes workspace-scoped verification run APIs through the verification service', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-route',
      name: 'Route test',
      rootPath: '/tmp/ws-route',
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const run: VerificationRun = {
      id: 'verify-run-1',
      workspaceId: workspace.id,
      sessionId: 'session-1',
      sourceMessageId: 'message-1',
      taskId: 'task-1',
      commandKind: 'lint',
      status: 'passed',
      startedAt: '2026-04-21T00:00:00.000Z',
      finishedAt: '2026-04-21T00:00:05.000Z',
      summary: 'Lint clean.',
      exitCode: 0,
      terminalLogRef: 'verification-logs/ws-route/verify-run-1.log',
    }
    const runPreset = vi.fn(async () => run)
    const gitStatus: WorkspaceGitStatusResult = {
      outcome: 'success',
      data: {
        workspaceId: workspace.id,
        checkedAt: '2026-04-21T00:00:00.000Z',
        branch: { name: 'main', detached: false },
        upstream: { status: 'tracked', ref: 'origin/main', remote: 'origin', branch: 'main', ahead: 0, behind: 0, remoteProvider: 'github' },
        changeSummary: {
          staged: { count: 1, paths: ['src/index.ts'], truncated: false },
          unstaged: { count: 0, paths: [], truncated: false },
          untracked: { count: 0, paths: [], truncated: false },
          conflicted: { count: 0, paths: [], truncated: false },
          hasChanges: true,
          hasStagedChanges: true,
        },
        pullRequest: { outcome: 'success', supported: true, summary: 'Ready', issues: [] },
        linkedPullRequest: {
          outcome: 'success',
          linked: true,
          summary: 'Linked pull request #21 is open.',
          number: 21,
          title: 'Verification route fixture',
          url: 'https://github.com/example/repo/pull/21',
          state: 'OPEN',
          headBranch: 'main',
          baseBranch: 'main',
          checks: {
            status: 'passing',
            summary: '1 check passing.',
            total: 1,
            passing: 1,
            failing: 0,
            pending: 0,
            failingChecks: [],
          },
          review: {
            status: 'approved',
            summary: 'Approved',
            requestedReviewerCount: 0,
          },
          issues: [],
        },
      },
      issues: [],
    }

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: () => workspace,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({ listMessages: async () => [] }),
      } as any,
      sessionService: {} as any,
      effortService: {} as any,
      usageService: {} as any,
      configService: {} as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn() } as any,
      capabilityProbeService: {} as any,
      contextCatalogService: {} as any,
      workspaceShipService: {
        getStatus: async () => gitStatus,
      } as any,
      taskLedgerService: {
        listRecords: () => [],
      } as any,
      verificationService: {
        listRuns: () => [run],
        runPreset,
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
      } as any,
    })

    const listResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/verify/runs`)
    const listPayload = await listResponse.json()
    expect(listPayload.ok).toBe(true)
    expect(listPayload.data).toEqual([run])

    const runResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/verify/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        commandKind: 'lint',
        sourceMessageId: 'message-1',
        taskId: 'task-1',
      }),
    })
    const runPayload = await runResponse.json()

    expect(runPayload.ok).toBe(true)
    expect(runPayload.data).toEqual(run)
    expect(runPreset).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      workspaceRoot: workspace.rootPath,
      sessionId: 'session-1',
      commandKind: 'lint',
      sourceMessageId: 'message-1',
      taskId: 'task-1',
    })
  })

  it('routes explicit compare-and-adopt lane mutations through the mounted workspace APIs and preserves single-lane guardrails', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-compare-route',
      name: 'Compare route test',
      rootPath: '/tmp/ws-compare-route',
      addedAt: '2026-04-22T00:00:00.000Z',
    }
    const runtime = {
      workspaceId: workspace.id,
      pid: 123,
      port: 3456,
      baseUrl: 'http://127.0.0.1:3456',
      password: 'secret',
      username: 'opencode-web',
      startedAt: '2026-04-22T00:00:00.000Z',
      state: 'ready' as const,
    }
    const laneComparisonByWorkspace = new Map<string, any>()
    const gitStatus: WorkspaceGitStatusResult = {
      outcome: 'success',
      data: {
        workspaceId: workspace.id,
        checkedAt: '2026-04-22T00:00:00.000Z',
        branch: { name: 'main', detached: false },
        upstream: {
          status: 'tracked',
          ref: 'origin/main',
          remote: 'origin',
          branch: 'main',
          ahead: 0,
          behind: 0,
          remoteProvider: 'github',
        },
        changeSummary: {
          staged: { count: 0, paths: [], truncated: false },
          unstaged: { count: 0, paths: [], truncated: false },
          untracked: { count: 0, paths: [], truncated: false },
          conflicted: { count: 0, paths: [], truncated: false },
          hasChanges: false,
          hasStagedChanges: false,
        },
        pullRequest: { outcome: 'degraded', supported: false, summary: 'Unavailable', issues: [] },
        linkedPullRequest: {
          outcome: 'degraded',
          linked: false,
          summary: 'Unavailable',
          issues: [],
        },
      },
      issues: [],
    }
    const sessions = [
      {
        id: 'session-branch',
        title: 'Branch attempt',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:01:00.000Z',
        messageCount: 1,
        state: 'idle' as const,
        laneContext: { kind: 'branch' as const, branch: 'feature/compare-branch' },
      },
      {
        id: 'session-worktree',
        title: 'Worktree attempt',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:02:00.000Z',
        messageCount: 1,
        state: 'idle' as const,
        laneContext: {
          kind: 'worktree' as const,
          worktreePath: '/tmp/worktrees/compare-route',
          branch: 'feature/compare-worktree',
        },
      },
    ]

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: (workspaceId: string) => workspaceId === workspace.id ? workspace : undefined,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => runtime,
        getAll: () => [runtime],
        waitUntilReady: async () => runtime,
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({
          health: async () => ({ ok: true, version: '1.2.3' }),
          listMessages: async () => [],
        }),
      } as any,
      sessionService: {
        listSessions: async () => sessions,
        resolveLaneComparisonState: (workspaceId: string) => laneComparisonByWorkspace.get(workspaceId),
        setLaneComparisonState: (workspaceId: string, state: unknown) => {
          if (state === undefined) {
            laneComparisonByWorkspace.delete(workspaceId)
            return undefined
          }

          laneComparisonByWorkspace.set(workspaceId, state)
          return state
        },
      } as any,
      effortService: {
        getEffortSummary: () => ({ sessionOverrides: {} }),
      } as any,
      usageService: {} as any,
      configService: {
        getConfig: async () => ({
          providers: [],
          models: [],
          agents: [],
          commands: [],
          connectedProviderIds: [],
        }),
      } as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn() } as any,
      capabilityProbeService: {
        probeWorkspace: async () => ({
          workspaceId: workspace.id,
          checkedAt: '2026-04-22T00:00:00.000Z',
          localGit: { status: 'available', summary: 'Local git available' },
          ghCli: { status: 'available', summary: 'GitHub CLI available' },
          ghAuth: { status: 'available', summary: 'GitHub auth available' },
          previewTarget: { status: 'available', summary: 'Preview target available' },
          browserEvidence: { status: 'available', summary: 'Browser evidence available' },
        }),
      } as any,
      contextCatalogService: {} as any,
      workspaceShipService: {
        getStatus: async () => gitStatus,
      } as any,
      taskLedgerService: {
        listRecords: () => [],
      } as any,
      verificationService: {
        listRuns: () => [],
        runPreset: vi.fn(),
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
        getWorkspaceSummary: () => ({
          runs: [],
          browserEvidenceRecords: [],
          traceability: { taskEntries: [], resultAnnotations: [] },
        }),
      } as any,
    })

    const selectResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/compare/select-lane`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-worktree',
        laneContext: {
          kind: 'worktree',
          worktreePath: '/tmp/worktrees/compare-route',
          branch: 'feature/compare-worktree',
        },
      }),
    })
    const selectPayload = await selectResponse.json()

    expect(selectResponse.status).toBe(200)
    expect(selectPayload.ok).toBe(true)
    expect(selectPayload.data.laneComparison).toEqual({
      selectedLane: {
        sessionId: 'session-worktree',
        laneId: 'worktree:/tmp/worktrees/compare-route',
        laneContext: {
          kind: 'worktree',
          worktreePath: '/tmp/worktrees/compare-route',
          branch: 'feature/compare-worktree',
        },
      },
    })

    const adoptResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/compare/adopt-lane`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-branch',
        laneContext: { kind: 'branch', branch: 'feature/compare-branch' },
      }),
    })
    const adoptPayload = await adoptResponse.json()

    expect(adoptResponse.status).toBe(200)
    expect(adoptPayload.ok).toBe(true)
    expect(adoptPayload.data.laneComparison).toEqual({
      selectedLane: {
        sessionId: 'session-branch',
        laneId: 'branch:feature/compare-branch',
        laneContext: { kind: 'branch', branch: 'feature/compare-branch' },
      },
      adoptedLane: {
        sessionId: 'session-branch',
        laneId: 'branch:feature/compare-branch',
        laneContext: { kind: 'branch', branch: 'feature/compare-branch' },
      },
    })

    const guardrailResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/compare/adopt-lane`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionIds: ['session-branch', 'session-worktree'],
      }),
    })
    const guardrailPayload = await guardrailResponse.json()

    expect(guardrailResponse.status).toBe(400)
    expect(guardrailPayload).toEqual({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'adoptedLane must describe exactly one lane.',
      },
    })

    const bootstrapResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/bootstrap`)
    const bootstrapPayload = await bootstrapResponse.json()

    expect(bootstrapResponse.status).toBe(200)
    expect(bootstrapPayload.ok).toBe(true)
    expect(bootstrapPayload.data.laneComparison).toEqual(adoptPayload.data.laneComparison)
    expect(laneComparisonByWorkspace.get(workspace.id)).toEqual(adoptPayload.data.laneComparison)
  })

  it('routes workspace-scoped git ship APIs through the ship service', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-git-route',
      name: 'Git route test',
      rootPath: '/tmp/ws-git-route',
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const gitStatus: WorkspaceGitStatusResult = {
      outcome: 'success',
      data: {
        workspaceId: workspace.id,
        checkedAt: '2026-04-21T00:00:00.000Z',
        branch: { name: 'main', detached: false },
        upstream: { status: 'tracked', ref: 'origin/main', remote: 'origin', branch: 'main', ahead: 1, behind: 0, remoteProvider: 'github' },
        changeSummary: {
          staged: { count: 1, paths: ['src/index.ts'], truncated: false },
          unstaged: { count: 0, paths: [], truncated: false },
          untracked: { count: 0, paths: [], truncated: false },
          conflicted: { count: 0, paths: [], truncated: false },
          hasChanges: true,
          hasStagedChanges: true,
        },
        pullRequest: { outcome: 'degraded', supported: false, summary: 'Unavailable', issues: [] },
        linkedPullRequest: {
          outcome: 'degraded',
          linked: false,
          summary: 'Linked pull request details are currently unavailable.',
          detail: 'The gh CLI is installed, but github.com authentication is not available.',
          remediation: 'Run gh auth login for github.com and retry the pull request action.',
          issues: [],
        },
      },
      issues: [],
    }
    const previewCommit = vi.fn(async () => ({
      outcome: 'success',
      status: gitStatus,
      draftMessage: 'update src changes',
      issues: [],
    }))
    const executeCommit = vi.fn(async () => ({
      outcome: 'success',
      status: gitStatus,
      commit: { sha: 'abc123', message: 'feat: ship contracts' },
      issues: [],
    }))
    const createPullRequest = vi.fn(async () => ({
      outcome: 'success',
      status: gitStatus,
      pullRequest: { url: 'https://github.com/example/repo/pull/42' },
      issues: [],
    }))

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: () => workspace,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({ listMessages: async () => [] }),
      } as any,
      sessionService: {} as any,
      effortService: {} as any,
      usageService: {} as any,
      configService: {} as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn() } as any,
      capabilityProbeService: {} as any,
      contextCatalogService: {} as any,
      workspaceShipService: {
        getStatus: async () => gitStatus,
        previewCommit,
        executeCommit,
        push: vi.fn(),
        createPullRequest,
      } as any,
      taskLedgerService: {
        listRecords: () => [],
      } as any,
      verificationService: {
        listRuns: () => [],
        runPreset: vi.fn(),
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
      } as any,
    })

    const statusResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/status`)
    const statusPayload = await statusResponse.json()
    expect(statusPayload.ok).toBe(true)
    expect(statusPayload.data).toEqual(gitStatus)

    const previewResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/commit/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const previewPayload = await previewResponse.json()
    expect(previewPayload.ok).toBe(true)
    expect(previewPayload.data.draftMessage).toBe('update src changes')
    expect(previewCommit).toHaveBeenCalledWith(workspace.id, workspace.rootPath, {})

    const commitResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', message: 'feat: ship contracts' }),
    })
    const commitPayload = await commitResponse.json()
    expect(commitPayload.ok).toBe(true)
    expect(commitPayload.data.commit).toEqual({ sha: 'abc123', message: 'feat: ship contracts' })
    expect(executeCommit).toHaveBeenCalledWith(workspace.id, workspace.rootPath, {
      sessionId: 'session-1',
      message: 'feat: ship contracts',
    })

    const pullRequestResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/pr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1' }),
    })
    const pullRequestPayload = await pullRequestResponse.json()
    expect(pullRequestPayload.ok).toBe(true)
    expect(pullRequestPayload.data.pullRequest).toEqual({ url: 'https://github.com/example/repo/pull/42' })
    expect(createPullRequest).toHaveBeenCalledWith(workspace.id, workspace.rootPath, {
      sessionId: 'session-1',
    })
  })

  it('records a ship fix handoff on chat launch and returns the upstream message id', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-chat-route',
      name: 'Chat route test',
      rootPath: '/tmp/ws-chat-route',
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const chat = vi.fn(async () => ({ messageId: 'message-user-1' }))
    const upsertRuntimeRecord = vi.fn()
    const registerShipFixHandoff = vi.fn()

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: () => workspace,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({ listMessages: async () => [], chat }),
      } as any,
      sessionService: {} as any,
      effortService: {} as any,
      usageService: {} as any,
      configService: {} as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn(), registerShipFixHandoff } as any,
      capabilityProbeService: {} as any,
      contextCatalogService: {} as any,
      workspaceShipService: {
        getStatus: async () => ({ outcome: 'degraded', issues: [] }),
      } as any,
      taskLedgerService: {
        listRecords: () => [],
        upsertRuntimeRecord,
      } as any,
      verificationService: {
        listRuns: () => [],
        runPreset: vi.fn(),
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
      } as any,
    })

    const response = await app.request(`http://localhost/api/workspaces/${workspace.id}/sessions/session-1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Continue the fix handoff.',
        shipFixHandoff: {
          taskId: 'ship-fix-pr-84-failing-check-ci-test',
          title: 'Fix failing check: CI / test',
          summary: 'Fix handoff from failing check CI / test.',
          shipState: 'blocked-by-checks',
          reviewState: 'needs-retry',
          pullRequestUrl: 'https://github.com/example/repo/pull/84',
          pullRequestNumber: 84,
          conditionKind: 'failing-check',
          conditionLabel: 'CI / test',
          detailsUrl: 'https://example.com/checks/1',
        },
      }),
    })
    const payload = await response.json()

    expect(payload.ok).toBe(true)
    expect(payload.data).toEqual({
      accepted: true,
      sessionId: 'session-1',
      messageId: 'message-user-1',
      taskId: 'ship-fix-pr-84-failing-check-ci-test',
    })
    expect(chat).toHaveBeenCalledWith('session-1', 'Continue the fix handoff.', {
      providerId: undefined,
      modelId: undefined,
      agentId: undefined,
      effort: undefined,
    })
    expect(upsertRuntimeRecord).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: workspace.id,
      taskId: 'ship-fix-pr-84-failing-check-ci-test',
      sessionId: 'session-1',
      sourceMessageId: 'message-user-1',
      state: 'blocked',
      resultAnnotation: expect.objectContaining({
        shipState: 'blocked-by-checks',
        reviewState: 'needs-retry',
      }),
      recentShipRef: expect.objectContaining({
        conditionKind: 'failing-check',
        conditionLabel: 'CI / test',
        pullRequestUrl: 'https://github.com/example/repo/pull/84',
      }),
    }))
    expect(registerShipFixHandoff).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: workspace.id,
      sessionId: 'session-1',
      taskId: 'ship-fix-pr-84-failing-check-ci-test',
      shipState: 'blocked-by-checks',
      conditionKind: 'failing-check',
    }))
  })

  it('tc-review-fix-handoff-contract records a review-feedback ship fix handoff on chat launch', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-review-route',
      name: 'Review route test',
      rootPath: '/tmp/ws-review-route',
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const chat = vi.fn(async () => ({ messageId: 'message-user-2' }))
    const upsertRuntimeRecord = vi.fn()
    const registerShipFixHandoff = vi.fn()

    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: () => workspace,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory: {
        forWorkspace: () => ({ listMessages: async () => [], chat }),
      } as any,
      sessionService: {} as any,
      effortService: {} as any,
      usageService: {} as any,
      configService: {} as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: vi.fn(), registerShipFixHandoff } as any,
      capabilityProbeService: {} as any,
      contextCatalogService: {} as any,
      workspaceShipService: {
        getStatus: async () => ({ outcome: 'degraded', issues: [] }),
      } as any,
      taskLedgerService: {
        listRecords: () => [],
        upsertRuntimeRecord,
      } as any,
      verificationService: {
        listRuns: () => [],
        runPreset: vi.fn(),
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
      } as any,
    })

    const response = await app.request(`http://localhost/api/workspaces/${workspace.id}/sessions/session-7/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Continue the review follow-up.',
        shipFixHandoff: {
          taskId: 'ship-fix-pr-55-review-feedback-security-review-follow-up-requested',
          title: 'Address review feedback',
          summary: 'Fix handoff from pull request review feedback.',
          shipState: 'not-ready',
          reviewState: 'approval-needed',
          pullRequestUrl: 'https://github.com/example/repo/pull/55',
          pullRequestNumber: 55,
          conditionKind: 'review-feedback',
          conditionLabel: 'Security review follow-up requested.',
        },
      }),
    })
    const payload = await response.json()

    expect(payload.ok).toBe(true)
    expect(payload.data).toEqual({
      accepted: true,
      sessionId: 'session-7',
      messageId: 'message-user-2',
      taskId: 'ship-fix-pr-55-review-feedback-security-review-follow-up-requested',
    })
    expect(chat).toHaveBeenCalledWith('session-7', 'Continue the review follow-up.', {
      providerId: undefined,
      modelId: undefined,
      agentId: undefined,
      effort: undefined,
    })
    expect(upsertRuntimeRecord).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: workspace.id,
      taskId: 'ship-fix-pr-55-review-feedback-security-review-follow-up-requested',
      sessionId: 'session-7',
      sourceMessageId: 'message-user-2',
      state: 'blocked',
      resultAnnotation: expect.objectContaining({
        shipState: 'not-ready',
        reviewState: 'approval-needed',
      }),
      recentShipRef: expect.objectContaining({
        conditionKind: 'review-feedback',
        conditionLabel: 'Security review follow-up requested.',
        pullRequestUrl: 'https://github.com/example/repo/pull/55',
        pullRequestNumber: 55,
      }),
    }))
    expect(registerShipFixHandoff).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: workspace.id,
      sessionId: 'session-7',
      taskId: 'ship-fix-pr-55-review-feedback-security-review-follow-up-requested',
      shipState: 'not-ready',
      reviewState: 'approval-needed',
      conditionKind: 'review-feedback',
      conditionLabel: 'Security review follow-up requested.',
    }))
  })
})
