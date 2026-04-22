import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { TaskLedgerRecord, VerificationRun, WorkspaceCapabilityProbe, WorkspaceGitStatusResult, WorkspaceProfile } from '../../shared/types.js'
import { WorkspacesRoute } from './workspaces.js'
import { EventBroker } from '../services/event-broker.js'
import { TaskLedgerService } from '../services/task-ledger-service.js'
import { VerificationService } from '../services/verification-service.js'

describe('WorkspacesRoute capability probes', () => {
  it('returns capability probes from both bootstrap and dedicated workspace routes', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'workspaces-route-'))
    const stateDir = mkdtempSync(path.join(tmpdir(), 'workspaces-route-state-'))
    const workspace: WorkspaceProfile = {
      id: 'ws-test',
      name: 'Test workspace',
      rootPath: workspaceRoot,
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const capabilities = makeCapabilityProbe(workspace.id)
    const gitStatus = makeGitStatus(workspace.id)
    const verificationRuns: VerificationRun[] = [makeVerificationRun(workspace.id)]
    const taskLedgerService = new TaskLedgerService({ stateDir })
    const workspaceTaskRecord = makeTaskLedgerRecord(workspace.id, 'session-1', 'task-1', 'running', {
      recentVerificationRef: {
        runId: 'verify-run-1',
        commandKind: 'lint',
        status: 'passed',
        summary: 'Lint clean.',
        terminalLogRef: 'verification-logs/ws-test/verify-run-1.log',
      },
    })
    taskLedgerService.replaceRecords(workspace.id, [workspaceTaskRecord])
    taskLedgerService.replaceRecords('ws-other', [makeTaskLedgerRecord('ws-other', 'session-2', 'task-2', 'completed', {
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId: 'session-2',
        taskId: 'task-2',
        pullRequestUrl: 'https://github.com/example/repo/pull/42',
      },
    })])

    try {
      const route = WorkspacesRoute({
        registry: {
          list: () => [workspace],
          get: (workspaceId: string) => workspaceId === workspace.id ? workspace : undefined,
          getActive: () => workspace,
          setActive: () => workspace,
        } as any,
        serverManager: {
          get: () => runtime,
          start: async () => runtime,
          waitUntilReady: async () => runtime,
          toJSON: () => runtime,
          getAll: () => [runtime],
          stop: async () => {},
          restart: async () => runtime,
        } as any,
        clientFactory: {
          forWorkspace: () => ({
            health: async () => ({ ok: true, version: '1.2.3' }),
            listSessions: async () => [],
          }),
        } as any,
        configService: {
          getConfig: async () => ({
            providers: [],
            models: [],
            agents: [],
            commands: [],
            connectedProviderIds: [],
          }),
        } as any,
        effortService: {
          getEffortSummary: () => ({ sessionOverrides: {} }),
        } as any,
        capabilityProbeService: {
          probeWorkspace: async () => capabilities,
        } as any,
        contextCatalogService: {
          getContextCatalog: async () => ({
            workspaceId: workspace.id,
            collectedAt: '2026-04-22T00:00:00.000Z',
            instructionSources: [],
            capabilityEntries: [],
          }),
        } as any,
        workspaceShipService: {
          getStatus: async () => gitStatus,
        } as any,
        verificationService: {
          getWorkspaceSummary: () => ({
            runs: verificationRuns,
            traceability: { taskEntries: [], resultAnnotations: [] },
          }),
        } as any,
        taskLedgerService,
      })

      const bootstrapResponse = await route.request(`http://localhost/${workspace.id}/bootstrap`)
      const bootstrapPayload = await bootstrapResponse.json()
      expect(bootstrapPayload.ok).toBe(true)
      expect(bootstrapPayload.data.capabilities).toEqual(capabilities)
      expect(bootstrapPayload.data.git).toEqual(gitStatus)
      expect(bootstrapPayload.data.verificationRuns).toEqual(verificationRuns)
      expect(bootstrapPayload.data.taskLedgerRecords).toEqual([workspaceTaskRecord])

      const capabilityResponse = await route.request(`http://localhost/${workspace.id}/capabilities`)
      const capabilityPayload = await capabilityResponse.json()
      expect(capabilityPayload.ok).toBe(true)
      expect(capabilityPayload.data).toEqual(capabilities)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it('rehydrates persisted runtime task ledger records through select and bootstrap for the same workspace only', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'workspaces-route-runtime-'))
    const stateDir = mkdtempSync(path.join(tmpdir(), 'workspaces-route-runtime-state-'))
    writeFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9', 'utf-8')

    const workspace: WorkspaceProfile = {
      id: 'ws-runtime',
      name: 'Runtime workspace',
      rootPath: workspaceRoot,
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const capabilities = makeCapabilityProbe(workspace.id)
    const gitStatus = makeGitStatus(workspace.id)
    const taskLedgerWriter = new TaskLedgerService({ stateDir })
    taskLedgerWriter.upsertRecord({
      taskId: 'task-runtime',
      workspaceId: workspace.id,
      sessionId: 'session-runtime',
      sourceMessageId: 'message-runtime',
      title: 'Runtime task',
      summary: 'Awaiting verification.',
      state: 'blocked',
      createdAt: '2026-04-21T12:00:00.000Z',
      updatedAt: '2026-04-21T12:00:00.000Z',
      resultAnnotation: {
        sourceMessageId: 'message-runtime',
        workspaceId: workspace.id,
        sessionId: 'session-runtime',
        taskId: 'task-runtime',
        verification: 'unverified',
        summary: 'Awaiting verification.',
        shipState: 'pr-ready',
      },
      recentShipRef: {
        action: 'pullRequest',
        outcome: 'success',
        sessionId: 'session-runtime',
        messageId: 'message-runtime',
        taskId: 'task-runtime',
        terminalLogRef: 'ship-logs/ws-runtime/pr-task-runtime.log',
        pullRequestUrl: 'https://github.com/example/repo/pull/73',
      },
    })

    const broker = new EventBroker({ get: () => undefined } as any, {
      taskLedgerService: taskLedgerWriter,
      now: sequenceClock('2026-04-21T12:00:30.000Z', '2026-04-21T12:00:31.000Z'),
    })
    const verificationWriter = new VerificationService(
      { stateDir },
      {
        forWorkspace: () => ({
          shell: async () => ({
            status: 'completed',
            exitCode: 0,
            summary: 'Tests passed for runtime task.',
            stdout: 'ok',
          }),
        }) as any,
      },
      undefined,
      {
        now: sequenceClock(
          '2026-04-21T12:01:00.000Z',
          '2026-04-21T12:01:01.000Z',
          '2026-04-21T12:01:02.000Z',
        ),
        randomId: sequenceIds('runtime-verify'),
        taskLedgerService: taskLedgerWriter,
      },
    )

    try {
      ;(broker as any).handleUpstreamEvent(workspace.id, 'message.updated', JSON.stringify({
        payload: {
          properties: {
            sessionID: 'session-runtime',
            info: {
              id: 'message-runtime',
              role: 'assistant',
              time: { created: '2026-04-21T12:00:00.000Z' },
              task: {
                id: 'task-runtime',
                state: 'blocked',
                title: 'Runtime task',
                summary: 'Waiting on ship review.',
              },
              resultAnnotation: {
                sourceMessageId: 'message-runtime',
                workspaceId: workspace.id,
                sessionId: 'session-runtime',
                taskId: 'task-runtime',
                verification: 'partially verified',
                summary: 'Waiting on ship review.',
                shipState: 'pr-ready',
              },
            },
          },
        },
      }))
      ;(broker as any).handleUpstreamEvent('ws-other', 'message.updated', JSON.stringify({
        payload: {
          properties: {
            sessionID: 'session-other',
            info: {
              id: 'message-other',
              role: 'assistant',
              time: { created: '2026-04-21T12:00:00.000Z' },
              task: {
                id: 'task-other',
                state: 'running',
                title: 'Workspace two task',
                summary: 'Workspace two running task.',
              },
            },
          },
        },
      }))

      await verificationWriter.runPreset({
        workspaceId: workspace.id,
        workspaceRoot,
        sessionId: 'session-runtime',
        commandKind: 'test',
        sourceMessageId: 'message-runtime',
        taskId: 'task-runtime',
      })

      const rehydratedTaskLedgerService = new TaskLedgerService({ stateDir })
      const rehydratedVerificationService = new VerificationService(
        { stateDir },
        { forWorkspace: () => ({ shell: async () => ({ status: 'completed' }) }) as any },
      )
      const route = WorkspacesRoute({
        registry: {
          list: () => [workspace],
          get: (workspaceId: string) => workspaceId === workspace.id ? workspace : undefined,
          getActive: () => workspace,
          setActive: () => workspace,
        } as any,
        serverManager: {
          get: () => runtime,
          start: async () => runtime,
          waitUntilReady: async () => runtime,
          toJSON: () => runtime,
          getAll: () => [runtime],
          stop: async () => {},
          restart: async () => runtime,
        } as any,
        clientFactory: {
          forWorkspace: () => ({
            health: async () => ({ ok: true, version: '1.2.3' }),
            listSessions: async () => [makeSession('session-runtime')],
          }),
        } as any,
        configService: {
          getConfig: async () => ({
            providers: [],
            models: [],
            agents: [],
            commands: [],
            connectedProviderIds: [],
          }),
        } as any,
        effortService: {
          getEffortSummary: () => ({ sessionOverrides: {} }),
        } as any,
        capabilityProbeService: {
          probeWorkspace: async () => capabilities,
        } as any,
        contextCatalogService: {
          getContextCatalog: async () => ({
            workspaceId: workspace.id,
            collectedAt: '2026-04-22T00:00:00.000Z',
            instructionSources: [],
            capabilityEntries: [],
          }),
        } as any,
        workspaceShipService: {
          getStatus: async () => gitStatus,
        } as any,
        verificationService: rehydratedVerificationService,
        taskLedgerService: rehydratedTaskLedgerService,
      })

      const selectResponse = await route.request(`http://localhost/${workspace.id}/select`, { method: 'POST' })
      const selectPayload = await selectResponse.json()
      expect(selectPayload.ok).toBe(true)
      expect(selectPayload.data.taskLedgerRecords).toEqual([
        expect.objectContaining({
          workspaceId: workspace.id,
          sessionId: 'session-runtime',
          sourceMessageId: 'message-runtime',
          summary: 'Tests passed for runtime task.',
          state: 'completed',
          recentVerificationRef: expect.objectContaining({
            commandKind: 'test',
            status: 'passed',
            summary: 'Tests passed for runtime task.',
          }),
          recentShipRef: expect.objectContaining({
            pullRequestUrl: 'https://github.com/example/repo/pull/73',
          }),
        }),
      ])

      const bootstrapResponse = await route.request(`http://localhost/${workspace.id}/bootstrap`)
      const bootstrapPayload = await bootstrapResponse.json()
      expect(bootstrapPayload.ok).toBe(true)
      expect(bootstrapPayload.data.sessions).toEqual([makeSession('session-runtime')])
      expect(bootstrapPayload.data.taskLedgerRecords).toEqual(selectPayload.data.taskLedgerRecords)
      expect(bootstrapPayload.data.taskLedgerRecords).toHaveLength(1)
      expect(bootstrapPayload.data.taskLedgerRecords[0]).toEqual(expect.objectContaining({
        workspaceId: workspace.id,
        sessionId: 'session-runtime',
        sourceMessageId: 'message-runtime',
        summary: 'Tests passed for runtime task.',
        state: 'completed',
      }))
      expect(bootstrapPayload.data.taskLedgerRecords.some((record: TaskLedgerRecord) => record.workspaceId === 'ws-other')).toBe(false)
      expect(rehydratedTaskLedgerService.listRecords('ws-other')).toEqual([
        expect.objectContaining({
          workspaceId: 'ws-other',
          sessionId: 'session-other',
          summary: 'Workspace two running task.',
          state: 'running',
        }),
      ])
    } finally {
      broker.shutdown()
      rmSync(workspaceRoot, { recursive: true, force: true })
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})

const runtime = {
  workspaceId: 'ws-test',
  pid: 123,
  port: 3456,
  baseUrl: 'http://127.0.0.1:3456',
  password: 'secret',
  username: 'opencode-web',
  startedAt: '2026-04-21T00:00:00.000Z',
  state: 'ready' as const,
}

function makeVerificationRun(workspaceId: string): VerificationRun {
  return {
    id: 'verify-run-1',
    workspaceId,
    sessionId: 'session-1',
    sourceMessageId: 'message-1',
    taskId: 'task-1',
    commandKind: 'lint',
    status: 'passed',
    startedAt: '2026-04-21T00:00:00.000Z',
    finishedAt: '2026-04-21T00:00:05.000Z',
    summary: 'Lint clean.',
    exitCode: 0,
    terminalLogRef: 'verification-logs/ws-test/verify-run-1.log',
  }
}

function makeSession(sessionId: string) {
  return {
    id: sessionId,
    title: 'Runtime session',
    createdAt: '2026-04-21T12:00:00.000Z',
    updatedAt: '2026-04-21T12:01:00.000Z',
    messageCount: 1,
    state: 'idle' as const,
  }
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
    sourceMessageId: overrides.sourceMessageId ?? `message-${taskId}`,
    title: overrides.title ?? `Task ${taskId}`,
    summary: overrides.summary ?? `Summary for ${taskId}`,
    state,
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:01:00.000Z',
    ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
    ...(overrides.resultAnnotation ? { resultAnnotation: overrides.resultAnnotation } : {}),
    ...(overrides.recentVerificationRef ? { recentVerificationRef: overrides.recentVerificationRef } : {}),
    ...(overrides.recentShipRef ? { recentShipRef: overrides.recentShipRef } : {}),
  }
}

