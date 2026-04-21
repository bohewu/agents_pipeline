import { describe, expect, it, vi } from 'vitest'
import { WorkspaceShipService } from './workspace-ship-service.js'

describe('WorkspaceShipService', () => {
  it('parses workspace git status and preserves degraded PR capability details', async () => {
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell: vi.fn() }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': {
          stdout: [
            '## main...origin/main [ahead 2, behind 1]',
            'A  src/index.ts',
            ' M README.md',
            '?? notes.txt',
          ].join('\n'),
          stderr: '',
        },
        'git rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': () => {
          throw execError('not logged in', {
            code: 1,
            stderr: 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.',
          })
        },
      }),
      now: () => new Date('2026-04-21T12:00:00.000Z'),
    })

    const result = await service.getStatus('ws-1', '/tmp/ws-1')

    expect(result).toEqual({
      outcome: 'success',
      data: {
        workspaceId: 'ws-1',
        checkedAt: '2026-04-21T12:00:00.000Z',
        branch: { name: 'main', detached: false, headSha: 'abc123' },
        upstream: {
          status: 'tracked',
          ref: 'origin/main',
          remote: 'origin',
          branch: 'main',
          ahead: 2,
          behind: 1,
          remoteUrl: 'git@github.com:example/repo.git',
          remoteHost: 'github.com',
          remoteProvider: 'github',
        },
        changeSummary: {
          staged: { count: 1, paths: ['src/index.ts'], truncated: false },
          unstaged: { count: 1, paths: ['README.md'], truncated: false },
          untracked: { count: 1, paths: ['notes.txt'], truncated: false },
          conflicted: { count: 0, paths: [], truncated: false },
          hasChanges: true,
          hasStagedChanges: true,
        },
        pullRequest: expect.objectContaining({
          outcome: 'degraded',
          supported: false,
          remediation: 'Run gh auth login for github.com and retry the pull request action.',
          issues: [
            expect.objectContaining({
              code: 'GH_AUTH_UNAVAILABLE',
              source: 'gh',
            }),
          ],
        }),
      },
      issues: [],
    })
  })

  it('blocks commit preview when no staged changes are ready', async () => {
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell: vi.fn() }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': {
          stdout: ['## main...origin/main', ' M README.md', '?? notes.txt'].join('\n'),
          stderr: '',
        },
        'git rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.previewCommit('ws-1', '/tmp/ws-1')

    expect(result.outcome).toBe('blocked')
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'NO_STAGED_CHANGES',
      }),
    ])
  })

  it('executes commit actions through the OpenCode shell seam and refreshes status', async () => {
    const shell = vi.fn(async () => ({ status: 'completed', exitCode: 0, summary: 'Commit created.' }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          {
            stdout: ['## main...origin/main [ahead 1]', 'A  src/index.ts'].join('\n'),
            stderr: '',
          },
          {
            stdout: '## main...origin/main [ahead 2]\n',
            stderr: '',
          },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'def456\n', stderr: '' },
          { stdout: 'def456\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.executeCommit('ws-1', '/tmp/ws-1', {
      sessionId: 'session-1',
      message: "feat: ship contracts",
      agentId: 'build',
    })

    expect(shell).toHaveBeenCalledWith('session-1', "git commit --message 'feat: ship contracts'", { agentId: 'build' })
    expect(result).toEqual({
      outcome: 'success',
      status: expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          changeSummary: expect.objectContaining({
            hasChanges: false,
            hasStagedChanges: false,
          }),
        }),
      }),
      execution: expect.objectContaining({
        sessionId: 'session-1',
        status: 'completed',
        summary: 'Commit created.',
        exitCode: 0,
      }),
      commit: {
        sha: 'def456',
        message: 'feat: ship contracts',
      },
      issues: [],
    })
  })

  it('surfaces hook rejection distinctly when a commit hook blocks completion', async () => {
    const shell = vi.fn(async () => ({
      status: 'failed',
      exitCode: 1,
      stderr: 'husky - pre-commit hook exited with code 1 (error)',
    }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          {
            stdout: ['## main...origin/main', 'A  src/index.ts'].join('\n'),
            stderr: '',
          },
          {
            stdout: ['## main...origin/main', 'A  src/index.ts'].join('\n'),
            stderr: '',
          },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.executeCommit('ws-1', '/tmp/ws-1', {
      sessionId: 'session-1',
      message: 'feat: commit flow',
    })

    expect(result.outcome).toBe('failure')
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'COMMIT_HOOK_REJECTED',
        message: 'Commit was rejected by a git hook.',
        remediation: 'Fix the hook-reported issue and retry the commit action.',
        source: 'git',
      }),
    ])
  })

  it('blocks push when no upstream branch is configured', async () => {
    const shell = vi.fn()
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': { stdout: '## main\n', stderr: '' },
        'git rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
      }),
    })

    const result = await service.push('ws-1', '/tmp/ws-1', { sessionId: 'session-1' })

    expect(shell).not.toHaveBeenCalled()
    expect(result.outcome).toBe('blocked')
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'MISSING_UPSTREAM',
      }),
    ])
  })

  it('executes push through the OpenCode shell seam and refreshes ahead/behind state', async () => {
    const shell = vi.fn(async () => ({ status: 'completed', exitCode: 0, summary: 'Push completed.' }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          { stdout: '## main...origin/main [ahead 2, behind 1]\n', stderr: '' },
          { stdout: '## main...origin/main [ahead 0, behind 1]\n', stderr: '' },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.push('ws-1', '/tmp/ws-1', { sessionId: 'session-1' })

    expect(shell).toHaveBeenCalledWith('session-1', 'git push')

    expect(result).toEqual({
      outcome: 'success',
      status: expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          upstream: expect.objectContaining({
            ref: 'origin/main',
            ahead: 0,
            behind: 1,
          }),
        }),
      }),
      execution: expect.objectContaining({
        sessionId: 'session-1',
        status: 'completed',
        summary: 'Push completed.',
        exitCode: 0,
      }),
      upstream: expect.objectContaining({
        ref: 'origin/main',
        ahead: 0,
        behind: 1,
      }),
      issues: [],
    })
  })

  it('executes push through the OpenCode shell seam with an explicit agent selection', async () => {
    const shell = vi.fn(async () => ({ status: 'completed', exitCode: 0, summary: 'Push completed.' }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          { stdout: '## main...origin/main [ahead 2, behind 1]\n', stderr: '' },
          { stdout: '## main...origin/main [ahead 0, behind 1]\n', stderr: '' },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.push('ws-1', '/tmp/ws-1', {
      sessionId: 'session-1',
      agentId: 'build',
    })

    expect(shell).toHaveBeenCalledWith('session-1', 'git push', { agentId: 'build' })
    expect(result).toEqual({
      outcome: 'success',
      status: expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          upstream: expect.objectContaining({
            ref: 'origin/main',
            ahead: 0,
            behind: 1,
          }),
        }),
      }),
      execution: expect.objectContaining({
        sessionId: 'session-1',
        status: 'completed',
        summary: 'Push completed.',
        exitCode: 0,
      }),
      upstream: expect.objectContaining({
        ref: 'origin/main',
        ahead: 0,
        behind: 1,
      }),
      issues: [],
    })
  })

  it('surfaces push failure and returns refreshed ahead/behind state after the attempt', async () => {
    const shell = vi.fn(async () => ({
      status: 'failed',
      exitCode: 1,
      stderr: 'remote rejected the update for origin/main',
    }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          { stdout: '## main...origin/main [ahead 1]\n', stderr: '' },
          { stdout: '## main...origin/main [ahead 1, behind 1]\n', stderr: '' },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.push('ws-1', '/tmp/ws-1', { sessionId: 'session-1' })

    expect(result).toEqual({
      outcome: 'failure',
      status: expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          upstream: expect.objectContaining({
            ref: 'origin/main',
            ahead: 1,
            behind: 1,
          }),
        }),
      }),
      execution: expect.objectContaining({
        sessionId: 'session-1',
        status: 'failed',
        exitCode: 1,
        stderr: 'remote rejected the update for origin/main',
      }),
      upstream: expect.objectContaining({
        ref: 'origin/main',
        ahead: 1,
        behind: 1,
      }),
      issues: [
        expect.objectContaining({
          code: 'PUSH_FAILED',
          message: 'Push did not complete successfully.',
        }),
      ],
    })
  })

  it('creates pull requests through the OpenCode shell seam and returns the PR URL', async () => {
    const shell = vi.fn(async () => ({ status: 'completed', exitCode: 0, stdout: 'https://github.com/example/repo/pull/42\n' }))
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': [
          { stdout: '## main...origin/main [ahead 0]\n', stderr: '' },
          { stdout: '## main...origin/main [ahead 0]\n', stderr: '' },
        ],
        'git rev-parse HEAD': [
          { stdout: 'abc123\n', stderr: '' },
          { stdout: 'abc123\n', stderr: '' },
        ],
        'git remote get-url origin': { stdout: 'git@github.com:example/repo.git\n', stderr: '' },
        'gh --version': { stdout: 'gh version 2.60.1\n', stderr: '' },
        'gh auth status --hostname github.com': { stdout: 'Logged in to github.com account octocat\n', stderr: '' },
      }),
    })

    const result = await service.createPullRequest('ws-1', '/tmp/ws-1', {
      sessionId: 'session-1',
      agentId: 'build',
    })

    expect(shell).toHaveBeenCalledWith(
      'session-1',
      "gh pr create --title 'OpenCode ship update for main' --body ''",
      { agentId: 'build' },
    )
    expect(result).toEqual({
      outcome: 'success',
      status: expect.objectContaining({ outcome: 'success' }),
      execution: expect.objectContaining({ sessionId: 'session-1', status: 'completed', exitCode: 0 }),
      pullRequest: { url: 'https://github.com/example/repo/pull/42' },
      issues: [],
    })
  })

  it('degrades pull request creation when the tracked upstream is not GitHub-backed', async () => {
    const shell = vi.fn()
    const service = new WorkspaceShipService({ forWorkspace: () => ({ shell }) as any }, {
      execFile: createExecStub({
        'git status --short --branch --untracked-files=all': {
          stdout: '## main...origin/main [ahead 0]\n',
          stderr: '',
        },
        'git rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
        'git remote get-url origin': { stdout: 'git@gitlab.com:example/repo.git\n', stderr: '' },
      }),
    })

    const result = await service.createPullRequest('ws-1', '/tmp/ws-1', {
      sessionId: 'session-1',
    })

    expect(shell).not.toHaveBeenCalled()
    expect(result).toEqual({
      outcome: 'degraded',
      status: expect.objectContaining({
        outcome: 'success',
        data: expect.objectContaining({
          upstream: expect.objectContaining({
            remoteProvider: 'gitlab',
            remoteHost: 'gitlab.com',
          }),
          pullRequest: expect.objectContaining({
            outcome: 'degraded',
            supported: false,
          }),
        }),
      }),
      issues: [
        expect.objectContaining({
          code: 'UNSUPPORTED_PR_REMOTE',
          detail: 'The upstream remote resolves to gitlab.com, not github.com.',
          remediation: 'Push the branch to a GitHub remote and retry the pull request action.',
        }),
      ],
    })
  })
})

function createExecStub(handlers: Record<string, ExecHandler | ExecHandler[]>) {
  const calls = new Map<string, number>()
  return async (file: string, args: string[]) => {
    const key = `${file} ${args.join(' ')}`.trim()
    const handler = handlers[key]
    if (!handler) {
      throw execError(`Missing command: ${key}`, { code: 'ENOENT' })
    }

    const index = calls.get(key) ?? 0
    calls.set(key, index + 1)
    const resolved = Array.isArray(handler) ? handler[Math.min(index, handler.length - 1)] : handler
    if (typeof resolved === 'function') {
      return await resolved()
    }
    return resolved
  }
}

type ExecHandler = { stdout: string; stderr: string } | (() => { stdout: string; stderr: string } | Promise<{ stdout: string; stderr: string }>)

function execError(message: string, props: Record<string, unknown>): Error {
  return Object.assign(new Error(message), props)
}
