// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  abort: vi.fn(),
  listMessages: vi.fn(),
  listVerificationRuns: vi.fn(),
  runVerification: vi.fn(),
}));

vi.mock('../../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('../../lib/api-client.js', () => ({
  api: apiMocks,
}));

import { TaskPanel } from './TaskPanel.js';
import { useStore } from '../../runtime/store.js';
import type { BrowserEvidenceRecord, TaskLedgerRecord, WorkspaceBootstrap, WorkspaceCapabilityProbe, WorkspaceGitStatusResult } from '../../../shared/types.js';

const baseState = useStore.getState();

describe('TaskPanel', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    resetStore();
    apiMocks.abort.mockReset();
    apiMocks.listMessages.mockReset();
    apiMocks.listVerificationRuns.mockReset();
    apiMocks.runVerification.mockReset();
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

  it('renders workspace-scoped task surfaces and updates cleanly when the active workspace changes', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', 'Repo One', [
      makeTaskRecord('workspace-1', 'task-queued', 'queued', 'Repo One queued task'),
      makeTaskRecord('workspace-1', 'task-completed', 'completed', 'Repo One completed task'),
    ]));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', 'Repo Two', [
      makeTaskRecord('workspace-2', 'task-running', 'running', 'Repo Two running task'),
      makeTaskRecord('workspace-2', 'task-blocked', 'blocked', 'Repo Two blocked task'),
      makeTaskRecord('workspace-2', 'task-failed', 'failed', 'Repo Two failed task'),
    ]));
    useStore.getState().setActiveWorkspace('workspace-2');

    await renderPanel();

    expect(container.textContent).toContain('Hydrated task continuity stays scoped to Repo Two');
    expect(container.textContent).toContain('Active tasks');
    expect(container.textContent).toContain('Recent completed');
    expect(container.textContent).toContain('Blocked tasks');
    expect(container.textContent).toContain('Repo Two running task');
    expect(container.textContent).toContain('Repo Two blocked task');
    expect(container.textContent).toContain('Repo Two failed task');
    expect(container.textContent).not.toContain('Repo One queued task');
    expect(container.textContent).not.toContain('Repo One completed task');

    await act(async () => {
      useStore.getState().setActiveWorkspace('workspace-1');
    });

    expect(container.textContent).toContain('Hydrated task continuity stays scoped to Repo One');
    expect(container.textContent).toContain('Repo One queued task');
    expect(container.textContent).toContain('Repo One completed task');
    expect(container.textContent).not.toContain('Repo Two running task');
    expect(container.textContent).not.toContain('Repo Two blocked task');
    expect(container.textContent).not.toContain('Repo Two failed task');
  });

  it('keeps the dedicated task surfaces visible when ledger data exists even if some sections are empty', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', 'Repo One', [
      makeTaskRecord('workspace-1', 'task-running', 'running', 'Repo One running task'),
    ]));
    useStore.getState().setActiveWorkspace('workspace-1');

    await renderPanel();

    expect(container.textContent).toContain('Active tasks');
    expect(container.textContent).toContain('Recent completed');
    expect(container.textContent).toContain('Blocked tasks');
    expect(container.textContent).toContain('Repo One running task');
    expect(container.textContent).toContain('No recently finished tasks are currently visible for this workspace.');
    expect(container.textContent).toContain('No blocked tasks are currently visible for this workspace.');
    expect(container.textContent).not.toContain('No persisted tasks yet');
  });

  it('scopes task actions to the active session and routes secondary attempts back through open-session handoffs', async () => {
    const workspaceId = 'workspace-actions';
    const runningMessages = [{ id: 'message-running', role: 'assistant', createdAt: '2026-04-21T00:00:00.000Z', parts: [{ type: 'text', text: 'Running task context' }] }];
    const failedMessages = [{ id: 'task-failed-message', role: 'assistant', createdAt: '2026-04-21T00:00:00.000Z', parts: [{ type: 'text', text: 'Failed task context' }] }];
    const completedMessages = [{ id: 'message-completed', role: 'assistant', createdAt: '2026-04-21T00:00:00.000Z', parts: [{ type: 'text', text: 'Completed task context' }] }];

    apiMocks.abort.mockResolvedValue(undefined);
    apiMocks.runVerification.mockResolvedValue({ id: 'verify-lint-2' });
    apiMocks.listVerificationRuns.mockResolvedValue([]);
    apiMocks.listMessages.mockImplementation(async (_workspaceId: string, sessionId: string) => {
      if (sessionId === 'session-failed') {
        return failedMessages;
      }
      if (sessionId === 'session-completed') {
        return completedMessages;
      }
      return [];
    });

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Actions', [
      makeTaskRecord(workspaceId, 'task-running', 'running', 'Running task summary'),
      makeTaskRecord(workspaceId, 'task-failed', 'failed', 'Failed verification task', {
        recentVerificationRef: {
          runId: 'verify-lint-1',
          commandKind: 'lint',
          status: 'failed',
          summary: 'Lint failed.',
        },
      }),
      makeTaskRecord(workspaceId, 'task-completed', 'completed', 'Completed task summary', {
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'success',
          sessionId: 'session-completed',
          messageId: 'message-completed',
          pullRequestUrl: 'https://example.com/pr/1',
        },
      }),
    ]));
    useStore.getState().setSessions(workspaceId, [
      makeSession('session-running'),
      makeSession('session-failed'),
      makeSession('session-completed'),
    ]);
    useStore.getState().setActiveWorkspace(workspaceId);
    useStore.getState().setActiveSession(workspaceId, 'session-running');
    useStore.getState().setMessages(workspaceId, 'session-running', runningMessages as any);

    await renderPanel();

    expect(getButtonLabels('Running task summary')).toEqual(['Cancel']);
    expect(getButtonLabels('Failed verification task')).toEqual(['Open session']);
    expect(findTaskCard('Failed verification task').textContent).toContain('Open session session-failed to retry this attempt from the matching workspace context.');
    expect(getButtonLabels('Completed task summary')).toEqual(['Open session']);

    await clickTaskButton('Running task summary', 'Cancel');
    expect(apiMocks.abort).toHaveBeenCalledWith(workspaceId, 'session-running');
    expect(findTaskCard('Running task summary').textContent).toContain('Sent an abort request for this task session.');

    await clickTaskButton('Failed verification task', 'Open session');
    expect(apiMocks.listMessages).toHaveBeenCalledWith(workspaceId, 'session-failed');
    expect(useStore.getState().activeSessionByWorkspace[workspaceId]).toBe('session-failed');
    expect(findTaskCard('Failed verification task').textContent).toContain('Opened this task in session session-failed for the matching lane context.');
    expect(getButtonLabels('Failed verification task')).toEqual(['Retry lint', 'Reopen']);

    await clickTaskButton('Failed verification task', 'Retry lint');
    expect(apiMocks.runVerification).toHaveBeenCalledWith(workspaceId, {
      sessionId: 'session-failed',
      commandKind: 'lint',
      sourceMessageId: 'task-failed-message',
      taskId: 'task-failed',
    });
    expect(apiMocks.listVerificationRuns).toHaveBeenCalledWith(workspaceId);
    expect(findTaskCard('Failed verification task').textContent).toContain('Retried lint verification from this task.');

    await clickTaskButton('Completed task summary', 'Open session');
    expect(apiMocks.listMessages).toHaveBeenCalledWith(workspaceId, 'session-completed');
    expect(useStore.getState().activeSessionByWorkspace[workspaceId]).toBe('session-completed');
    expect(useStore.getState().messagesBySession[`${workspaceId}::session-completed`]).toEqual([
      expect.objectContaining({
        ...completedMessages[0],
        trace: expect.objectContaining({
          workspaceId,
          sessionId: 'session-completed',
          sourceMessageId: 'message-completed',
        }),
      }),
    ]);
    expect(findTaskCard('Completed task summary').textContent).toContain('Opened this task in session session-completed for the matching lane context.');
  });

  it('keeps blocked actions in-context and directs other saved attempts back to their own sessions', async () => {
    const workspaceId = 'workspace-action-matrix';
    const failedMessages = [{ id: 'task-failed-message', role: 'assistant', createdAt: '2026-04-21T00:00:00.000Z', parts: [{ type: 'text', text: 'Failed task context' }] }];

    apiMocks.listMessages.mockImplementation(async (_workspaceId: string, sessionId: string) => {
      if (sessionId === 'session-failed') {
        return failedMessages;
      }
      return [];
    });

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Matrix', [
      makeTaskRecord(workspaceId, 'task-queued', 'queued', 'Queued task summary'),
      makeTaskRecord(workspaceId, 'task-blocked', 'blocked', 'Blocked verification task', {
        recentVerificationRef: {
          runId: 'verify-build-1',
          commandKind: 'build',
          status: 'failed',
          summary: 'Build verification failed.',
        },
      }),
      makeTaskRecord(workspaceId, 'task-failed', 'failed', 'Failed task summary', {
        recentVerificationRef: {
          runId: 'verify-lint-1',
          commandKind: 'lint',
          status: 'failed',
          summary: 'Lint verification failed.',
        },
      }),
      makeTaskRecord(workspaceId, 'task-cancelled', 'cancelled', 'Cancelled verification task', {
        recentVerificationRef: {
          runId: 'verify-test-1',
          commandKind: 'test',
          status: 'cancelled',
          summary: 'Test verification was cancelled.',
        },
      }),
    ]));
    useStore.getState().setSessions(workspaceId, [
      makeSession('session-queued'),
      makeSession('session-blocked'),
      makeSession('session-failed'),
      makeSession('session-cancelled'),
    ]);
    useStore.getState().setActiveWorkspace(workspaceId);
    useStore.getState().setActiveSession(workspaceId, 'session-blocked');

    await renderPanel();

    expect(getButtonLabels('Queued task summary')).toEqual(['Open session']);
    expect(getButtonLabels('Blocked verification task')).toEqual(['Retry build']);
    expect(getButtonLabels('Failed task summary')).toEqual(['Open session']);
    expect(getButtonLabels('Cancelled verification task')).toEqual(['Open session']);

    await clickTaskButton('Failed task summary', 'Open session');
    expect(apiMocks.listMessages).toHaveBeenCalledWith(workspaceId, 'session-failed');
    expect(useStore.getState().activeSessionByWorkspace[workspaceId]).toBe('session-failed');
    expect(useStore.getState().messagesBySession[`${workspaceId}::session-failed`]).toEqual([
      expect.objectContaining({
        ...failedMessages[0],
        trace: expect.objectContaining({
          workspaceId,
          sessionId: 'session-failed',
          sourceMessageId: 'task-failed-message',
        }),
      }),
    ]);
    expect(findTaskCard('Failed task summary').textContent).toContain('Opened this task in session session-failed for the matching lane context.');
    expect(getButtonLabels('Failed task summary')).toEqual(['Retry lint', 'Reopen']);
  });

  it('keeps sibling lane task records separate when attempts reuse the same task id', async () => {
    const workspaceId = 'workspace-lane-task-isolation';

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Lane Isolation', [
      makeTaskRecord(workspaceId, 'task-shared', 'completed', 'Branch lane summary', {
        sessionId: 'session-lane-a',
        sourceMessageId: 'message-shared',
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
        recentVerificationRef: {
          runId: 'verify-lane-a',
          commandKind: 'lint',
          status: 'failed',
          summary: 'Lane A verification failed.',
          terminalLogRef: 'verification-logs/lane-a.log',
        },
        resultAnnotation: {
          sourceMessageId: 'message-shared',
          workspaceId,
          sessionId: 'session-lane-a',
          taskId: 'task-shared',
          verification: 'unverified',
          summary: 'Lane A blocked by review.',
          shipState: 'blocked-by-requested-changes',
          laneContext: { kind: 'branch', branch: 'feature/lane-a' },
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'blocked',
          sessionId: 'session-lane-a',
          messageId: 'message-shared',
          taskId: 'task-shared',
          pullRequestUrl: 'https://example.com/pr/lane-a',
          conditionKind: 'requested-changes',
          conditionLabel: 'Lane A review requested changes.',
          terminalLogRef: 'ship-logs/lane-a.log',
        },
      }),
      makeTaskRecord(workspaceId, 'task-shared', 'completed', 'Worktree lane summary', {
        sessionId: 'session-lane-b',
        sourceMessageId: 'message-shared',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
        recentVerificationRef: {
          runId: 'verify-lane-b',
          commandKind: 'test',
          status: 'passed',
          summary: 'Lane B verification passed.',
          terminalLogRef: 'verification-logs/lane-b.log',
        },
        resultAnnotation: {
          sourceMessageId: 'message-shared',
          workspaceId,
          sessionId: 'session-lane-b',
          taskId: 'task-shared',
          verification: 'verified',
          summary: 'Lane B ready for ship.',
          shipState: 'pr-ready',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'success',
          sessionId: 'session-lane-b',
          messageId: 'message-shared',
          taskId: 'task-shared',
          pullRequestUrl: 'https://example.com/pr/lane-b',
          terminalLogRef: 'ship-logs/lane-b.log',
        },
      }),
    ]));
    useStore.getState().setActiveWorkspace(workspaceId);

    await renderPanel();

    expect(findTaskCard('Branch lane summary').textContent).toContain('Alternative attempt');
    expect(findTaskCard('Branch lane summary').textContent).toContain('Branch · feature/lane-a');
    expect(findTaskCard('Branch lane summary').textContent).toContain('Workspace: workspace-lane-task-isolation · Session: session-lane-a');
    expect(findTaskCard('Branch lane summary').textContent).not.toContain('Verification: Lane A verification failed.');
    expect(findTaskCard('Branch lane summary').textContent).not.toContain('Blocked by requested changes');
    expect(findTaskCard('Branch lane summary').textContent).not.toContain('Fix handoff:');
    expect(findTaskCard('Branch lane summary').textContent).not.toContain('Pull request:');
    expect(findTaskCard('Worktree lane summary').textContent).toContain('Alternative attempt');
    expect(findTaskCard('Worktree lane summary').textContent).toContain('Worktree · feature/lane-b');
    expect(findTaskCard('Worktree lane summary').textContent).toContain('Path · /tmp/worktrees/lane-b');
    expect(findTaskCard('Worktree lane summary').textContent).toContain('Workspace: workspace-lane-task-isolation · Session: session-lane-b');
    expect(findTaskCard('Worktree lane summary').textContent).not.toContain('Verification: Lane B verification passed.');
    expect(findTaskCard('Worktree lane summary').textContent).not.toContain('PR ready');
    expect(findTaskCard('Worktree lane summary').textContent).not.toContain('Pull request:');
  });

  it('projects linked PR ready and blocked state into task cards without cross-workspace leakage', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', 'Repo Ready', [
      makeTaskRecord('workspace-1', 'task-ready', 'blocked', 'Ready for ship', {
        resultAnnotation: {
          sourceMessageId: 'task-ready-message',
          workspaceId: 'workspace-1',
          sessionId: 'session-ready',
          taskId: 'task-ready',
          verification: 'verified',
          summary: 'Ready for ship',
          shipState: 'not-ready',
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'blocked',
          sessionId: 'session-ready',
          messageId: 'task-ready-message',
          taskId: 'task-ready',
          pullRequestUrl: 'https://github.com/example/repo/pull/41',
        },
      }),
    ], makeGitStatus('workspace-1', 'https://github.com/example/repo/pull/41', 'passing', 'approved')));
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', 'Repo Blocked', [
      makeTaskRecord('workspace-2', 'task-blocked-check', 'blocked', 'Blocked by checks', {
        resultAnnotation: {
          sourceMessageId: 'task-blocked-check-message',
          workspaceId: 'workspace-2',
          sessionId: 'session-blocked-check',
          taskId: 'task-blocked-check',
          verification: 'unverified',
          summary: 'Blocked by checks',
          shipState: 'not-ready',
        },
        recentShipRef: {
          action: 'pullRequest',
          outcome: 'blocked',
          sessionId: 'session-blocked-check',
          messageId: 'task-blocked-check-message',
          taskId: 'task-blocked-check',
          pullRequestUrl: 'https://github.com/example/repo/pull/84',
          conditionKind: 'failing-check',
          conditionLabel: 'CI / test',
          detailsUrl: 'https://example.com/checks/1',
        },
      }),
    ], makeGitStatus('workspace-2', 'https://github.com/example/repo/pull/84', 'failing', 'changes_requested')));

    useStore.getState().setActiveWorkspace('workspace-2');

    await renderPanel();

    expect(container.textContent).toContain('Blocked by checks');
    expect(container.textContent).toContain('Fix handoff: Failing check · CI / test');
    expect(container.textContent).not.toContain('PR ready');

    await act(async () => {
      useStore.getState().setActiveWorkspace('workspace-1');
      await flushAsync();
    });

    expect(container.textContent).toContain('PR ready');
    expect(container.textContent).not.toContain('Fix handoff: Failing check · CI / test');
  });

  it('renders browser evidence only while the workspace capability-gated projection is present', async () => {
    const workspaceId = 'workspace-browser-task';

    useStore.getState().setWorkspaceBootstrap(workspaceId, {
      ...makeBootstrap(workspaceId, 'Repo Browser', [
        makeTaskRecord(workspaceId, 'task-browser', 'completed', 'Browser-backed task', {
          sessionId: 'session-browser',
          sourceMessageId: 'message-browser',
          recentVerificationRef: {
            runId: 'verify-browser-task',
            commandKind: 'test',
            status: 'passed',
            summary: 'Browser verification passed.',
            terminalLogRef: 'verification-logs/workspace-browser-task/verify-browser-task.log',
          },
        }),
      ]),
      browserEvidenceRecords: [makeBrowserEvidenceRecord(workspaceId, 'record-task-browser', '2026-04-22T16:02:00.000Z', {
        sessionId: 'session-browser',
        sourceMessageId: 'message-browser',
        taskId: 'task-browser',
        summary: 'Captured browser evidence for the task card.',
        screenshot: {
          artifactRef: 'artifacts/browser/task-browser.png',
          mimeType: 'image/png',
          bytes: 8 * 1024,
          width: 1280,
          height: 720,
          capturedAt: '2026-04-22T16:02:00.000Z',
        },
      })],
    });
    useStore.getState().setWorkspaceCapabilities(workspaceId, makeCapabilityProbe(workspaceId));
    useStore.getState().setActiveWorkspace(workspaceId);

    await renderPanel();

    expect(findTaskCard('Browser-backed task').textContent).toContain('Verification log: verification-logs/workspace-browser-task/verify-browser-task.log');
    expect(findTaskCard('Browser-backed task').textContent).toContain('Browser evidence');
    expect(findTaskCard('Browser-backed task').textContent).toContain('Captured browser evidence for the task card.');
    expect(findTaskCard('Browser-backed task').textContent).toContain('Preview URL: http://127.0.0.1:4173/');
    expect(findTaskCard('Browser-backed task').textContent).toContain('Screenshot ref: artifacts/browser/task-browser.png · 1280×720 · 8.0 KB');

    await act(async () => {
      useStore.getState().setWorkspaceCapabilities(workspaceId, makeCapabilityProbe(workspaceId, {
        previewTarget: { status: 'unavailable', summary: 'Preview target unavailable', detail: 'No preview script detected.' },
        browserEvidence: { status: 'unavailable', summary: 'Browser evidence unavailable', detail: 'Preview runtime is disabled.' },
      }));
      await flushAsync();
    });

    expect(findTaskCard('Browser-backed task').textContent).toContain('Verification log: verification-logs/workspace-browser-task/verify-browser-task.log');
    expect(findTaskCard('Browser-backed task').textContent).not.toContain('Browser evidence');
    expect(findTaskCard('Browser-backed task').textContent).not.toContain('Preview URL: http://127.0.0.1:4173/');
    expect(findTaskCard('Browser-backed task').textContent).not.toContain('Screenshot ref: artifacts/browser/task-browser.png');
  });

  async function renderPanel(): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(<TaskPanel />);
      await flushAsync();
    });
  }

  async function clickTaskButton(summary: string, label: string): Promise<void> {
    await act(async () => {
      const button = Array.from(findTaskCard(summary).querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
      if (!button) {
        throw new Error(`Unable to find ${label} for ${summary}`);
      }
      (button as HTMLButtonElement).click();
      await flushAsync();
    });
  }

  function getButtonLabels(summary: string): string[] {
    return Array.from(findTaskCard(summary).querySelectorAll('button')).map((button) => button.textContent?.trim() ?? '');
  }

  function findTaskCard(summary: string): HTMLElement {
    const card = Array.from(container.querySelectorAll('article')).find((candidate) => candidate.textContent?.includes(summary));
    if (!card) {
      throw new Error(`Unable to find task card for ${summary}`);
    }
    return card as HTMLElement;
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
  workspaceName: string,
  taskLedgerRecords: TaskLedgerRecord[],
  git?: WorkspaceBootstrap['git'],
): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions: [],
    ...(git ? { git } : {}),
    taskLedgerRecords,
    traceability: {
      taskEntries: [],
      resultAnnotations: [],
    },
  };
}

