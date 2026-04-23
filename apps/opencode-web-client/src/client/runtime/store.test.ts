import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

import {
  selectActiveWorkspaceContextCatalog,
  selectActiveWorkspaceContextCatalogError,
  selectActiveWorkspaceContextCatalogLoading,
  selectActiveWorkspaceBrowserEvidenceCapabilityState,
  selectActiveWorkspaceContextCapabilityEntries,
  selectActiveWorkspaceContextInstructionSources,
  selectActiveWorkspaceTaskLedgerRecords,
  selectActiveWorkspaceCapabilityGaps,
  selectActiveWorkspaceCapabilities,
  selectActiveWorkspaceGitStatus,
  selectActiveWorkspaceShipActionResults,
  selectActiveWorkspaceSessionLanes,
  selectActiveWorkspaceVerificationRuns,
  resolveWorkspaceSessionStoreKey,
  selectMessageResultTrace,
  selectSessionLane,
  selectSessionTaskLedgerRecords,
  selectSessionMessages,
  selectWorkspaceSessionLanes,
  selectWorkspaceLaneComparisonSummaries,
  selectActiveWorkspaceLaneComparisonSummaries,
  selectWorkspaceVerificationRuns,
  useStore,
} from './store.js';
import type {
  BrowserEvidenceRecord,
  LaneAttribution,
  NormalizedMessage,
  ResultAnnotation,
  SessionSummary,
  TaskEntry,
  TaskLedgerRecord,
  VerificationRun,
  WorkspaceCapabilityProbe,
  WorkspaceBootstrap,
  WorkspaceContextCatalogResponse,
  WorkspaceGitStatusResult,
  WorkspaceLaneRecord,
} from '../../shared/types.js';

const baseState = useStore.getState();

