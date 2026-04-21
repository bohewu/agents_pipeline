import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EventBroker } from './event-broker.js'
import { TaskLedgerService } from './task-ledger-service.js'

describe('EventBroker task ledger persistence', () => {
  it('persists workspace-scoped lifecycle updates and preserves existing refs across queued through cancelled states', () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'event-broker-ledger-'))
    const taskLedgerService = new TaskLedgerService({ stateDir })
    const broker = new EventBroker({ get: () => undefined } as any, {
      taskLedgerService,
      now: sequenceClock(
        '2026-04-21T13:00:01.000Z',
        '2026-04-21T13:00:02.000Z',
        '2026-04-21T13:00:03.000Z',
        '2026-04-21T13:00:04.000Z',
        '2026-04-21T13:00:05.000Z',
        '2026-04-21T13:00:06.000Z',
        '2026-04-21T13:00:07.000Z',
      ),
    })

    taskLedgerService.upsertRecord({
      taskId: 'task-1',
      workspaceId: 'ws-1',
      sessionId: 'session-1',
      sourceMessageId: 'message-1',
      title: 'Task task-1',
      summary: 'Queued work.',
      state: 'queued',
      createdAt: '2026-04-21T13:00:00.000Z',
      updatedAt: '2026-04-21T13:00:00.000Z',
      resultAnnotation: {
        sourceMessageId: 'message-1',
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        taskId: 'task-1',
        verification: 'partially verified',
        summary: 'Queued work.',
        shipState: 'pr-ready',
      },
      recentVerificationRef: {
        runId: 'verify-1',
        commandKind: 'test',
        status: 'passed',
        summary: 'Tests passed.',
        terminalLogRef: 'verification-logs/ws-1/verify-1.log',
      },
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId: 'session-1',
        messageId: 'message-1',
        taskId: 'task-1',
        terminalLogRef: 'ship-logs/ws-1/pr-task-1.log',
        pullRequestUrl: 'https://github.com/example/repo/pull/99',
      },
    })

    try {
      const states = ['queued', 'running', 'blocked', 'completed', 'failed', 'cancelled'] as const

      for (const state of states) {
        ;(broker as any).handleUpstreamEvent('ws-1', 'message.updated', JSON.stringify({
          payload: {
            properties: {
              sessionID: 'session-1',
              info: {
                id: 'message-1',
                role: 'assistant',
                time: { created: '2026-04-21T13:00:00.000Z' },
                task: {
                  id: 'task-1',
                  state,
                  title: 'Task task-1',
                  summary: `Lifecycle moved to ${state}.`,
                },
                resultAnnotation: {
                  sourceMessageId: 'message-1',
                  workspaceId: 'ws-1',
                  sessionId: 'session-1',
                  taskId: 'task-1',
                  verification: 'partially verified',
                  summary: `Lifecycle moved to ${state}.`,
                },
              },
            },
          },
        }))

        expect(taskLedgerService.getRecord('ws-1', 'task-1')).toEqual(expect.objectContaining({
          workspaceId: 'ws-1',
          sessionId: 'session-1',
          sourceMessageId: 'message-1',
          summary: `Lifecycle moved to ${state}.`,
          state,
          recentVerificationRef: expect.objectContaining({
            runId: 'verify-1',
            status: 'passed',
          }),
          recentShipRef: expect.objectContaining({
            action: 'pullRequest',
            taskId: 'task-1',
            pullRequestUrl: 'https://github.com/example/repo/pull/99',
          }),
        }))
      }

      ;(broker as any).handleUpstreamEvent('ws-2', 'message.updated', JSON.stringify({
        payload: {
          properties: {
            sessionID: 'session-1',
            info: {
              id: 'message-1',
              role: 'assistant',
              time: { created: '2026-04-21T13:00:00.000Z' },
              task: {
                id: 'task-1',
                state: 'running',
                title: 'Task task-1',
                summary: 'Workspace two running task.',
              },
            },
          },
        },
      }))

      expect(taskLedgerService.getRecord('ws-1', 'task-1')).toEqual(expect.objectContaining({
        workspaceId: 'ws-1',
        summary: 'Lifecycle moved to cancelled.',
        state: 'cancelled',
      }))
      expect(taskLedgerService.getRecord('ws-2', 'task-1')).toEqual(expect.objectContaining({
        workspaceId: 'ws-2',
        sessionId: 'session-1',
        summary: 'Workspace two running task.',
        state: 'running',
      }))
    } finally {
      broker.shutdown()
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})

function sequenceClock(...values: string[]): () => Date {
  const queue = [...values]
  return () => new Date(queue.shift() ?? values[values.length - 1]!)
}
