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
  selectSessionMessages,
  selectWorkspaceSessionLanes,
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
    const initialLane = { laneContext: { kind: 'branch', branch: 'feature/reconnect-before' } } as const;
    const reconnectedLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/reconnect-after', branch: 'feature/reconnect-after' },
    } as const;
    const initialBootstrap = makeBootstrap(
      workspaceId,
      sessionId,
      'Task summary before reconnect',
      'https://github.com/example/repo/pull/1',
      initialLane,
    );
    const reconnectedBootstrap = makeBootstrap(
      workspaceId,
      sessionId,
      'Task summary after reconnect',
      'https://github.com/example/repo/pull/2',
      reconnectedLane,
    );
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
    apiMocks.listMessages
      .mockResolvedValueOnce([makeMessage(workspaceId, sessionId, initialLane)])
      .mockResolvedValueOnce([makeMessage(workspaceId, sessionId, reconnectedLane)]);

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
    expect(Object.values(useStore.getState().taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {})).toEqual([
      expect.objectContaining({
        taskId: 'task-1',
        workspaceId,
        sessionId,
        state: 'completed',
        latestSummary: 'Task summary before reconnect',
        laneId: 'branch:feature/reconnect-before',
      }),
    ]);
    expect(Object.values(useStore.getState().resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {})).toEqual([
      expect.objectContaining({
        sourceMessageId: 'message-1',
        workspaceId,
        sessionId,
        taskId: 'task-1',
        summary: 'Task summary before reconnect',
      }),
    ]);

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
    expect(selectWorkspaceSessionLanes(useStore.getState(), workspaceId)).toEqual([
      expect.objectContaining({ sessionId, laneId: 'worktree:/tmp/worktrees/reconnect-after' }),
    ]);
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
    expect(Object.values(useStore.getState().taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {})).toEqual([
      expect.objectContaining({
        workspaceId,
        sessionId,
        latestSummary: 'Task summary after reconnect',
        laneId: 'worktree:/tmp/worktrees/reconnect-after',
      }),
    ]);
    expect(selectSessionMessages(useStore.getState(), workspaceId, sessionId)).toEqual([
      expect.objectContaining({
        trace: expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/reconnect-after' }),
      }),
    ]);
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

  it('renders a compact multi-lane surface when one workspace hydrates sibling attempts', async () => {
    const workspaceId = 'workspace-lane-surface';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    } as const;
    const primarySession = makeSession('session-lane-a', branchLane, {
      title: 'Branch attempt',
      updatedAt: '2026-04-21T00:07:00.000Z',
    });
    const secondarySession = makeSession('session-lane-b', worktreeLane, {
      title: 'Worktree attempt',
      updatedAt: '2026-04-21T00:06:00.000Z',
    });

    apiMocks.getBootstrap.mockResolvedValue(makeBootstrapWithSessions(workspaceId, [
      primarySession,
      secondarySession,
    ], [
      makeTaskLedgerRecord(workspaceId, primarySession.id, 'Lane A summary', 'https://github.com/example/repo/pull/31', branchLane),
      makeTaskLedgerRecord(workspaceId, secondarySession.id, 'Lane B summary', 'https://github.com/example/repo/pull/32', worktreeLane),
    ]));
    apiMocks.listMessages.mockResolvedValue([makeMessage(workspaceId, primarySession.id, branchLane)]);

    useStore.getState().setActiveWorkspace(workspaceId);

    await renderShell();

    expect(container.textContent).toContain('Alternative attempts');
    expect(container.textContent).toContain('Open thread · Attempt 1');
    expect(container.textContent).toContain('Alternative attempt 2');
    expect(container.textContent).toContain('Branch · feature/lane-a');
    expect(container.textContent).toContain('Worktree · feature/lane-b');
    expect(container.textContent).toContain('Path · /tmp/worktrees/lane-b');
    expect(container.textContent).toContain('Branch attempt');
    expect(container.textContent).toContain('Worktree attempt');
    expect(container.textContent).toContain('session-lane-a');
    expect(container.textContent).toContain('session-lane-b');
  });

  it('keeps the two-lane surface limited to lane context without compare or readiness guardrail regressions', async () => {
    const workspaceId = 'workspace-lane-guardrails';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    } as const;
    const primarySession = makeSession('session-lane-a', branchLane, {
      title: 'Branch attempt',
      updatedAt: '2026-04-21T00:07:00.000Z',
    });
    const secondarySession = makeSession('session-lane-b', worktreeLane, {
      title: 'Worktree attempt',
      updatedAt: '2026-04-21T00:06:00.000Z',
    });

    apiMocks.getBootstrap.mockResolvedValue(makeBootstrapWithSessions(workspaceId, [
      primarySession,
      secondarySession,
    ], [
      makeTaskLedgerRecord(workspaceId, primarySession.id, 'Lane A summary', 'https://github.com/example/repo/pull/31', branchLane),
      makeTaskLedgerRecord(workspaceId, secondarySession.id, 'Lane B summary', 'https://github.com/example/repo/pull/32', worktreeLane),
    ]));
    apiMocks.listMessages.mockResolvedValue([makeMessage(workspaceId, primarySession.id, branchLane)]);

    useStore.getState().setActiveWorkspace(workspaceId);

    await renderShell();

    const laneSurface = Array.from(container.querySelectorAll('section')).find((section) =>
      section.textContent?.includes('Alternative attempts'),
    );

    expect(laneSurface).toBeTruthy();
    expect(laneSurface?.querySelector('button')).toBeNull();
    expect(laneSurface?.textContent).toContain('Alternative attempts');
    expect(laneSurface?.textContent).toContain('Open thread · Attempt 1');
    expect(laneSurface?.textContent).toContain('Alternative attempt 2');
    expect(laneSurface?.textContent).not.toContain('Compare attempts');
    expect(laneSurface?.textContent).not.toContain('Adopt selected');
    expect(laneSurface?.textContent).not.toContain('Final selection');
    expect(laneSurface?.textContent).not.toContain('Selected attempt');
    expect(laneSurface?.textContent).not.toContain('PR ready');
    expect(laneSurface?.textContent).not.toContain('Verified');
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
  lane?: { laneId?: string; laneContext?: SessionSummary['laneContext'] },
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions: [makeSession(sessionId, lane)],
    capabilities: makeCapabilityProbe(workspaceId),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
    taskLedgerRecords: [makeTaskLedgerRecord(workspaceId, sessionId, summary, pullRequestUrl, lane)],
  };
}

