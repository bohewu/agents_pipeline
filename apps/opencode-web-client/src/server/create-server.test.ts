import { describe, expect, it, vi } from 'vitest'
import { createApp } from './create-server.js'
import type { VerificationRun, WorkspaceProfile } from '../shared/types.js'

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
})
