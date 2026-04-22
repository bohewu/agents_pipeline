import { describe, expect, it, vi } from 'vitest'
import { PreviewRuntimeInputError, PreviewRuntimeService } from './preview-runtime-service.js'
import type { PreviewRuntimeConsoleCaptureMetadata, PreviewRuntimeScreenshotMetadata, WorkspaceCapabilityProbe } from '../../shared/types.js'

describe('PreviewRuntimeService', () => {
  it('returns unavailable when preview target or browser evidence capability is unavailable', async () => {
    const captureBrowserEvidence = vi.fn()
    const service = new PreviewRuntimeService(
      { stateDir: '/tmp/preview-runtime-state' },
      {
        probeWorkspace: async () => makeCapabilityProbe('ws-preview', {
          previewTarget: {
            status: 'unavailable',
            summary: 'Preview target unavailable',
            detail: 'No local preview fixture was detected.',
          },
          browserEvidence: {
            status: 'unavailable',
            summary: 'Browser evidence unavailable',
            detail: 'No local browser runtime was detected.',
          },
        }),
      },
      { captureBrowserEvidence },
    )

    const result = await service.captureWorkspacePreview({
      workspaceId: 'ws-preview',
      workspaceRoot: '/tmp/ws-preview',
      previewUrl: 'http://127.0.0.1:4173',
    })

    expect(result).toEqual({
      workspaceId: 'ws-preview',
      outcome: 'unavailable',
      issues: [
        {
          code: 'PREVIEW_TARGET_UNAVAILABLE',
          message: 'Preview target unavailable',
          detail: 'No local preview fixture was detected.',
          capability: 'previewTarget',
        },
        {
          code: 'BROWSER_EVIDENCE_UNAVAILABLE',
          message: 'Browser evidence unavailable',
          detail: 'No local browser runtime was detected.',
          capability: 'browserEvidence',
        },
      ],
    })
    expect(captureBrowserEvidence).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'preview target is unavailable while browser evidence remains available',
      overrides: {
        previewTarget: {
          status: 'unavailable' as const,
          summary: 'Preview target unavailable',
          detail: 'No local preview fixture was detected.',
        },
      },
      expectedIssue: {
        code: 'PREVIEW_TARGET_UNAVAILABLE',
        message: 'Preview target unavailable',
        detail: 'No local preview fixture was detected.',
        capability: 'previewTarget',
      },
    },
    {
      label: 'browser evidence is unavailable while the preview target remains available',
      overrides: {
        browserEvidence: {
          status: 'unavailable' as const,
          summary: 'Browser evidence unavailable',
          detail: 'No local browser runtime was detected.',
        },
      },
      expectedIssue: {
        code: 'BROWSER_EVIDENCE_UNAVAILABLE',
        message: 'Browser evidence unavailable',
        detail: 'No local browser runtime was detected.',
        capability: 'browserEvidence',
      },
    },
  ])('returns unavailable without invoking browser capture when $label', async ({ overrides, expectedIssue }) => {
    const captureBrowserEvidence = vi.fn()
    const service = new PreviewRuntimeService(
      { stateDir: '/tmp/preview-runtime-state' },
      {
        probeWorkspace: async () => makeCapabilityProbe('ws-preview', overrides),
      },
      { captureBrowserEvidence },
    )

    const result = await service.captureWorkspacePreview({
      workspaceId: 'ws-preview',
      workspaceRoot: '/tmp/ws-preview',
      previewUrl: 'http://127.0.0.1:4173',
    })

    expect(result).toEqual({
      workspaceId: 'ws-preview',
      outcome: 'unavailable',
      issues: [expectedIssue],
    })
    expect(captureBrowserEvidence).not.toHaveBeenCalled()
  })

  it('returns degraded when the browser evidence capability probe errors', async () => {
    const captureBrowserEvidence = vi.fn()
    const service = new PreviewRuntimeService(
      { stateDir: '/tmp/preview-runtime-state' },
      {
        probeWorkspace: async () => makeCapabilityProbe('ws-preview', {
          browserEvidence: {
            status: 'error',
            summary: 'Browser evidence probe failed',
            detail: 'spawn EPERM',
          },
        }),
      },
      { captureBrowserEvidence },
    )

    const result = await service.captureWorkspacePreview({
      workspaceId: 'ws-preview',
      workspaceRoot: '/tmp/ws-preview',
      previewUrl: 'http://127.0.0.1:4173',
    })

    expect(result).toEqual({
      workspaceId: 'ws-preview',
      outcome: 'degraded',
      issues: [
        {
          code: 'BROWSER_EVIDENCE_PROBE_FAILED',
          message: 'Browser evidence probe failed',
          detail: 'spawn EPERM',
          capability: 'browserEvidence',
        },
      ],
    })
    expect(captureBrowserEvidence).not.toHaveBeenCalled()
  })

  it('captures only bounded Phase G artifacts through the preview URL path', async () => {
    const consoleCapture: PreviewRuntimeConsoleCaptureMetadata = {
      capturedAt: '2026-04-22T13:30:01.000Z',
      entryCount: 2,
      errorCount: 0,
      warningCount: 1,
      exceptionCount: 0,
      levels: ['log', 'warning'],
    }
    const screenshot: PreviewRuntimeScreenshotMetadata = {
      artifactRef: 'preview-runtime-artifacts/ws-preview/preview-run-1.png',
      mimeType: 'image/png',
      bytes: 2048,
      width: 1280,
      height: 800,
      capturedAt: '2026-04-22T13:30:01.000Z',
    }
    const captureBrowserEvidence = vi.fn(async () => ({
      consoleCapture,
      screenshot,
      commandKind: 'test',
      terminalLogRef: 'verification-logs/ws-preview/preview-run-1.log',
    } as any))
    const service = new PreviewRuntimeService(
      { stateDir: '/tmp/preview-runtime-state' },
      {
        probeWorkspace: async () => makeCapabilityProbe('ws-preview'),
      },
      {
        now: () => new Date('2026-04-22T13:30:01.000Z'),
        randomId: () => 'run-1',
        captureBrowserEvidence,
      },
    )

    const result = await service.captureWorkspacePreview({
      workspaceId: 'ws-preview',
      workspaceRoot: '/tmp/ws-preview',
      previewUrl: 'http://0.0.0.0:4173/fixture',
    })

    expect(captureBrowserEvidence).toHaveBeenCalledWith({
      workspaceId: 'ws-preview',
      previewUrl: 'http://127.0.0.1:4173/fixture',
      stateDir: '/tmp/preview-runtime-state',
      captureId: 'preview-run-1',
      capturedAt: '2026-04-22T13:30:01.000Z',
    })
    expect(result).toEqual({
      workspaceId: 'ws-preview',
      outcome: 'captured',
      previewUrl: 'http://127.0.0.1:4173/fixture',
      consoleCapture,
      screenshot,
      issues: [],
    })
    expect(result).not.toHaveProperty('commandKind')
    expect(result).not.toHaveProperty('terminalLogRef')
    expect(result).not.toHaveProperty('exitCode')
  })

  it('rejects non-loopback preview URLs so the boundary stays workspace-scoped', async () => {
    const service = new PreviewRuntimeService(
      { stateDir: '/tmp/preview-runtime-state' },
      {
        probeWorkspace: async () => makeCapabilityProbe('ws-preview'),
      },
      { captureBrowserEvidence: vi.fn() },
    )

    await expect(service.captureWorkspacePreview({
      workspaceId: 'ws-preview',
      workspaceRoot: '/tmp/ws-preview',
      previewUrl: 'https://example.com/preview',
    })).rejects.toBeInstanceOf(PreviewRuntimeInputError)
  })
})

function makeCapabilityProbe(
  workspaceId: string,
  overrides: Partial<WorkspaceCapabilityProbe> = {},
): WorkspaceCapabilityProbe {
  return {
    workspaceId,
    checkedAt: '2026-04-22T13:30:00.000Z',
    localGit: { status: 'available', summary: 'Local git available' },
    ghCli: { status: 'available', summary: 'GitHub CLI available' },
    ghAuth: { status: 'available', summary: 'GitHub auth available' },
    previewTarget: { status: 'available', summary: 'Preview target available' },
    browserEvidence: { status: 'available', summary: 'Browser evidence available' },
    ...overrides,
  }
}
