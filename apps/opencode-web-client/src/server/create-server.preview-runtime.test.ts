import { describe, expect, it, vi } from 'vitest'
import { createApp } from './create-server.js'
import type { PreviewRuntimeCaptureResult, WorkspaceProfile } from '../shared/types.js'

describe('createApp preview runtime routes', () => {
  it('routes workspace-scoped preview capture through the dedicated preview runtime service', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-preview-route',
      name: 'Preview route test',
      rootPath: '/tmp/ws-preview-route',
      addedAt: '2026-04-22T00:00:00.000Z',
    }
    const captureResult: PreviewRuntimeCaptureResult = {
      workspaceId: workspace.id,
      outcome: 'captured',
      previewUrl: 'http://127.0.0.1:4173/',
      consoleCapture: {
        capturedAt: '2026-04-22T00:00:01.000Z',
        entryCount: 1,
        errorCount: 0,
        warningCount: 0,
        exceptionCount: 0,
        levels: ['log'],
      },
      screenshot: {
        artifactRef: 'preview-runtime-artifacts/ws-preview-route/preview-run-1.png',
        mimeType: 'image/png',
        bytes: 1024,
        width: 1280,
        height: 800,
        capturedAt: '2026-04-22T00:00:01.000Z',
      },
      issues: [],
    }
    const captureWorkspacePreview = vi.fn(async () => captureResult)
    const recordBrowserEvidence = vi.fn()
    const app = createApp(makeServerOptions(), makeServerDeps(workspace, {
      captureWorkspacePreview,
      recordBrowserEvidence,
    }))

    const response = await app.request(`http://localhost/api/workspaces/${workspace.id}/preview-runtime/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        previewUrl: 'http://127.0.0.1:4173',
        sessionId: 'session-1',
        sourceMessageId: 'message-1',
        taskId: 'task-1',
      }),
    })
    const payload = await response.json()

    expect(payload.ok).toBe(true)
    expect(payload.data).toEqual(captureResult)
    expect(captureWorkspacePreview).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      workspaceRoot: workspace.rootPath,
      previewUrl: 'http://127.0.0.1:4173',
    })
    expect(recordBrowserEvidence).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      sessionId: 'session-1',
      sourceMessageId: 'message-1',
      taskId: 'task-1',
      captureResult,
    })
  })

  it('rejects unsupported automation-style fields outside the preview URL path', async () => {
    const workspace: WorkspaceProfile = {
      id: 'ws-preview-route',
      name: 'Preview route test',
      rootPath: '/tmp/ws-preview-route',
      addedAt: '2026-04-22T00:00:00.000Z',
    }
    const captureWorkspacePreview = vi.fn()
    const app = createApp(makeServerOptions(), makeServerDeps(workspace, {
      captureWorkspacePreview,
    }))

    const response = await app.request(`http://localhost/api/workspaces/${workspace.id}/preview-runtime/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        previewUrl: 'http://127.0.0.1:4173',
        actions: [{ type: 'click', selector: '#save' }],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.ok).toBe(false)
    expect(payload.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'Unsupported preview runtime fields: actions',
    })
    expect(captureWorkspacePreview).not.toHaveBeenCalled()
  })
})

function makeServerOptions() {
  return {
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
  }
}

function makeServerDeps(
  workspace: WorkspaceProfile,
  previewRuntimeService: {
    captureWorkspacePreview: (args: { workspaceId: string; workspaceRoot: string; previewUrl: string }) => Promise<PreviewRuntimeCaptureResult>
    recordBrowserEvidence?: (args: unknown) => void
  },
) {
  return {
    registry: {
      list: () => [workspace],
      get: (workspaceId: string) => workspaceId === workspace.id ? workspace : undefined,
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
      getStatus: async () => ({ outcome: 'degraded', issues: [] }),
    } as any,
    taskLedgerService: {
      listRecords: () => [],
    } as any,
    verificationService: {
      listRuns: () => [],
      runPreset: vi.fn(),
      recordBrowserEvidence: previewRuntimeService.recordBrowserEvidence ?? vi.fn(),
      decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
    } as any,
    previewRuntimeService: previewRuntimeService as any,
  }
}
