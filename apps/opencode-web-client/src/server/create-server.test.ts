import { describe, expect, it, vi } from 'vitest'
import { createApp } from './create-server.js'
import type { VerificationRun, WorkspaceGitStatusResult, WorkspaceProfile } from '../shared/types.js'

describe('createApp verification routes', () => {
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
})
