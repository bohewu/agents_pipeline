// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  getGitStatus: vi.fn(),
  previewCommit: vi.fn(),
  executeCommit: vi.fn(),
  push: vi.fn(),
  createPullRequest: vi.fn(),
  sendChat: vi.fn(),
}))

vi.mock('../../lib/api-client.js', () => ({
  api: apiMocks,
}))

import { ShipPanel } from './ShipPanel.js'
import { useStore } from '../../runtime/store.js'
import type {
  WorkspaceBootstrap,
  WorkspaceCapabilityProbe,
  WorkspaceGitStatusResult,
  WorkspaceLinkedPullRequestSummary,
} from '../../../shared/types.js'

const baseState = useStore.getState()

describe('ShipPanel', () => {
  let container: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    resetStore()
    apiMocks.getGitStatus.mockReset()
    apiMocks.previewCommit.mockReset()
    apiMocks.executeCommit.mockReset()
    apiMocks.push.mockReset()
    apiMocks.createPullRequest.mockReset()
    apiMocks.sendChat.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = null
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container.remove()
  })

  it('renders active-workspace branch, status summary, and action availability', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-1', makeBootstrap('workspace-1', 'Repo One', makeSuccessStatus('workspace-1', {
      branchName: 'main',
      ahead: 1,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    })))
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', 'Repo Two', makeSuccessStatus('workspace-2', {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 1,
      staged: 2,
      stagedPaths: ['src/index.ts', 'README.md'],
      unstaged: 1,
      unstagedPaths: ['docs/spec.md'],
      untracked: 1,
      untrackedPaths: ['notes.txt'],
      pullRequestSupported: false,
      pullRequestSummary: 'Pull request creation is currently unavailable.',
      pullRequestDetail: 'The gh CLI is installed, but github.com authentication is not available.',
      pullRequestRemediation: 'Run gh auth login for github.com and retry the pull request action.',
    })))
    useStore.getState().setActiveWorkspace('workspace-2')
    useStore.getState().setActiveSession('workspace-2', 'session-1')

    await renderPanel()

    expect(container.textContent).toContain('scoped to Repo Two')
    expect(container.textContent).toContain('feature/ship')
    expect(container.textContent).toContain('Ahead 0')
    expect(container.textContent).toContain('Behind 1')
    expect(container.textContent).toContain('Staged')
    expect(container.textContent).toContain('Unstaged')
    expect(container.textContent).toContain('Untracked')
    expect(container.textContent).toContain('src/index.ts')
    expect(container.textContent).toContain('docs/spec.md')
    expect(container.textContent).toContain('notes.txt')
    expect(container.textContent).toContain('2 files ready to commit.')
    expect(container.textContent).toContain('No local commits are ahead of origin/main.')
    expect(container.textContent).toContain('Pull request creation is currently unavailable.')
    expect(container.textContent).toContain('Linked pull request details are currently unavailable.')
    expect(container.textContent).toContain('Run gh auth login for github.com and retry the pull request action.')
    expect(container.textContent).toContain('Preview commit')
    expect(container.textContent).toContain('Push blocked')
    expect(container.textContent).not.toContain('Create pull request')
    expect(container.textContent).not.toContain('Repo One')
  })

  it('renders linked PR checks and review summaries without hiding the local ship controls', async () => {
    const workspaceId = 'workspace-2'
    const linkedPullRequest: WorkspaceLinkedPullRequestSummary = {
      outcome: 'success',
      linked: true,
      summary: 'Linked pull request #42 is open.',
      number: 42,
      title: 'Ship status contract',
      url: 'https://github.com/example/repo/pull/42',
      state: 'OPEN',
      headBranch: 'feature/ship',
      baseBranch: 'main',
      checks: {
        status: 'failing',
        summary: '1 of 3 checks failing, 1 pending.',
        total: 3,
        passing: 1,
        failing: 1,
        pending: 1,
        failingChecks: [{ name: 'CI / test', summary: 'FAILURE', detailsUrl: 'https://example.com/test' }],
      },
      review: {
        status: 'changes_requested',
        summary: 'Changes requested; 1 reviewer still requested.',
        requestedReviewerCount: 1,
      },
      issues: [],
    }

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 1,
      behind: 0,
      staged: 2,
      stagedPaths: ['src/index.ts', 'README.md'],
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: true,
      linkedPullRequest,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()

    expect(container.textContent).toContain('Linked pull request #42 is open.')
    expect(container.textContent).toContain('Checks summary')
    expect(container.textContent).toContain('1 of 3 checks failing, 1 pending.')
    expect(container.textContent).toContain('CI / test')
    expect(container.textContent).toContain('Review summary')
    expect(container.textContent).toContain('Changes requested; 1 reviewer still requested.')
    expect(container.textContent).toContain('Preview commit')
    expect(container.textContent).toContain('Push now')
    expect(container.textContent).toContain('Create pull request')
  })

  it('launches a failing-check fix handoff into the existing chat loop and preserves ship linkage', async () => {
    const workspaceId = 'workspace-2'
    const linkedPullRequest: WorkspaceLinkedPullRequestSummary = {
      outcome: 'success',
      linked: true,
      summary: 'Linked pull request #42 is blocked by checks.',
      number: 42,
      title: 'Ship status contract',
      url: 'https://github.com/example/repo/pull/42',
      state: 'OPEN',
      headBranch: 'feature/ship',
      baseBranch: 'main',
      checks: {
        status: 'failing',
        summary: '1 of 3 checks failing.',
        total: 3,
        passing: 2,
        failing: 1,
        pending: 0,
        failingChecks: [{ name: 'CI / test', summary: 'FAILURE', detailsUrl: 'https://example.com/checks/1' }],
      },
      review: {
        status: 'changes_requested',
        summary: 'Changes requested.',
        requestedReviewerCount: 1,
      },
      issues: [],
    }

    apiMocks.sendChat.mockResolvedValue({ accepted: true, sessionId: 'session-1', messageId: 'message-user-1', taskId: 'ship-fix-pr-42-failing-check-ci-test' })
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 1,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: true,
      linkedPullRequest,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()
    await clickButton('Fix in chat')

    expect(apiMocks.sendChat).toHaveBeenCalledWith(workspaceId, 'session-1', expect.objectContaining({
      text: expect.stringContaining('Failing check: CI / test.'),
      shipFixHandoff: expect.objectContaining({
        taskId: 'ship-fix-pr-42-failing-check-ci-test',
        shipState: 'blocked-by-checks',
        reviewState: 'needs-retry',
        pullRequestUrl: 'https://github.com/example/repo/pull/42',
        conditionKind: 'failing-check',
        conditionLabel: 'CI / test',
        detailsUrl: 'https://example.com/checks/1',
      }),
    }))
    expect(useStore.getState().messagesBySession[`${workspaceId}::session-1`]).toEqual([
      expect.objectContaining({ role: 'user' }),
    ])
    expect(useStore.getState().workspaceBootstraps[workspaceId]?.taskLedgerRecords).toEqual([
      expect.objectContaining({
        taskId: 'ship-fix-pr-42-failing-check-ci-test',
        sourceMessageId: 'message-user-1',
        resultAnnotation: expect.objectContaining({ shipState: 'blocked-by-checks' }),
        recentShipRef: expect.objectContaining({
          conditionKind: 'failing-check',
          conditionLabel: 'CI / test',
          pullRequestUrl: 'https://github.com/example/repo/pull/42',
        }),
      }),
    ])
    expect(container.textContent).toContain('Sent a fix handoff for CI / test into the current chat session.')
  })

  it('launches a requested-changes fix handoff into the existing chat loop', async () => {
    const workspaceId = 'workspace-2'
    const linkedPullRequest: WorkspaceLinkedPullRequestSummary = {
      outcome: 'success',
      linked: true,
      summary: 'Linked pull request #73 needs review follow-up.',
      number: 73,
      title: 'Review follow-up',
      url: 'https://github.com/example/repo/pull/73',
      state: 'OPEN',
      headBranch: 'feature/review',
      baseBranch: 'main',
      checks: {
        status: 'passing',
        summary: '2 checks passing.',
        total: 2,
        passing: 2,
        failing: 0,
        pending: 0,
        failingChecks: [],
      },
      review: {
        status: 'changes_requested',
        summary: 'Security review requested code changes.',
        requestedReviewerCount: 1,
      },
      issues: [],
    }

    apiMocks.sendChat.mockResolvedValue({ accepted: true, sessionId: 'session-1', messageId: 'message-user-2', taskId: 'ship-fix-pr-73-requested-changes-security-review-requested-code-chan' })
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/review',
      ahead: 1,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: true,
      linkedPullRequest,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()
    await clickButton('Address in chat')

    expect(apiMocks.sendChat).toHaveBeenCalledWith(workspaceId, 'session-1', expect.objectContaining({
      text: expect.stringContaining('Requested changes: Security review requested code changes.'),
      shipFixHandoff: expect.objectContaining({
        shipState: 'blocked-by-requested-changes',
        reviewState: 'needs-retry',
        pullRequestUrl: 'https://github.com/example/repo/pull/73',
        conditionKind: 'requested-changes',
        conditionLabel: 'Security review requested code changes.',
      }),
    }))
    expect(useStore.getState().workspaceBootstraps[workspaceId]?.taskLedgerRecords?.[0]).toEqual(expect.objectContaining({
      sourceMessageId: 'message-user-2',
      resultAnnotation: expect.objectContaining({ shipState: 'blocked-by-requested-changes', reviewState: 'needs-retry' }),
      recentShipRef: expect.objectContaining({ conditionKind: 'requested-changes' }),
    }))
  })

  it('shows explicit linked PR remediation when no PR is linked and keeps local ship controls usable', async () => {
    const workspaceId = 'workspace-2'
    const detail = 'GitHub did not find a pull request linked to feature/ship tracking origin/main.'
    const remediation = 'Create or link a GitHub pull request for the current branch, then refresh ship status.'
    const linkedPullRequest: WorkspaceLinkedPullRequestSummary = {
      outcome: 'degraded',
      linked: false,
      summary: 'No linked pull request was found for the current branch.',
      detail,
      remediation,
      issues: [{
        code: 'LINKED_PR_NOT_FOUND',
        message: 'No linked pull request was found for the current branch.',
        detail,
        remediation,
        source: 'gh',
      }],
    }

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 1,
      behind: 0,
      staged: 1,
      stagedPaths: ['src/index.ts'],
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: true,
      linkedPullRequest,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()

    expect(container.textContent).toContain('No linked pull request was found for the current branch.')
    expect(container.textContent).toContain(detail)
    expect(container.textContent).toContain(remediation)
    expect(container.textContent).toContain('Preview commit')
    expect(container.textContent).toContain('Push now')
    expect(container.textContent).toContain('Create pull request')
  })

  it('renders a workspace-scoped unavailable state when git status is degraded', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', 'Repo Two', makeDegradedStatus('workspace-2')))
    useStore.getState().setActiveWorkspace('workspace-2')

    await renderPanel()

    expect(container.textContent).toContain('Git status unavailable for Repo Two')
    expect(container.textContent).toContain('Workspace git status is unavailable.')
    expect(container.textContent).toContain('git is missing or the workspace is not a local git repository.')
    expect(container.textContent).toContain('Open a git-backed workspace with local git available, then retry the ship status request.')
    expect(container.textContent).toContain('Commit is unavailable until workspace git status resolves.')
    expect(container.textContent).toContain('Push is unavailable until workspace git status resolves.')
    expect(container.textContent).not.toContain('This workspace is currently clean.')
  })

  it('survives a missing status snapshot without tripping render state', async () => {
    useStore.getState().setWorkspaceBootstrap('workspace-2', makeBootstrap('workspace-2', 'Repo Two', {
      outcome: 'success',
      issues: [],
    }))
    useStore.getState().setActiveWorkspace('workspace-2')

    await renderPanel()

    expect(container.textContent).toContain('Git status is incomplete for Repo Two')
    expect(container.textContent).toContain('A workspace-scoped git status snapshot was not returned.')
    expect(container.textContent).toContain('Pull request availability depends on workspace git status and capability checks.')
  })

  it('shows a commit preview, runs the foreground commit, and refreshes ship state on success', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 0,
      staged: 2,
      stagedPaths: ['src/index.ts', 'README.md'],
      unstaged: 1,
      unstagedPaths: ['docs/spec.md'],
      untracked: 0,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')
    useStore.getState().setSelectedAgent('build')

    apiMocks.previewCommit.mockResolvedValue(makeCommitPreviewResult(workspaceId, 'update src changes'))
    apiMocks.executeCommit.mockResolvedValue({
      outcome: 'success',
      status: makeSuccessStatus(workspaceId, {
        branchName: 'feature/ship',
        ahead: 1,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      }),
      commit: { sha: 'abc1234', message: 'feat: foreground commit flow' },
      issues: [],
    })

    await renderPanel()

    await clickButton('Preview commit')

    expect(apiMocks.previewCommit).toHaveBeenCalledWith(workspaceId, undefined)
    expect(container.textContent).toContain('Commit preview ready for Repo Two')
    expect(container.textContent).toContain('Workspace status preview')
    expect(container.textContent).toContain('Ready to commit:')
    expect(getTextArea().value).toBe('update src changes')

    await setTextAreaValue('feat: foreground commit flow')
    await clickButton('Confirm commit')

    expect(apiMocks.executeCommit).toHaveBeenCalledWith(workspaceId, {
      sessionId: 'session-1',
      message: 'feat: foreground commit flow',
      agentId: 'build',
    })
    expect(container.textContent).toContain('Commit completed for Repo Two')
    expect(container.textContent).toContain('Workspace ship state refreshed after the foreground commit.')
    expect(useStore.getState().workspaceGitStatusByWorkspace[workspaceId]?.data?.changeSummary.hasChanges).toBe(false)
  })

  it('surfaces hook rejection explicitly and does not present commit failure as success', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 0,
      staged: 1,
      stagedPaths: ['src/index.ts'],
      unstaged: 0,
      untracked: 0,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')
    useStore.getState().setSelectedAgent('build')

    apiMocks.previewCommit.mockResolvedValue(makeCommitPreviewResult(workspaceId, 'update index'))
    apiMocks.executeCommit.mockResolvedValue({
      outcome: 'failure',
      status: makeSuccessStatus(workspaceId, {
        branchName: 'feature/ship',
        ahead: 0,
        behind: 0,
        staged: 1,
        stagedPaths: ['src/index.ts'],
        unstaged: 0,
        untracked: 0,
      }),
      commit: { message: 'update index' },
      issues: [{
        code: 'COMMIT_HOOK_REJECTED',
        message: 'Commit was rejected by a git hook.',
        detail: 'husky - pre-commit hook exited with code 1',
        remediation: 'Fix the hook-reported issue and retry the commit action.',
        source: 'git',
      }],
    })

    await renderPanel()

    await clickButton('Preview commit')
    await clickButton('Confirm commit')

    expect(container.textContent).toContain('Commit rejected by hook for Repo Two')
    expect(container.textContent).toContain('A git hook stopped the foreground commit. No success state was recorded.')
    expect(container.textContent).toContain('husky - pre-commit hook exited with code 1')
    expect(container.textContent).not.toContain('Commit completed for Repo Two')
  })

  it('runs the foreground push, shows the tracked upstream, and refreshes ahead/behind after success', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 2,
      behind: 1,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')
    useStore.getState().setSelectedAgent('build')

    apiMocks.push.mockResolvedValue({
      outcome: 'success',
      status: makeSuccessStatus(workspaceId, {
        branchName: 'feature/ship',
        ahead: 0,
        behind: 1,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      }),
      upstream: {
        status: 'tracked',
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 0,
        behind: 1,
        remoteProvider: 'github',
        remoteHost: 'github.com',
        remoteUrl: 'git@github.com:example/repo.git',
      },
      issues: [],
    })

    await renderPanel()

    await clickButton('Push now')

    expect(apiMocks.push).toHaveBeenCalledWith(workspaceId, { sessionId: 'session-1', agentId: 'build' })
    expect(container.textContent).toContain('Push completed for Repo Two')
    expect(container.textContent).toContain('Foreground push completed for origin/main.')
    expect(container.textContent).toContain('Workspace ahead/behind refreshed after the foreground push.')
    expect(container.textContent).toContain('Upstream:')
    expect(container.textContent).toContain('Tracking origin/main · github')
    expect(useStore.getState().workspaceGitStatusByWorkspace[workspaceId]?.data?.upstream.ahead).toBe(0)
    expect(useStore.getState().workspaceGitStatusByWorkspace[workspaceId]?.data?.upstream.behind).toBe(1)
  })

  it('surfaces explicit push failure feedback without reporting false success', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 1,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')
    useStore.getState().setSelectedAgent('build')

    apiMocks.push.mockResolvedValue({
      outcome: 'failure',
      status: makeSuccessStatus(workspaceId, {
        branchName: 'feature/ship',
        ahead: 1,
        behind: 1,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      }),
      upstream: {
        status: 'tracked',
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 1,
        behind: 1,
        remoteProvider: 'github',
        remoteHost: 'github.com',
        remoteUrl: 'git@github.com:example/repo.git',
      },
      issues: [{
        code: 'PUSH_FAILED',
        message: 'Push did not complete successfully.',
        detail: 'remote rejected the update for origin/main',
        remediation: 'Resolve the remote rejection, then retry the push action.',
        source: 'opencode',
      }],
    })

    await renderPanel()

    await clickButton('Push now')

    expect(container.textContent).toContain('Push failed for Repo Two')
    expect(container.textContent).toContain('Push did not complete successfully.')
    expect(container.textContent).toContain('remote rejected the update for origin/main')
    expect(container.textContent).toContain('Resolve the remote rejection, then retry the push action.')
    expect(container.textContent).not.toContain('Push completed for Repo Two')
    expect(useStore.getState().workspaceGitStatusByWorkspace[workspaceId]?.data?.upstream.behind).toBe(1)
  })

  it('creates a foreground pull request when the workspace capability is supported and shows the PR URL', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: true,
      pullRequestSummary: 'Pull request creation is ready for this workspace.',
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')
    useStore.getState().setSelectedAgent('build')

    apiMocks.createPullRequest.mockResolvedValue({
      outcome: 'success',
      status: makeSuccessStatus(workspaceId, {
        branchName: 'feature/ship',
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        pullRequestSupported: true,
        pullRequestSummary: 'Pull request creation is ready for this workspace.',
      }),
      pullRequest: { url: 'https://github.com/example/repo/pull/42' },
      issues: [],
    })

    await renderPanel()

    await clickButton('Create pull request')

    expect(apiMocks.createPullRequest).toHaveBeenCalledWith(workspaceId, { sessionId: 'session-1', agentId: 'build' })
    expect(container.textContent).toContain('Pull request created for Repo Two')
    expect(container.textContent).toContain('Foreground pull request creation completed successfully.')
    expect(container.textContent).toContain('https://github.com/example/repo/pull/42')
    expect(useStore.getState().workspaceShipActionResultsByWorkspace[workspaceId]?.pullRequest?.pullRequest?.url).toBe(
      'https://github.com/example/repo/pull/42',
    )
  })

  it('shows degraded PR remediation for non-GitHub upstream remotes and does not offer PR creation', async () => {
    const workspaceId = 'workspace-2'
    const status = makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      pullRequestSupported: false,
      pullRequestDetail: 'Pull request creation is unavailable for the current upstream remote.',
      pullRequestIssueDetail: 'The upstream remote resolves to gitlab.com, not github.com.',
      pullRequestRemediation: 'Push the branch to a GitHub remote and retry the pull request action.',
    })
    status.data!.upstream = {
      status: 'tracked',
      ref: 'origin/main',
      remote: 'origin',
      branch: 'main',
      ahead: 0,
      behind: 0,
      remoteProvider: 'gitlab',
      remoteHost: 'gitlab.com',
      remoteUrl: 'git@gitlab.com:example/repo.git',
    }

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', status))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()

    expect(container.textContent).toContain('Pull request creation is currently unavailable.')
    expect(container.textContent).toContain('The upstream remote resolves to gitlab.com, not github.com.')
    expect(container.textContent).toContain('Push the branch to a GitHub remote and retry the pull request action.')
    expect(container.textContent).not.toContain('Create pull request')
  })

  it('shows a visible blocked push state when no tracked upstream exists', async () => {
    const workspaceId = 'workspace-2'
    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo Two', makeMissingUpstreamStatus(workspaceId, {
      branchName: 'feature/ship',
      staged: 0,
      unstaged: 0,
      untracked: 0,
    })))
    useStore.getState().setActiveWorkspace(workspaceId)
    useStore.getState().setActiveSession(workspaceId, 'session-1')

    await renderPanel()

    expect(container.textContent).toContain('No tracked upstream is configured for the current branch.')
    expect(container.textContent).toContain('Push is blocked because no tracked upstream is available for this workspace.')
    expect(container.textContent).toContain('Configure an upstream branch before using the push flow from the ship surface.')
  })

  async function renderPanel(): Promise<void> {
    root = createRoot(container)
    await act(async () => {
      root?.render(<ShipPanel />)
      await flushAsync()
    })
  }

  async function clickButton(label: string): Promise<void> {
    await act(async () => {
      getButton(label).click()
      await flushAsync()
    })
  }

  async function setTextAreaValue(value: string): Promise<void> {
    await act(async () => {
      const textArea = getTextArea()
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textArea, value)
      textArea.dispatchEvent(new Event('input', { bubbles: true }))
      textArea.dispatchEvent(new Event('change', { bubbles: true }))
      await flushAsync()
    })
  }

  function getButton(label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label)
    if (!button) {
      throw new Error(`Unable to find button: ${label}`)
    }
    return button as HTMLButtonElement
  }

  function getTextArea(): HTMLTextAreaElement {
    const textArea = container.querySelector('textarea')
    if (!textArea) {
      throw new Error('Unable to find commit message textarea')
    }
    return textArea as HTMLTextAreaElement
  }
})

