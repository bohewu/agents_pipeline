import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { NormalizedMessage } from '../../shared/types.js'
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
