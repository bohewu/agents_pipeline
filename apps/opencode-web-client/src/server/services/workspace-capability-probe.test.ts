import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceCapabilityProbeService } from './workspace-capability-probe.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('WorkspaceCapabilityProbeService', () => {
  it('marks missing workspace capabilities as unavailable', async () => {
    const workspaceRoot = makeTempWorkspace()
    const service = new WorkspaceCapabilityProbeService({
      execFile: createExecStub({
        'git rev-parse --is-inside-work-tree': () => {
          throw execError('fatal: not a git repository', {
            code: 128,
            stderr: 'fatal: not a git repository (or any of the parent directories): .git',
          })
        },
        'gh --version': () => ({ stdout: 'gh version 2.60.1\n', stderr: '' }),
        'gh auth status --hostname github.com': () => {
          throw execError('not logged in', {
            code: 1,
            stderr: 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.',
          })
        },
      }),
      now: () => new Date('2026-04-21T00:00:00.000Z'),
    })

    const probe = await service.probeWorkspace('ws-missing', workspaceRoot)

    expect(probe.checkedAt).toBe('2026-04-21T00:00:00.000Z')
    expect(probe.localGit.status).toBe('unavailable')
    expect(probe.ghCli.status).toBe('available')
    expect(probe.ghAuth.status).toBe('unavailable')
    expect(probe.previewTarget.status).toBe('unavailable')
    expect(probe.browserEvidence.status).toBe('unavailable')
  })

  it('marks gh capabilities unavailable when the gh CLI is missing', async () => {
    const workspaceRoot = makeTempWorkspace({
      'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
    })
    const service = new WorkspaceCapabilityProbeService({
      execFile: createExecStub({
        'git rev-parse --is-inside-work-tree': () => ({ stdout: 'true\n', stderr: '' }),
      }),
    })

    const probe = await service.probeWorkspace('ws-gh-missing', workspaceRoot)

    expect(probe.localGit.status).toBe('available')
    expect(probe.ghCli).toMatchObject({
      status: 'unavailable',
      summary: 'GitHub CLI unavailable',
    })
    expect(probe.ghAuth).toMatchObject({
      status: 'unavailable',
      summary: 'GitHub auth unavailable',
    })
  })

  it('distinguishes probe failures from unavailable capabilities', async () => {
    const workspaceRoot = makeTempWorkspace({
      'package.json': '{ invalid json',
    })
    const service = new WorkspaceCapabilityProbeService({
      execFile: createExecStub({
        'git rev-parse --is-inside-work-tree': () => {
          throw execError('spawn EPERM', { code: 'EPERM' })
        },
      }),
    })

    const probe = await service.probeWorkspace('ws-errors', workspaceRoot)

    expect(probe.localGit.status).toBe('error')
    expect(probe.previewTarget.status).toBe('error')
    expect(probe.browserEvidence.status).toBe('error')
  })

  it('detects preview and browser evidence support from a nested app target', async () => {
    const workspaceRoot = makeTempWorkspace({
      'apps/site/package.json': JSON.stringify({
        name: 'site',
        scripts: { dev: 'vite', build: 'vite build' },
      }),
    })
    const service = new WorkspaceCapabilityProbeService({
      execFile: createExecStub({
        'git rev-parse --is-inside-work-tree': () => ({ stdout: 'true\n', stderr: '' }),
        'gh --version': () => ({ stdout: 'gh version 2.60.1\n', stderr: '' }),
        'gh auth status --hostname github.com': () => ({ stdout: 'Logged in to github.com account octocat\n', stderr: '' }),
        'chromium --version': () => ({ stdout: 'Chromium 124.0.0.0\n', stderr: '' }),
      }),
    })

    const probe = await service.probeWorkspace('ws-preview', workspaceRoot)

    expect(probe.localGit.status).toBe('available')
    expect(probe.ghCli.status).toBe('available')
    expect(probe.ghAuth.status).toBe('available')
    expect(probe.previewTarget).toMatchObject({
      status: 'available',
      summary: 'Preview target available',
    })
    expect(probe.previewTarget.detail).toContain('apps/site')
    expect(probe.browserEvidence).toMatchObject({
      status: 'available',
      summary: 'Browser evidence available',
    })
  })
})

function makeTempWorkspace(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-capability-probe-'))
  tempDirs.push(root)

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf-8')
  }

  return root
}

function createExecStub(handlers: Record<string, () => { stdout: string; stderr: string } | Promise<{ stdout: string; stderr: string }>>) {
  return async (file: string, args: string[]) => {
    const key = `${file} ${args.join(' ')}`.trim()
    const handler = handlers[key]
    if (handler) {
      return await handler()
    }
    throw execError(`Missing command: ${key}`, { code: 'ENOENT' })
  }
}

function execError(message: string, props: Record<string, unknown>): Error {
  return Object.assign(new Error(message), props)
}