describe('store session streaming state', () => {
  beforeEach(() => {
    useStore.setState({
      ...baseState,
      sessionsByWorkspace: {},
      activeSessionByWorkspace: {},
      messagesBySession: {},
      taskEntriesByWorkspace: {},
      resultAnnotationsByWorkspace: {},
      pendingPermissions: {},
      serverStatusByWorkspace: {},
      workspaceBootstraps: {},
      workspaceCapabilitiesByWorkspace: {},
      workspaceContextCatalogByWorkspace: {},
      workspaceContextCatalogLoadingByWorkspace: {},
      workspaceContextCatalogErrorByWorkspace: {},
      workspaceGitStatusByWorkspace: {},
      workspaceShipActionResultsByWorkspace: {},
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

  it('preserves explicit streaming state with workspace-scoped keys', () => {
    useStore.getState().setSessionStreaming('workspace-1', 'session-1', true);
    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1' })]);

    expect(useStore.getState().streamingBySession).toEqual({
      [resolveWorkspaceSessionStoreKey('workspace-1', 'session-1')]: true,
    });
  });

  it('clears streaming state when a workspace session becomes idle or disappears', () => {
    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1', state: 'running' })]);
    expect(useStore.getState().streamingBySession).toEqual({
      [resolveWorkspaceSessionStoreKey('workspace-1', 'session-1')]: true,
    });

    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-1', state: 'idle' })]);
    expect(useStore.getState().streamingBySession).toEqual({});

    useStore.getState().setSessions('workspace-1', [makeSession({ id: 'session-2', state: 'running' })]);
    expect(useStore.getState().streamingBySession).toEqual({
      [resolveWorkspaceSessionStoreKey('workspace-1', 'session-2')]: true,
    });

    useStore.getState().setSessions('workspace-1', []);
    expect(useStore.getState().streamingBySession).toEqual({});
  });

  it('hydrates workspace traceability from bootstrap summaries', () => {
    const workspaceId = 'workspace-bootstrap';
    const sessionId = 'session-bootstrap';
    const taskEntry = makeTaskEntry(workspaceId, sessionId, 'message-bootstrap', 'task-bootstrap', 'Bootstrap summary');
    const annotation = makeResultAnnotation(workspaceId, sessionId, 'message-bootstrap', 'task-bootstrap', 'verified', 'Bootstrap summary');

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, {
      taskEntries: [taskEntry],
      resultAnnotations: [annotation],
    }));

    const resolved = selectMessageResultTrace(useStore.getState(), makeAssistantMessage(workspaceId, sessionId, 'message-bootstrap', 'task-bootstrap'));

    expect(resolved?.summary).toBe('Bootstrap summary');
    expect(resolved?.annotation?.verification).toBe('verified');
    expect(resolved?.trace.taskId).toBe('task-bootstrap');
  });

  it('preserves task ledger summaries and refs when session messages reload after bootstrap hydration', () => {
    const workspaceId = 'workspace-ledger-bootstrap';
    const sessionId = 'session-ledger-bootstrap';
    const taskRecord = makeTaskLedgerRecord(workspaceId, sessionId, 'task-ledger-bootstrap', 'blocked', {
      sourceMessageId: 'message-ledger-bootstrap',
      summary: 'Blocked while waiting on ship review.',
      resultAnnotation: {
        sourceMessageId: 'message-ledger-bootstrap',
        workspaceId,
        sessionId,
        taskId: 'task-ledger-bootstrap',
        verification: 'partially verified',
        summary: 'Blocked while waiting on ship review.',
        shipState: 'pr-ready',
      },
      recentVerificationRef: {
        runId: 'verify-ledger-bootstrap',
        commandKind: 'test',
        status: 'passed',
        summary: 'Test verification passed.',
        terminalLogRef: 'verification-logs/workspace-ledger-bootstrap/verify-ledger-bootstrap.log',
      },
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId,
        messageId: 'message-ledger-bootstrap',
        taskId: 'task-ledger-bootstrap',
        terminalLogRef: 'ship-logs/workspace-ledger-bootstrap/pr.log',
        pullRequestUrl: 'https://github.com/example/repo/pull/42',
      },
    });

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(
      workspaceId,
      undefined,
      undefined,
      undefined,
      undefined,
      [taskRecord],
    ));
    useStore.getState().setMessages(workspaceId, sessionId, [
      {
        id: 'message-ledger-bootstrap',
        role: 'assistant',
        createdAt: '2026-04-20T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Message text without task metadata.' }],
        trace: {
          sourceMessageId: 'message-ledger-bootstrap',
          workspaceId,
          sessionId,
        },
      },
    ]);

    const message = selectSessionMessages(useStore.getState(), workspaceId, sessionId)[0]!;
    const resolved = selectMessageResultTrace(useStore.getState(), message);

    expect(resolved?.taskEntry).toEqual(expect.objectContaining({
      taskId: 'task-ledger-bootstrap',
      workspaceId,
      sessionId,
      state: 'blocked',
      latestSummary: 'Blocked while waiting on ship review.',
    }));
    expect(resolved?.annotation).toEqual(expect.objectContaining({
      sourceMessageId: 'message-ledger-bootstrap',
      shipState: 'pr-ready',
      verification: 'partially verified',
    }));
    expect(selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId)).toEqual([taskRecord]);
    expect(selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId)[0]?.recentShipRef?.pullRequestUrl).toBe(
      'https://github.com/example/repo/pull/42',
    );
  });

  it('keeps traceability isolated when different workspaces reuse the same session id', () => {
    const sharedSessionId = 'shared-session';

    useStore.getState().setMessages('workspace-1', sharedSessionId, [
      makeAssistantMessage('workspace-1', sharedSessionId, 'message-1', 'task-1', {
        summary: 'Workspace 1 verified summary',
        verification: 'verified',
      }),
    ]);
    useStore.getState().setMessages('workspace-2', sharedSessionId, [
      makeAssistantMessage('workspace-2', sharedSessionId, 'message-2', 'task-2', {
        summary: 'Workspace 2 unverified summary',
        verification: 'unverified',
      }),
    ]);

    const workspace1Message = selectSessionMessages(useStore.getState(), 'workspace-1', sharedSessionId)[0];
    const workspace2Message = selectSessionMessages(useStore.getState(), 'workspace-2', sharedSessionId)[0];

    expect(workspace1Message?.id).toBe('message-1');
    expect(workspace2Message?.id).toBe('message-2');
    expect(selectMessageResultTrace(useStore.getState(), workspace1Message!)?.summary).toBe('Workspace 1 verified summary');
    expect(selectMessageResultTrace(useStore.getState(), workspace2Message!)?.summary).toBe('Workspace 2 unverified summary');
    expect(useStore.getState().taskEntriesByWorkspace['workspace-1'][sharedSessionId]['task-1']?.workspaceId).toBe('workspace-1');
    expect(useStore.getState().taskEntriesByWorkspace['workspace-2'][sharedSessionId]['task-2']?.workspaceId).toBe('workspace-2');
  });

  it('exposes lane metadata keyed by workspace and session context for downstream selectors', () => {
    const workspaceId = 'workspace-session-lanes';
    useStore.getState().setSessions(workspaceId, [
      makeSession({
        id: 'session-lane-a',
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      }),
      makeSession({
        id: 'session-lane-b',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      }),
    ]);
    useStore.getState().setActiveWorkspace(workspaceId);

    expect(selectSessionLane(useStore.getState(), workspaceId, 'session-lane-a')).toEqual(expect.objectContaining({
      workspaceId,
      sessionId: 'session-lane-a',
      laneId: 'branch:feature/lane-a',
    }));
    expect(selectWorkspaceSessionLanes(useStore.getState(), workspaceId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: 'session-lane-a', laneId: 'branch:feature/lane-a' }),
      expect.objectContaining({ sessionId: 'session-lane-b', laneId: 'worktree:/tmp/worktrees/lane-b' }),
    ]));
    expect(selectActiveWorkspaceSessionLanes(useStore.getState())).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: 'session-lane-a', laneId: 'branch:feature/lane-a' }),
      expect.objectContaining({ sessionId: 'session-lane-b', laneId: 'worktree:/tmp/worktrees/lane-b' }),
    ]));
  });

  it('keeps refreshed lane hydration isolated when different workspaces reuse the same session id', () => {
    const sharedSessionId = 'shared-session';
    useStore.getState().setWorkspaceBootstrap('workspace-1', {
      ...makeBootstrap('workspace-1', { taskEntries: [], resultAnnotations: [] }),
      sessions: [makeSession({ id: sharedSessionId, laneContext: { kind: 'branch', branch: 'feature/workspace-one' } })],
    });
    useStore.getState().setWorkspaceBootstrap('workspace-2', {
      ...makeBootstrap('workspace-2', { taskEntries: [], resultAnnotations: [] }),
      sessions: [makeSession({
        id: sharedSessionId,
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/workspace-two', branch: 'feature/workspace-two' },
      })],
    });

    expect(selectWorkspaceSessionLanes(useStore.getState(), 'workspace-1')).toEqual([
      expect.objectContaining({ sessionId: sharedSessionId, laneId: 'branch:feature/workspace-one' }),
    ]);
    expect(selectWorkspaceSessionLanes(useStore.getState(), 'workspace-2')).toEqual([
      expect.objectContaining({ sessionId: sharedSessionId, laneId: 'worktree:/tmp/worktrees/workspace-two' }),
    ]);

    useStore.getState().setWorkspaceBootstrap('workspace-1', {
      ...makeBootstrap('workspace-1', { taskEntries: [], resultAnnotations: [] }),
      sessions: [makeSession({ id: sharedSessionId, laneContext: { kind: 'branch', branch: 'feature/workspace-one-refreshed' } })],
    });

    expect(selectWorkspaceSessionLanes(useStore.getState(), 'workspace-1')).toEqual([
      expect.objectContaining({ sessionId: sharedSessionId, laneId: 'branch:feature/workspace-one-refreshed' }),
    ]);
    expect(selectWorkspaceSessionLanes(useStore.getState(), 'workspace-2')).toEqual([
      expect.objectContaining({ sessionId: sharedSessionId, laneId: 'worktree:/tmp/worktrees/workspace-two' }),
    ]);
  });

  it('keeps task ledger records isolated by workspace and session selectors', () => {
    const sharedSessionId = 'shared-session';
    const workspaceOneRecord = makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-1', 'running', {
      summary: 'Workspace 1 task',
      recentVerificationRef: {
        runId: 'verify-1',
        commandKind: 'lint',
        status: 'passed',
        summary: 'Workspace 1 lint passed.',
      },
    });
    const workspaceTwoRecord = makeTaskLedgerRecord('workspace-2', sharedSessionId, 'task-2', 'completed', {
      summary: 'Workspace 2 task',
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId: sharedSessionId,
        taskId: 'task-2',
        pullRequestUrl: 'https://github.com/example/repo/pull/84',
      },
    });

    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', undefined, undefined, undefined, undefined, [workspaceOneRecord]));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', undefined, undefined, undefined, undefined, [workspaceTwoRecord]));
    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceTaskLedgerRecords(useStore.getState())).toEqual([workspaceTwoRecord]);
    expect(selectSessionTaskLedgerRecords(useStore.getState(), 'workspace-1', sharedSessionId)).toEqual([workspaceOneRecord]);
    expect(selectSessionTaskLedgerRecords(useStore.getState(), 'workspace-2', sharedSessionId)[0]?.recentShipRef?.pullRequestUrl).toBe(
      'https://github.com/example/repo/pull/84',
    );
  });

  it('projects per-lane comparison readiness from lane records without sibling session message hydration', () => {
    const workspaceId = 'workspace-lane-comparison';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    } as const;

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId, undefined),
      laneRecords: [
        makeLaneRecord(workspaceId, 'session-lane-a', branchLane, {
          session: makeSession({ id: 'session-lane-a', title: 'Branch attempt', updatedAt: '2026-04-22T00:02:00.000Z' }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, 'session-lane-a', 'task-lane-a', 'completed', {
              sourceMessageId: 'message-lane-a',
              summary: 'Branch lane summary',
              resultAnnotation: {
                sourceMessageId: 'message-lane-a',
                workspaceId,
                sessionId: 'session-lane-a',
                taskId: 'task-lane-a',
                verification: 'verified',
                summary: 'Branch lane summary',
                shipState: 'pr-ready',
                ...branchLane,
              },
              recentVerificationRef: {
                runId: 'verify-lane-a',
                commandKind: 'test',
                status: 'passed',
                summary: 'Branch tests passed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'success',
                sessionId: 'session-lane-a',
                taskId: 'task-lane-a',
                pullRequestUrl: 'https://github.com/example/repo/pull/41',
              },
              ...branchLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-lane-a',
              workspaceId,
              sessionId: 'session-lane-a',
              sourceMessageId: 'message-lane-a',
              taskId: 'task-lane-a',
              commandKind: 'test',
              status: 'passed',
              startedAt: '2026-04-22T00:01:00.000Z',
              summary: 'Branch tests passed.',
              ...branchLane,
            },
          ],
        }),
        makeLaneRecord(workspaceId, 'session-lane-b', worktreeLane, {
          session: makeSession({ id: 'session-lane-b', title: 'Worktree attempt', updatedAt: '2026-04-22T00:01:00.000Z' }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, 'session-lane-b', 'task-lane-b', 'blocked', {
              sourceMessageId: 'message-lane-b',
              summary: 'Worktree lane summary',
              resultAnnotation: {
                sourceMessageId: 'message-lane-b',
                workspaceId,
                sessionId: 'session-lane-b',
                taskId: 'task-lane-b',
                verification: 'unverified',
                summary: 'Worktree lane summary',
                shipState: 'blocked-by-checks',
                reviewState: 'needs-retry',
                ...worktreeLane,
              },
              recentVerificationRef: {
                runId: 'verify-lane-b',
                commandKind: 'build',
                status: 'failed',
                summary: 'Worktree build failed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'blocked',
                sessionId: 'session-lane-b',
                taskId: 'task-lane-b',
                pullRequestUrl: 'https://github.com/example/repo/pull/42',
              },
              ...worktreeLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-lane-b',
              workspaceId,
              sessionId: 'session-lane-b',
              sourceMessageId: 'message-lane-b',
              taskId: 'task-lane-b',
              commandKind: 'build',
              status: 'failed',
              startedAt: '2026-04-22T00:01:30.000Z',
              summary: 'Worktree build failed.',
              ...worktreeLane,
            },
          ],
        }),
      ],
    });

    const laneSummaries = selectWorkspaceLaneComparisonSummaries(useStore.getState(), workspaceId);

    expect(laneSummaries).toHaveLength(2);
    expect(laneSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: 'session-lane-a',
        laneId: 'branch:feature/lane-a',
        summary: 'Branch lane summary',
        verification: expect.objectContaining({
          state: 'verified',
          summary: 'Branch tests passed.',
        }),
        shipReadiness: expect.objectContaining({
          shipState: 'pr-ready',
          pullRequestUrl: 'https://github.com/example/repo/pull/41',
        }),
      }),
      expect.objectContaining({
        sessionId: 'session-lane-b',
        laneId: 'worktree:/tmp/worktrees/lane-b',
        summary: 'Worktree lane summary',
        verification: expect.objectContaining({
          state: 'unverified',
          summary: 'Worktree build failed.',
        }),
        shipReadiness: expect.objectContaining({
          shipState: 'blocked-by-checks',
          reviewState: 'needs-retry',
          pullRequestUrl: 'https://github.com/example/repo/pull/42',
        }),
      }),
    ]));
    expect(selectSessionMessages(useStore.getState(), workspaceId, 'session-lane-a')).toEqual([]);
    expect(selectSessionMessages(useStore.getState(), workspaceId, 'session-lane-b')).toEqual([]);
  });

  it('projects selected and adopted lane flags without collapsing lane-local readiness summaries', () => {
    const workspaceId = 'workspace-lane-selection-state';
    const branchLane = { laneContext: { kind: 'branch', branch: 'feature/selected-branch' } } as const;
    const worktreeLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/selected-worktree', branch: 'feature/selected-worktree' },
    } as const;

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId, undefined),
      laneComparison: {
        selectedLane: {
          sessionId: 'session-worktree',
          ...worktreeLane,
        },
        adoptedLane: {
          sessionId: 'session-branch',
          ...branchLane,
        },
      },
      laneRecords: [
        makeLaneRecord(workspaceId, 'session-branch', branchLane, {
          session: makeSession({ id: 'session-branch', title: 'Branch lane' }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, 'session-branch', 'task-branch', 'completed', {
              sourceMessageId: 'message-branch',
              summary: 'Branch lane ready',
              resultAnnotation: {
                sourceMessageId: 'message-branch',
                workspaceId,
                sessionId: 'session-branch',
                taskId: 'task-branch',
                verification: 'verified',
                summary: 'Branch lane ready',
                shipState: 'pr-ready',
                ...branchLane,
              },
              recentVerificationRef: {
                runId: 'verify-branch',
                commandKind: 'test',
                status: 'passed',
                summary: 'Branch tests passed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'success',
                sessionId: 'session-branch',
                taskId: 'task-branch',
                pullRequestUrl: 'https://github.com/example/repo/pull/61',
              },
              ...branchLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-branch',
              workspaceId,
              sessionId: 'session-branch',
              sourceMessageId: 'message-branch',
              taskId: 'task-branch',
              commandKind: 'test',
              status: 'passed',
              startedAt: '2026-04-22T00:01:00.000Z',
              summary: 'Branch tests passed.',
              ...branchLane,
            },
          ],
        }),
        makeLaneRecord(workspaceId, 'session-worktree', worktreeLane, {
          session: makeSession({ id: 'session-worktree', title: 'Worktree lane' }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, 'session-worktree', 'task-worktree', 'blocked', {
              sourceMessageId: 'message-worktree',
              summary: 'Worktree lane blocked',
              resultAnnotation: {
                sourceMessageId: 'message-worktree',
                workspaceId,
                sessionId: 'session-worktree',
                taskId: 'task-worktree',
                verification: 'unverified',
                summary: 'Worktree lane blocked',
                shipState: 'blocked-by-checks',
                reviewState: 'needs-retry',
                ...worktreeLane,
              },
              recentVerificationRef: {
                runId: 'verify-worktree',
                commandKind: 'build',
                status: 'failed',
                summary: 'Worktree build failed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'blocked',
                sessionId: 'session-worktree',
                taskId: 'task-worktree',
                pullRequestUrl: 'https://github.com/example/repo/pull/62',
              },
              ...worktreeLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-worktree',
              workspaceId,
              sessionId: 'session-worktree',
              sourceMessageId: 'message-worktree',
              taskId: 'task-worktree',
              commandKind: 'build',
              status: 'failed',
              startedAt: '2026-04-22T00:01:30.000Z',
              summary: 'Worktree build failed.',
              ...worktreeLane,
            },
          ],
        }),
      ],
    });

    const summaries = selectWorkspaceLaneComparisonSummaries(useStore.getState(), workspaceId);
    const branchSummary = summaries.find((lane) => lane.laneId === 'branch:feature/selected-branch');
    const worktreeSummary = summaries.find((lane) => lane.laneId === 'worktree:/tmp/worktrees/selected-worktree');

    expect(branchSummary?.comparison).toEqual({ selected: false, adopted: true });
    expect(branchSummary?.verification).toEqual(expect.objectContaining({
      state: 'verified',
      summary: 'Branch tests passed.',
    }));
    expect(branchSummary?.shipReadiness).toEqual(expect.objectContaining({
      shipState: 'pr-ready',
      pullRequestUrl: 'https://github.com/example/repo/pull/61',
    }));
    expect(worktreeSummary?.comparison).toEqual({ selected: true, adopted: false });
    expect(worktreeSummary?.verification).toEqual(expect.objectContaining({
      state: 'unverified',
      summary: 'Worktree build failed.',
    }));
    expect(worktreeSummary?.shipReadiness).toEqual(expect.objectContaining({
      shipState: 'blocked-by-checks',
      reviewState: 'needs-retry',
      pullRequestUrl: 'https://github.com/example/repo/pull/62',
    }));
  });

  it('keeps selected and adopted lane state isolated by workspace when session and lane ids overlap', () => {
    const sharedSessionId = 'session-shared';
    const sharedLane = { laneContext: { kind: 'branch', branch: 'feature/shared-lane' } } as const;

    useStore.getState().setWorkspaceBootstrap('workspace-1', {
      ...makeBootstrap('workspace-1', undefined),
      laneComparison: {
        selectedLane: { sessionId: sharedSessionId, ...sharedLane },
      },
      laneRecords: [
        makeLaneRecord('workspace-1', sharedSessionId, sharedLane, {
          taskLedgerRecords: [makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-1', 'completed', {
            summary: 'Workspace 1 shared lane',
            resultAnnotation: {
              sourceMessageId: 'message-1',
              workspaceId: 'workspace-1',
              sessionId: sharedSessionId,
              taskId: 'task-1',
              verification: 'verified',
              summary: 'Workspace 1 shared lane',
              ...sharedLane,
            },
            ...sharedLane,
          })],
        }),
      ],
    });
    useStore.getState().setWorkspaceBootstrap('workspace-2', {
      ...makeBootstrap('workspace-2', undefined),
      laneComparison: {
        adoptedLane: { sessionId: sharedSessionId, ...sharedLane },
      },
      laneRecords: [
        makeLaneRecord('workspace-2', sharedSessionId, sharedLane, {
          taskLedgerRecords: [makeTaskLedgerRecord('workspace-2', sharedSessionId, 'task-2', 'blocked', {
            summary: 'Workspace 2 shared lane',
            resultAnnotation: {
              sourceMessageId: 'message-2',
              workspaceId: 'workspace-2',
              sessionId: sharedSessionId,
              taskId: 'task-2',
              verification: 'unverified',
              summary: 'Workspace 2 shared lane',
              ...sharedLane,
            },
            ...sharedLane,
          })],
        }),
      ],
    });

    expect(selectWorkspaceLaneComparisonSummaries(useStore.getState(), 'workspace-1')).toEqual([
      expect.objectContaining({
        sessionId: sharedSessionId,
        laneId: 'branch:feature/shared-lane',
        comparison: { selected: true, adopted: false },
      }),
    ]);
    expect(selectWorkspaceLaneComparisonSummaries(useStore.getState(), 'workspace-2')).toEqual([
      expect.objectContaining({
        sessionId: sharedSessionId,
        laneId: 'branch:feature/shared-lane',
        comparison: { selected: false, adopted: true },
      }),
    ]);
  });

  it('keeps per-lane readiness summaries isolated when rehydrated lane records reuse the same session and trace ids', () => {
    const workspaceId = 'workspace-lane-rehydrate-shared-ids';
    const sharedSessionId = 'session-shared';
    const sharedTaskId = 'task-shared';
    const sharedSourceMessageId = 'message-shared';
    const readyLane = { laneContext: { kind: 'branch', branch: 'feature/ready-lane' } } as const;
    const blockedLane = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/blocked-lane', branch: 'feature/blocked-lane' },
    } as const;

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId, undefined),
      laneRecords: [
        makeLaneRecord(workspaceId, sharedSessionId, readyLane, {
          session: makeSession({
            id: sharedSessionId,
            title: 'Ready branch attempt',
            updatedAt: '2026-04-22T00:02:00.000Z',
          }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, sharedSessionId, sharedTaskId, 'completed', {
              sourceMessageId: sharedSourceMessageId,
              summary: 'Ready lane summary',
              resultAnnotation: {
                sourceMessageId: sharedSourceMessageId,
                workspaceId,
                sessionId: sharedSessionId,
                taskId: sharedTaskId,
                verification: 'verified',
                summary: 'Ready lane summary',
                shipState: 'pr-ready',
                ...readyLane,
              },
              recentVerificationRef: {
                runId: 'verify-ready-lane',
                commandKind: 'test',
                status: 'passed',
                summary: 'Ready lane tests passed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'success',
                sessionId: sharedSessionId,
                taskId: sharedTaskId,
                pullRequestUrl: 'https://github.com/example/repo/pull/51',
              },
              ...readyLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-ready-lane',
              workspaceId,
              sessionId: sharedSessionId,
              sourceMessageId: sharedSourceMessageId,
              taskId: sharedTaskId,
              commandKind: 'test',
              status: 'passed',
              startedAt: '2026-04-22T00:01:00.000Z',
              summary: 'Ready lane tests passed.',
              ...readyLane,
            },
          ],
        }),
        makeLaneRecord(workspaceId, sharedSessionId, blockedLane, {
          session: makeSession({
            id: sharedSessionId,
            title: 'Blocked worktree attempt',
            updatedAt: '2026-04-22T00:01:00.000Z',
          }),
          taskLedgerRecords: [
            makeTaskLedgerRecord(workspaceId, sharedSessionId, sharedTaskId, 'blocked', {
              sourceMessageId: sharedSourceMessageId,
              summary: 'Blocked lane summary',
              resultAnnotation: {
                sourceMessageId: sharedSourceMessageId,
                workspaceId,
                sessionId: sharedSessionId,
                taskId: sharedTaskId,
                verification: 'unverified',
                summary: 'Blocked lane summary',
                shipState: 'blocked-by-checks',
                reviewState: 'needs-retry',
                ...blockedLane,
              },
              recentVerificationRef: {
                runId: 'verify-blocked-lane',
                commandKind: 'build',
                status: 'failed',
                summary: 'Blocked lane build failed.',
              },
              recentShipRef: {
                action: 'pullRequest',
                outcome: 'blocked',
                sessionId: sharedSessionId,
                taskId: sharedTaskId,
                pullRequestUrl: 'https://github.com/example/repo/pull/52',
              },
              ...blockedLane,
            }),
          ],
          verificationRuns: [
            {
              id: 'verify-blocked-lane',
              workspaceId,
              sessionId: sharedSessionId,
              sourceMessageId: sharedSourceMessageId,
              taskId: sharedTaskId,
              commandKind: 'build',
              status: 'failed',
              startedAt: '2026-04-22T00:01:30.000Z',
              summary: 'Blocked lane build failed.',
              ...blockedLane,
            },
          ],
        }),
      ],
    });

    const laneSummaries = selectWorkspaceLaneComparisonSummaries(useStore.getState(), workspaceId);
    const readySummary = laneSummaries.find((lane) => lane.laneId === 'branch:feature/ready-lane');
    const blockedSummary = laneSummaries.find((lane) => lane.laneId === 'worktree:/tmp/worktrees/blocked-lane');

    expect(laneSummaries).toHaveLength(2);
    expect(new Set(laneSummaries.map((lane) => lane.laneId))).toEqual(new Set([
      'branch:feature/ready-lane',
      'worktree:/tmp/worktrees/blocked-lane',
    ]));
    expect(readySummary).toEqual(expect.objectContaining({
      sessionId: sharedSessionId,
      summary: 'Ready lane summary',
      verification: expect.objectContaining({
        state: 'verified',
        summary: 'Ready lane tests passed.',
      }),
      shipReadiness: expect.objectContaining({
        shipState: 'pr-ready',
        pullRequestUrl: 'https://github.com/example/repo/pull/51',
      }),
    }));
    expect(blockedSummary).toEqual(expect.objectContaining({
      sessionId: sharedSessionId,
      summary: 'Blocked lane summary',
      verification: expect.objectContaining({
        state: 'unverified',
        summary: 'Blocked lane build failed.',
      }),
      shipReadiness: expect.objectContaining({
        shipState: 'blocked-by-checks',
        reviewState: 'needs-retry',
        pullRequestUrl: 'https://github.com/example/repo/pull/52',
      }),
    }));
    expect(readySummary?.shipReadiness.reviewState).toBeUndefined();
    expect(blockedSummary?.shipReadiness.shipState).not.toBe(readySummary?.shipReadiness.shipState);
    expect(blockedSummary?.verification.summary).not.toBe(readySummary?.verification.summary);
  });

  it('keeps lane comparison summaries isolated across lane rehydration and workspace navigation', () => {
    const sharedSessionId = 'session-shared';
    const workspaceOneLaneA = { laneContext: { kind: 'branch', branch: 'feature/shared-a' } } as const;
    const workspaceOneLaneB = {
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/shared-b', branch: 'feature/shared-b' },
    } as const;
    const workspaceTwoLane = { laneContext: { kind: 'branch', branch: 'feature/workspace-two' } } as const;

    useStore.getState().setWorkspaceBootstrap('workspace-1', {
      ...makeBootstrap('workspace-1', undefined),
      laneRecords: [
        makeLaneRecord('workspace-1', sharedSessionId, workspaceOneLaneA, {
          taskLedgerRecords: [
            makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-a', 'completed', {
              sourceMessageId: 'message-a',
              summary: 'Workspace 1 lane A ready',
              resultAnnotation: {
                sourceMessageId: 'message-a',
                workspaceId: 'workspace-1',
                sessionId: sharedSessionId,
                taskId: 'task-a',
                verification: 'verified',
                summary: 'Workspace 1 lane A ready',
                shipState: 'pr-ready',
                ...workspaceOneLaneA,
              },
              ...workspaceOneLaneA,
            }),
          ],
        }),
        makeLaneRecord('workspace-1', sharedSessionId, workspaceOneLaneB, {
          taskLedgerRecords: [
            makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-b', 'blocked', {
              sourceMessageId: 'message-b',
              summary: 'Workspace 1 lane B blocked',
              resultAnnotation: {
                sourceMessageId: 'message-b',
                workspaceId: 'workspace-1',
                sessionId: sharedSessionId,
                taskId: 'task-b',
                verification: 'unverified',
                summary: 'Workspace 1 lane B blocked',
                shipState: 'blocked-by-requested-changes',
                reviewState: 'needs-retry',
                ...workspaceOneLaneB,
              },
              ...workspaceOneLaneB,
            }),
          ],
        }),
      ],
    });
    useStore.getState().setWorkspaceBootstrap('workspace-2', {
      ...makeBootstrap('workspace-2', undefined),
      laneRecords: [
        makeLaneRecord('workspace-2', sharedSessionId, workspaceTwoLane, {
          taskLedgerRecords: [
            makeTaskLedgerRecord('workspace-2', sharedSessionId, 'task-c', 'completed', {
              sourceMessageId: 'message-c',
              summary: 'Workspace 2 lane ready',
              resultAnnotation: {
                sourceMessageId: 'message-c',
                workspaceId: 'workspace-2',
                sessionId: sharedSessionId,
                taskId: 'task-c',
                verification: 'verified',
                summary: 'Workspace 2 lane ready',
                shipState: 'local-ready',
                ...workspaceTwoLane,
              },
              ...workspaceTwoLane,
            }),
          ],
        }),
      ],
    });
    useStore.getState().setActiveWorkspace('workspace-1');

    expect(selectWorkspaceLaneComparisonSummaries(useStore.getState(), 'workspace-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ laneId: 'branch:feature/shared-a', shipReadiness: expect.objectContaining({ shipState: 'pr-ready' }) }),
      expect.objectContaining({
        laneId: 'worktree:/tmp/worktrees/shared-b',
        shipReadiness: expect.objectContaining({ shipState: 'blocked-by-requested-changes' }),
      }),
    ]));
    expect(selectActiveWorkspaceLaneComparisonSummaries(useStore.getState())).toEqual(expect.arrayContaining([
      expect.objectContaining({ laneId: 'branch:feature/shared-a' }),
      expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/shared-b' }),
    ]));

    useStore.getState().setWorkspaceBootstrap('workspace-1', {
      ...makeBootstrap('workspace-1', undefined),
      laneRecords: [
        makeLaneRecord('workspace-1', sharedSessionId, workspaceOneLaneA, {
          taskLedgerRecords: [
            makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-a', 'blocked', {
              sourceMessageId: 'message-a',
              summary: 'Workspace 1 lane A now blocked',
              resultAnnotation: {
                sourceMessageId: 'message-a',
                workspaceId: 'workspace-1',
                sessionId: sharedSessionId,
                taskId: 'task-a',
                verification: 'unverified',
                summary: 'Workspace 1 lane A now blocked',
                shipState: 'not-ready',
                ...workspaceOneLaneA,
              },
              ...workspaceOneLaneA,
            }),
          ],
        }),
        makeLaneRecord('workspace-1', sharedSessionId, workspaceOneLaneB, {
          taskLedgerRecords: [
            makeTaskLedgerRecord('workspace-1', sharedSessionId, 'task-b', 'blocked', {
              sourceMessageId: 'message-b',
              summary: 'Workspace 1 lane B still blocked',
              resultAnnotation: {
                sourceMessageId: 'message-b',
                workspaceId: 'workspace-1',
                sessionId: sharedSessionId,
                taskId: 'task-b',
                verification: 'unverified',
                summary: 'Workspace 1 lane B still blocked',
                shipState: 'blocked-by-requested-changes',
                reviewState: 'needs-retry',
                ...workspaceOneLaneB,
              },
              ...workspaceOneLaneB,
            }),
          ],
        }),
      ],
    });

    expect(selectWorkspaceLaneComparisonSummaries(useStore.getState(), 'workspace-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        laneId: 'branch:feature/shared-a',
        summary: 'Workspace 1 lane A now blocked',
        shipReadiness: expect.objectContaining({ shipState: 'not-ready' }),
      }),
      expect.objectContaining({
        laneId: 'worktree:/tmp/worktrees/shared-b',
        summary: 'Workspace 1 lane B still blocked',
        shipReadiness: expect.objectContaining({ shipState: 'blocked-by-requested-changes' }),
      }),
    ]));

    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceLaneComparisonSummaries(useStore.getState())).toEqual([
      expect.objectContaining({
        sessionId: sharedSessionId,
        laneId: 'branch:feature/workspace-two',
        summary: 'Workspace 2 lane ready',
        shipReadiness: expect.objectContaining({ shipState: 'local-ready' }),
      }),
    ]);
    expect(selectWorkspaceLaneComparisonSummaries(useStore.getState(), 'workspace-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ laneId: 'branch:feature/shared-a', shipReadiness: expect.objectContaining({ shipState: 'not-ready' }) }),
      expect.objectContaining({
        laneId: 'worktree:/tmp/worktrees/shared-b',
        shipReadiness: expect.objectContaining({ shipState: 'blocked-by-requested-changes' }),
      }),
    ]));
  });

  it('keeps lane-specific task and result state isolated when overlapping ids arrive in one session', () => {
    const workspaceId = 'workspace-lane-isolation';
    const sessionId = 'session-lane-isolation';
    const laneA: LaneAttribution = { laneContext: { kind: 'branch', branch: 'feature/lane-a' } };
    const laneB: LaneAttribution = { laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' } };

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(
      workspaceId,
      undefined,
      undefined,
      undefined,
      undefined,
      [
        makeTaskLedgerRecord(workspaceId, sessionId, 'task-shared', 'completed', {
          sourceMessageId: 'message-shared',
          summary: 'Lane A summary',
          resultAnnotation: {
            sourceMessageId: 'message-shared',
            workspaceId,
            sessionId,
            taskId: 'task-shared',
            verification: 'verified',
            summary: 'Lane A summary',
            ...laneA,
          },
          ...laneA,
        }),
        makeTaskLedgerRecord(workspaceId, sessionId, 'task-shared', 'completed', {
          sourceMessageId: 'message-shared',
          summary: 'Lane B summary',
          resultAnnotation: {
            sourceMessageId: 'message-shared',
            workspaceId,
            sessionId,
            taskId: 'task-shared',
            verification: 'verified',
            summary: 'Lane B summary',
            ...laneB,
          },
          ...laneB,
        }),
      ],
    ));
    useStore.getState().setMessages(workspaceId, sessionId, [
      makeAssistantMessage(workspaceId, sessionId, 'message-shared', 'task-shared', {
        summary: 'Lane A message',
        verification: 'verified',
        ...laneA,
      }),
      makeAssistantMessage(workspaceId, sessionId, 'message-shared', 'task-shared', {
        summary: 'Lane B message',
        verification: 'verified',
        ...laneB,
      }),
    ]);

    const messages = selectSessionMessages(useStore.getState(), workspaceId, sessionId);
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => selectMessageResultTrace(useStore.getState(), message)?.summary)).toEqual([
      'Lane A summary',
      'Lane B summary',
    ]);
    expect(selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId, laneA)).toEqual([
      expect.objectContaining({ summary: 'Lane A summary', laneId: 'branch:feature/lane-a' }),
    ]);
    expect(selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId, laneB)).toEqual([
      expect.objectContaining({ summary: 'Lane B summary', laneId: 'worktree:/tmp/worktrees/lane-b' }),
    ]);
    expect(Object.keys(useStore.getState().taskEntriesByWorkspace[workspaceId][sessionId] ?? {})).toHaveLength(2);
    expect(Object.keys(useStore.getState().resultAnnotationsByWorkspace[workspaceId][sessionId] ?? {})).toHaveLength(2);
  });

  it('stores live message updates separately when lanes reuse the same message id', () => {
    const workspaceId = 'workspace-live-lanes';
    const sessionId = 'session-live-lanes';
    const laneA: LaneAttribution = { laneContext: { kind: 'branch', branch: 'feature/live-a' } };
    const laneB: LaneAttribution = { laneContext: { kind: 'branch', branch: 'feature/live-b' } };

    useStore.getState().addMessage(
      workspaceId,
      sessionId,
      makeAssistantMessage(workspaceId, sessionId, 'message-live', 'task-live', { summary: 'Lane A live', ...laneA }),
    );
    useStore.getState().updateMessage(
      workspaceId,
      sessionId,
      makeAssistantMessage(workspaceId, sessionId, 'message-live', 'task-live', { summary: 'Lane B live', ...laneB }),
    );

    expect(selectSessionMessages(useStore.getState(), workspaceId, sessionId)).toEqual([
      expect.objectContaining({ trace: expect.objectContaining({ laneId: 'branch:feature/live-a' }) }),
      expect.objectContaining({ trace: expect.objectContaining({ laneId: 'branch:feature/live-b' }) }),
    ]);
  });

  it('applies verification projections to the matching source message and bootstrap run state', () => {
    const workspaceId = 'workspace-verify';
    const sessionId = 'session-verify';
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-verify', 'task-verify', {
      summary: 'Original task summary',
      verification: 'unverified',
    });
    const run: VerificationRun = {
      id: 'verify-run-1',
      workspaceId,
      sessionId,
      sourceMessageId: 'message-verify',
      taskId: 'task-verify',
      commandKind: 'lint',
      status: 'passed',
      startedAt: '2026-04-20T01:00:00.000Z',
      finishedAt: '2026-04-20T01:00:10.000Z',
      summary: 'Lint verification passed.',
      exitCode: 0,
      terminalLogRef: 'verification-logs/workspace-verify/verify-run-1.log',
    };

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, undefined));
    useStore.getState().setMessages(workspaceId, sessionId, [message]);
    useStore.getState().upsertVerificationRun(workspaceId, run);
    useStore.getState().applyVerificationProjection(
      workspaceId,
      sessionId,
      'message-verify',
      makeTaskEntry(workspaceId, sessionId, 'message-verify', 'task-verify', 'Lint verification passed.'),
      makeResultAnnotation(workspaceId, sessionId, 'message-verify', 'task-verify', 'verified', 'Lint verification passed.'),
    );

    expect(useStore.getState().workspaceBootstraps[workspaceId]?.verificationRuns).toEqual([run]);
    const updatedMessage = selectSessionMessages(useStore.getState(), workspaceId, sessionId)[0];
    expect(updatedMessage?.resultAnnotation).toEqual(expect.objectContaining({
      verification: 'verified',
      summary: 'Lint verification passed.',
    }));
    expect(selectMessageResultTrace(useStore.getState(), updatedMessage!)?.summary).toBe('Lint verification passed.');
  });

  it('projects persisted browser evidence into verification runs, task records, and message traces when capability is available', () => {
    const workspaceId = 'workspace-browser-projection';
    const sessionId = 'session-browser-projection';
    const sourceMessageId = 'message-browser-projection';
    const taskId = 'task-browser-projection';
    const browserEvidenceRecord = makeBrowserEvidenceRecord(
      workspaceId,
      sessionId,
      sourceMessageId,
      taskId,
      'record-browser-projection',
      '2026-04-22T16:02:00.000Z',
    );
    const taskRecord = makeTaskLedgerRecord(workspaceId, sessionId, taskId, 'completed', {
      sourceMessageId,
      summary: 'Browser verification complete.',
      resultAnnotation: {
        sourceMessageId,
        workspaceId,
        sessionId,
        taskId,
        verification: 'verified',
        summary: 'Browser verification complete.',
      },
    });

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(
      workspaceId,
      undefined,
      undefined,
      [
        {
          id: 'verify-browser-projection',
          workspaceId,
          sessionId,
          sourceMessageId,
          taskId,
          commandKind: 'test',
          status: 'passed',
          startedAt: '2026-04-22T16:00:00.000Z',
          finishedAt: '2026-04-22T16:00:05.000Z',
          summary: 'Browser verification passed.',
        },
      ],
      undefined,
      [taskRecord],
      [browserEvidenceRecord],
    ));
    useStore.getState().setMessages(workspaceId, sessionId, [
      makeAssistantMessage(workspaceId, sessionId, sourceMessageId, taskId, {
        summary: 'Browser verification complete.',
        verification: 'verified',
      }),
    ]);

    const projectedRun = selectWorkspaceVerificationRuns(useStore.getState(), workspaceId)[0]!;
    const projectedRecord = selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId)[0]!;
    const resolved = selectMessageResultTrace(
      useStore.getState(),
      selectSessionMessages(useStore.getState(), workspaceId, sessionId)[0]!,
    );

    expect(projectedRun.browserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
      previewUrl: 'http://127.0.0.1:4173/',
    }));
    expect(projectedRecord.browserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
    }));
    expect(projectedRecord.recentBrowserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
    }));
    expect(projectedRecord.resultAnnotation?.browserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
    }));
    expect(resolved?.browserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
    }));
    expect(resolved?.annotation?.browserEvidenceRef).toEqual(expect.objectContaining({
      recordId: 'record-browser-projection',
    }));
    expect(resolved?.summary).toBe('Browser verification passed.');
  });

  it('derives verification state and latest linked summary from workspace-scoped runs', () => {
    const workspaceId = 'workspace-linked-runs';
    const sessionId = 'session-linked-runs';
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-linked-runs', 'task-linked-runs', {
      summary: 'Original task summary',
      verification: 'unverified',
    });
    const runs: VerificationRun[] = [
      {
        id: 'verify-build-1',
        workspaceId,
        sessionId,
        sourceMessageId: 'message-linked-runs',
        taskId: 'task-linked-runs',
        commandKind: 'build',
        status: 'failed',
        startedAt: '2026-04-20T01:00:00.000Z',
        finishedAt: '2026-04-20T01:00:15.000Z',
        summary: 'Build verification failed with exit code 1.',
        exitCode: 1,
        terminalLogRef: 'verification-logs/workspace-linked-runs/verify-build-1.log',
      },
      {
        id: 'verify-lint-1',
        workspaceId,
        sessionId,
        sourceMessageId: 'message-linked-runs',
        taskId: 'task-linked-runs',
        commandKind: 'lint',
        status: 'passed',
        startedAt: '2026-04-20T01:05:00.000Z',
        finishedAt: '2026-04-20T01:05:10.000Z',
        summary: 'Lint verification passed.',
        exitCode: 0,
        terminalLogRef: 'verification-logs/workspace-linked-runs/verify-lint-1.log',
      },
    ];

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, undefined, undefined, runs));

    const resolved = selectMessageResultTrace(useStore.getState(), message);

    expect(resolved?.verification).toBe('partially verified');
    expect(resolved?.verificationSummary).toBe('Lint verification passed.');
    expect(resolved?.summary).toBe('Lint verification passed.');
    expect(resolved?.latestVerificationRun?.id).toBe('verify-lint-1');
  });

  it('returns verification runs for the active workspace only', () => {
    const workspace1Run: VerificationRun = {
      id: 'verify-workspace-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sourceMessageId: 'message-1',
      taskId: 'task-1',
      commandKind: 'test',
      status: 'passed',
      startedAt: '2026-04-20T02:00:00.000Z',
      summary: 'Workspace 1 test verification passed.',
    };
    const workspace2Run: VerificationRun = {
      id: 'verify-workspace-2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      sourceMessageId: 'message-2',
      taskId: 'task-2',
      commandKind: 'lint',
      status: 'failed',
      startedAt: '2026-04-20T03:00:00.000Z',
      summary: 'Workspace 2 lint verification failed.',
    };

    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', undefined, undefined, [workspace1Run]));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', undefined, undefined, [workspace2Run]));
    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceVerificationRuns(useStore.getState())).toEqual([workspace2Run]);
  });

  it('surfaces capability gaps for the active workspace only', () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', undefined, {
      ghAuth: { status: 'unavailable', summary: 'GitHub auth unavailable', detail: 'Run gh auth login.' },
    }));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', undefined, {
      previewTarget: { status: 'unavailable', summary: 'Preview target unavailable', detail: 'No preview script detected.' },
    }));
    useStore.getState().setActiveWorkspace('workspace-2');

    const probe = selectActiveWorkspaceCapabilities(useStore.getState());
    const gaps = selectActiveWorkspaceCapabilityGaps(useStore.getState());

    expect(probe?.workspaceId).toBe('workspace-2');
    expect(gaps).toEqual([
      {
        key: 'previewTarget',
        label: 'Preview target',
        status: 'unavailable',
        summary: 'Preview target unavailable',
        detail: 'No preview script detected.',
      },
    ]);
  });

  it('gates browser evidence capability state and leaves projected browser refs unset when unavailable', () => {
    const workspaceId = 'workspace-browser-capability';
    const sessionId = 'session-browser-capability';
    const taskRecord = makeTaskLedgerRecord(workspaceId, sessionId, 'task-browser-capability', 'completed', {
      sourceMessageId: 'message-browser-capability',
      summary: 'Command verification still available.',
      recentBrowserEvidenceRef: {
        recordId: 'task-browser-capability-ref',
        capturedAt: '2026-04-22T15:00:00.000Z',
        previewUrl: 'http://127.0.0.1:4173/',
        summary: 'Captured browser evidence while available.',
      },
      resultAnnotation: {
        sourceMessageId: 'message-browser-capability',
        workspaceId,
        sessionId,
        taskId: 'task-browser-capability',
        verification: 'verified',
        summary: 'Command verification still available.',
      },
    });

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(
      workspaceId,
      undefined,
      {
        previewTarget: { status: 'unavailable', summary: 'Preview target unavailable', detail: 'No preview script detected.' },
        browserEvidence: { status: 'unavailable', summary: 'Browser evidence unavailable', detail: 'Preview runtime is disabled.' },
      },
      [
        {
          id: 'verify-browser-capability',
          workspaceId,
          sessionId,
          sourceMessageId: 'message-browser-capability',
          taskId: 'task-browser-capability',
          commandKind: 'test',
          status: 'passed',
          startedAt: '2026-04-22T15:01:00.000Z',
          finishedAt: '2026-04-22T15:01:05.000Z',
          summary: 'Command verification passed.',
        },
      ],
      undefined,
      [taskRecord],
      [makeBrowserEvidenceRecord(workspaceId, sessionId, 'message-browser-capability', 'task-browser-capability', 'record-browser-capability', '2026-04-22T15:02:00.000Z')],
    ));
    useStore.getState().setActiveWorkspace(workspaceId);

    const capabilityState = selectActiveWorkspaceBrowserEvidenceCapabilityState(useStore.getState());
    const projectedRun = selectActiveWorkspaceVerificationRuns(useStore.getState())[0]!;
    const projectedRecord = selectActiveWorkspaceTaskLedgerRecords(useStore.getState())[0]!;
    const resolved = selectMessageResultTrace(
      useStore.getState(),
      makeAssistantMessage(workspaceId, sessionId, 'message-browser-capability', 'task-browser-capability', {
        summary: 'Command verification still available.',
        verification: 'verified',
      }),
    );

    expect(capabilityState).toEqual(expect.objectContaining({
      status: 'degraded',
      tone: 'warning',
      summary: expect.stringContaining('Command-only lint, build, and test verification remains available.'),
    }));
    expect(projectedRun.browserEvidenceRef).toBeUndefined();
    expect(projectedRecord.browserEvidenceRef).toBeUndefined();
    expect(projectedRecord.recentBrowserEvidenceRef).toBeUndefined();
    expect(projectedRecord.resultAnnotation?.browserEvidenceRef).toBeUndefined();
    expect(resolved?.browserEvidenceRef).toBeUndefined();
    expect(resolved?.annotation?.browserEvidenceRef).toBeUndefined();
    expect(resolved?.summary).toBe('Command verification passed.');
  });

  it('returns context catalog data, loading, and error state for the active workspace only', () => {
    const workspaceOneCatalog = makeContextCatalog('workspace-1', {
      instructionSuffix: 'workspace-1',
      capabilitySuffix: 'workspace-1',
    });
    const workspaceTwoCatalog = makeContextCatalog('workspace-2', {
      instructionSuffix: 'workspace-2',
      capabilitySuffix: 'workspace-2',
    });

    useStore.getState().setWorkspaceContextCatalog('workspace-1', workspaceOneCatalog);
    useStore.getState().setWorkspaceContextCatalog('workspace-2', workspaceTwoCatalog);
    useStore.getState().setWorkspaceContextCatalogLoading('workspace-1', true);
    useStore.getState().setWorkspaceContextCatalogLoading('workspace-2', false);
    useStore.getState().setWorkspaceContextCatalogError('workspace-1', 'Workspace 1 context failed');
    useStore.getState().setWorkspaceContextCatalogError('workspace-2', null);
    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceContextCatalog(useStore.getState())).toEqual(workspaceTwoCatalog);
    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState())).toEqual(workspaceTwoCatalog.instructionSources);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState())).toEqual(workspaceTwoCatalog.capabilityEntries);
    expect(selectActiveWorkspaceContextCatalogLoading(useStore.getState())).toBe(false);
    expect(selectActiveWorkspaceContextCatalogError(useStore.getState())).toBeNull();
  });

  it('keeps workspace context catalog entries isolated when workspaces switch', () => {
    const workspaceOneCatalog = makeContextCatalog('workspace-1', {
      instructionSuffix: 'workspace-1',
      capabilitySuffix: 'workspace-1',
    });
    const workspaceTwoCatalog = makeContextCatalog('workspace-2', {
      instructionSuffix: 'workspace-2',
      capabilitySuffix: 'workspace-2',
    });

    useStore.getState().setWorkspaceContextCatalog('workspace-1', workspaceOneCatalog);
    useStore.getState().setWorkspaceContextCatalog('workspace-2', workspaceTwoCatalog);
    useStore.getState().setActiveWorkspace('workspace-1');

    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:workspace-1',
    ]);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:workspace-1',
    ]);

    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceContextInstructionSources(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:agents-file:workspace-2',
    ]);
    expect(selectActiveWorkspaceContextCapabilityEntries(useStore.getState()).map((entry) => entry.id)).toEqual([
      'project-local:commands:workspace-2',
    ]);
  });

  it('hydrates git status from workspace bootstrap and keeps it workspace-scoped', () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', undefined, undefined, undefined, makeGitStatus('workspace-1')));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', undefined, undefined, undefined, {
      ...makeGitStatus('workspace-2'),
      data: {
        ...makeGitStatus('workspace-2').data!,
        branch: { name: 'feature/ship', detached: false },
        linkedPullRequest: {
          ...makeGitStatus('workspace-2').data!.linkedPullRequest,
          linked: true,
          outcome: 'success',
          summary: 'Linked pull request #84 is open.',
          number: 84,
          title: 'Ship status follow-up',
          url: 'https://github.com/example/repo/pull/84',
          state: 'OPEN',
          headBranch: 'feature/ship',
          baseBranch: 'main',
          checks: {
            status: 'passing',
            summary: '2 checks passing.',
            total: 2,
            passing: 2,
            failing: 0,
            pending: 0,
            failingChecks: [],
          },
          review: {
            status: 'approved',
            summary: 'Approved',
            requestedReviewerCount: 0,
          },
          issues: [],
        },
      },
    }));
    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceGitStatus(useStore.getState())?.data?.branch.name).toBe('feature/ship');
    expect(selectActiveWorkspaceGitStatus(useStore.getState())?.data?.linkedPullRequest.url).toBe(
      'https://github.com/example/repo/pull/84',
    );
  });

  it('stores ship action results with workspace scoping intact', () => {
    useStore.getState().setWorkspaceShipActionResult('workspace-1', 'push', {
      outcome: 'blocked',
      status: makeGitStatus('workspace-1'),
      issues: [{ code: 'MISSING_UPSTREAM', message: 'Push is blocked.' }],
    });
    useStore.getState().setWorkspaceShipActionResult('workspace-2', 'pullRequest', {
      outcome: 'success',
      status: makeGitStatus('workspace-2'),
      pullRequest: { url: 'https://github.com/example/repo/pull/123' },
      issues: [],
    });
    useStore.getState().setActiveWorkspace('workspace-2');

    expect(selectActiveWorkspaceShipActionResults(useStore.getState())).toEqual({
      pullRequest: {
        outcome: 'success',
        status: makeGitStatus('workspace-2'),
        pullRequest: { url: 'https://github.com/example/repo/pull/123' },
        issues: [],
      },
    });
  });

  it('projects matching linked PR state onto task ledger and result traces without leaking across workspaces', () => {
    const sessionId = 'session-ship-projection';
    const workspaceId = 'workspace-ship-projection';
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-ship-projection', 'task-ship-projection', {
      summary: 'Fix handoff result',
      verification: 'unverified',
    });
    const gitStatus = makeGitStatus(workspaceId);
    gitStatus.data!.pullRequest = {
      outcome: 'success',
      supported: true,
      summary: 'Ready',
      issues: [],
    };
    gitStatus.data!.linkedPullRequest = {
      outcome: 'success',
      linked: true,
      summary: 'Linked pull request #84 is blocked by checks.',
      number: 84,
      title: 'Ship fix',
      url: 'https://github.com/example/repo/pull/84',
      state: 'OPEN',
      headBranch: 'feature/ship',
      baseBranch: 'main',
      checks: {
        status: 'failing',
        summary: '1 failing check.',
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        failingChecks: [{ name: 'CI / test' }],
      },
      review: {
        status: 'changes_requested',
        summary: 'Changes requested.',
        requestedReviewerCount: 1,
      },
      issues: [],
    };

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, undefined, undefined, undefined, gitStatus, [
      makeTaskLedgerRecord(workspaceId, sessionId, 'task-ship-projection', 'blocked', {
        sourceMessageId: 'message-ship-projection',
        summary: 'Fix handoff result',
        resultAnnotation: {
          sourceMessageId: 'message-ship-projection',
          workspaceId,
          sessionId,
          taskId: 'task-ship-projection',
          verification: 'unverified',
          summary: 'Fix handoff result',
          shipState: 'not-ready',
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'blocked',
          sessionId,
          messageId: 'message-ship-projection',
          taskId: 'task-ship-projection',
          pullRequestUrl: 'https://github.com/example/repo/pull/84',
          conditionKind: 'failing-check',
          conditionLabel: 'CI / test',
        },
      }),
    ]));
    useStore.getState().setWorkspaceBootstrap('workspace-other', makeBootstrap('workspace-other', undefined, undefined, undefined, {
      ...makeGitStatus('workspace-other'),
      data: {
        ...makeGitStatus('workspace-other').data!,
        linkedPullRequest: {
          outcome: 'success',
          linked: true,
          summary: 'Linked pull request #99 is ready.',
          number: 99,
          title: 'Other workspace',
          url: 'https://github.com/example/repo/pull/99',
          state: 'OPEN',
          headBranch: 'feature/other',
          baseBranch: 'main',
          checks: {
            status: 'passing',
            summary: 'Passing',
            total: 1,
            passing: 1,
            failing: 0,
            pending: 0,
            failingChecks: [],
          },
          review: {
            status: 'approved',
            summary: 'Approved',
            requestedReviewerCount: 0,
          },
          issues: [],
        },
      },
    }));
    useStore.getState().setMessages(workspaceId, sessionId, [message]);

    const projectedRecord = selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId)[0]!;
    const projectedTrace = selectMessageResultTrace(useStore.getState(), selectSessionMessages(useStore.getState(), workspaceId, sessionId)[0]!);

    expect(projectedRecord.resultAnnotation?.shipState).toBe('blocked-by-checks');
    expect(projectedTrace?.annotation?.shipState).toBe('blocked-by-checks');
    expect(projectedTrace?.annotation?.reviewState).toBe('needs-retry');
    expect(selectSessionTaskLedgerRecords(useStore.getState(), 'workspace-other', sessionId)).toEqual([]);
  });

  it('tc-task-result-state-projection projects requested-changes-only PR state onto task ledger and result traces', () => {
    const sessionId = 'session-review-projection';
    const workspaceId = 'workspace-review-projection';
    const message = makeAssistantMessage(workspaceId, sessionId, 'message-review-projection', 'task-review-projection', {
      summary: 'Requested changes follow-up result',
      verification: 'unverified',
    });
    const gitStatus = makeGitStatus(workspaceId);
    gitStatus.data!.pullRequest = {
      outcome: 'success',
      supported: true,
      summary: 'Ready',
      issues: [],
    };
    gitStatus.data!.linkedPullRequest = {
      outcome: 'success',
      linked: true,
      summary: 'Linked pull request #73 needs review follow-up.',
      number: 73,
      title: 'Review follow-up',
      url: 'https://github.com/example/repo/pull/73',
      state: 'OPEN',
      headBranch: 'feature/review',
      baseBranch: 'main',
      checks: {
        status: 'passing',
        summary: '2 checks passing.',
        total: 2,
        passing: 2,
        failing: 0,
        pending: 0,
        failingChecks: [],
      },
      review: {
        status: 'changes_requested',
        summary: 'Security review requested code changes.',
        requestedReviewerCount: 1,
      },
      issues: [],
    };

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, undefined, undefined, undefined, gitStatus, [
      makeTaskLedgerRecord(workspaceId, sessionId, 'task-review-projection', 'blocked', {
        sourceMessageId: 'message-review-projection',
        summary: 'Requested changes follow-up result',
        resultAnnotation: {
          sourceMessageId: 'message-review-projection',
          workspaceId,
          sessionId,
          taskId: 'task-review-projection',
          verification: 'unverified',
          summary: 'Requested changes follow-up result',
          shipState: 'not-ready',
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'blocked',
          sessionId,
          messageId: 'message-review-projection',
          taskId: 'task-review-projection',
          pullRequestUrl: 'https://github.com/example/repo/pull/73',
          conditionKind: 'requested-changes',
          conditionLabel: 'Security review requested code changes.',
        },
      }),
    ]));
    useStore.getState().setMessages(workspaceId, sessionId, [message]);

    const projectedRecord = selectSessionTaskLedgerRecords(useStore.getState(), workspaceId, sessionId)[0]!;
    const projectedTrace = selectMessageResultTrace(useStore.getState(), selectSessionMessages(useStore.getState(), workspaceId, sessionId)[0]!);

    expect(projectedRecord.resultAnnotation?.shipState).toBe('blocked-by-requested-changes');
    expect(projectedRecord.resultAnnotation?.reviewState).toBe('needs-retry');
    expect(projectedTrace?.annotation?.shipState).toBe('blocked-by-requested-changes');
    expect(projectedTrace?.annotation?.reviewState).toBe('needs-retry');
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
    laneId: overrides.laneId,
    laneContext: overrides.laneContext,
  };
}