function makeTaskRecord(
  workspaceId: string,
  taskId: string,
  state: TaskLedgerRecord['state'],
  summary: string,
  overrides: Partial<TaskLedgerRecord> = {},
): TaskLedgerRecord {
  return {
    taskId,
    workspaceId,
    sessionId: overrides.sessionId ?? taskId.replace('task', 'session'),
    sourceMessageId: overrides.sourceMessageId ?? `${taskId}-message`,
    title: `${summary} title`,
    summary,
    state,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:05:00.000Z',
    ...(state === 'completed' || state === 'failed' || state === 'cancelled'
      ? { completedAt: '2026-04-21T00:06:00.000Z' }
      : {}),
    ...overrides,
  };
}

function makeSession(id: string) {
  return {
    id,
    title: id,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    messageCount: 0,
    state: 'idle' as const,
  };
}

function makeGitStatus(
  workspaceId: string,
  pullRequestUrl: string,
  checksStatus: 'passing' | 'failing' | 'pending' | 'none',
  reviewStatus: 'approved' | 'changes_requested' | 'review_required' | 'unknown',
): WorkspaceGitStatusResult {
  return {
    outcome: 'success',
    data: {
      workspaceId,
      checkedAt: '2026-04-21T00:00:00.000Z',
      branch: { name: 'feature/ship', detached: false },
      upstream: {
        status: 'tracked',
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 0,
        behind: 0,
        remoteProvider: 'github',
      },
      changeSummary: {
        staged: { count: 0, paths: [], truncated: false },
        unstaged: { count: 0, paths: [], truncated: false },
        untracked: { count: 0, paths: [], truncated: false },
        conflicted: { count: 0, paths: [], truncated: false },
        hasChanges: false,
        hasStagedChanges: false,
      },
      pullRequest: {
        outcome: 'success',
        supported: true,
        summary: 'Ready',
        issues: [],
      },
      linkedPullRequest: {
        outcome: 'success',
        linked: true,
        summary: 'Linked pull request.',
        number: workspaceId === 'workspace-1' ? 41 : 84,
        title: 'Projected PR',
        url: pullRequestUrl,
        state: 'OPEN',
        headBranch: 'feature/ship',
        baseBranch: 'main',
        checks: {
          status: checksStatus,
          summary: `${checksStatus} checks`,
          total: 1,
          passing: checksStatus === 'passing' ? 1 : 0,
          failing: checksStatus === 'failing' ? 1 : 0,
          pending: checksStatus === 'pending' ? 1 : 0,
          failingChecks: checksStatus === 'failing' ? [{ name: 'CI / test' }] : [],
        },
        review: {
          status: reviewStatus,
          summary: reviewStatus,
          requestedReviewerCount: reviewStatus === 'approved' ? 0 : 1,
        },
        issues: [],
      },
    },
    issues: [],
  };
}

function makeCapabilityProbe(
  workspaceId: string,
  overrides?: Partial<WorkspaceCapabilityProbe>,
): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const;
  return {
    workspaceId,
    checkedAt: '2026-04-22T16:00:00.000Z',
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
  id: string,
  capturedAt: string,
  overrides: Partial<BrowserEvidenceRecord> = {},
): BrowserEvidenceRecord {
  return {
    id,
    workspaceId,
    capturedAt,
    sessionId: overrides.sessionId ?? 'session-browser',
    sourceMessageId: overrides.sourceMessageId ?? 'message-browser',
    taskId: overrides.taskId ?? 'task-browser',
    summary: overrides.summary ?? `Captured browser evidence for ${id}.`,
    previewUrl: overrides.previewUrl ?? 'http://127.0.0.1:4173/',
    ...(overrides.consoleCapture ? { consoleCapture: overrides.consoleCapture } : {}),
    ...(overrides.screenshot ? { screenshot: overrides.screenshot } : {}),
  };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
