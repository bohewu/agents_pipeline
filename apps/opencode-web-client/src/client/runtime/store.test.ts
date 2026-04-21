import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

import {
  selectActiveWorkspaceCapabilityGaps,
  selectActiveWorkspaceCapabilities,
  selectActiveWorkspaceVerificationRuns,
  resolveWorkspaceSessionStoreKey,
  selectMessageResultTrace,
  selectSessionMessages,
  useStore,
} from './store.js';
import type {
  NormalizedMessage,
  ResultAnnotation,
  SessionSummary,
  TaskEntry,
  VerificationRun,
  WorkspaceCapabilityProbe,
  WorkspaceBootstrap,
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
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceId,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-20T00:00:00.000Z',
    },
    sessions: [],
    capabilities: makeCapabilityProbe(workspaceId, capabilityOverrides),
    traceability,
    verificationRuns,
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