function resetStore(): void {
  useStore.setState({
    ...baseState,
    workspaces: [],
    activeWorkspaceId: null,
    workspaceDialogOpen: false,
    settingsDialogOpen: false,
    serverStatusByWorkspace: {},
    workspaceBootstraps: {},
    workspaceCapabilitiesByWorkspace: {},
    workspaceGitStatusByWorkspace: {},
    workspaceShipActionResultsByWorkspace: {},
    sessionsByWorkspace: {},
    activeSessionByWorkspace: {},
    messagesBySession: {},
    taskEntriesByWorkspace: {},
    resultAnnotationsByWorkspace: {},
    pendingPermissions: {},
    selectedProvider: null,
    selectedModel: null,
    selectedModelVariant: null,
    selectedAgent: null,
    effortByWorkspace: {},
    usageByWorkspace: {},
    usageLoadingByWorkspace: {},
    rightPanel: 'usage',
    selectedReasoningMessageId: null,
    activityFocusMessageId: null,
    activityFocusNonce: 0,
    composerMode: 'ask',
    sidebarOpen: true,
    rightDrawerOpen: false,
    connectionByWorkspace: {},
    streamingBySession: {},
  }, false)
}

function makeBootstrap(workspaceId: string, workspaceName: string, git: WorkspaceBootstrap['git']): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-21T00:00:00.000Z',
    },
    sessions: [],
    git,
    capabilities: makeCapabilityProbe(workspaceId),
    traceability: { taskEntries: [], resultAnnotations: [] },
    verificationRuns: [],
  }
}

