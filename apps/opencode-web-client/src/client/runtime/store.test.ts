import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

import { useStore } from './store.js';
import type { SessionSummary } from '../../shared/types.js';

const baseState = useStore.getState();

describe('store session streaming state', () => {
  beforeEach(() => {
    useStore.setState({
      ...baseState,
      sessionsByWorkspace: {},
      activeSessionByWorkspace: {},
      messagesBySession: {},
      pendingPermissions: {},
      serverStatusByWorkspace: {},
      workspaceBootstraps: {},
      effortByWorkspace: {},
      usageByWorkspace: {},
      usageLoadingByWorkspace: {},
      connectionByWorkspace: {},
      streamingBySession: {},
      selectedReasoningMessageId: null,
      activityFocusMessageId: null,
      activityFocusNonce: 0,
    }, false);
  });

  it('preserves explicit streaming state when session summaries have no state yet', () => {
    useStore.getState().setSessionStreaming('session-1', true);
    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1' })]);

    expect(useStore.getState().streamingBySession).toEqual({ 'session-1': true });
  });

  it('clears streaming state when a session becomes idle or disappears', () => {
    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1', state: 'running' })]);
    expect(useStore.getState().streamingBySession).toEqual({ 'session-1': true });

    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1', state: 'idle' })]);
    expect(useStore.getState().streamingBySession).toEqual({});

    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-2', state: 'running' })]);
    expect(useStore.getState().streamingBySession).toEqual({ 'session-2': true });

    useStore.getState().setSessions('workspace-1', []);
    expect(useStore.getState().streamingBySession).toEqual({});
  });
});

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
