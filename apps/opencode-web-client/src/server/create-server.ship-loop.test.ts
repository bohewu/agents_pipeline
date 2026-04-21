import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { createApp } from './create-server.js'
import { WorkspaceShipService } from './services/workspace-ship-service.js'
import type { OpenCodeExecutionResult } from './services/opencode-client-factory.js'
import type { WorkspaceProfile } from '../shared/types.js'

const execFileAsync = promisify(execFile)

describe('createApp Phase C local ship loop', () => {
  it('completes status, commit preview, commit, and push through workspace git routes with disposable git fixtures', async () => {
    const fixture = await createShipFixture()
    const workspace: WorkspaceProfile = {
      id: 'ws-ship-loop',
      name: 'Ship loop fixture',
      rootPath: fixture.workspaceRoot,
      addedAt: '2026-04-21T00:00:00.000Z',
    }

    const clientFactory = {
      forWorkspace: () => ({
        shell: async (_sessionId: string, command: string, options?: { agentId?: string }) => {
          expect(options?.agentId).toBe('build')
          return runWorkspaceShell(fixture.workspaceRoot, command)
        },
        listMessages: async () => [],
      }),
    } as any

    const workspaceShipService = new WorkspaceShipService(clientFactory)
    const app = createApp({
      host: '127.0.0.1',
      port: 3456,
      appPaths: {
        configDir: '/tmp/config',
        dataDir: '/tmp/data',
        stateDir: '/tmp/state',
        cacheDir: '/tmp/cache',
        logDir: '/tmp/logs',
        workspaceRegistryFile: '/tmp/workspaces.json',
        installManifestFile: '/tmp/install-manifest.json',
        clientStaticDir: '/tmp/client',
        serverBundleDir: '/tmp/server',
        toolsDir: '/tmp/tools',
      },
    }, {
      registry: {
        list: () => [workspace],
        get: (workspaceId: string) => workspaceId === workspace.id ? workspace : undefined,
        getActive: () => workspace,
        setActive: () => workspace,
      } as any,
      serverManager: {
        get: () => undefined,
        getAll: () => [],
        toJSON: (value: unknown) => value,
      } as any,
      clientFactory,
      sessionService: {} as any,
      effortService: {
        getEffortSummary: () => ({ sessionOverrides: {} }),
      } as any,
      usageService: {} as any,
      configService: {
        getConfig: async () => ({
          providers: [],
          models: [],
          agents: [],
          commands: [],
          connectedProviderIds: [],
        }),
      } as any,
      diffService: {} as any,
      fileService: {} as any,
      permissionRegistry: {} as any,
      eventBroker: { broadcast: () => {} } as any,
      capabilityProbeService: {
        probeWorkspace: async () => ({
          workspaceId: workspace.id,
          checkedAt: '2026-04-21T00:00:00.000Z',
          localGit: { status: 'available', summary: 'Local git available' },
          ghCli: { status: 'unavailable', summary: 'GitHub CLI unavailable' },
          ghAuth: { status: 'unavailable', summary: 'GitHub auth unavailable' },
          previewTarget: { status: 'unavailable', summary: 'Preview target unavailable' },
          browserEvidence: { status: 'unavailable', summary: 'Browser evidence unavailable' },
        }),
      } as any,
      workspaceShipService,
      verificationService: {
        listRuns: () => [],
        runPreset: async () => {
          throw new Error('not used in ship loop test')
        },
        decorateMessages: (_workspaceId: string, _sessionId: string, messages: unknown[]) => messages,
        getWorkspaceSummary: () => ({
          runs: [],
          traceability: { taskEntries: [], resultAnnotations: [] },
        }),
      } as any,
    })

    try {
      const statusResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/status`)
      const statusPayload = await statusResponse.json()

      expect(statusPayload.ok).toBe(true)
      expect(statusPayload.data).toEqual(expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          workspaceId: workspace.id,
          branch: expect.objectContaining({ name: 'main', detached: false }),
          upstream: expect.objectContaining({
            status: 'tracked',
            ref: 'origin/main',
            ahead: 0,
            behind: 0,
          }),
          changeSummary: expect.objectContaining({
            staged: expect.objectContaining({ count: 1, paths: ['src/index.ts'] }),
            unstaged: expect.objectContaining({ count: 1, paths: ['README.md'] }),
            untracked: expect.objectContaining({ count: 1, paths: ['notes.txt'] }),
            hasChanges: true,
            hasStagedChanges: true,
          }),
          pullRequest: expect.objectContaining({
            outcome: 'degraded',
            supported: false,
          }),
        }),
        issues: [],
      }))

      const previewResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/commit/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const previewPayload = await previewResponse.json()

      expect(previewPayload.ok).toBe(true)
      expect(previewPayload.data).toEqual(expect.objectContaining({
        outcome: 'success',
        draftMessage: 'update index.ts',
        status: expect.objectContaining({
          outcome: 'success',
          data: expect.objectContaining({
            changeSummary: expect.objectContaining({
              hasStagedChanges: true,
            }),
          }),
        }),
      }))

      const commitResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          message: 'feat: local ship loop',
          agentId: 'build',
        }),
      })
      const commitPayload = await commitResponse.json()

      expect(commitPayload.ok).toBe(true)
      expect(commitPayload.data).toEqual(expect.objectContaining({
        outcome: 'success',
        commit: expect.objectContaining({
          sha: expect.any(String),
          message: 'feat: local ship loop',
        }),
        status: expect.objectContaining({
          outcome: 'success',
          data: expect.objectContaining({
            upstream: expect.objectContaining({
              ref: 'origin/main',
              ahead: 1,
              behind: 0,
            }),
            changeSummary: expect.objectContaining({
              staged: expect.objectContaining({ count: 0 }),
              hasChanges: true,
              hasStagedChanges: false,
            }),
          }),
        }),
      }))

      const pushResponse = await app.request(`http://localhost/api/workspaces/${workspace.id}/git/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-1', agentId: 'build' }),
      })
      const pushPayload = await pushResponse.json()

      expect(pushPayload.ok).toBe(true)
      expect(pushPayload.data).toEqual(expect.objectContaining({
        outcome: 'success',
        upstream: expect.objectContaining({
          ref: 'origin/main',
          ahead: 0,
          behind: 0,
        }),
        status: expect.objectContaining({
          outcome: 'success',
          data: expect.objectContaining({
            upstream: expect.objectContaining({
              ref: 'origin/main',
              ahead: 0,
              behind: 0,
            }),
            changeSummary: expect.objectContaining({
              hasChanges: true,
              hasStagedChanges: false,
            }),
          }),
        }),
        issues: [],
      }))

      const remoteHead = (await runCommand('git', ['--git-dir', fixture.remoteRoot, 'rev-parse', 'refs/heads/main'])).stdout.trim()
      expect(remoteHead).toBe(commitPayload.data.commit.sha)
    } finally {
      fixture.cleanup()
    }
  })
})

