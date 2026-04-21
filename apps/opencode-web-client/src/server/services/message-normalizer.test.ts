import { describe, expect, it } from 'vitest';
import { normalizeMessage } from './message-normalizer.js';

describe('normalizeMessage traceability', () => {
  it('extracts structured task linkage and result annotations from message metadata', () => {
    const normalized = normalizeMessage({
      info: {
        id: 'message-1',
        role: 'assistant',
        sessionID: 'session-1',
        time: { created: 1_712_000_000_000 },
      },
      metadata: {
        task: {
          id: 'task-1',
          state: 'done',
          title: 'Thread workspace traceability',
          latestSummary: 'Threaded stable task metadata through the store.',
        },
      },
      parts: [
        { type: 'text', text: 'Traceability foundation is ready.' },
        {
          type: 'tool-result',
          result: {
            annotation: {
              verification: 'verified',
              review_state: 'ready',
              ship_state: 'local-ready',
              summary: 'Structured summary from annotation state.',
            },
          },
        },
      ],
    }, { workspaceId: 'workspace-1' });

    expect(normalized.trace).toEqual({
      sourceMessageId: 'message-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    });
    expect(normalized.taskEntry).toEqual({
      taskId: 'task-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sourceMessageId: 'message-1',
      title: 'Thread workspace traceability',
      state: 'completed',
      latestSummary: 'Threaded stable task metadata through the store.',
    });
    expect(normalized.resultAnnotation).toEqual({
      sourceMessageId: 'message-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      verification: 'verified',
      reviewState: 'ready',
      shipState: 'local-ready',
      summary: 'Structured summary from annotation state.',
    });
  });

  it('synthesizes an unverified annotation when only structured task linkage is present', () => {
    const normalized = normalizeMessage({
      id: 'message-2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Task result without explicit annotation.' }],
      taskId: 'task-2',
      latestSummary: 'Fallback structured task summary.',
    }, {
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    });

    expect(normalized.trace).toEqual({
      sourceMessageId: 'message-2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      taskId: 'task-2',
    });
    expect(normalized.taskEntry).toEqual({
      taskId: 'task-2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      sourceMessageId: 'message-2',
      state: 'completed',
      latestSummary: 'Fallback structured task summary.',
    });
    expect(normalized.resultAnnotation).toEqual({
      sourceMessageId: 'message-2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      taskId: 'task-2',
      verification: 'unverified',
      summary: 'Fallback structured task summary.',
    });
  });
});