function makeCapabilityProbe(workspaceId: string): WorkspaceCapabilityProbe {
  return {
    workspaceId,
    checkedAt: '2026-04-21T00:00:00.000Z',
    localGit: { status: 'available', summary: 'Local git available' },
    ghCli: { status: 'available', summary: 'GitHub CLI available' },
    ghAuth: { status: 'unavailable', summary: 'GitHub auth unavailable', detail: 'Run gh auth login.' },
    previewTarget: { status: 'unavailable', summary: 'Preview target unavailable', detail: 'No preview target detected.' },
    browserEvidence: { status: 'unavailable', summary: 'Browser evidence unavailable', detail: 'No browser runtime detected.' },
  }
}

function makeGitStatus(workspaceId: string): WorkspaceGitStatusResult {
  return {
    outcome: 'success',
    data: {
      workspaceId,
      checkedAt: '2026-04-21T00:00:00.000Z',
      branch: { name: 'main', detached: false },
      upstream: {
        status: 'tracked',
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 1,
        behind: 0,
        remoteProvider: 'github',
        remoteHost: 'github.com',
        remoteUrl: 'git@github.com:example/repo.git',
      },
      changeSummary: {
        staged: { count: 1, paths: ['src/index.ts'], truncated: false },
        unstaged: { count: 2, paths: ['README.md', 'src/app.ts'], truncated: false },
        untracked: { count: 1, paths: ['notes.txt'], truncated: false },
        conflicted: { count: 0, paths: [], truncated: false },
        hasChanges: true,
        hasStagedChanges: true,
      },
      pullRequest: {
        outcome: 'degraded',
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
            source: 'gh',
          },
        ],
      },
      linkedPullRequest: {
        outcome: 'degraded',
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
            source: 'gh',
          },
        ],
      },
    },
    issues: [],
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
