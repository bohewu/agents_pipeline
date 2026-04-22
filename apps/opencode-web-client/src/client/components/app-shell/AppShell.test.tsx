// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  connectEvents: vi.fn(),
  createSession: vi.fn(),
  getBootstrap: vi.fn(),
  getWorkspaceContextCatalog: vi.fn(),
  getUsage: vi.fn(),
  getWorkspaceCapabilities: vi.fn(),
  listMessages: vi.fn(),
}));

vi.mock('../../lib/api-client.js', () => ({
  api: apiMocks,
}));

vi.mock('../../runtime/runtime-provider.js', () => ({
  RuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./Sidebar.js', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('./RightDrawer.js', () => ({ RightDrawer: () => <div data-testid="drawer" /> }));
vi.mock('../thread/Thread.js', () => ({ Thread: () => <div data-testid="thread" /> }));
vi.mock('../workspaces/AddWorkspaceDialog.js', () => ({ AddWorkspaceDialog: () => <div data-testid="workspace-dialog" /> }));
vi.mock('../settings/AppSettingsDialog.js', () => ({ AppSettingsDialog: () => <div data-testid="settings-dialog" /> }));

import { AppShell } from './AppShell.js';
import {
  selectActiveWorkspaceContextCapabilityEntries,
  selectActiveWorkspaceContextCatalog,
  selectActiveWorkspaceContextInstructionSources,
  useStore,
} from '../../runtime/store.js';
import type {
  NormalizedMessage,
  SessionSummary,
  TaskLedgerRecord,
  UsageDetails,
  WorkspaceBootstrap,
  WorkspaceCapabilityProbe,
  WorkspaceContextCatalogResponse,
} from '../../../shared/types.js';

const baseState = useStore.getState();

describe('AppShell continuity hydration', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let emitEvent: ((event: { type: string; timestamp: string; payload: Record<string, unknown> }) => void) | null;

  beforeEach(() => {
    resetStore();
    emitEvent = null;
    apiMocks.connectEvents.mockReset();
    apiMocks.createSession.mockReset();
    apiMocks.getBootstrap.mockReset();
    apiMocks.getWorkspaceContextCatalog.mockReset();
    apiMocks.getUsage.mockReset();
    apiMocks.getWorkspaceCapabilities.mockReset();
    apiMocks.listMessages.mockReset();
    apiMocks.connectEvents.mockImplementation((_workspaceId: string, onEvent: typeof emitEvent) => {
      emitEvent = onEvent;
      return vi.fn();
    });
    apiMocks.getUsage.mockResolvedValue(makeUsage());
    apiMocks.getWorkspaceContextCatalog.mockResolvedValue(makeContextCatalog('workspace-reconnect'));
    apiMocks.getWorkspaceCapabilities.mockResolvedValue(makeCapabilityProbe('workspace-reconnect'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
  });

  it('rehydrates workspace bootstrap task records on same-workspace reconnect', async () => {
    const workspaceId = 'workspace-reconnect';
    const sessionId = 'session-1';
    const initialBootstrap = makeBootstrap(workspaceId, sessionId, 'Task summary before reconnect', 'https://github.com/example/repo/pull/1');
    const reconnectedBootstrap = makeBootstrap(workspaceId, sessionId, 'Task summary after reconnect', 'https://github.com/example/repo/pull/2');
    const initialCatalog = makeContextCatalog(workspaceId, {
      instructionId: 'project-local:agents-file:before-reconnect',
      capabilityId: 'project-local:commands:before-reconnect',
    });
    const reconnectedCatalog = makeContextCatalog(workspaceId, {
      instructionId: 'project-local:agents-file:after-reconnect',
      capabilityId: 'project-local:commands:after-reconnect',
    });

    apiMocks.getBootstrap
      .mockResolvedValueOnce(initialBootstrap)
      .mockResolvedValueOnce(reconnectedBootstrap);
    apiMocks.getWorkspaceContextCatalog
      .mockResolvedValueOnce(initialCatalog)
      .mockResolvedValueOnce(reconnectedCatalog);
    apiMocks.listMessages.mockResolvedValue([makeMessage(workspaceId, sessionId)]);

    useStore.getState().setActiveWorkspace(workspaceId);

    await renderShell();

    expect(apiMocks.getBootstrap).toHaveBeenCalledTimes(1);
    expect(apiMocks.getWorkspaceContextCatalog).toHaveBeenCalledTimes(1);
    expect(apiMocks.getWorkspaceContextCatalog).toHaveBeenCalledWith(workspaceId);
    expect(apiMocks.listMessages).toHaveBeenCalledWith(workspaceId, sessionId);
    expect(selectActiveWorkspaceContextCatalog(useStore.getState())?.workspaceId).toBe(workspaceId);
    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:before-reconnect',
    ]);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:before-reconnect',
    ]);
    expect(useStore.getState().workspaceBootstraps[workspaceId]?.taskLedgerRecords?.[0]).toEqual(
      expect.objectContaining({
        summary: 'Task summary before reconnect',
        recentVerificationRef: expect.objectContaining({
          runId: `verify-${sessionId}`,
          commandKind: 'test',
          status: 'passed',
          summary: 'Verification passed for Task summary before reconnect',
        }),
        recentShipRef: expect.objectContaining({
          pullRequestUrl: 'https://github.com/example/repo/pull/1',
        }),
      }),
    );
    expect(useStore.getState().taskEntriesByWorkspace[workspaceId]?.[sessionId]?.['task-1']).toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        workspaceId,
        sessionId,
        state: 'completed',
        latestSummary: 'Task summary before reconnect',
      }),
    );
    expect(useStore.getState().resultAnnotationsByWorkspace[workspaceId]?.[sessionId]?.['message-1']).toEqual(
      expect.objectContaining({
        sourceMessageId: 'message-1',
        workspaceId,
        sessionId,
        taskId: 'task-1',
        summary: 'Task summary before reconnect',
      }),
    );

    await act(async () => {
      emitEvent?.({
        type: 'connection.ping',
        timestamp: '2026-04-21T12:10:00.000Z',
        payload: { reconnected: true },
      });
      await flushAsync();
      await flushAsync();
    });

    expect(apiMocks.getBootstrap).toHaveBeenCalledTimes(2);
    expect(apiMocks.getWorkspaceContextCatalog).toHaveBeenCalledTimes(2);
    expect(apiMocks.listMessages).toHaveBeenCalledTimes(2);
    expect(useStore.getState().activeSessionByWorkspace[workspaceId]).toBe(sessionId);
    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:after-reconnect',
    ]);
    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).not.toContain(
      'project-local:agents-file:before-reconnect',
    );
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:after-reconnect',
    ]);
    expect(useStore.getState().workspaceContextCatalogByWorkspace[workspaceId]?.capabilityEntries.map((entry) => entry.id)).toEqual([
      'project-local:commands:after-reconnect',
    ]);
    expect(useStore.getState().workspaceBootstraps[workspaceId]?.taskLedgerRecords?.[0]).toEqual(
      expect.objectContaining({
        summary: 'Task summary after reconnect',
        recentVerificationRef: expect.objectContaining({
          summary: 'Verification passed for Task summary after reconnect',
        }),
        recentShipRef: expect.objectContaining({
          pullRequestUrl: 'https://github.com/example/repo/pull/2',
        }),
      }),
    );
    expect(useStore.getState().taskEntriesByWorkspace[workspaceId]?.[sessionId]?.['task-1']).toEqual(
      expect.objectContaining({
        workspaceId,
        sessionId,
        latestSummary: 'Task summary after reconnect',
      }),
    );
    expect(useStore.getState().connectionByWorkspace[workspaceId]).toBe('connected');
  });

  it('switches active workspace context catalogs without merging entries across workspaces', async () => {
    const workspaceOne = 'workspace-one';
    const workspaceTwo = 'workspace-two';

    apiMocks.getBootstrap.mockImplementation(async (workspaceId: string) => {
      if (workspaceId === workspaceOne) {
        return makeBootstrap(workspaceOne, 'session-one', 'Workspace one summary', 'https://github.com/example/repo/pull/11');
      }

      return makeBootstrap(workspaceTwo, 'session-two', 'Workspace two summary', 'https://github.com/example/repo/pull/22');
    });
    apiMocks.getWorkspaceContextCatalog.mockImplementation(async (workspaceId: string) => {
      if (workspaceId === workspaceOne) {
        return makeContextCatalog(workspaceOne, {
          instructionId: 'project-local:agents-file:workspace-one',
          capabilityId: 'project-local:commands:workspace-one',
        });
      }

      return makeContextCatalog(workspaceTwo, {
        instructionId: 'project-local:agents-file:workspace-two',
        capabilityId: 'project-local:commands:workspace-two',
      });
    });
    apiMocks.listMessages.mockImplementation(async (_workspaceId: string, sessionId: string) => [
      makeMessage(sessionId === 'session-one' ? workspaceOne : workspaceTwo, sessionId),
    ]);

    useStore.getState().setActiveWorkspace(workspaceOne);

    await renderShell();

    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:workspace-one',
    ]);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:workspace-one',
    ]);

    await act(async () => {
      useStore.getState().setActiveWorkspace(workspaceTwo);
      await flushAsync();
      await flushAsync();
    });

    expect(apiMocks.getWorkspaceContextCatalog).toHaveBeenCalledWith(workspaceOne);
    expect(apiMocks.getWorkspaceContextCatalog).toHaveBeenCalledWith(workspaceTwo);
    expect(selectActiveWorkspaceContextCatalog(useStore.getState())?.workspaceId).toBe(workspaceTwo);
    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:workspace-two',
    ]);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:workspace-two',
    ]);
    expect(useStore.getState().workspaceContextCatalogByWorkspace[workspaceOne]?.instructionSources.map((entry) => entry.id)).toEqual([
      'project-local:agents-file:workspace-one',
    ]);
    expect(useStore.getState().workspaceContextCatalogByWorkspace[workspaceTwo]?.capabilityEntries.map((entry) => entry.id)).toEqual([
      'project-local:commands:workspace-two',
    ]);
  });

  async function renderShell(): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(<AppShell />);
      await flushAsync();
      await flushAsync();
    });
  }
});

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
    workspaceContextCatalogByWorkspace: {},
    workspaceContextCatalogLoadingByWorkspace: {},
    workspaceContextCatalogErrorByWorkspace: {},
    workspaceGitStatusByWorkspace: {},
    workspaceShipActionResultsByWorkspace: {},
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
  }, false);
}

