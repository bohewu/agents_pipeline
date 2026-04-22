import { describe, expect, it } from 'vitest';
import { applyLaneAttributionToMessage, extractLaneAttribution, validateLaneAttributionRecord } from './lane-attribution.js';

describe('lane attribution normalization', () => {
  it('normalizes explicit branch metadata and derives the branch lane id', () => {
    expect(extractLaneAttribution({
      metadata: {
        branch: {
          name: '  feature/branch-lane  ',
        },
      },
    })).toEqual({
      laneId: 'branch:feature/branch-lane',
      laneContext: {
        kind: 'branch',
        branch: 'feature/branch-lane',
      },
    });

    expect(validateLaneAttributionRecord({
      laneContext: {
        kind: ' BRANCH ',
        branch: ' feature/manual-branch ',
      },
    }, 'lane')).toEqual({
      laneId: 'branch:feature/manual-branch',
      laneContext: {
        kind: 'branch',
        branch: 'feature/manual-branch',
      },
    });
  });

  it('normalizes explicit worktree metadata and applies it across projected traceability records', () => {
    const lane = extractLaneAttribution({
      info: {
        lane: {
          context: {
            type: ' WORKTREE ',
            path: ' /tmp/worktrees/attempt-b ',
            branchName: ' feature/attempt-b ',
          },
        },
      },
    });

    expect(lane).toEqual({
      laneId: 'worktree:/tmp/worktrees/attempt-b',
      laneContext: {
        kind: 'worktree',
        worktreePath: '/tmp/worktrees/attempt-b',
        branch: 'feature/attempt-b',
      },
    });

    const projected = applyLaneAttributionToMessage({
      id: 'message-lane',
      role: 'assistant',
      createdAt: '2026-04-22T16:00:00.000Z',
      parts: [{ type: 'text', text: 'Lane-aware output.' }],
      trace: {
        sourceMessageId: 'message-lane',
        workspaceId: 'workspace-lane',
        sessionId: 'session-lane',
      },
      taskEntry: {
        taskId: 'task-lane',
        workspaceId: 'workspace-lane',
        sessionId: 'session-lane',
        sourceMessageId: 'message-lane',
        state: 'completed',
      },
      resultAnnotation: {
        sourceMessageId: 'message-lane',
        workspaceId: 'workspace-lane',
        sessionId: 'session-lane',
        taskId: 'task-lane',
        verification: 'verified',
      },
    }, lane);

    expect(projected.trace).toEqual(expect.objectContaining({
      laneId: 'worktree:/tmp/worktrees/attempt-b',
      laneContext: {
        kind: 'worktree',
        worktreePath: '/tmp/worktrees/attempt-b',
        branch: 'feature/attempt-b',
      },
    }));
    expect(projected.taskEntry).toEqual(expect.objectContaining({
      laneId: 'worktree:/tmp/worktrees/attempt-b',
      laneContext: {
        kind: 'worktree',
        worktreePath: '/tmp/worktrees/attempt-b',
        branch: 'feature/attempt-b',
      },
    }));
    expect(projected.resultAnnotation).toEqual(expect.objectContaining({
      laneId: 'worktree:/tmp/worktrees/attempt-b',
      laneContext: {
        kind: 'worktree',
        worktreePath: '/tmp/worktrees/attempt-b',
        branch: 'feature/attempt-b',
      },
    }));
  });
});