function makeBootstrap(
  workspaceId: string,
  traceability: WorkspaceBootstrap['traceability'],
  capabilityOverrides?: Partial<WorkspaceCapabilityProbe>,
  verificationRuns?: VerificationRun[],
  git?: WorkspaceBootstrap['git'],
  taskLedgerRecords?: TaskLedgerRecord[],
  browserEvidenceRecords?: BrowserEvidenceRecord[],
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-20T00:00:00.000Z',
    },
    sessions: [],
    git,
    capabilities: makeCapabilityProbe(workspaceId, capabilityOverrides),
    traceability,
    verificationRuns,
    browserEvidenceRecords,
    taskLedgerRecords,
  };
}

function makeTaskLedgerRecord(
  workspaceId: string,
  sessionId: string,
  taskId: string,
  state: TaskLedgerRecord['state'],
  overrides: Partial<TaskLedgerRecord> = {},
): TaskLedgerRecord {
  return {
    taskId,
    workspaceId,
    sessionId,
    sourceMessageId: overrides.sourceMessageId ?? `${taskId}-message`,
    title: overrides.title ?? `Task ${taskId}`,
    summary: overrides.summary ?? `${taskId} summary`,
    state,
    createdAt: overrides.createdAt ?? '2026-04-20T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-20T00:05:00.000Z',
    completedAt: overrides.completedAt,
    resultAnnotation: overrides.resultAnnotation,
    recentVerificationRef: overrides.recentVerificationRef,
    recentBrowserEvidenceRef: overrides.recentBrowserEvidenceRef,
    recentShipRef: overrides.recentShipRef,
    laneId: overrides.laneId,
    laneContext: overrides.laneContext,
  };
}