function makeBootstrap(
  workspaceId: string,
  sessionId: string,
  summary: string,
  pullRequestUrl: string,
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions: [makeSession(sessionId)],
    capabilities: makeCapabilityProbe(workspaceId),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
    taskLedgerRecords: [makeTaskLedgerRecord(workspaceId, sessionId, summary, pullRequestUrl)],
  };
}

function makeSession(sessionId: string): SessionSummary {
  return {
    id: sessionId,
    title: 'Reconnect session',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:05:00.000Z',
    messageCount: 1,
    state: 'idle',
  };
}

function makeMessage(workspaceId: string, sessionId: string): NormalizedMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    createdAt: '2026-04-21T00:05:00.000Z',
    parts: [{ type: 'text', text: 'Reconnect message' }],
    trace: {
      sourceMessageId: 'message-1',
      workspaceId,
      sessionId,
    },
  };
}

function makeTaskLedgerRecord(
  workspaceId: string,
  sessionId: string,
  summary: string,
  pullRequestUrl: string,
): TaskLedgerRecord {
  return {
    taskId: 'task-1',
    workspaceId,
    sessionId,
    sourceMessageId: 'message-1',
    title: 'Reconnect task',
    summary,
    state: 'completed',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:05:00.000Z',
    resultAnnotation: {
      sourceMessageId: 'message-1',
      workspaceId,
      sessionId,
      taskId: 'task-1',
      verification: 'verified',
      summary,
      shipState: 'pr-ready',
    },
    recentVerificationRef: {
      runId: `verify-${sessionId}`,
      commandKind: 'test',
      status: 'passed',
      summary: `Verification passed for ${summary}`,
      terminalLogRef: `verification-logs/${workspaceId}/${sessionId}.log`,
    },
    recentShipRef: {
      action: 'pullRequest',
      outcome: 'success',
      sessionId,
      messageId: 'message-1',
      taskId: 'task-1',
      pullRequestUrl,
    },
  };
}

