// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const apiMocks = vi.hoisted(() => ({
  runVerification: vi.fn(),
  sendChat: vi.fn(),
}))

const storeMocks = vi.hoisted(() => {
  const resolveKey = (workspaceId: string, sessionId: string) => `${workspaceId}::${sessionId}`
  const createState = () => ({
    settings: { showReasoningSummaries: false },
    selectedReasoningMessageId: null as string | null,
    rightPanel: 'usage',
    rightDrawerOpen: false,
    activeWorkspaceId: null as string | null,
    activeSessionByWorkspace: {} as Record<string, string | undefined>,
    selectedProvider: null as string | null,
    selectedModel: null as string | null,
    selectedAgent: null as string | null,
    effortByWorkspace: {} as Record<string, { projectDefault?: string; sessionOverrides: Record<string, string> }>,
    messagesBySession: {} as Record<string, any[]>,
    streamingBySession: {} as Record<string, boolean>,
    resultTracesByMessageId: {} as Record<string, any>,
  })

  const state = createState()
  const actions = {
    setRightPanel: vi.fn((panel: string) => {
      state.rightPanel = panel
    }),
    focusActivityMessage: vi.fn(),
    toggleRightDrawer: vi.fn(() => {
      state.rightDrawerOpen = !state.rightDrawerOpen
    }),
    addMessage: vi.fn((workspaceId: string, sessionId: string, message: any) => {
      const key = resolveKey(workspaceId, sessionId)
      state.messagesBySession[key] = [...(state.messagesBySession[key] ?? []), message]
    }),
    setMessages: vi.fn((workspaceId: string, sessionId: string, messages: any[]) => {
      state.messagesBySession[resolveKey(workspaceId, sessionId)] = messages
    }),
    setSessionStreaming: vi.fn((workspaceId: string, sessionId: string, streaming: boolean) => {
      const key = resolveKey(workspaceId, sessionId)
      if (streaming) {
        state.streamingBySession[key] = true
        return
      }
      delete state.streamingBySession[key]
    }),
  }

  const reset = () => {
    Object.assign(state, createState())
    Object.values(actions).forEach((mock) => mock.mockClear())
  }

  const snapshot = () => ({
    ...state,
    ...actions,
  })

  return {
    resolveKey,
    state,
    actions,
    reset,
    snapshot,
  }
})

vi.mock('../../lib/api-client.js', () => ({
  api: apiMocks,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: unknown }) => children,
}))

vi.mock('remark-gfm', () => ({ default: [] }))

vi.mock('../../runtime/store.js', () => {
  const useStore = ((selector: (state: ReturnType<typeof storeMocks.snapshot>) => unknown) => selector(storeMocks.snapshot())) as any
  useStore.getState = storeMocks.snapshot

  return {
    useStore,
    selectMessageResultTrace: (_state: unknown, message: { id: string }) => storeMocks.state.resultTracesByMessageId[message.id],
    selectSessionMessages: (
      state: { messagesBySession: Record<string, any[]> },
      workspaceId?: string | null,
      sessionId?: string,
    ) => {
      if (!workspaceId || !sessionId) return []
      return state.messagesBySession[storeMocks.resolveKey(workspaceId, sessionId)] ?? []
    },
  }
})

import { MessageCard } from './MessageCard.js'
import { selectSessionMessages, useStore } from '../../runtime/store.js'
import type { NormalizedMessage, ResultAnnotation, VerificationRun } from '../../../shared/types.js'

