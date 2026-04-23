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
  adoptComparisonLane: vi.fn(),
  connectEvents: vi.fn(),
  createSession: vi.fn(),
  getBootstrap: vi.fn(),
  selectComparisonLane: vi.fn(),
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
    apiMocks.adoptComparisonLane.mockReset();
    apiMocks.connectEvents.mockReset();
    apiMocks.createSession.mockReset();
    apiMocks.getBootstrap.mockReset();
    apiMocks.selectComparisonLane.mockReset();
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

  it('renders a bounded compare-and-adopt surface with explicit lane selection and per-lane readiness summaries', async () => {
    const workspaceId = 'workspace-lane-surface';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    } as const;
    const fallbackLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-c', branch: 'feature/lane-c' },
    } as const;
    const primarySession = makeSession('session-lane-a', branchLane, {
      title: 'Branch attempt',
      updatedAt: '2026-04-21T00:08:00.000Z',
    });
    const secondarySession = makeSession('session-lane-b', worktreeLane, {
      title: 'Worktree attempt',
      updatedAt: '2026-04-21T00:07:00.000Z',
    });
    const fallbackSession = makeSession('session-lane-c', fallbackLane, {
      title: 'Fallback attempt',
      updatedAt: '2026-04-21T00:06:00.000Z',
    });

    apiMocks.getBootstrap.mockResolvedValue(makeBootstrapWithSessions(workspaceId, [
      primarySession,
      secondarySession,
      fallbackSession,
    ], [
      makeTaskLedgerRecord(workspaceId, primarySession.id, 'Lane A summary', 'https://github.com/example/repo/pull/31', branchLane),
      makeTaskLedgerRecord(workspaceId, secondarySession.id, 'Lane B summary', 'https://github.com/example/repo/pull/32', worktreeLane, {
        state: 'blocked',
        verification: 'unverified',
        shipState: 'blocked-by-checks',
        reviewState: 'needs-retry',
        verificationStatus: 'failed',
        verificationCommandKind: 'build',
        verificationSummary: 'Worktree build failed.',
      }),
      makeTaskLedgerRecord(workspaceId, fallbackSession.id, 'Lane C summary', 'https://github.com/example/repo/pull/33', fallbackLane, {
        shipState: 'local-ready',
      }),
    ]));
    apiMocks.listMessages.mockResolvedValue([makeMessage(workspaceId, primarySession.id, branchLane)]);

    useStore.getState().setActiveWorkspace(workspaceId);

    await renderShell();

    const laneSurface = getLaneSurface();

    expect(container.textContent).toContain('Alternative attempts');
    expect(container.textContent).toContain('Open thread · Attempt 1');
    expect(container.textContent).toContain('Alternative attempt 2');
    expect(container.textContent).toContain('Alternative attempt 3');
    expect(container.textContent).toContain('Branch · feature/lane-a');
    expect(container.textContent).toContain('Worktree · feature/lane-b');
    expect(container.textContent).toContain('Path · /tmp/worktrees/lane-b');
    expect(container.textContent).toContain('Select one alternative lane, then adopt it explicitly.');
    expect(container.textContent).toContain('Explicit adopt only');
    expect(container.textContent).toContain('Compare and adopt');
    expect(container.textContent).toContain('Branch attempt');
    expect(container.textContent).toContain('Worktree attempt');
    expect(container.textContent).toContain('Fallback attempt');
    expect(container.textContent).toContain('Verification');
    expect(container.textContent).toContain('Ship readiness');
    expect(container.textContent).toContain('Verified');
    expect(container.textContent).toContain('Unverified');
    expect(container.textContent).toContain('Verification passed for Lane A summary');
    expect(container.textContent).toContain('Worktree build failed.');
    expect(container.textContent).toContain('PR ready');
    expect(container.textContent).toContain('Blocked by checks');
    expect(container.textContent).toContain('Local ready');
    expect(container.textContent).toContain('Needs retry');
    expect(container.textContent).toContain('session-lane-a');
    expect(container.textContent).toContain('session-lane-b');
    expect(container.textContent).toContain('session-lane-c');
    expect(getButtonsByText(laneSurface, 'Select lane')).toHaveLength(2);
    expect(getButtonByText(laneSurface, 'Adopt selected lane')).toBeNull();
  });

  it('keeps exactly one lane selected, holds that selection through adoption, and differentiates the adopted outcome', async () => {
    const workspaceId = 'workspace-lane-adoption';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    } as const;
    const fallbackLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-c', branch: 'feature/lane-c' },
    } as const;
    const primarySession = makeSession('session-lane-a', branchLane, {
      title: 'Branch attempt',
      updatedAt: '2026-04-21T00:08:00.000Z',
    });
    const secondarySession = makeSession('session-lane-b', worktreeLane, {
      title: 'Worktree attempt',
      updatedAt: '2026-04-21T00:07:00.000Z',
    });
    const fallbackSession = makeSession('session-lane-c', fallbackLane, {
      title: 'Fallback attempt',
      updatedAt: '2026-04-21T00:06:00.000Z',
    });
    const taskLedgerRecords = [
      makeTaskLedgerRecord(workspaceId, primarySession.id, 'Lane A summary', 'https://github.com/example/repo/pull/31', branchLane),
      makeTaskLedgerRecord(workspaceId, secondarySession.id, 'Lane B summary', 'https://github.com/example/repo/pull/32', worktreeLane, {
        state: 'blocked',
        verification: 'unverified',
        shipState: 'blocked-by-checks',
        reviewState: 'needs-retry',
        verificationStatus: 'failed',
        verificationCommandKind: 'build',
        verificationSummary: 'Worktree build failed.',
      }),
      makeTaskLedgerRecord(workspaceId, fallbackSession.id, 'Lane C summary', 'https://github.com/example/repo/pull/33', fallbackLane, {
        shipState: 'local-ready',
      }),
    ];
    const sessions = [primarySession, secondarySession, fallbackSession];
    const selectedSecondary = makeLaneReference(secondarySession.id, worktreeLane);
    const selectedFallback = makeLaneReference(fallbackSession.id, fallbackLane);
    const initialBootstrap = makeBootstrapWithSessions(workspaceId, sessions, taskLedgerRecords);
    const secondarySelectedBootstrap = makeBootstrapWithSessions(workspaceId, sessions, taskLedgerRecords, {
      selectedLane: selectedSecondary,
    });
    const fallbackSelectedBootstrap = makeBootstrapWithSessions(workspaceId, sessions, taskLedgerRecords, {
      selectedLane: selectedFallback,
    });
    const adoptDeferred = createDeferred<WorkspaceBootstrap>();

    apiMocks.getBootstrap.mockResolvedValue(initialBootstrap);
    apiMocks.listMessages.mockResolvedValue([makeMessage(workspaceId, primarySession.id, branchLane)]);
    apiMocks.selectComparisonLane.mockImplementation(async (_workspaceId: string, request: { sessionId: string }) => {
      return request.sessionId === secondarySession.id ? secondarySelectedBootstrap : fallbackSelectedBootstrap;
    });
    apiMocks.adoptComparisonLane.mockReturnValue(adoptDeferred.promise);

    useStore.getState().setActiveWorkspace(workspaceId);

    await renderShell();

    const laneSurface = getLaneSurface();
    const secondaryLaneCard = getLaneCard('session-lane-b');
    const fallbackLaneCard = getLaneCard('session-lane-c');

    await clickButton(getButtonByText(secondaryLaneCard, 'Select lane')!);

    expect(secondaryLaneCard.textContent).toContain('Selected for adoption');
    expect(fallbackLaneCard.textContent).not.toContain('Selected for adoption');
    expect(countTextOccurrences(laneSurface.textContent ?? '', 'Selected for adoption')).toBe(1);
    expect(getButtonByText(laneSurface, 'Adopt selected lane')).toBeTruthy();

    await clickButton(getButtonByText(fallbackLaneCard, 'Select lane')!);

    expect(secondaryLaneCard.textContent).not.toContain('Selected for adoption');
    expect(fallbackLaneCard.textContent).toContain('Selected for adoption');
    expect(countTextOccurrences(laneSurface.textContent ?? '', 'Selected for adoption')).toBe(1);

    await clickButton(getButtonByText(laneSurface, 'Adopt selected lane')!, { settle: false });

    expect(fallbackLaneCard.textContent).toContain('Selected · adopting…');
    expect(laneSurface.textContent).toContain('Adopting lane…');
    expect(laneSurface.textContent).toContain('Verification');
    expect(laneSurface.textContent).toContain('Ship readiness');

    await act(async () => {
      adoptDeferred.resolve(makeBootstrapWithSessions(workspaceId, sessions, taskLedgerRecords, {
        selectedLane: selectedFallback,
        adoptedLane: selectedFallback,
      }));
      await flushAsync();
      await flushAsync();
    });

    expect(fallbackLaneCard.textContent).toContain('Adopted outcome');
    expect(fallbackLaneCard.textContent).not.toContain('Selected for adoption');
    expect(secondaryLaneCard.textContent).toContain('Not adopted');
    expect(getButtonByText(laneSurface, 'Adopt selected lane')).toBeNull();
    expect(laneSurface.textContent).toContain('Adopted outcome · Worktree · feature/lane-c — Fallback attempt');
    expect(apiMocks.selectComparisonLane).toHaveBeenCalledTimes(2);
    expect(apiMocks.adoptComparisonLane).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        ...selectedFallback,
        laneId: 'worktree:/tmp/worktrees/lane-c',
      }),
    );
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
  laneComparison?: WorkspaceBootstrap['laneComparison'],
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
    ...(laneComparison ? { laneComparison } : {}),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
    taskLedgerRecords,
  };
}

