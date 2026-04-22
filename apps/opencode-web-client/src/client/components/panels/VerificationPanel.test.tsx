// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  listVerificationRuns: vi.fn(),
  runVerification: vi.fn(),
}))

vi.mock('../../lib/api-client.js', () => ({
  api: apiMocks,
}))

import { VerificationPanel } from './VerificationPanel.js'
import { selectActiveWorkspaceVerificationRuns, useStore } from '../../runtime/store.js'
import type { BrowserEvidenceRecord, WorkspaceBootstrap, WorkspaceCapabilityProbe, VerificationRun } from '../../../shared/types.js'

const baseState = useStore.getState()

describe('VerificationPanel', () => {
  let container: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    resetStore()
    apiMocks.listVerificationRuns.mockReset()
    apiMocks.runVerification.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = null
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container.remove()
  })

  it('loads workspace runs and launches a preset verification from the panel', async () => {
    const workspaceId = 'workspace-verify-panel'
    const existingRun = makeRun(workspaceId, 'verify-lint-1', 'lint', 'passed', 'Lint clean.', {
      startedAt: '2026-04-21T10:00:00.000Z',
      finishedAt: '2026-04-21T10:00:05.000Z',
      sourceMessageId: 'message-1',
      taskId: 'task-1',
    })
    const nextRun = makeRun(workspaceId, 'verify-build-1', 'build', 'passed', 'Build clean.', {
      startedAt: '2026-04-21T10:05:00.000Z',
      finishedAt: '2026-04-21T10:05:07.000Z',
      exitCode: 0,
    })

    apiMocks.listVerificationRuns
      .mockResolvedValueOnce([existingRun])
      .mockResolvedValueOnce([existingRun, nextRun])
    apiMocks.runVerification.mockResolvedValue(nextRun)

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()

    expect(apiMocks.listVerificationRuns).toHaveBeenCalledWith(workspaceId)
    expect(container.textContent).toContain('Recent runs stay scoped to workspace-verify-panel')
    expect(container.textContent).toContain('Lint clean.')

    await clickButton('Run build')

    expect(apiMocks.runVerification).toHaveBeenCalledWith(workspaceId, {
      sessionId: 'session-1',
      commandKind: 'build',
      sourceMessageId: undefined,
      taskId: undefined,
    })
    expect(apiMocks.listVerificationRuns).toHaveBeenCalledTimes(2)
    expect(selectActiveWorkspaceVerificationRuns(useStore.getState()).map((run) => run.id)).toEqual([
      'verify-build-1',
      'verify-lint-1',
    ])
    expect(container.textContent).toContain('Ran build verification.')
    expect(useStore.getState().streamingBySession).toEqual({})
  })

  it('disables preset launch until an active session is selected', async () => {
    const workspaceId = 'workspace-no-session'

    apiMocks.listVerificationRuns.mockResolvedValue([])
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId))
    useStore.getState().setActiveWorkspace(workspaceId)

    await renderPanel()

    expect(getButton('Run lint').disabled).toBe(true)
    expect(getButton('Run build').disabled).toBe(true)
    expect(getButton('Run test').disabled).toBe(true)
    expect(container.textContent).toContain('Select an active chat session to launch lint, build, or test from this workspace surface.')
  })

  it.each([
    {
      label: 'preview target is unavailable while browser evidence remains available',
      workspaceId: 'workspace-preview-target-gated',
      capabilityOverrides: {
        previewTarget: {
          status: 'unavailable' as const,
          summary: 'Preview target unavailable',
          detail: 'No preview script detected.',
        },
      },
    },
    {
      label: 'browser evidence is unavailable while the preview target remains available',
      workspaceId: 'workspace-browser-evidence-gated',
      capabilityOverrides: {
        browserEvidence: {
          status: 'unavailable' as const,
          summary: 'Browser evidence unavailable',
          detail: 'Preview runtime is disabled.',
        },
      },
    },
  ])('keeps command-only verification usable when $label', async ({ workspaceId, capabilityOverrides }) => {
    const existingRun = makeRun(workspaceId, `verify-existing-${workspaceId}`, 'test', 'passed', 'Existing command-only test verification passed.', {
      sessionId: 'session-browser-gated',
      sourceMessageId: 'message-browser-gated',
      taskId: 'task-browser-gated',
      terminalLogRef: `verification-logs/${workspaceId}/verify-existing.log`,
    })
    const nextRun = makeRun(workspaceId, `verify-next-${workspaceId}`, 'lint', 'passed', 'Lint verification still runs without browser evidence capability.', {
      sessionId: 'session-browser-gated',
      sourceMessageId: 'message-browser-gated',
      taskId: 'task-browser-gated',
      terminalLogRef: `verification-logs/${workspaceId}/verify-next.log`,
    })

    apiMocks.listVerificationRuns
      .mockResolvedValueOnce([existingRun])
      .mockResolvedValueOnce([nextRun, existingRun])
    apiMocks.runVerification.mockResolvedValue(nextRun)

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId),
      capabilities: makeCapabilityProbe(workspaceId, capabilityOverrides),
      browserEvidenceRecords: [makeBrowserEvidenceRecord(workspaceId, `record-${workspaceId}`, '2026-04-22T16:02:00.000Z', {
        sessionId: 'session-browser-gated',
        sourceMessageId: 'message-browser-gated',
        taskId: 'task-browser-gated',
        summary: 'Captured browser evidence should stay hidden while capability is degraded.',
        consoleCapture: {
          capturedAt: '2026-04-22T16:02:00.000Z',
          entryCount: 1,
          errorCount: 0,
          warningCount: 0,
          exceptionCount: 0,
          levels: ['log'],
        },
      })],
    })
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-browser-gated')

    await renderPanel()

    expect(getButton('Run lint').disabled).toBe(false)
    expect(getButton('Run build').disabled).toBe(false)
    expect(getButton('Run test').disabled).toBe(false)
    expect(container.textContent).toContain('Existing command-only test verification passed.')
    expect(container.textContent).toContain(`Verification log: verification-logs/${workspaceId}/verify-existing.log`)
    expect(container.textContent).not.toContain('Browser evidence')
    expect(container.textContent).not.toContain('Preview URL: http://127.0.0.1:4173/')

    await clickButton('Run lint')

    expect(apiMocks.runVerification).toHaveBeenCalledWith(workspaceId, {
      sessionId: 'session-browser-gated',
      commandKind: 'lint',
      sourceMessageId: undefined,
      taskId: undefined,
    })
    expect(container.textContent).toContain('Lint verification still runs without browser evidence capability.')
    expect(container.textContent).not.toContain('Captured browser evidence should stay hidden while capability is degraded.')
    expect(container.textContent).not.toContain('Browser evidence')
  })

  it('renders projected browser evidence for verification runs when capability is available', async () => {
    const workspaceId = 'workspace-browser-evidence'
    const run = makeRun(workspaceId, 'verify-browser-1', 'test', 'passed', 'Browser verification passed.', {
      sessionId: 'session-browser',
      sourceMessageId: 'message-browser',
      taskId: 'task-browser',
      terminalLogRef: 'verification-logs/workspace-browser-evidence/verify-browser-1.log',
    })

    apiMocks.listVerificationRuns.mockResolvedValue([run])

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId),
      browserEvidenceRecords: [makeBrowserEvidenceRecord(workspaceId, 'record-browser-1', '2026-04-22T16:02:00.000Z', {
        sessionId: 'session-browser',
        sourceMessageId: 'message-browser',
        taskId: 'task-browser',
        summary: 'Captured browser evidence for verification replay.',
        consoleCapture: {
          capturedAt: '2026-04-22T16:02:00.000Z',
          entryCount: 3,
          errorCount: 1,
          warningCount: 1,
          exceptionCount: 0,
          levels: ['error', 'warn'],
        },
        screenshot: {
          artifactRef: 'artifacts/browser/verify-browser-1.png',
          mimeType: 'image/png',
          bytes: 32 * 1024,
          width: 1440,
          height: 900,
          capturedAt: '2026-04-22T16:02:00.000Z',
        },
      })],
    })
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-browser')

    await renderPanel()

    expect(selectActiveWorkspaceVerificationRuns(useStore.getState())[0]).toEqual(expect.objectContaining({
      browserEvidenceRef: expect.objectContaining({
        recordId: 'record-browser-1',
        previewUrl: 'http://127.0.0.1:4173/',
      }),
    }))
    expect(container.textContent).toContain('Verification log: verification-logs/workspace-browser-evidence/verify-browser-1.log')
    expect(container.textContent).toContain('Browser evidence')
    expect(container.textContent).toContain('Captured browser evidence for verification replay.')
    expect(container.textContent).toContain('Preview URL: http://127.0.0.1:4173/')
    expect(container.textContent).toContain('Console capture: 3 entries · 1 error · 1 warning · 0 exceptions · levels: error, warn')
    expect(container.textContent).toContain('Screenshot ref: artifacts/browser/verify-browser-1.png · 1440×900 · 32.0 KB')
  })

  async function renderPanel(): Promise<void> {
    root = createRoot(container)
    await act(async () => {
      root?.render(<VerificationPanel />)
      await flushAsync()
    })
  }

  async function clickButton(label: string): Promise<void> {
    await act(async () => {
      getButton(label).click()
      await flushAsync()
    })
  }

  function getButton(label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) => {
      return candidate.textContent?.trim() === label
    })
    if (!button) {
      throw new Error(`Unable to find button: ${label}`)
    }
    return button as HTMLButtonElement
  }
})