function makeLaneRecord(
  workspaceId: string,
  sessionId: string,
  lane: LaneAttribution,
  overrides: Partial<WorkspaceLaneRecord> = {},
): WorkspaceLaneRecord {
  const laneId = lane.laneId ?? (lane.laneContext?.kind === 'branch'
    ? `branch:${lane.laneContext.branch}`
    : lane.laneContext?.kind === 'worktree'
      ? `worktree:${lane.laneContext.worktreePath}`
      : undefined);

  if (!laneId || !lane.laneContext) {
    throw new Error('makeLaneRecord requires explicit lane attribution.');
  }

  return {
    workspaceId,
    sessionId,
    laneId,
    laneContext: lane.laneContext,
    traceability: overrides.traceability ?? { taskEntries: [], resultAnnotations: [] },
    verificationRuns: overrides.verificationRuns ?? [],
    browserEvidenceRecords: overrides.browserEvidenceRecords ?? [],
    taskLedgerRecords: overrides.taskLedgerRecords ?? [],
    session: overrides.session,
  };
}

function makeCapabilityProbe(
  workspaceId: string,
  overrides?: Partial<WorkspaceCapabilityProbe>,
): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const;
  return {
    workspaceId,
    checkedAt: '2026-04-20T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
    ...overrides,
  };
}

