import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

import {
  selectActiveWorkspaceTaskLedgerRecords,
  selectActiveWorkspaceCapabilityGaps,
  selectActiveWorkspaceCapabilities,
  selectActiveWorkspaceGitStatus,
  selectActiveWorkspaceShipActionResults,
  selectActiveWorkspaceVerificationRuns,
  resolveWorkspaceSessionStoreKey,
  selectMessageResultTrace,
  selectSessionTaskLedgerRecords,
  selectSessionMessages,
  useStore,
} from './store.js';
import type {
  NormalizedMessage,
  ResultAnnotation,
  SessionSummary,
  TaskEntry,
  TaskLedgerRecord,
  VerificationRun,
  WorkspaceCapabilityProbe,
  WorkspaceBootstrap,
  WorkspaceGitStatusResult,
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
  };
}

function makeBootstrap(
  workspaceId: string,
  traceability: WorkspaceBootstrap['traceability'],
  capabilityOverrides?: Partial<WorkspaceCapabilityProbe>,
  verificationRuns?: VerificationRun[],
  git?: WorkspaceBootstrap['git'],
  taskLedgerRecords?: TaskLedgerRecord[],
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
    recentShipRef: overrides.recentShipRef,
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
): TaskEntry {
  return {
    taskId,
    workspaceId,
    sessionId,
    sourceMessageId,
    state: 'completed',
    latestSummary,
  };
}

function makeResultAnnotation(
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId: string,
  verification: ResultAnnotation['verification'],
  summary: string,
): ResultAnnotation {
  return {
    sourceMessageId,
    workspaceId,
    sessionId,
    taskId,
    verification,
    summary,
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
  },
): NormalizedMessage {
  const summary = overrides?.summary ?? `${taskId} summary`;
  const verification = overrides?.verification ?? 'unverified';

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
    },
    taskEntry: makeTaskEntry(workspaceId, sessionId, messageId, taskId, summary),
    resultAnnotation: makeResultAnnotation(workspaceId, sessionId, messageId, taskId, verification, summary),
  };
}