function resetStore(): void {
  useStore.setState({
    ...baseState,
    workspaces: [],
    activeWorkspaceId: null,
    workspaceDialogOpen: false,
    settingsDialogOpen: false,
    serverStatusByWorkspace: {},
    workspaceBootstraps: {},
    workspaceCapabilitiesByWorkspace: {},
    sessionsByWorkspace: {},
    activeSessionByWorkspace: {},
    messagesBySession: {},
    taskEntriesByWorkspace: {},
    resultAnnotationsByWorkspace: {},
    pendingPermissions: {},
    selectedProvider: null,
    selectedModel: null,
    selectedModelVariant: null,
    selectedAgent: null,
    effortByWorkspace: {},
    usageByWorkspace: {},
    usageLoadingByWorkspace: {},
    rightPanel: 'usage',
    selectedReasoningMessageId: null,
    activityFocusMessageId: null,
    activityFocusNonce: 0,
    composerMode: 'ask',
    sidebarOpen: true,
    rightDrawerOpen: false,
    connectionByWorkspace: {},
    streamingBySession: {},
  }, false)
}

function makeBootstrap(workspaceId: string): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions: [],
    capabilities: makeCapabilityProbe(workspaceId),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
  }
}

function makeCapabilityProbe(
  workspaceId: string,
  overrides: Partial<WorkspaceCapabilityProbe> = {},
): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const
  return {
    workspaceId,
    checkedAt: '2026-04-21T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
    ...overrides,
  }
}