function makeBrowserEvidenceRecord(
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId: string,
  id: string,
  capturedAt: string,
): BrowserEvidenceRecord {
  return {
    id,
    workspaceId,
    capturedAt,
    sessionId,
    sourceMessageId,
    taskId,
    summary: `Captured browser evidence for ${sourceMessageId}.`,
    previewUrl: 'http://127.0.0.1:4173/',
    consoleCapture: {
      capturedAt,
      entryCount: 1,
      errorCount: 0,
      warningCount: 0,
      exceptionCount: 0,
      levels: ['log'],
    },
  };
}

function makeContextCatalog(
  workspaceId: string,
  options: { instructionSuffix: string; capabilitySuffix: string },
): WorkspaceContextCatalogResponse {
  return {
    workspaceId,
    collectedAt: '2026-04-22T00:00:00.000Z',
    instructionSources: [
      {
        id: `project-local:agents-file:${options.instructionSuffix}`,
        category: 'agents-file',
        sourceLayer: 'project-local',
        label: `Workspace AGENTS.md ${options.instructionSuffix}`,
        status: 'available',
        path: `/tmp/${workspaceId}/AGENTS.md`,
      },
    ],
    capabilityEntries: [
      {
        id: `project-local:commands:${options.capabilitySuffix}`,
        category: 'command',
        sourceLayer: 'project-local',
        label: `Project-local commands ${options.capabilitySuffix}`,
        status: 'available',
        path: `/tmp/${workspaceId}/opencode/commands`,
        itemCount: 1,
        items: [`/${options.capabilitySuffix}`],
      },
    ],
  };
}