function makeLaneReference(
  sessionId: string,
  lane?: { laneId?: string; laneContext?: SessionSummary['laneContext'] },
) {
  return {
    sessionId,
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
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
  options: {
    taskId?: string;
    sourceMessageId?: string;
    state?: TaskLedgerRecord['state'];
    title?: string;
    verification?: NonNullable<TaskLedgerRecord['resultAnnotation']>['verification'];
    shipState?: NonNullable<TaskLedgerRecord['resultAnnotation']>['shipState'];
    reviewState?: NonNullable<TaskLedgerRecord['resultAnnotation']>['reviewState'];
    verificationStatus?: NonNullable<TaskLedgerRecord['recentVerificationRef']>['status'];
    verificationCommandKind?: NonNullable<TaskLedgerRecord['recentVerificationRef']>['commandKind'];
    verificationSummary?: string;
  } = {},
): TaskLedgerRecord {
  const taskId = options.taskId ?? 'task-1';
  const sourceMessageId = options.sourceMessageId ?? 'message-1';
  const verification = options.verification ?? 'verified';
  const shipState = options.shipState ?? 'pr-ready';
  const reviewState = options.reviewState;
  const verificationStatus = options.verificationStatus ?? 'passed';
  const verificationCommandKind = options.verificationCommandKind
    ?? (verificationStatus === 'failed' ? 'build' : 'test');
  const verificationSummary = options.verificationSummary
    ?? (verificationStatus === 'passed'
      ? `Verification passed for ${summary}`
      : `Verification ${verificationStatus} for ${summary}`);

  return {
    taskId,
    workspaceId,
    sessionId,
    sourceMessageId,
    title: options.title ?? 'Reconnect task',
    summary,
    state: options.state ?? 'completed',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:05:00.000Z',
    resultAnnotation: {
      sourceMessageId,
      workspaceId,
      sessionId,
      taskId,
      verification,
      summary,
      ...(shipState ? { shipState } : {}),
      ...(reviewState ? { reviewState } : {}),
      ...(lane?.laneId ? { laneId: lane.laneId } : {}),
      ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
    },
    recentVerificationRef: {
      runId: options.taskId ? `verify-${sessionId}-${taskId}` : `verify-${sessionId}`,
      commandKind: verificationCommandKind,
      status: verificationStatus,
      summary: verificationSummary,
      terminalLogRef: `verification-logs/${workspaceId}/${sessionId}.log`,
    },
    recentShipRef: {
      action: 'pullRequest',
      outcome: shipState === 'pr-ready' ? 'success' : 'blocked',
      sessionId,
      messageId: sourceMessageId,
      taskId,
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

function getLaneSurface(): HTMLElement {
  const laneSurface = Array.from(document.querySelectorAll('section')).find((section) =>
    section.textContent?.includes('Alternative attempts'),
  );

  expect(laneSurface).toBeTruthy();
  return laneSurface as HTMLElement;
}

function getLaneCard(sessionId: string): HTMLElement {
  const laneCard = Array.from(getLaneSurface().querySelectorAll('article')).find((article) =>
    article.textContent?.includes(sessionId),
  );

  expect(laneCard).toBeTruthy();
  return laneCard as HTMLElement;
}

function getButtonsByText(root: ParentNode, text: string): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button')).filter((button): button is HTMLButtonElement => button.textContent?.trim() === text);
}

function getButtonByText(root: ParentNode, text: string): HTMLButtonElement | null {
  return getButtonsByText(root, text)[0] ?? null;
}

async function clickButton(
  button: HTMLButtonElement,
  options: { settle?: boolean } = {},
): Promise<void> {
  const { settle = true } = options;

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();
    if (settle) {
      await flushAsync();
    }
  });
}

function countTextOccurrences(text: string, fragment: string): number {
  if (!fragment) return 0;
  return text.split(fragment).length - 1;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
