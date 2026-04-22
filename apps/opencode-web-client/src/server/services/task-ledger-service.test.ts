import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TaskEntryState, TaskLedgerRecord } from '../../shared/types.js'
import { TaskLedgerService } from './task-ledger-service.js'

const tempDirs: string[] = []

describe('TaskLedgerService', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('round-trips Phase D task records and existing verification or ship references by workspace', () => {
    const stateDir = makeTempDir('task-ledger-state-')
    const service = new TaskLedgerService({ stateDir })

    const queuedRecord = makeTaskRecord('ws-1', 'session-1', 'task-queued', 'queued', 'Queued task summary', {
      updatedAt: '2026-04-21T12:00:00.000Z',
    })
    const runningRecord = makeTaskRecord('ws-1', 'session-1', 'task-running', 'running', 'Running task summary', {
      updatedAt: '2026-04-21T12:01:00.000Z',
      recentVerificationRef: {
        runId: 'verify-run-1',
        commandKind: 'lint',
        status: 'running',
        summary: 'Lint verification still running.',
        terminalLogRef: 'verification-logs/ws-1/verify-run-1.log',
      },
    })
    const blockedRecord = makeTaskRecord('ws-1', 'session-1', 'task-blocked', 'blocked', 'Blocked waiting for approval', {
      updatedAt: '2026-04-21T12:02:00.000Z',
      resultAnnotation: {
        sourceMessageId: 'message-task-blocked',
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        taskId: 'task-blocked',
        verification: 'unverified',
        summary: 'Blocked waiting for approval',
        reviewState: 'approval-needed',
        shipState: 'not-ready',
      },
    })
    const completedRecord = makeTaskRecord('ws-1', 'session-1', 'task-completed', 'completed', 'Completed task summary', {
      updatedAt: '2026-04-21T12:03:00.000Z',
      completedAt: '2026-04-21T12:03:00.000Z',
      recentVerificationRef: {
        runId: 'verify-run-2',
        commandKind: 'test',
        status: 'passed',
        summary: 'Tests passed.',
        terminalLogRef: 'verification-logs/ws-1/verify-run-2.log',
      },
      recentBrowserEvidenceRef: {
        recordId: 'browser-evidence-2',
        capturedAt: '2026-04-22T09:00:00.000Z',
        summary: 'Captured browser evidence for http://127.0.0.1:4173/.',
        previewUrl: 'http://127.0.0.1:4173/',
        consoleCapture: {
          capturedAt: '2026-04-22T09:00:00.000Z',
          entryCount: 1,
          errorCount: 0,
          warningCount: 0,
          exceptionCount: 0,
          levels: ['log'],
        },
        screenshot: {
          artifactRef: 'preview-runtime-artifacts/ws-1/browser-evidence-2.png',
          mimeType: 'image/png',
          bytes: 1024,
          width: 1280,
          height: 800,
          capturedAt: '2026-04-22T09:00:00.000Z',
        },
      },
      resultAnnotation: {
        sourceMessageId: 'message-task-completed',
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        taskId: 'task-completed',
        verification: 'verified',
        summary: 'Completed task summary',
        reviewState: 'ready',
        shipState: 'local-ready',
        browserEvidenceRef: {
          recordId: 'browser-evidence-2',
          capturedAt: '2026-04-22T09:00:00.000Z',
          summary: 'Captured browser evidence for http://127.0.0.1:4173/.',
          previewUrl: 'http://127.0.0.1:4173/',
          consoleCapture: {
            capturedAt: '2026-04-22T09:00:00.000Z',
            entryCount: 1,
            errorCount: 0,
            warningCount: 0,
            exceptionCount: 0,
            levels: ['log'],
          },
          screenshot: {
            artifactRef: 'preview-runtime-artifacts/ws-1/browser-evidence-2.png',
            mimeType: 'image/png',
            bytes: 1024,
            width: 1280,
            height: 800,
            capturedAt: '2026-04-22T09:00:00.000Z',
          },
        },
      },
    })
    const failedRecord = makeTaskRecord('ws-1', 'session-1', 'task-failed', 'failed', 'Failed task summary', {
      updatedAt: '2026-04-21T12:04:00.000Z',
      completedAt: '2026-04-21T12:04:00.000Z',
      recentShipRef: {
        action: 'commit',
        outcome: 'failure',
        sessionId: 'session-1',
        messageId: 'message-task-failed',
        taskId: 'task-failed',
        terminalLogRef: 'ship-logs/ws-1/commit-task-failed.log',
      },
      resultAnnotation: {
        sourceMessageId: 'message-task-failed',
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        taskId: 'task-failed',
        verification: 'partially verified',
        summary: 'Failed task summary',
        shipState: 'not-ready',
      },
    })
    const cancelledRecord = makeTaskRecord('ws-1', 'session-1', 'task-cancelled', 'cancelled', 'Cancelled task summary', {
      updatedAt: '2026-04-21T12:05:00.000Z',
      completedAt: '2026-04-21T12:05:00.000Z',
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'blocked',
        sessionId: 'session-1',
        messageId: 'message-task-cancelled',
        taskId: 'task-cancelled',
        terminalLogRef: 'ship-logs/ws-1/pr-task-cancelled.log',
        pullRequestUrl: 'https://github.com/example/repo/pull/42',
      },
    })

    const expected = [
      cancelledRecord,
      failedRecord,
      completedRecord,
      blockedRecord,
      runningRecord,
      queuedRecord,
    ]

    expect(service.replaceRecords('ws-1', expected)).toEqual(expected)

    const stateFilePath = path.join(stateDir, 'task-ledger', 'ws-1.json')
    const rawState = JSON.parse(readFileSync(stateFilePath, 'utf-8')) as { version: number; records: TaskLedgerRecord[] }
    expect(rawState.version).toBe(1)
    expect(rawState.records).toEqual(expected)

    const rehydratedService = new TaskLedgerService({ stateDir })
    expect(rehydratedService.listRecords('ws-1')).toEqual(expected)
    expect(rehydratedService.getRecord('ws-1', 'task-failed')).toEqual(failedRecord)
  })

  it('keeps persisted ledgers workspace-scoped and rejects cross-workspace writes', () => {
    const stateDir = makeTempDir('task-ledger-state-')
    const service = new TaskLedgerService({ stateDir })

    const workspaceOneRecord = makeTaskRecord('ws-1', 'session-1', 'task-one', 'running', 'Workspace one running task', {
      updatedAt: '2026-04-21T13:00:00.000Z',
    })
    const workspaceTwoRecord = makeTaskRecord('ws-2', 'session-2', 'task-two', 'completed', 'Workspace two completed task', {
      updatedAt: '2026-04-21T13:01:00.000Z',
      completedAt: '2026-04-21T13:01:00.000Z',
    })

    service.upsertRecord(workspaceOneRecord)
    service.upsertRecord(workspaceTwoRecord)

    expect(service.listRecords('ws-1')).toEqual([workspaceOneRecord])
    expect(service.listRecords('ws-2')).toEqual([workspaceTwoRecord])

    expect(() => service.replaceRecords('ws-1', [workspaceTwoRecord])).toThrow('workspace mismatch')

    const workspaceOneFile = path.join(stateDir, 'task-ledger', 'ws-1.json')
    mkdirSync(path.dirname(workspaceOneFile), { recursive: true })
    writeFileSync(workspaceOneFile, JSON.stringify({
      version: 1,
      records: [workspaceOneRecord, workspaceTwoRecord],
    }, null, 2), 'utf-8')

    const rehydratedService = new TaskLedgerService({ stateDir })
    expect(rehydratedService.listRecords('ws-1')).toEqual([workspaceOneRecord])
    expect(rehydratedService.listRecords('ws-2')).toEqual([workspaceTwoRecord])
  })

  it('preserves distinct lane-attributed records when task identifiers overlap across alternative attempts', () => {
    const stateDir = makeTempDir('task-ledger-lanes-')
    const service = new TaskLedgerService({ stateDir })

    const branchRecord = makeTaskRecord('ws-lane', 'session-a', 'task-shared', 'completed', 'Branch lane summary', {
      sourceMessageId: 'message-a',
      laneId: 'branch:feature/lane-a',
      laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      resultAnnotation: {
        sourceMessageId: 'message-a',
        workspaceId: 'ws-lane',
        sessionId: 'session-a',
        taskId: 'task-shared',
        verification: 'verified',
        summary: 'Branch lane summary',
        laneId: 'branch:feature/lane-a',
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      },
    })
    const worktreeRecord = makeTaskRecord('ws-lane', 'session-b', 'task-shared', 'running', 'Worktree lane summary', {
      sourceMessageId: 'message-b',
      laneId: 'lane-worktree-b',
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      resultAnnotation: {
        sourceMessageId: 'message-b',
        workspaceId: 'ws-lane',
        sessionId: 'session-b',
        taskId: 'task-shared',
        verification: 'unverified',
        summary: 'Worktree lane summary',
        laneId: 'lane-worktree-b',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      },
    })

    service.upsertRecord(branchRecord)
    service.upsertRecord(worktreeRecord)

    expect(service.listRecords('ws-lane')).toEqual([worktreeRecord, branchRecord])
    expect(service.getRecord('ws-lane', 'task-shared', {
      sessionId: 'session-a',
      sourceMessageId: 'message-a',
      laneId: 'branch:feature/lane-a',
    })).toEqual(branchRecord)
    expect(service.getRecord('ws-lane', 'task-shared', {
      sessionId: 'session-b',
      sourceMessageId: 'message-b',
      laneId: 'lane-worktree-b',
    })).toEqual(worktreeRecord)

    const rehydratedService = new TaskLedgerService({ stateDir })
    expect(rehydratedService.listRecords('ws-lane')).toEqual([worktreeRecord, branchRecord])
  })
})

function makeTaskRecord(
  workspaceId: string,
  sessionId: string,
  taskId: string,
  state: TaskEntryState,
  summary: string,
  overrides: Partial<TaskLedgerRecord> = {},
): TaskLedgerRecord {
  return {
    taskId,
    workspaceId,
    sessionId,
    sourceMessageId: overrides.sourceMessageId ?? `message-${taskId}`,
    title: overrides.title ?? `Task ${taskId}`,
    summary,
    state,
    createdAt: overrides.createdAt ?? '2026-04-21T11:59:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T11:59:30.000Z',
    ...(overrides.laneId ? { laneId: overrides.laneId } : {}),
    ...(overrides.laneContext ? { laneContext: overrides.laneContext } : {}),
    ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
    ...(overrides.resultAnnotation ? { resultAnnotation: overrides.resultAnnotation } : {}),
    ...(overrides.recentVerificationRef ? { recentVerificationRef: overrides.recentVerificationRef } : {}),
    ...(overrides.recentBrowserEvidenceRef ? { recentBrowserEvidenceRef: overrides.recentBrowserEvidenceRef } : {}),
    ...(overrides.recentShipRef ? { recentShipRef: overrides.recentShipRef } : {}),
  }
}

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