function makeCapabilityProbe(workspaceId: string): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const;
  return {
    workspaceId,
    checkedAt: '2026-04-21T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
  };
}

function makeContextCatalog(
  workspaceId: string,
  overrides?: { instructionId?: string; capabilityId?: string },
): WorkspaceContextCatalogResponse {
  return {
    workspaceId,
    collectedAt: '2026-04-22T00:00:00.000Z',
    instructionSources: [
      {
        id: overrides?.instructionId ?? `project-local:agents-file:${workspaceId}`,
        category: 'agents-file',
        sourceLayer: 'project-local',
        label: `Workspace AGENTS.md ${workspaceId}`,
        status: 'available',
        path: `/tmp/${workspaceId}/AGENTS.md`,
      },
    ],
    capabilityEntries: [
      {
        id: overrides?.capabilityId ?? `project-local:commands:${workspaceId}`,
        category: 'command',
        sourceLayer: 'project-local',
        label: `Project-local commands ${workspaceId}`,
        status: 'available',
        path: `/tmp/${workspaceId}/opencode/commands`,
        itemCount: 1,
        items: [`/${workspaceId}`],
      },
    ],
  };
}

function makeUsage(): UsageDetails {
  return {
    provider: 'auto',
    status: 'ok',
    data: {},
  };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