function makeCapabilityProbe(workspaceId: string): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const
  return {
    workspaceId,
    checkedAt: '2026-04-21T00:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
  }
}

function makeSuccessStatus(
  workspaceId: string,
  overrides: {
    branchName: string
    ahead: number
    behind: number
    staged: number
    stagedPaths?: string[]
    unstaged: number
    unstagedPaths?: string[]
    untracked: number
    untrackedPaths?: string[]
    pullRequestSupported?: boolean
    pullRequestSummary?: string
    pullRequestDetail?: string
    pullRequestIssueDetail?: string
    pullRequestRemediation?: string
    linkedPullRequest?: WorkspaceLinkedPullRequestSummary
  },
): WorkspaceGitStatusResult {
  const pullRequestSupported = overrides.pullRequestSupported ?? false
  const pullRequestSummary = overrides.pullRequestSummary
    ?? (pullRequestSupported
      ? 'Pull request creation is ready for this workspace.'
      : 'Pull request creation is currently unavailable.')
  return {
    outcome: 'success',
    data: {
      workspaceId,
      checkedAt: '2026-04-21T11:00:00.000Z',
      branch: { name: overrides.branchName, detached: false },
      upstream: {
        status: 'tracked',
        ref: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: overrides.ahead,
        behind: overrides.behind,
        remoteProvider: 'github',
        remoteHost: 'github.com',
        remoteUrl: 'git@github.com:example/repo.git',
      },
      changeSummary: {
        staged: { count: overrides.staged, paths: overrides.stagedPaths ?? [], truncated: false },
        unstaged: { count: overrides.unstaged, paths: overrides.unstagedPaths ?? [], truncated: false },
        untracked: { count: overrides.untracked, paths: overrides.untrackedPaths ?? [], truncated: false },
        conflicted: { count: 0, paths: [], truncated: false },
        hasChanges: overrides.staged + overrides.unstaged + overrides.untracked > 0,
        hasStagedChanges: overrides.staged > 0,
      },
      pullRequest: {
        outcome: pullRequestSupported ? 'success' : 'degraded',
        supported: pullRequestSupported,
        summary: pullRequestSummary,
        detail: overrides.pullRequestDetail,
        remediation: overrides.pullRequestRemediation,
        issues: pullRequestSupported
          ? []
          : [{
              code: 'GH_AUTH_UNAVAILABLE',
              message: pullRequestSummary,
              detail: overrides.pullRequestIssueDetail ?? overrides.pullRequestDetail,
              remediation: overrides.pullRequestRemediation,
              source: 'gh',
            }],
      },
      linkedPullRequest: overrides.linkedPullRequest ?? (pullRequestSupported
        ? {
            outcome: 'success',
            linked: true,
            summary: 'Linked pull request #42 is open.',
            number: 42,
            title: 'Ship panel fixture',
            url: 'https://github.com/example/repo/pull/42',
            state: 'OPEN',
            headBranch: overrides.branchName,
            baseBranch: 'main',
            checks: {
              status: 'passing',
              summary: '2 checks passing.',
              total: 2,
              passing: 2,
              failing: 0,
              pending: 0,
              failingChecks: [],
            },
            review: {
              status: 'approved',
              summary: 'Approved',
              requestedReviewerCount: 0,
            },
            issues: [],
          }
        : {
            outcome: 'degraded',
            linked: false,
            summary: 'Linked pull request details are currently unavailable.',
            detail: overrides.pullRequestIssueDetail ?? overrides.pullRequestDetail,
            remediation: overrides.pullRequestRemediation,
            issues: [{
              code: 'GH_AUTH_UNAVAILABLE',
              message: 'Linked pull request details are currently unavailable.',
              detail: overrides.pullRequestIssueDetail ?? overrides.pullRequestDetail,
              remediation: overrides.pullRequestRemediation,
              source: 'gh',
            }],
          }),
    },
    issues: [],
  }
}