describe('MessageCard verification actions', () => {
  let container: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    storeMocks.reset()
    apiMocks.runVerification.mockReset()
    apiMocks.sendChat.mockReset()
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

  it('retries the latest linked verification from the same session context', async () => {
    const workspaceId = 'workspace-message-card'
    const sessionId = 'session-1'
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-1', 'task-1', 'Build verification failed.', 'unverified')
    const latestRun = makeRun('verify-lint-1', 'lint', 'failed', 'Build verification failed.', {
      sourceMessageId: message.id,
      taskId: 'task-1',
    })

    apiMocks.runVerification.mockResolvedValue(latestRun)
    configureMessageContext(workspaceId, sessionId, message, makeTrace(message, latestRun, 'unverified'))

    await renderCard(message)
    await clickButton('Retry lint')

    expect(apiMocks.runVerification).toHaveBeenCalledWith(workspaceId, {
      sessionId,
      commandKind: 'lint',
      sourceMessageId: message.id,
      taskId: 'task-1',
    })
    expect(storeMocks.state.rightPanel).toBe('verification')
    expect(storeMocks.state.rightDrawerOpen).toBe(true)
    expect(storeMocks.state.streamingBySession).toEqual({})
    expect(container.textContent).toContain('Ran lint verification again.')
  })

  it('sends an accept follow-up with the linked verification summary', async () => {
    const workspaceId = 'workspace-accept'
    const sessionId = 'session-accept'
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-accept', 'task-accept', 'Lint verification passed.', 'verified')
    const latestRun = makeRun('verify-lint-accept', 'lint', 'passed', 'Lint verification passed.', {
      sourceMessageId: message.id,
      taskId: 'task-accept',
      startedAt: '2026-04-21T10:00:00.000Z',
      finishedAt: '2026-04-21T10:00:05.000Z',
    })

    apiMocks.sendChat.mockResolvedValue(undefined)
    configureMessageContext(workspaceId, sessionId, message, makeTrace(message, latestRun, 'verified'), 'medium')

    await renderCard(message)
    await clickButton('Accept')

    expect(apiMocks.sendChat).toHaveBeenCalledWith(workspaceId, sessionId, {
      text: 'Accept the current assistant result for task task-accept. Latest linked verification summary: Lint verification passed.\n\nConfirm what is ready and call out any remaining follow-up in one concise update.',
      providerId: undefined,
      modelId: undefined,
      agentId: undefined,
      effort: 'medium',
    })
    const sessionMessages = selectSessionMessages(useStore.getState(), workspaceId, sessionId)
    expect(sessionMessages).toHaveLength(2)
    expect(sessionMessages[1]?.role).toBe('user')
    expect(sessionMessages[1]?.parts[0]?.text).toContain('Accept the current assistant result for task task-accept.')
    expect(container.textContent).toContain('Sent an accept follow-up for this result.')
  })

  it('removes the optimistic recover prompt when the follow-up send fails', async () => {
    const workspaceId = 'workspace-recover'
    const sessionId = 'session-recover'
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-recover', 'task-recover', 'Test verification failed.', 'unverified')
    const latestRun = makeRun('verify-test-recover', 'test', 'failed', 'Test verification failed.', {
      sourceMessageId: message.id,
      taskId: 'task-recover',
    })

    apiMocks.sendChat.mockRejectedValue(new Error('Recover request failed.'))
    configureMessageContext(workspaceId, sessionId, message, makeTrace(message, latestRun, 'unverified'))

    await renderCard(message)
    await clickButton('Recover')

    expect(apiMocks.sendChat).toHaveBeenCalledWith(workspaceId, sessionId, expect.objectContaining({
      text: expect.stringContaining('Recover the current assistant result for task task-recover.'),
    }))
    expect(selectSessionMessages(useStore.getState(), workspaceId, sessionId)).toEqual([message])
    expect(storeMocks.state.streamingBySession).toEqual({})
    expect(container.textContent).toContain('Recover request failed.')
  })

  async function renderCard(message: NormalizedMessage): Promise<void> {
    root = createRoot(container)
    await act(async () => {
      root?.render(<MessageCard message={message} />)
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

function configureMessageContext(
  workspaceId: string,
  sessionId: string,
  message: NormalizedMessage,
  resultTrace: {
    trace: NormalizedMessage['trace']
    annotation: ResultAnnotation
    taskEntry: NonNullable<NormalizedMessage['taskEntry']>
    verification: ResultAnnotation['verification']
    verificationSummary: string
    latestVerificationRun: VerificationRun
    linkedVerificationRuns: VerificationRun[]
    summary: string
  },
  effort?: string,
): void {
  storeMocks.state.activeWorkspaceId = workspaceId
  storeMocks.state.activeSessionByWorkspace = { [workspaceId]: sessionId }
  storeMocks.state.messagesBySession = { [storeMocks.resolveKey(workspaceId, sessionId)]: [message] }
  storeMocks.state.resultTracesByMessageId = { [message.id]: resultTrace }
  storeMocks.state.effortByWorkspace = effort
    ? { [workspaceId]: { projectDefault: effort, sessionOverrides: {} } }
    : {}
}

function makeAssistantMessage(
  workspaceId: string,
  sessionId: string,
  messageId: string,
  taskId: string,
  summary: string,
  verification: ResultAnnotation['verification'],
): NormalizedMessage {
  return {
    id: messageId,
    role: 'assistant',
    createdAt: '2026-04-21T00:00:00.000Z',
    parts: [{ type: 'text', text: summary }],
    trace: {
      sourceMessageId: messageId,
      workspaceId,
      sessionId,
      taskId,
    },
    taskEntry: {
      taskId,
      workspaceId,
      sessionId,
      sourceMessageId: messageId,
      state: 'completed',
      latestSummary: summary,
    },
    resultAnnotation: {
      sourceMessageId: messageId,
      workspaceId,
      sessionId,
      taskId,
      verification,
      summary,
    },
  }
}

function makeRun(
  id: string,
  commandKind: VerificationRun['commandKind'],
  status: VerificationRun['status'],
  summary: string,
  overrides: Partial<VerificationRun> = {},
): VerificationRun {
  return {
    id,
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    sessionId: overrides.sessionId ?? 'session-1',
    sourceMessageId: overrides.sourceMessageId,
    taskId: overrides.taskId ?? `${commandKind}-task`,
    commandKind,
    status,
    startedAt: overrides.startedAt ?? '2026-04-21T00:00:00.000Z',
    finishedAt: overrides.finishedAt,
    summary,
    exitCode: overrides.exitCode,
    terminalLogRef: overrides.terminalLogRef ?? `verification-logs/${id}.log`,
  }
}

function makeTrace(
  message: NormalizedMessage,
  latestVerificationRun: VerificationRun,
  verification: ResultAnnotation['verification'],
): {
  trace: NormalizedMessage['trace']
  annotation: ResultAnnotation
  taskEntry: NonNullable<NormalizedMessage['taskEntry']>
  verification: ResultAnnotation['verification']
  verificationSummary: string
  latestVerificationRun: VerificationRun
  linkedVerificationRuns: VerificationRun[]
  summary: string
} {
  return {
    trace: message.trace,
    annotation: message.resultAnnotation!,
    taskEntry: message.taskEntry!,
    verification,
    verificationSummary: latestVerificationRun.summary,
    latestVerificationRun,
    linkedVerificationRuns: [latestVerificationRun],
    summary: latestVerificationRun.summary,
  }
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
