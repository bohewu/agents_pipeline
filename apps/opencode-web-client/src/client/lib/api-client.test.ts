import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api-client.js';
import type { NormalizedMessage, WorkspaceBootstrap } from '../../shared/types.js';

describe('api lane normalization', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('derives branch and worktree lane ids throughout workspace bootstrap payloads', async () => {
    const workspaceId = 'workspace-bootstrap-lanes';
    fetchMock.mockResolvedValueOnce(okJsonResponse<WorkspaceBootstrap>({
      workspace: {
        id: workspaceId,
        name: 'Lane workspace',
        rootPath: '/tmp/workspace-bootstrap-lanes',
        addedAt: '2026-04-22T00:00:00.000Z',
      },
      sessions: [
        {
          id: 'session-branch',
          title: 'Branch session',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:01:00.000Z',
          messageCount: 1,
          state: 'idle',
          laneContext: { kind: 'branch', branch: 'feature/bootstrap-a' },
        },
        {
          id: 'session-worktree',
          title: 'Worktree session',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:01:00.000Z',
          messageCount: 1,
          state: 'idle',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
        },
      ],
      capabilities: makeCapabilityProbe(workspaceId),
      traceability: {
        taskEntries: [
          {
            taskId: 'task-branch',
            workspaceId,
            sessionId: 'session-branch',
            sourceMessageId: 'message-branch',
            state: 'completed',
            laneContext: { kind: 'branch', branch: 'feature/bootstrap-a' },
          },
        ],
        resultAnnotations: [
          {
            sourceMessageId: 'message-worktree',
            workspaceId,
            sessionId: 'session-worktree',
            taskId: 'task-worktree',
            verification: 'verified',
            laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
          },
        ],
      },
      verificationRuns: [
        {
          id: 'verify-worktree',
          workspaceId,
          sessionId: 'session-worktree',
          sourceMessageId: 'message-worktree',
          taskId: 'task-worktree',
          commandKind: 'test',
          status: 'passed',
          startedAt: '2026-04-22T00:00:00.000Z',
          summary: 'Tests passed.',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
        },
      ],
      browserEvidenceRecords: [
        {
          id: 'browser-worktree',
          workspaceId,
          capturedAt: '2026-04-22T00:00:02.000Z',
          sessionId: 'session-worktree',
          sourceMessageId: 'message-worktree',
          taskId: 'task-worktree',
          summary: 'Captured browser evidence.',
          previewUrl: 'http://127.0.0.1:4173/',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
        },
      ],
      taskLedgerRecords: [
        {
          taskId: 'task-worktree',
          workspaceId,
          sessionId: 'session-worktree',
          sourceMessageId: 'message-worktree',
          title: 'Worktree task',
          summary: 'Lane-aware ledger summary.',
          state: 'completed',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:01:00.000Z',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
          resultAnnotation: {
            sourceMessageId: 'message-worktree',
            workspaceId,
            sessionId: 'session-worktree',
            taskId: 'task-worktree',
            verification: 'verified',
            laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/bootstrap-b', branch: 'feature/bootstrap-b' },
          },
        },
      ],
    }));

    const bootstrap = await api.getBootstrap(workspaceId);

    expect(fetchMock).toHaveBeenCalledWith(`/api/workspaces/${workspaceId}/bootstrap`, {
      headers: { Accept: 'application/json' },
    });
    expect(bootstrap.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'session-branch', laneId: 'branch:feature/bootstrap-a' }),
      expect.objectContaining({ id: 'session-worktree', laneId: 'worktree:/tmp/worktrees/bootstrap-b' }),
    ]));
    expect(bootstrap.traceability).toBeDefined();
    expect(bootstrap.traceability!.taskEntries).toEqual([
      expect.objectContaining({ laneId: 'branch:feature/bootstrap-a' }),
    ]);
    expect(bootstrap.traceability!.resultAnnotations).toEqual([
      expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/bootstrap-b' }),
    ]);
    expect(bootstrap.verificationRuns).toEqual([
      expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/bootstrap-b' }),
    ]);
    expect(bootstrap.browserEvidenceRecords).toEqual([
      expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/bootstrap-b' }),
    ]);
    expect(bootstrap.taskLedgerRecords).toEqual([
      expect.objectContaining({
        laneId: 'worktree:/tmp/worktrees/bootstrap-b',
        resultAnnotation: expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/bootstrap-b' }),
      }),
    ]);
  });

  it('derives lane ids for message traces and per-message projections', async () => {
    const workspaceId = 'workspace-message-lanes';
    const sessionId = 'session-message-lanes';
    fetchMock.mockResolvedValueOnce(okJsonResponse<NormalizedMessage[]>([
      {
        id: 'message-lane',
        role: 'assistant',
        createdAt: '2026-04-22T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Lane-aware message.' }],
        trace: {
          sourceMessageId: 'message-lane',
          workspaceId,
          sessionId,
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/message-b', branch: 'feature/message-b' },
        },
        taskEntry: {
          taskId: 'task-lane',
          workspaceId,
          sessionId,
          sourceMessageId: 'message-lane',
          state: 'completed',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/message-b', branch: 'feature/message-b' },
        },
        resultAnnotation: {
          sourceMessageId: 'message-lane',
          workspaceId,
          sessionId,
          taskId: 'task-lane',
          verification: 'verified',
          laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/message-b', branch: 'feature/message-b' },
        },
      },
    ]));

    const messages = await api.listMessages(workspaceId, sessionId);

    expect(fetchMock).toHaveBeenCalledWith(`/api/workspaces/${workspaceId}/sessions/${sessionId}/messages`, {
      headers: { Accept: 'application/json' },
    });
    expect(messages).toEqual([
      expect.objectContaining({
        trace: expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/message-b' }),
        taskEntry: expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/message-b' }),
        resultAnnotation: expect.objectContaining({ laneId: 'worktree:/tmp/worktrees/message-b' }),
      }),
    ]);
  });
});

function okJsonResponse<T>(data: T): Response {
  return {
    ok: true,
    json: async () => ({ ok: true, data }),
  } as Response;
}

function makeCapabilityProbe(workspaceId: string) {
  const available = { status: 'available', summary: 'Available' } as const;
  return {
    workspaceId,
    checkedAt: '2026-04-22T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
  };
}