function makeRun(
  workspaceId: string,
  id: string,
  commandKind: VerificationRun['commandKind'],
  status: VerificationRun['status'],
  summary: string,
  overrides: Partial<VerificationRun> = {},
): VerificationRun {
  return {
    id,
    workspaceId,
    sessionId: overrides.sessionId ?? 'session-1',
    sourceMessageId: overrides.sourceMessageId,
    taskId: overrides.taskId ?? `${commandKind}-task`,
    commandKind,
    status,
    startedAt: overrides.startedAt ?? '2026-04-21T10:00:00.000Z',
    finishedAt: overrides.finishedAt,
    summary,
    exitCode: overrides.exitCode,
    terminalLogRef: overrides.terminalLogRef,
  }
}

function makeBrowserEvidenceRecord(
  workspaceId: string,
  id: string,
  capturedAt: string,
  overrides: Partial<BrowserEvidenceRecord> = {},
): BrowserEvidenceRecord {
  return {
    id,
    workspaceId,
    capturedAt,
    sessionId: overrides.sessionId ?? 'session-1',
    sourceMessageId: overrides.sourceMessageId ?? 'message-1',
    taskId: overrides.taskId ?? 'task-1',
    summary: overrides.summary ?? `Captured browser evidence for ${id}.`,
    previewUrl: overrides.previewUrl ?? 'http://127.0.0.1:4173/',
    ...(overrides.consoleCapture ? { consoleCapture: overrides.consoleCapture } : {}),
    ...(overrides.screenshot ? { screenshot: overrides.screenshot } : {}),
  }
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