function makeGitStatus(workspaceId: string): WorkspaceGitStatusResult {
  return {
    outcome: 'success' as const,
    data: {
      workspaceId,
      checkedAt: '2026-04-20T00:00:00.000Z',
      branch: { name: 'main', detached: false },
      upstream: {
        status: 'tracked' as const,
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 1,
        behind: 0,
        remoteProvider: 'github' as const,
        remoteHost: 'github.com',
        remoteUrl: 'git@github.com:example/repo.git',
      },
      changeSummary: {
        staged: { count: 1, paths: ['src/index.ts'], truncated: false },
        unstaged: { count: 1, paths: ['README.md'], truncated: false },
        untracked: { count: 1, paths: ['notes.txt'], truncated: false },
        conflicted: { count: 0, paths: [], truncated: false },
        hasChanges: true,
        hasStagedChanges: true,
      },
      pullRequest: {
        outcome: 'degraded' as const,
        supported: false,
        summary: 'Pull request creation is currently unavailable.',
        detail: 'The gh CLI is installed, but github.com authentication is not available.',
        remediation: 'Run gh auth login for github.com and retry the pull request action.',
        issues: [
          {
            code: 'GH_AUTH_UNAVAILABLE',
            message: 'Pull request creation is currently unavailable.',
            detail: 'The gh CLI is installed, but github.com authentication is not available.',
            remediation: 'Run gh auth login for github.com and retry the pull request action.',
            source: 'gh' as const,
          },
        ],
      },
      linkedPullRequest: {
        outcome: 'degraded' as const,
        linked: false,
        summary: 'Linked pull request details are currently unavailable.',
        detail: 'The gh CLI is installed, but github.com authentication is not available.',
        remediation: 'Run gh auth login for github.com and retry the pull request action.',
        issues: [
          {
            code: 'GH_AUTH_UNAVAILABLE',
            message: 'Linked pull request details are currently unavailable.',
            detail: 'The gh CLI is installed, but github.com authentication is not available.',
            remediation: 'Run gh auth login for github.com and retry the pull request action.',
            source: 'gh' as const,
          },
        ],
      },
    },
    issues: [],
  };
}

