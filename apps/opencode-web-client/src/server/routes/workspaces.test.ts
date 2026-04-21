import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { VerificationRun, WorkspaceCapabilityProbe, WorkspaceGitStatusResult, WorkspaceProfile } from '../../shared/types.js'
import { WorkspacesRoute } from './workspaces.js'

describe('WorkspacesRoute capability probes', () => {
  it('returns capability probes from both bootstrap and dedicated workspace routes', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'workspaces-route-'))
    const workspace: WorkspaceProfile = {
      id: 'ws-test',
      name: 'Test workspace',
      rootPath: workspaceRoot,
      addedAt: '2026-04-21T00:00:00.000Z',
    }
    const capabilities = makeCapabilityProbe(workspace.id)
    const gitStatus = makeGitStatus(workspace.id)
    const verificationRuns: VerificationRun[] = [makeVerificationRun(workspace.id)]

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
        workspaceShipService: {
          getStatus: async () => gitStatus,
        } as any,
        verificationService: {
          getWorkspaceSummary: () => ({
            runs: verificationRuns,
            traceability: { taskEntries: [], resultAnnotations: [] },
          }),
        } as any,
      })

      const bootstrapResponse = await route.request(`http://localhost/${workspace.id}/bootstrap`)
      const bootstrapPayload = await bootstrapResponse.json()
      expect(bootstrapPayload.ok).toBe(true)
      expect(bootstrapPayload.data.capabilities).toEqual(capabilities)
      expect(bootstrapPayload.data.git).toEqual(gitStatus)
      expect(bootstrapPayload.data.verificationRuns).toEqual(verificationRuns)

      const capabilityResponse = await route.request(`http://localhost/${workspace.id}/capabilities`)
      const capabilityPayload = await capabilityResponse.json()
      expect(capabilityPayload.ok).toBe(true)
      expect(capabilityPayload.data).toEqual(capabilities)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
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
    },
    issues: [],
  }
}
