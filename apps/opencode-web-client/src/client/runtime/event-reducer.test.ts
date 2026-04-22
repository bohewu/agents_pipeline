import { describe, expect, it, vi } from 'vitest';
import { handleBffEvent } from './event-reducer.js';
import { resolveWorkspaceSessionStoreKey } from './store.js';
import type { UIStore } from './store.js';
import type { SessionSummary } from '../../shared/types.js';

describe('handleBffEvent session streaming updates', () => {
  it('marks only the active event session as streaming on message delta', () => {
    const store = createStoreMock();

    handleBffEvent({
      type: 'message.delta',
      timestamp: '2026-04-20T00:00:00.000Z',
      payload: {
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        message: { id: 'message-1', role: 'assistant', createdAt: '2026-04-20T00:00:00.000Z', parts: [] },
      },
    }, store);

    expect(store.updateMessage).toHaveBeenCalledWith('workspace-1', 'session-1', {
      id: 'message-1',
      role: 'assistant',
      createdAt: '2026-04-20T00:00:00.000Z',
      parts: [],
    });
    expect(store.setSessionStreaming).toHaveBeenCalledWith('workspace-1', 'session-1', true);
    expect(store.setSessions).toHaveBeenCalledWith('workspace-1', [
      { ...makeSession({ id: 'session-1', state: 'running' }), state: 'running' },
      makeSession({ id: 'session-2', state: 'idle' }),
    ]);
  });

  it('clears only the completed session streaming flag on message completion', () => {
    const store = createStoreMock();

    handleBffEvent({
      type: 'message.completed',
      timestamp: '2026-04-20T00:00:01.000Z',
      payload: {
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        message: { id: 'message-1', role: 'assistant', createdAt: '2026-04-20T00:00:01.000Z', parts: [] },
      },
    }, store);

    expect(store.updateMessage).toHaveBeenCalledWith('workspace-1', 'session-1', {
      id: 'message-1',
      role: 'assistant',
      createdAt: '2026-04-20T00:00:01.000Z',
      parts: [],
    });
    expect(store.setSessionStreaming).toHaveBeenCalledWith('workspace-1', 'session-1', false);
  });

  it('applies verification run updates to workspace-scoped store state', () => {
    const store = createStoreMock();

    handleBffEvent({
      type: 'verification.updated',
      timestamp: '2026-04-20T00:00:02.000Z',
      payload: {
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        sourceMessageId: 'message-1',
        run: { id: 'verify-1', commandKind: 'lint', status: 'passed' },
        taskEntry: { taskId: 'task-1', workspaceId: 'workspace-1', sessionId: 'session-1', sourceMessageId: 'message-1', state: 'completed' },
        resultAnnotation: { sourceMessageId: 'message-1', workspaceId: 'workspace-1', sessionId: 'session-1', taskId: 'task-1', verification: 'verified' },
      },
    }, store);

    expect(store.upsertVerificationRun).toHaveBeenCalledWith('workspace-1', { id: 'verify-1', commandKind: 'lint', status: 'passed' });
    expect(store.applyVerificationProjection).toHaveBeenCalledWith(
      'workspace-1',
      'session-1',
      'message-1',
      { taskId: 'task-1', workspaceId: 'workspace-1', sessionId: 'session-1', sourceMessageId: 'message-1', state: 'completed' },
      { sourceMessageId: 'message-1', workspaceId: 'workspace-1', sessionId: 'session-1', taskId: 'task-1', verification: 'verified' },
    );
  });

  it('treats same message ids from different lanes as separate live updates', () => {
    const store = createStoreMock({
      messagesBySession: {
        [resolveWorkspaceSessionStoreKey('workspace-1', 'session-1')]: [
          {
            id: 'message-1',
            role: 'assistant',
            createdAt: '2026-04-20T00:00:00.000Z',
            parts: [],
            trace: {
              sourceMessageId: 'message-1',
              workspaceId: 'workspace-1',
              sessionId: 'session-1',
              laneId: 'branch:feature/lane-a',
            },
          },
        ],
      },
      sessionsByWorkspace: {
        'workspace-1': [makeSession({ id: 'session-1', state: 'idle', messageCount: 0 })],
      },
    });

    handleBffEvent({
      type: 'message.created',
      timestamp: '2026-04-20T00:00:03.000Z',
      payload: {
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        message: {
          id: 'message-1',
          role: 'assistant',
          createdAt: '2026-04-20T00:00:03.000Z',
          parts: [],
          trace: {
            sourceMessageId: 'message-1',
            workspaceId: 'workspace-1',
            sessionId: 'session-1',
            laneId: 'worktree:/tmp/worktrees/lane-b',
          },
        },
      },
    }, store);

    expect(store.addMessage).toHaveBeenCalledWith('workspace-1', 'session-1', expect.objectContaining({ id: 'message-1' }));
    expect(store.setSessions).toHaveBeenCalledWith('workspace-1', [
      expect.objectContaining({ id: 'session-1', messageCount: 1 }),
    ]);
  });
});

function createStoreMock(overrides: Partial<Pick<UIStore, 'sessionsByWorkspace' | 'messagesBySession'>> = {}): UIStore {
  const sessions = [makeSession({ id: 'session-1', state: 'idle' }), makeSession({ id: 'session-2', state: 'idle' })];
  const store = {
    sessionsByWorkspace: { 'workspace-1': sessions, ...(overrides.sessionsByWorkspace ?? {}) },
    messagesBySession: overrides.messagesBySession ?? {},
    taskEntriesByWorkspace: {},
    resultAnnotationsByWorkspace: {},
    pendingPermissions: {},
    setSessions: vi.fn((workspaceId: string, nextSessions: SessionSummary[]) => {
      store.sessionsByWorkspace[workspaceId] = nextSessions;
    }),
    updateMessage: vi.fn(),
    addMessage: vi.fn(),
    setMessages: vi.fn(),
    setPendingPermissions: vi.fn(),
    setEffort: vi.fn(),
    setSessionStreaming: vi.fn(),
    upsertVerificationRun: vi.fn(),
    applyVerificationProjection: vi.fn(),
  } as unknown as UIStore;

  return store;
}

function makeSession(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Test session',
    createdAt: overrides.createdAt ?? '2026-04-20T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-20T00:00:00.000Z',
    messageCount: overrides.messageCount ?? 0,
    parentId: overrides.parentId,
    state: overrides.state,
    changeSummary: overrides.changeSummary,
  };
}
