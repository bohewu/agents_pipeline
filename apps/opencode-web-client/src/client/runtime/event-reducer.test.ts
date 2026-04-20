import { describe, expect, it, vi } from 'vitest';
import { handleBffEvent } from './event-reducer.js';
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

    expect(store.setSessionStreaming).toHaveBeenCalledWith('session-1', true);
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

    expect(store.setSessionStreaming).toHaveBeenCalledWith('session-1', false);
  });
});

function createStoreMock(): UIStore {
  const sessions = [makeSession({ id: 'session-1', state: 'idle' }), makeSession({ id: 'session-2', state: 'idle' })];
  const store = {
    sessionsByWorkspace: { 'workspace-1': sessions },
    messagesBySession: {},
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
