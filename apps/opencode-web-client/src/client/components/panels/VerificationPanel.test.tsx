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
import type { WorkspaceBootstrap, WorkspaceCapabilityProbe, VerificationRun } from '../../../shared/types.js'

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

function makeCapabilityProbe(workspaceId: string): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const
  return {
    workspaceId,
    checkedAt: '2026-04-21T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
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

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