async function createShipFixture(): Promise<{
  root: string
  workspaceRoot: string
  remoteRoot: string
  cleanup: () => void
}> {
  const root = mkdtempSync(path.join(tmpdir(), 'phase-c-ship-loop-'))
  const workspaceRoot = path.join(root, 'workspace')
  const remoteRoot = path.join(root, 'remote')

  mkdirSync(workspaceRoot, { recursive: true })
  mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true })

  await runCommand('git', ['init', '--bare', remoteRoot])
  await runCommand('git', ['init', '--initial-branch=main'], { cwd: workspaceRoot })
  await runCommand('git', ['config', 'user.name', 'Phase C Test'], { cwd: workspaceRoot })
  await runCommand('git', ['config', 'user.email', 'phase-c@example.com'], { cwd: workspaceRoot })

  writeFileSync(path.join(workspaceRoot, 'src/index.ts'), 'export const version = 1\n')
  writeFileSync(path.join(workspaceRoot, 'README.md'), '# Ship loop\n')

  await runCommand('git', ['add', '.'], { cwd: workspaceRoot })
  await runCommand('git', ['commit', '--message', 'chore: seed ship fixture'], { cwd: workspaceRoot })
  await runCommand('git', ['remote', 'add', 'origin', remoteRoot], { cwd: workspaceRoot })
  await runCommand('git', ['push', '--set-upstream', 'origin', 'main'], { cwd: workspaceRoot })

  writeFileSync(path.join(workspaceRoot, 'src/index.ts'), 'export const version = 2\n')
  await runCommand('git', ['add', 'src/index.ts'], { cwd: workspaceRoot })
  writeFileSync(path.join(workspaceRoot, 'README.md'), '# Ship loop\n\nUpdated README\n')
  writeFileSync(path.join(workspaceRoot, 'notes.txt'), 'ship checklist\n')

  return {
    root,
    workspaceRoot,
    remoteRoot,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function runWorkspaceShell(workspaceRoot: string, command: string): Promise<OpenCodeExecutionResult> {
  try {
    const result = await runCommand('/bin/sh', ['-lc', command], { cwd: workspaceRoot })
    return {
      raw: { command, ...result },
      status: 'completed',
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      summary: result.stdout.trim() || 'Command completed successfully.',
    }
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code
    return {
      raw: error,
      status: 'failed',
      exitCode: typeof errorCode === 'number' ? errorCode : 1,
      stdout: toText((error as { stdout?: unknown }).stdout),
      stderr: toText((error as { stderr?: unknown }).stderr),
      summary: error instanceof Error ? error.message : 'Command failed.',
    }
  }
}

async function runCommand(
  file: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: options?.cwd,
    encoding: 'utf-8',
  })
  return {
    stdout: toText(stdout),
    stderr: toText(stderr),
  }
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}