function makeDegradedStatus(_workspaceId: string): WorkspaceGitStatusResult {
  return {
    outcome: 'degraded',
    issues: [{
      code: 'GIT_STATUS_UNAVAILABLE',
      message: 'Workspace git status is unavailable.',
      detail: 'git is missing or the workspace is not a local git repository.',
      remediation: 'Open a git-backed workspace with local git available, then retry the ship status request.',
      source: 'git',
    }],
  }
}

function makeCommitPreviewResult(workspaceId: string, draftMessage: string) {
  return {
    outcome: 'success' as const,
    status: makeSuccessStatus(workspaceId, {
      branchName: 'feature/ship',
      ahead: 0,
      behind: 0,
      staged: 2,
      stagedPaths: ['src/index.ts', 'README.md'],
      unstaged: 1,
      unstagedPaths: ['docs/spec.md'],
      untracked: 0,
    }),
    draftMessage,
    issues: [],
  }
}

function makeMissingUpstreamStatus(
  workspaceId: string,
  overrides: {
    branchName: string
    staged: number
    stagedPaths?: string[]
    unstaged: number
    unstagedPaths?: string[]
    untracked: number
    untrackedPaths?: string[]
  },
): WorkspaceGitStatusResult {
  return {
    outcome: 'success',
    data: {
      workspaceId,
      checkedAt: '2026-04-21T11:00:00.000Z',
      branch: { name: overrides.branchName, detached: false },
      upstream: {
        status: 'missing',
        ahead: 0,
        behind: 0,
      },
      changeSummary: {
        staged: { count: overrides.staged, paths: overrides.stagedPaths ?? [], truncated: false },
        unstaged: { count: overrides.unstaged, paths: overrides.unstagedPaths ?? [], truncated: false },
        untracked: { count: overrides.untracked, paths: overrides.untrackedPaths ?? [], truncated: false },
        conflicted: { count: 0, paths: [], truncated: false },
        hasChanges: overrides.staged + overrides.unstaged + overrides.untracked > 0,
        hasStagedChanges: overrides.staged > 0,
      },
      pullRequest: {
        outcome: 'blocked',
        supported: false,
        summary: 'Pull request creation is currently blocked.',
        detail: 'Push the branch with upstream tracking before creating a pull request.',
        remediation: 'Configure upstream tracking outside the web client, then retry the pull request action.',
        issues: [{
          code: 'PR_BLOCKED',
          message: 'Pull request creation is currently blocked.',
          detail: 'Push the branch with upstream tracking before creating a pull request.',
          remediation: 'Configure upstream tracking outside the web client, then retry the pull request action.',
          source: 'git',
        }],
      },
      linkedPullRequest: {
        outcome: 'degraded',
        linked: false,
        summary: 'Linked pull request details are currently unavailable.',
        detail: 'Push the branch with upstream tracking before creating a pull request.',
        remediation: 'Configure upstream tracking outside the web client, then retry the pull request action.',
        issues: [{
          code: 'PR_BLOCKED',
          message: 'Linked pull request details are currently unavailable.',
          detail: 'Push the branch with upstream tracking before creating a pull request.',
          remediation: 'Configure upstream tracking outside the web client, then retry the pull request action.',
          source: 'git',
        }],
      },
    },
    issues: [],
  }
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
