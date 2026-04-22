import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { NormalizedMessage } from '../../shared/types.js'
import { TaskLedgerService } from './task-ledger-service.js'
import { VerificationService } from './verification-service.js'

describe('VerificationService', () => {
  it('persists successful runs, emits verification events, and writes terminal log snapshots', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'verify-state-'))
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'verify-workspace-'))
    writeFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9', 'utf-8')

    const shell = vi.fn(async () => ({
      status: 'completed',
      exitCode: 0,
      summary: 'Lint clean.',
      stdout: 'All files pass lint.',
      taskId: 'task-upstream',
    }))
    const broadcast = vi.fn()
    const service = new VerificationService(
      { stateDir },
      { forWorkspace: () => ({ shell }) as any },
      { broadcast },
      {
        now: sequenceClock('2026-04-21T10:00:00.000Z', '2026-04-21T10:00:02.000Z', '2026-04-21T10:00:02.500Z', '2026-04-21T10:00:03.000Z'),
        randomId: sequenceIds('run-1', 'task-1'),
      },
    )

    try {
      const run = await service.runPreset({
        workspaceId: 'ws-1',
        workspaceRoot,
        sessionId: 'session-1',
        commandKind: 'lint',
        sourceMessageId: 'message-1',
        taskId: 'task-1',
      })

      expect(shell).toHaveBeenCalledWith('session-1', 'pnpm run lint')
      expect(run).toMatchObject({
        workspaceId: 'ws-1',
        sessionId: 'session-1',
        sourceMessageId: 'message-1',
        taskId: 'task-1',
        commandKind: 'lint',
        status: 'passed',
        exitCode: 0,
        summary: 'Lint clean.',
      })
      expect(run.terminalLogRef).toBeTruthy()
      expect(service.listRuns('ws-1')).toEqual([run])
      expect(broadcast).toHaveBeenCalledTimes(2)

      const logPath = path.join(stateDir, run.terminalLogRef!)
      const logContents = readText(logPath)
      expect(logContents).toContain('commandKind: lint')
      expect(logContents).toContain('stdout:')
      expect(logContents).toContain('All files pass lint.')
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('aggregates mixed verification outcomes into a partially verified result annotation', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'verify-state-'))
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'verify-workspace-'))
    writeFileSync(path.join(workspaceRoot, 'package-lock.json'), '{}', 'utf-8')

    const shell = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', exitCode: 0, summary: 'Lint clean.' })
      .mockResolvedValueOnce({ status: 'failed', exitCode: 1, stderr: 'Tests failed.' })
    const service = new VerificationService(
      { stateDir },
      { forWorkspace: () => ({ shell }) as any },
      undefined,
      {
        now: sequenceClock(
          '2026-04-21T11:00:00.000Z',
          '2026-04-21T11:00:01.000Z',
          '2026-04-21T11:00:02.000Z',
          '2026-04-21T11:01:00.000Z',
          '2026-04-21T11:01:01.000Z',
          '2026-04-21T11:01:02.000Z',
        ),
        randomId: sequenceIds('task-1', 'run-1', 'task-2', 'run-2'),
      },
    )

    try {
      const lintRun = await service.runPreset({
        workspaceId: 'ws-2',
        workspaceRoot,
        sessionId: 'session-2',
        commandKind: 'lint',
        sourceMessageId: 'message-2',
        taskId: 'task-shared',
      })
      const testRun = await service.runPreset({
        workspaceId: 'ws-2',
        workspaceRoot,
        sessionId: 'session-2',
        commandKind: 'test',
        sourceMessageId: 'message-2',
        taskId: 'task-shared',
      })

      expect(lintRun.status).toBe('passed')
      expect(testRun.status).toBe('failed')

      const workspaceSummary = service.getWorkspaceSummary('ws-2')
      expect(workspaceSummary.runs).toHaveLength(2)
      expect(workspaceSummary.traceability.resultAnnotations).toEqual([
        expect.objectContaining({
          sourceMessageId: 'message-2',
          taskId: 'task-shared',
          verification: 'partially verified',
          summary: 'lint passed · test failed (exit 1)',
        }),
      ])

      const decorated = service.decorateMessages('ws-2', 'session-2', [makeAssistantMessage('message-2')])
      expect(decorated[0]?.resultAnnotation).toEqual(expect.objectContaining({
        verification: 'partially verified',
        summary: 'lint passed · test failed (exit 1)',
      }))
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('writes runtime task ledger updates with recent verification refs while preserving existing ship refs', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'verify-ledger-state-'))
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'verify-ledger-workspace-'))
    writeFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9', 'utf-8')

    const taskLedgerService = new TaskLedgerService({ stateDir })
    taskLedgerService.upsertRecord({
      taskId: 'task-1',
      workspaceId: 'ws-3',
      sessionId: 'session-3',
      sourceMessageId: 'message-3',
      title: 'Task task-1',
      summary: 'Awaiting verification.',
      state: 'running',
      createdAt: '2026-04-21T12:00:00.000Z',
      updatedAt: '2026-04-21T12:00:00.000Z',
      resultAnnotation: {
        sourceMessageId: 'message-3',
        workspaceId: 'ws-3',
        sessionId: 'session-3',
        taskId: 'task-1',
        verification: 'unverified',
        summary: 'Awaiting verification.',
        shipState: 'pr-ready',
      },
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId: 'session-3',
        messageId: 'message-3',
        taskId: 'task-1',
        terminalLogRef: 'ship-logs/ws-3/pr-task-1.log',
        pullRequestUrl: 'https://github.com/example/repo/pull/73',
      },
    })

    const shell = vi.fn(async () => ({
      status: 'completed',
      exitCode: 0,
      summary: 'Lint clean.',
      stdout: 'All files pass lint.',
    }))
    const service = new VerificationService(
      { stateDir },
      { forWorkspace: () => ({ shell }) as any },
      undefined,
      {
        now: sequenceClock(
          '2026-04-21T12:01:00.000Z',
          '2026-04-21T12:01:01.000Z',
          '2026-04-21T12:01:02.000Z',
        ),
        randomId: sequenceIds('run-3'),
        taskLedgerService,
      },
    )

    try {
      const run = await service.runPreset({
        workspaceId: 'ws-3',
        workspaceRoot,
        sessionId: 'session-3',
        commandKind: 'lint',
        sourceMessageId: 'message-3',
        taskId: 'task-1',
      })

      const record = taskLedgerService.getRecord('ws-3', 'task-1')
      expect(record).toEqual(expect.objectContaining({
        workspaceId: 'ws-3',
        sessionId: 'session-3',
        sourceMessageId: 'message-3',
        summary: 'Lint clean.',
        state: 'completed',
        resultAnnotation: expect.objectContaining({
          sourceMessageId: 'message-3',
          taskId: 'task-1',
          verification: 'verified',
          summary: 'Lint clean.',
          shipState: 'pr-ready',
        }),
        recentVerificationRef: expect.objectContaining({
          runId: run.id,
          commandKind: 'lint',
          status: 'passed',
          summary: 'Lint clean.',
          terminalLogRef: run.terminalLogRef,
        }),
        recentShipRef: expect.objectContaining({
          action: 'pullRequest',
          outcome: 'success',
          sessionId: 'session-3',
          taskId: 'task-1',
          pullRequestUrl: 'https://github.com/example/repo/pull/73',
        }),
      }))
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('persists bounded browser evidence metadata separately from command verification logs and projects it by traceability', () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'verify-browser-state-'))
    const taskLedgerService = new TaskLedgerService({ stateDir })
    const service = new VerificationService(
      { stateDir },
      { forWorkspace: () => ({ shell: vi.fn() }) as any },
      undefined,
      {
        now: () => new Date('2026-04-22T14:00:00.000Z'),
        randomId: sequenceIds('browser-1'),
        taskLedgerService,
      },
    )

    try {
      const captureResult = {
        workspaceId: 'ws-browser',
        outcome: 'captured' as const,
        previewUrl: 'http://127.0.0.1:4173/',
        consoleCapture: {
          capturedAt: '2026-04-22T14:00:00.000Z',
          entryCount: 2,
          errorCount: 0,
          warningCount: 1,
          exceptionCount: 0,
          levels: ['log', 'warning'],
        },
        screenshot: {
          artifactRef: 'preview-runtime-artifacts/ws-browser/browser-1.png',
          mimeType: 'image/png' as const,
          bytes: 2048,
          width: 1280,
          height: 800,
          capturedAt: '2026-04-22T14:00:00.000Z',
        },
        issues: [],
      }

      const record = service.recordBrowserEvidence({
        workspaceId: 'ws-browser',
        sessionId: 'session-browser',
        sourceMessageId: 'message-browser',
        taskId: 'task-browser',
        captureResult,
      })

      expect(service.listRuns('ws-browser')).toEqual([])
      expect(service.listBrowserEvidence('ws-browser')).toEqual([record])

      const workspaceSummary = service.getWorkspaceSummary('ws-browser')
      expect(workspaceSummary.browserEvidenceRecords).toEqual([record])
      expect(workspaceSummary.traceability.resultAnnotations).toEqual([
        expect.objectContaining({
          sourceMessageId: 'message-browser',
          workspaceId: 'ws-browser',
          sessionId: 'session-browser',
          taskId: 'task-browser',
          verification: 'unverified',
          browserEvidenceRef: expect.objectContaining({
            recordId: record.id,
            previewUrl: 'http://127.0.0.1:4173/',
            screenshot: expect.objectContaining({
              artifactRef: 'preview-runtime-artifacts/ws-browser/browser-1.png',
            }),
          }),
        }),
      ])

      const decorated = service.decorateMessages('ws-browser', 'session-browser', [{
        id: 'message-browser',
        role: 'assistant',
        createdAt: '2026-04-22T14:00:00.000Z',
        parts: [{ type: 'text', text: 'Preview checked.' }],
      }])
      expect(decorated[0]?.resultAnnotation).toEqual(expect.objectContaining({
        verification: 'unverified',
        browserEvidenceRef: expect.objectContaining({
          recordId: record.id,
          previewUrl: 'http://127.0.0.1:4173/',
          consoleCapture: expect.objectContaining({
            entryCount: 2,
            warningCount: 1,
          }),
        }),
      }))

      const ledgerRecord = taskLedgerService.getRecord('ws-browser', 'task-browser')
      expect(ledgerRecord).toEqual(expect.objectContaining({
        workspaceId: 'ws-browser',
        sessionId: 'session-browser',
        sourceMessageId: 'message-browser',
        state: 'completed',
        recentBrowserEvidenceRef: expect.objectContaining({
          recordId: record.id,
          previewUrl: 'http://127.0.0.1:4173/',
        }),
      }))
      expect(ledgerRecord?.recentVerificationRef).toBeUndefined()

      const rawState = JSON.parse(readText(path.join(stateDir, 'verification', 'ws-browser.json'))) as {
        version: number
        runs: unknown[]
        browserEvidenceRecords: Array<Record<string, unknown>>
      }
      expect(rawState.version).toBe(1)
      expect(rawState.runs).toEqual([])
      expect(rawState.browserEvidenceRecords).toEqual([
        expect.objectContaining({
          id: record.id,
          workspaceId: 'ws-browser',
          sessionId: 'session-browser',
          sourceMessageId: 'message-browser',
          taskId: 'task-browser',
          previewUrl: 'http://127.0.0.1:4173/',
          consoleCapture: expect.objectContaining({
            entryCount: 2,
            levels: ['log', 'warning'],
          }),
          screenshot: expect.objectContaining({
            artifactRef: 'preview-runtime-artifacts/ws-browser/browser-1.png',
          }),
        }),
      ])
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})

function makeAssistantMessage(messageId: string): NormalizedMessage {
  return {
    id: messageId,
    role: 'assistant',
    createdAt: '2026-04-21T00:00:00.000Z',
    parts: [{ type: 'text', text: 'Implementation complete.' }],
    trace: {
      sourceMessageId: messageId,
      workspaceId: 'ws-2',
      sessionId: 'session-2',
      taskId: 'task-shared',
    },
  }
}

function sequenceClock(...values: string[]): () => Date {
  const queue = [...values]
  return () => new Date(queue.shift() ?? values[values.length - 1]!)
}

function sequenceIds(...values: string[]): () => string {
  const queue = [...values]
  return () => queue.shift() ?? values[values.length - 1]!
}

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}