function makeTaskEntry(
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId: string,
  latestSummary: string,
  lane?: LaneAttribution,
): TaskEntry {
  return {
    taskId,
    workspaceId,
    sessionId,
    sourceMessageId,
    state: 'completed',
    latestSummary,
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
  };
}

function makeResultAnnotation(
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId: string,
  verification: ResultAnnotation['verification'],
  summary: string,
  lane?: LaneAttribution,
): ResultAnnotation {
  return {
    sourceMessageId,
    workspaceId,
    sessionId,
    taskId,
    verification,
    summary,
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
  };
}

function makeAssistantMessage(
  workspaceId: string,
  sessionId: string,
  messageId: string,
  taskId: string,
  overrides?: {
    summary?: string;
    verification?: ResultAnnotation['verification'];
  } & LaneAttribution,
): NormalizedMessage {
  const summary = overrides?.summary ?? `${taskId} summary`;
  const verification = overrides?.verification ?? 'unverified';
  const lane = overrides?.laneId || overrides?.laneContext
    ? { laneId: overrides.laneId, laneContext: overrides.laneContext }
    : undefined;

  return {
    id: messageId,
    role: 'assistant',
    createdAt: '2026-04-20T00:00:00.000Z',
    parts: [{ type: 'text', text: summary }],
    trace: {
      sourceMessageId: messageId,
      workspaceId,
      sessionId,
      taskId,
      ...(lane?.laneId ? { laneId: lane.laneId } : {}),
      ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
    },
    taskEntry: makeTaskEntry(workspaceId, sessionId, messageId, taskId, summary, lane),
    resultAnnotation: makeResultAnnotation(workspaceId, sessionId, messageId, taskId, verification, summary, lane),
  };
}