function makeBootstrapWithSessions(
  workspaceId: string,
  sessions: SessionSummary[],
  taskLedgerRecords: TaskLedgerRecord[],
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions,
    capabilities: makeCapabilityProbe(workspaceId),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
    taskLedgerRecords,
  };
}

function makeSession(
  sessionId: string,
  lane?: { laneId?: string; laneContext?: SessionSummary['laneContext'] },
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id: sessionId,
    title: 'Reconnect session',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:05:00.000Z',
    messageCount: 1,
    state: 'idle',
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
    ...overrides,
  };
}

function makeMessage(
  workspaceId: string,
  sessionId: string,
  lane?: { laneId?: string; laneContext?: SessionSummary['laneContext'] },
): NormalizedMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    createdAt: '2026-04-21T00:05:00.000Z',
    parts: [{ type: 'text', text: 'Reconnect message' }],
    trace: {
      sourceMessageId: 'message-1',
      workspaceId,
      sessionId,
      ...(lane?.laneId ? { laneId: lane.laneId } : {}),
      ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
    },
  };
}

function makeTaskLedgerRecord(
  workspaceId: string,
  sessionId: string,
  summary: string,
  pullRequestUrl: string,
  lane?: { laneId?: string; laneContext?: SessionSummary['laneContext'] },
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
      ...(lane?.laneId ? { laneId: lane.laneId } : {}),
      ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
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
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
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
