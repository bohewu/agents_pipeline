import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  CommitExecuteRequest,
  CommitExecuteResult,
  CommitPreviewRequest,
  CommitPreviewResult,
  GitRemoteProvider,
  PullRequestCreateRequest,
  PullRequestCreateResult,
  PushRequest,
  PushResult,
  ShipExecutionResult,
  ShipIssue,
  WorkspaceLinkedPullRequestChecksSummary,
  WorkspaceLinkedPullRequestSummary,
  WorkspaceGitStatusResult,
  WorkspaceGitStatusSnapshot,
  WorkspaceGitUpstreamState,
  WorkspacePullRequestCapability,
} from '../../shared/types.js'
import type { OpenCodeClientFactory, OpenCodeExecutionResult } from './opencode-client-factory.js'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 5000
const GH_TIMEOUT_MS = 4000
const MAX_BUCKET_PATHS = 20
const LINKED_PULL_REQUEST_JSON_FIELDS = [
  'number',
  'title',
  'url',
  'state',
  'isDraft',
  'headRefName',
  'baseRefName',
  'reviewDecision',
  'reviewRequests',
  'statusCheckRollup',
].join(',')

type ExecResult = { stdout: string; stderr: string }
type ExecFn = (file: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<ExecResult>

interface GitHubPullRequestView {
  number?: number
  title?: string
  url?: string
  state?: string
  isDraft?: boolean
  headRefName?: string
  baseRefName?: string
  reviewDecision?: string
  reviewRequests?: unknown[]
  statusCheckRollup?: unknown[]
}

type NormalizedLinkedPullRequestCheckStatus = 'passing' | 'failing' | 'pending'

interface NormalizedLinkedPullRequestCheck {
  name: string
  status: NormalizedLinkedPullRequestCheckStatus
  summary?: string
  detailsUrl?: string
}

export interface WorkspaceShipServiceOptions {
  execFile?: ExecFn
  now?: () => Date
}

interface ParsedGitStatus {
  branchName?: string
  detached: boolean
  headSha?: string
  upstreamRef?: string
  ahead: number
  behind: number
  stagedPaths: string[]
  unstagedPaths: string[]
  untrackedPaths: string[]
  conflictedPaths: string[]
}

export class WorkspaceShipService {
  private clientFactory: Pick<OpenCodeClientFactory, 'forWorkspace'>
  private execFile: ExecFn
  private now: () => Date

  constructor(
    clientFactory: Pick<OpenCodeClientFactory, 'forWorkspace'>,
    options: WorkspaceShipServiceOptions = {},
  ) {
    this.clientFactory = clientFactory
    this.execFile = options.execFile ?? defaultExecFile
    this.now = options.now ?? (() => new Date())
  }

  async getStatus(workspaceId: string, workspaceRoot: string): Promise<WorkspaceGitStatusResult> {
    const checkedAt = this.now().toISOString()

    try {
      const parsed = await this.readGitStatus(workspaceRoot)
      const upstream = await this.resolveUpstream(parsed, workspaceRoot)
      const pullRequest = await this.resolvePullRequestCapability(parsed, upstream)
      const linkedPullRequest = await this.resolveLinkedPullRequest(parsed, workspaceRoot, upstream, pullRequest)

      return {
        outcome: 'success',
        data: {
          workspaceId,
          checkedAt,
          branch: {
            ...(parsed.branchName ? { name: parsed.branchName } : {}),
            detached: parsed.detached,
            ...(parsed.headSha ? { headSha: parsed.headSha } : {}),
          },
          upstream,
          changeSummary: {
            staged: createPathBucket(parsed.stagedPaths),
            unstaged: createPathBucket(parsed.unstagedPaths),
            untracked: createPathBucket(parsed.untrackedPaths),
            conflicted: createPathBucket(parsed.conflictedPaths),
            hasChanges: parsed.stagedPaths.length > 0
              || parsed.unstagedPaths.length > 0
              || parsed.untrackedPaths.length > 0
              || parsed.conflictedPaths.length > 0,
            hasStagedChanges: parsed.stagedPaths.length > 0,
          },
          pullRequest,
          linkedPullRequest,
        },
        issues: [],
      }
    } catch (error) {
      return mapStatusError(error)
    }
  }

  async previewCommit(
    workspaceId: string,
    workspaceRoot: string,
    request: CommitPreviewRequest = {},
  ): Promise<CommitPreviewResult> {
    const status = await this.getStatus(workspaceId, workspaceRoot)
    if (status.outcome !== 'success' || !status.data) {
      return {
        outcome: status.outcome === 'failure' ? 'failure' : 'degraded',
        status,
        issues: [...status.issues],
      }
    }

    if (!status.data.changeSummary.hasStagedChanges) {
      return {
        outcome: 'blocked',
        status,
        draftMessage: request.message?.trim() || draftCommitMessage(status.data),
        issues: [
          createIssue(
            'NO_STAGED_CHANGES',
            'No staged changes are ready to commit.',
            'Stage changes in the workspace before running the commit action.',
            'Use your preferred git staging flow, then refresh the ship status preview.',
            'git',
          ),
        ],
      }
    }

    return {
      outcome: 'success',
      status,
      draftMessage: request.message?.trim() || draftCommitMessage(status.data),
      issues: [],
    }
  }

  async executeCommit(
    workspaceId: string,
    workspaceRoot: string,
    request: CommitExecuteRequest,
  ): Promise<CommitExecuteResult> {
    const preview = await this.previewCommit(workspaceId, workspaceRoot, { message: request.message })
    if (preview.outcome !== 'success') {
      return {
        outcome: preview.outcome,
        status: preview.status,
        commit: { message: request.message },
        issues: [...preview.issues],
      }
    }

    try {
      const execution = await this.runShipShell(
        workspaceId,
        request.sessionId,
        buildGitCommitCommand(request.message),
        request.agentId,
      )

      if (!didExecutionSucceed(execution)) {
        return {
          outcome: 'failure',
          status: await this.getStatus(workspaceId, workspaceRoot),
          execution: toShipExecution(request.sessionId, execution),
          commit: { message: request.message },
          issues: [createCommitExecutionIssue(execution)],
        }
      }

      const commitSha = await readHeadSha(this.execFile, workspaceRoot)
      const refreshedStatus = await this.getStatus(workspaceId, workspaceRoot)

      return {
        outcome: refreshedStatus.outcome === 'success' ? 'success' : 'degraded',
        status: refreshedStatus,
        execution: toShipExecution(request.sessionId, execution),
        commit: {
          ...(commitSha ? { sha: commitSha } : {}),
          message: request.message,
        },
        issues: refreshedStatus.outcome === 'success'
          ? []
          : [createIssue('STATUS_REFRESH_DEGRADED', 'The commit finished, but git status refresh was degraded.', undefined, undefined, 'git')],
      }
    } catch (error) {
      return {
        outcome: 'failure',
        status: await this.getStatus(workspaceId, workspaceRoot),
        commit: { message: request.message },
        issues: [mapExecutionError('COMMIT_EXECUTION_FAILED', 'Commit execution failed before completion.', error)],
      }
    }
  }

  async push(
    workspaceId: string,
    workspaceRoot: string,
    request: PushRequest,
  ): Promise<PushResult> {
    const status = await this.getStatus(workspaceId, workspaceRoot)
    if (status.outcome !== 'success' || !status.data) {
      return {
        outcome: status.outcome === 'failure' ? 'failure' : 'degraded',
        status,
        issues: [...status.issues],
      }
    }

    if (status.data.upstream.status !== 'tracked') {
      return {
        outcome: 'blocked',
        status,
        upstream: status.data.upstream,
        issues: [
          createIssue(
            'MISSING_UPSTREAM',
            'Push is blocked because the current branch does not track an upstream branch.',
            'Phase C push only supports branches with an existing upstream.',
            'Set an upstream branch outside the web client, then retry the push action.',
            'git',
          ),
        ],
      }
    }

    if (status.data.upstream.ahead <= 0) {
      return {
        outcome: 'blocked',
        status,
        upstream: status.data.upstream,
        issues: [
          createIssue(
            'NOTHING_TO_PUSH',
            'Push is blocked because there are no local commits ahead of the upstream branch.',
            undefined,
            'Create a commit first, then retry the push action.',
            'git',
          ),
        ],
      }
    }

    try {
      const execution = await this.runShipShell(workspaceId, request.sessionId, 'git push', request.agentId)
      if (!didExecutionSucceed(execution)) {
        const refreshedStatus = await this.getStatus(workspaceId, workspaceRoot)
        return {
          outcome: 'failure',
          status: refreshedStatus,
          execution: toShipExecution(request.sessionId, execution),
          upstream: refreshedStatus.data?.upstream ?? status.data.upstream,
          issues: [createExecutionIssue('PUSH_FAILED', 'Push did not complete successfully.', execution)],
        }
      }

      const refreshedStatus = await this.getStatus(workspaceId, workspaceRoot)
      return {
        outcome: refreshedStatus.outcome === 'success' ? 'success' : 'degraded',
        status: refreshedStatus,
        execution: toShipExecution(request.sessionId, execution),
        upstream: refreshedStatus.data?.upstream ?? status.data.upstream,
        issues: refreshedStatus.outcome === 'success'
          ? []
          : [createIssue('STATUS_REFRESH_DEGRADED', 'The push finished, but git status refresh was degraded.', undefined, undefined, 'git')],
      }
    } catch (error) {
      const refreshedStatus = await this.getStatus(workspaceId, workspaceRoot)
      return {
        outcome: 'failure',
        status: refreshedStatus,
        upstream: refreshedStatus.data?.upstream ?? status.data.upstream,
        issues: [mapExecutionError('PUSH_EXECUTION_FAILED', 'Push execution failed before completion.', error)],
      }
    }
  }

  async createPullRequest(
    workspaceId: string,
    workspaceRoot: string,
    request: PullRequestCreateRequest,
  ): Promise<PullRequestCreateResult> {
    const status = await this.getStatus(workspaceId, workspaceRoot)
    if (status.outcome !== 'success' || !status.data) {
      return {
        outcome: status.outcome === 'failure' ? 'failure' : 'degraded',
        status,
        issues: [...status.issues],
      }
    }

    const capability = status.data.pullRequest
    if (capability.outcome !== 'success' || !capability.supported) {
      return {
        outcome: capability.outcome,
        status,
        issues: [...capability.issues],
      }
    }

    try {
      const execution = await this.runShipShell(
        workspaceId,
        request.sessionId,
        buildPullRequestCommand(status.data, request),
        request.agentId,
      )

      if (!didExecutionSucceed(execution)) {
        return {
          outcome: 'failure',
          status: await this.getStatus(workspaceId, workspaceRoot),
          execution: toShipExecution(request.sessionId, execution),
          issues: [createExecutionIssue('PR_CREATE_FAILED', 'Pull request creation did not complete successfully.', execution)],
        }
      }

      const url = extractUrl(execution)
      if (!url) {
        return {
          outcome: 'failure',
          status: await this.getStatus(workspaceId, workspaceRoot),
          execution: toShipExecution(request.sessionId, execution),
          issues: [
            createIssue(
              'PR_URL_MISSING',
              'Pull request creation completed without a detectable URL.',
              execution.summary ?? execution.stdout ?? execution.stderr,
              'Retry the PR action or inspect the upstream gh output for the created PR URL.',
              'gh',
            ),
          ],
        }
      }

      const refreshedStatus = await this.getStatus(workspaceId, workspaceRoot)
      return {
        outcome: refreshedStatus.outcome === 'success' ? 'success' : 'degraded',
        status: refreshedStatus,
        execution: toShipExecution(request.sessionId, execution),
        pullRequest: { url },
        issues: refreshedStatus.outcome === 'success'
          ? []
          : [createIssue('STATUS_REFRESH_DEGRADED', 'The pull request was created, but git status refresh was degraded.', undefined, undefined, 'git')],
      }
    } catch (error) {
      return {
        outcome: 'failure',
        status: await this.getStatus(workspaceId, workspaceRoot),
        issues: [mapExecutionError('PR_EXECUTION_FAILED', 'Pull request creation failed before completion.', error)],
      }
    }
  }

  private async readGitStatus(workspaceRoot: string): Promise<ParsedGitStatus> {
    const statusResult = await this.execFile('git', ['status', '--short', '--branch', '--untracked-files=all'], {
      cwd: workspaceRoot,
      timeout: GIT_TIMEOUT_MS,
    })
    const headSha = await readHeadSha(this.execFile, workspaceRoot)
    return parseGitStatus(statusResult.stdout, headSha)
  }

  private async runShipShell(
    workspaceId: string,
    sessionId: string,
    command: string,
    agentId?: string,
  ): Promise<OpenCodeExecutionResult> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return agentId
      ? client.shell(sessionId, command, { agentId })
      : client.shell(sessionId, command)
  }

  private async resolveUpstream(parsed: ParsedGitStatus, workspaceRoot: string): Promise<WorkspaceGitUpstreamState> {
    const { upstreamRef, ahead, behind, detached } = parsed
    if (detached) {
      return {
        status: 'detached',
        ...(upstreamRef ? { ref: upstreamRef } : {}),
        ahead,
        behind,
      }
    }

    if (!upstreamRef) {
      return {
        status: 'missing',
        ahead,
        behind,
      }
    }

    const [remote, ...branchParts] = upstreamRef.split('/')
    const branch = branchParts.join('/')
    if (!remote || !branch) {
      return {
        status: 'unknown',
        ref: upstreamRef,
        ahead,
        behind,
      }
    }

    const remoteUrl = await this.execFile('git', ['remote', 'get-url', remote], {
      cwd: workspaceRoot,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((result) => result.stdout.trim())
      .catch(() => undefined)

    return {
      status: 'tracked',
      ref: upstreamRef,
      remote,
      branch,
      ...resolveRemoteMetadata(remoteUrl),
      ahead,
      behind,
    }
  }

  private async resolvePullRequestCapability(
    parsed: ParsedGitStatus,
    upstream: WorkspaceGitUpstreamState,
  ): Promise<WorkspacePullRequestCapability> {
    if (parsed.detached || !parsed.branchName) {
      return blockedCapability(
        'Pull request creation is blocked for detached HEAD state.',
        'Check out a named branch before creating a pull request from the web client.',
      )
    }

    if (upstream.status !== 'tracked') {
      return blockedCapability(
        'Pull request creation is blocked until the current branch tracks an upstream branch.',
        'Push the branch with upstream tracking before creating a pull request.',
      )
    }

    if (upstream.remoteProvider !== 'github') {
      return degradedCapability(
        'Pull request creation is unavailable for the current upstream remote.',
        upstream.remoteHost
          ? `The upstream remote resolves to ${upstream.remoteHost}, not github.com.`
          : 'A GitHub-backed upstream remote is required for Phase C pull request creation.',
        'Push the branch to a GitHub remote and retry the pull request action.',
        'UNSUPPORTED_PR_REMOTE',
      )
    }

    try {
      await this.execFile('gh', ['--version'], { timeout: GH_TIMEOUT_MS })
    } catch (error) {
      if (isMissingCommandError(error)) {
        return degradedCapability(
          'Pull request creation is unavailable because GitHub CLI is missing.',
          'The gh CLI is not installed or is not on PATH.',
          'Install gh and retry the pull request action.',
          'GH_CLI_UNAVAILABLE',
        )
      }

      return failedCapability('Pull request capability probe failed while checking GitHub CLI.', toErrorMessage(error), 'GH_CLI_PROBE_FAILED')
    }

    try {
      await this.execFile('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: GH_TIMEOUT_MS })
    } catch (error) {
      if (hasExecOutput(error, 'not logged into') || hasExecOutput(error, 'not logged in')) {
        return degradedCapability(
          'Pull request creation is unavailable because GitHub CLI is not authenticated.',
          'The gh CLI is installed, but github.com authentication is not available.',
          'Run gh auth login for github.com and retry the pull request action.',
          'GH_AUTH_UNAVAILABLE',
        )
      }

      if (isMissingCommandError(error)) {
        return degradedCapability(
          'Pull request creation is unavailable because GitHub CLI is missing.',
          'The gh CLI is not installed or is not on PATH.',
          'Install gh and retry the pull request action.',
          'GH_CLI_UNAVAILABLE',
        )
      }

      return failedCapability('Pull request capability probe failed while checking GitHub authentication.', toErrorMessage(error), 'GH_AUTH_PROBE_FAILED')
    }

    return {
      outcome: 'success',
      supported: true,
      summary: 'Pull request creation is ready for this workspace.',
      issues: [],
    }
  }

  private async resolveLinkedPullRequest(
    parsed: ParsedGitStatus,
    workspaceRoot: string,
    upstream: WorkspaceGitUpstreamState,
    capability: WorkspacePullRequestCapability,
  ): Promise<WorkspaceLinkedPullRequestSummary> {
    if (capability.outcome !== 'success' || !capability.supported) {
      return linkedPullRequestFromCapability(capability)
    }

    try {
      const args = ['pr', 'view']
      if (parsed.branchName) {
        args.push(parsed.branchName)
      }
      args.push('--json', LINKED_PULL_REQUEST_JSON_FIELDS)

      const result = await this.execFile('gh', args, {
        cwd: workspaceRoot,
        timeout: GH_TIMEOUT_MS,
      })

      return createLinkedPullRequestSummary(parseLinkedPullRequestView(result.stdout))
    } catch (error) {
      if (isMissingLinkedPullRequestError(error)) {
        return missingLinkedPullRequestSummary(parsed, upstream)
      }

      if (hasExecOutput(error, 'not logged into') || hasExecOutput(error, 'not logged in')) {
        return degradedLinkedPullRequestSummary(
          'Linked pull request details are currently unavailable.',
          'The gh CLI is installed, but github.com authentication is not available.',
          'Run gh auth login for github.com and refresh ship status.',
          [createIssue(
            'GH_AUTH_UNAVAILABLE',
            'Linked pull request details are currently unavailable.',
            'The gh CLI is installed, but github.com authentication is not available.',
            'Run gh auth login for github.com and refresh ship status.',
            'gh',
          )],
        )
      }

      if (isMissingCommandError(error)) {
        return degradedLinkedPullRequestSummary(
          'Linked pull request details are currently unavailable.',
          'The gh CLI is not installed or is not on PATH.',
          'Install gh and refresh ship status.',
          [createIssue(
            'GH_CLI_UNAVAILABLE',
            'Linked pull request details are currently unavailable.',
            'The gh CLI is not installed or is not on PATH.',
            'Install gh and refresh ship status.',
            'gh',
          )],
        )
      }

      return failedLinkedPullRequestSummary(
        'Linked pull request details failed to load.',
        toErrorMessage(error),
        'LINKED_PR_READ_FAILED',
      )
    }
  }
}

async function defaultExecFile(
  file: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: options?.cwd,
    timeout: options?.timeout,
    encoding: 'utf-8',
  })
  return {
    stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
    stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
  }
}

function parseGitStatus(output: string, headSha?: string): ParsedGitStatus {
  const parsed: ParsedGitStatus = {
    detached: false,
    ...(headSha ? { headSha } : {}),
    ahead: 0,
    behind: 0,
    stagedPaths: [],
    unstagedPaths: [],
    untrackedPaths: [],
    conflictedPaths: [],
  }

  const lines = output.split('\n').map((line) => line.trimEnd()).filter(Boolean)
  const header = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : undefined
  if (header) {
    applyHeader(header, parsed)
  }

  for (const line of lines) {
    const statusToken = line.slice(0, 2)
    const path = normalizeStatusPath(line.slice(3).trim())
    if (!path) continue

    if (statusToken === '??') {
      parsed.untrackedPaths.push(path)
      continue
    }

    const indexStatus = statusToken[0] ?? ' '
    const worktreeStatus = statusToken[1] ?? ' '
    if (isConflictStatus(indexStatus) || isConflictStatus(worktreeStatus)) {
      parsed.conflictedPaths.push(path)
    }
    if (indexStatus !== ' ' && indexStatus !== '?') {
      parsed.stagedPaths.push(path)
    }
    if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
      parsed.unstagedPaths.push(path)
    }
  }

  return parsed
}

function applyHeader(header: string, parsed: ParsedGitStatus): void {
  if (header.startsWith('No commits yet on ')) {
    parsed.branchName = header.slice('No commits yet on '.length).trim() || undefined
    return
  }

  if (header.startsWith('HEAD ')) {
    parsed.detached = true
    return
  }

  const [branchPartRaw, trackingPartRaw] = header.split('...')
  const branchPart = branchPartRaw.trim()
  if (branchPart && branchPart !== 'HEAD') {
    parsed.branchName = branchPart
  }
  if (branchPart.includes('(no branch)')) {
    parsed.detached = true
  }

  if (!trackingPartRaw) return

  const trackingMatch = trackingPartRaw.match(/^([^[]+?)(?:\s+\[(.+)\])?$/)
  if (!trackingMatch) {
    parsed.upstreamRef = trackingPartRaw.trim() || undefined
    return
  }

  parsed.upstreamRef = trackingMatch[1]?.trim() || undefined
  const trackingState = trackingMatch[2] ?? ''
  const aheadMatch = trackingState.match(/ahead\s+(\d+)/)
  const behindMatch = trackingState.match(/behind\s+(\d+)/)
  parsed.ahead = aheadMatch ? Number(aheadMatch[1]) : 0
  parsed.behind = behindMatch ? Number(behindMatch[1]) : 0
}

function normalizeStatusPath(rawPath: string): string {
  if (!rawPath) return rawPath
  const targetPath = rawPath.includes(' -> ')
    ? rawPath.split(' -> ').at(-1) ?? rawPath
    : rawPath
  return unquoteGitPath(targetPath)
}

function unquoteGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value
  return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function isConflictStatus(value: string): boolean {
  return value === 'U'
 }

function createPathBucket(paths: string[]) {
  return {
    count: paths.length,
    paths: paths.slice(0, MAX_BUCKET_PATHS),
    truncated: paths.length > MAX_BUCKET_PATHS,
  }
}

function mapStatusError(error: unknown): WorkspaceGitStatusResult {
  const detail = toErrorMessage(error)
  if (isMissingCommandError(error) || hasExecOutput(error, 'not a git repository')) {
    return {
      outcome: 'degraded',
      issues: [
        createIssue(
          'GIT_STATUS_UNAVAILABLE',
          'Workspace git status is unavailable.',
          detail || 'git is missing or the workspace is not a local git repository.',
          'Open a git-backed workspace with local git available, then retry the ship status request.',
          'git',
        ),
      ],
    }
  }

  return {
    outcome: 'failure',
    issues: [createIssue('GIT_STATUS_FAILED', 'Workspace git status failed to load.', detail, undefined, 'git')],
  }
}

function resolveRemoteMetadata(remoteUrl: string | undefined): Pick<WorkspaceGitUpstreamState, 'remoteUrl' | 'remoteHost' | 'remoteProvider'> {
  if (!remoteUrl) {
    return {
      remoteProvider: 'unknown',
    }
  }

  const remoteHost = extractRemoteHost(remoteUrl)
  const remoteProvider = resolveRemoteProvider(remoteHost)
  return {
    remoteUrl,
    ...(remoteHost ? { remoteHost } : {}),
    remoteProvider,
  }
}

function extractRemoteHost(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim()
  if (!trimmed) return undefined

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).hostname || undefined
    } catch {
      return undefined
    }
  }

  const sshMatch = trimmed.match(/^[^@]+@([^:]+):/)
  if (sshMatch?.[1]) {
    return sshMatch[1]
  }

  const scpLikeMatch = trimmed.match(/^ssh:\/\/[^@]+@([^/]+)/)
  return scpLikeMatch?.[1]
}

function resolveRemoteProvider(host: string | undefined): GitRemoteProvider {
  const normalized = host?.toLowerCase()
  if (!normalized) return 'unknown'
  if (normalized.includes('github.com')) return 'github'
  if (normalized.includes('gitlab')) return 'gitlab'
  if (normalized.includes('bitbucket')) return 'bitbucket'
  return 'unknown'
}

function draftCommitMessage(status: WorkspaceGitStatusSnapshot): string {
  const stagedPaths = status.changeSummary.staged.paths
  if (stagedPaths.length === 0) {
    return 'update staged changes'
  }

  if (stagedPaths.length === 1) {
    return `update ${describeDraftPath(stagedPaths[0])}`
  }

  const topLevel = sharedTopLevel(stagedPaths)
  if (topLevel) {
    return `update ${topLevel} changes`
  }

  return `update ${status.changeSummary.staged.count} files`
}

function sharedTopLevel(paths: string[]): string | undefined {
  const first = paths[0]?.split('/')[0]?.trim()
  if (!first) return undefined
  return paths.every((path) => path.split('/')[0]?.trim() === first) ? first : undefined
}

function describeDraftPath(filePath: string): string {
  const normalized = filePath.trim()
  if (!normalized) return 'staged changes'
  const segments = normalized.split('/')
  return segments.at(-1) ?? normalized
}

function buildGitCommitCommand(message: string): string {
  return `git commit --message ${shellQuote(message)}`
}

function buildPullRequestCommand(
  status: WorkspaceGitStatusSnapshot,
  request: PullRequestCreateRequest,
): string {
  const title = request.title?.trim() || `OpenCode ship update for ${status.branch.name ?? 'current branch'}`
  const body = request.body ?? ''
  const args = ['gh pr create']

  args.push('--title', shellQuote(title))
  args.push('--body', shellQuote(body))

  if (request.baseBranch?.trim()) {
    args.push('--base', shellQuote(request.baseBranch.trim()))
  }
  if (request.headBranch?.trim()) {
    args.push('--head', shellQuote(request.headBranch.trim()))
  }
  if (request.draft) {
    args.push('--draft')
  }

  return args.join(' ')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

async function readHeadSha(execFileFn: ExecFn, workspaceRoot: string): Promise<string | undefined> {
  try {
    const result = await execFileFn('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, timeout: GIT_TIMEOUT_MS })
    const sha = result.stdout.trim()
    return sha || undefined
  } catch {
    return undefined
  }
}

function didExecutionSucceed(execution: OpenCodeExecutionResult): boolean {
  const normalizedStatus = execution.status?.trim().toLowerCase()
  if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'errored') {
    return false
  }
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedStatus === 'aborted') {
    return false
  }
  if (execution.exitCode !== undefined) {
    return execution.exitCode === 0
  }
  return true
}

function toShipExecution(sessionId: string, execution: OpenCodeExecutionResult): ShipExecutionResult {
  return {
    sessionId: execution.sessionId ?? sessionId,
    ...(execution.status ? { status: execution.status } : {}),
    ...(execution.summary ? { summary: execution.summary } : {}),
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    ...(execution.terminalLogRef ? { terminalLogRef: execution.terminalLogRef } : {}),
    ...(execution.messageId ? { messageId: execution.messageId } : {}),
    ...(execution.taskId ? { taskId: execution.taskId } : {}),
    ...(execution.stdout ? { stdout: execution.stdout } : {}),
    ...(execution.stderr ? { stderr: execution.stderr } : {}),
  }
}

function createExecutionIssue(code: string, message: string, execution: OpenCodeExecutionResult): ShipIssue {
  return createIssue(
    code,
    message,
    execution.stderr ?? execution.summary ?? execution.stdout,
    undefined,
    'opencode',
  )
}

function createCommitExecutionIssue(execution: OpenCodeExecutionResult): ShipIssue {
  if (looksLikeCommitHookRejection(execution)) {
    return createIssue(
      'COMMIT_HOOK_REJECTED',
      'Commit was rejected by a git hook.',
      execution.stderr ?? execution.summary ?? execution.stdout,
      'Fix the hook-reported issue and retry the commit action.',
      'git',
    )
  }

  return createExecutionIssue('COMMIT_FAILED', 'Commit did not complete successfully.', execution)
}

function mapExecutionError(code: string, message: string, error: unknown): ShipIssue {
  return createIssue(code, message, toErrorMessage(error), undefined, 'opencode')
}

function extractUrl(execution: OpenCodeExecutionResult): string | undefined {
  const source = [execution.summary, execution.stdout, execution.stderr, execution.raw]
    .map((value) => typeof value === 'string' ? value : JSON.stringify(value))
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
  const match = source.match(/https?:\/\/\S+/)
  return match?.[0]
}

function looksLikeCommitHookRejection(execution: OpenCodeExecutionResult): boolean {
  const output = [execution.stderr, execution.summary, execution.stdout]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase()

  if (!output) {
    return false
  }

  return /pre-commit|commit-msg|prepare-commit-msg|husky|hook/.test(output)
}

function createIssue(
  code: string,
  message: string,
  detail?: string,
  remediation?: string,
  source?: ShipIssue['source'],
): ShipIssue {
  return {
    code,
    message,
    ...(detail ? { detail } : {}),
    ...(remediation ? { remediation } : {}),
    ...(source ? { source } : {}),
  }
}

function blockedCapability(detail: string, remediation: string): WorkspacePullRequestCapability {
  return {
    outcome: 'blocked',
    supported: false,
    summary: 'Pull request creation is currently blocked.',
    detail,
    remediation,
    issues: [createIssue('PR_BLOCKED', 'Pull request creation is currently blocked.', detail, remediation, 'git')],
  }
}

function linkedPullRequestFromCapability(capability: WorkspacePullRequestCapability): WorkspaceLinkedPullRequestSummary {
  const detail = capability.issues[0]?.detail ?? capability.detail ?? capability.summary
  const remediation = capability.issues[0]?.remediation ?? capability.remediation

  if (capability.outcome === 'failure') {
    return {
      outcome: 'failure',
      linked: false,
      summary: 'Linked pull request details failed to load.',
      ...(detail ? { detail } : {}),
      ...(remediation ? { remediation } : {}),
      issues: [...capability.issues],
    }
  }

  return degradedLinkedPullRequestSummary(
    'Linked pull request details are currently unavailable.',
    detail,
    remediation,
    capability.issues,
  )
}

function degradedLinkedPullRequestSummary(
  summary: string,
  detail: string | undefined,
  remediation: string | undefined,
  issues: ShipIssue[],
): WorkspaceLinkedPullRequestSummary {
  return {
    outcome: 'degraded',
    linked: false,
    summary,
    ...(detail ? { detail } : {}),
    ...(remediation ? { remediation } : {}),
    issues: [...issues],
  }
}

function failedLinkedPullRequestSummary(
  summary: string,
  detail: string,
  code: string,
): WorkspaceLinkedPullRequestSummary {
  return {
    outcome: 'failure',
    linked: false,
    summary,
    ...(detail ? { detail } : {}),
    issues: [createIssue(code, summary, detail, undefined, 'gh')],
  }
}

function missingLinkedPullRequestSummary(
  parsed: ParsedGitStatus,
  upstream: WorkspaceGitUpstreamState,
): WorkspaceLinkedPullRequestSummary {
  const branchLabel = parsed.branchName ?? 'the current branch'
  const upstreamLabel = upstream.ref ? ` tracking ${upstream.ref}` : ''
  const detail = `GitHub did not find a pull request linked to ${branchLabel}${upstreamLabel}.`
  const remediation = 'Create or link a GitHub pull request for the current branch, then refresh ship status.'

  return degradedLinkedPullRequestSummary(
    'No linked pull request was found for the current branch.',
    detail,
    remediation,
    [createIssue('LINKED_PR_NOT_FOUND', 'No linked pull request was found for the current branch.', detail, remediation, 'gh')],
  )
}

function parseLinkedPullRequestView(output: string): GitHubPullRequestView {
  const parsed = JSON.parse(output) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GitHub CLI returned an invalid linked pull request payload.')
  }
  return parsed as GitHubPullRequestView
}

function createLinkedPullRequestSummary(pr: GitHubPullRequestView): WorkspaceLinkedPullRequestSummary {
  const checks = summarizeLinkedPullRequestChecks(pr.statusCheckRollup)
  const review = summarizeLinkedPullRequestReview(pr.reviewDecision, pr.reviewRequests)

  return {
    outcome: 'success',
    linked: true,
    summary: describeLinkedPullRequest(pr),
    ...(typeof pr.number === 'number' ? { number: pr.number } : {}),
    ...(pr.title ? { title: pr.title } : {}),
    ...(pr.url ? { url: pr.url } : {}),
    ...(pr.state ? { state: pr.state } : {}),
    ...(typeof pr.isDraft === 'boolean' ? { isDraft: pr.isDraft } : {}),
    ...(pr.headRefName ? { headBranch: pr.headRefName } : {}),
    ...(pr.baseRefName ? { baseBranch: pr.baseRefName } : {}),
    checks,
    review,
    issues: [],
  }
}

function describeLinkedPullRequest(pr: GitHubPullRequestView): string {
  const numberLabel = typeof pr.number === 'number' ? ` #${pr.number}` : ''
  const normalizedState = normalizeUppercase(pr.state)

  if (pr.isDraft && normalizedState === 'OPEN') {
    return `Linked pull request${numberLabel} is open as a draft.`
  }
  if (normalizedState === 'MERGED') {
    return `Linked pull request${numberLabel} is merged.`
  }
  if (normalizedState === 'CLOSED') {
    return `Linked pull request${numberLabel} is closed.`
  }
  if (normalizedState === 'OPEN') {
    return `Linked pull request${numberLabel} is open.`
  }

  return `Linked pull request${numberLabel} details are available.`
}

function summarizeLinkedPullRequestChecks(statusCheckRollup: unknown): WorkspaceLinkedPullRequestChecksSummary {
  const checks = Array.isArray(statusCheckRollup)
    ? statusCheckRollup
        .map((entry) => normalizeLinkedPullRequestCheck(entry))
        .filter((entry): entry is NormalizedLinkedPullRequestCheck => Boolean(entry))
    : []

  const total = checks.length
  const passing = checks.filter((check) => check.status === 'passing').length
  const failingEntries = checks.filter((check) => check.status === 'failing')
  const failing = failingEntries.length
  const pending = checks.filter((check) => check.status === 'pending').length

  if (total === 0) {
    return {
      status: 'none',
      summary: 'No reported status checks.',
      total: 0,
      passing: 0,
      failing: 0,
      pending: 0,
      failingChecks: [],
    }
  }

  const summary = failing > 0
    ? `${failing} of ${total} ${pluralize('check', total)} failing${pending > 0 ? `, ${pending} pending` : ''}.`
    : pending > 0
      ? `${pending} of ${total} ${pluralize('check', total)} pending.`
      : `${passing} ${pluralize('check', passing)} passing.`

  return {
    status: failing > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing',
    summary,
    total,
    passing,
    failing,
    pending,
    failingChecks: failingEntries.map((check) => ({
      name: check.name,
      ...(check.summary ? { summary: check.summary } : {}),
      ...(check.detailsUrl ? { detailsUrl: check.detailsUrl } : {}),
    })),
  }
}

function normalizeLinkedPullRequestCheck(entry: unknown): NormalizedLinkedPullRequestCheck | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined
  }

  const candidate = entry as Record<string, unknown>
  const name = readString(candidate.name) ?? readString(candidate.context)
  if (!name) {
    return undefined
  }

  const status = resolveLinkedPullRequestCheckStatus(candidate)
  const summary = readString(candidate.description)
    ?? readString(candidate.conclusion)
    ?? readString(candidate.state)
    ?? readString(candidate.status)
  const detailsUrl = readString(candidate.detailsUrl) ?? readString(candidate.targetUrl)

  return {
    name,
    status,
    ...(summary ? { summary } : {}),
    ...(detailsUrl ? { detailsUrl } : {}),
  }
}

function resolveLinkedPullRequestCheckStatus(candidate: Record<string, unknown>): NormalizedLinkedPullRequestCheckStatus {
  const state = normalizeUppercase(candidate.state)
  if (state === 'ERROR' || state === 'FAILURE') {
    return 'failing'
  }
  if (state === 'PENDING' || state === 'EXPECTED') {
    return 'pending'
  }
  if (state === 'SUCCESS') {
    return 'passing'
  }

  const status = normalizeUppercase(candidate.status)
  if (status && status !== 'COMPLETED') {
    return 'pending'
  }

  const conclusion = normalizeUppercase(candidate.conclusion)
  if (!conclusion) {
    return status === 'COMPLETED' ? 'passing' : 'pending'
  }

  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') {
    return 'passing'
  }

  return 'failing'
}

function summarizeLinkedPullRequestReview(
  reviewDecision: unknown,
  reviewRequests: unknown,
): WorkspaceLinkedPullRequestSummary['review'] {
  const requestedReviewerCount = Array.isArray(reviewRequests) ? reviewRequests.length : 0
  const decision = normalizeUppercase(reviewDecision)

  if (decision === 'APPROVED') {
    return {
      status: 'approved',
      summary: appendRequestedReviewerSummary('Approved', requestedReviewerCount),
      requestedReviewerCount,
    }
  }

  if (decision === 'CHANGES_REQUESTED') {
    return {
      status: 'changes_requested',
      summary: appendRequestedReviewerSummary('Changes requested', requestedReviewerCount),
      requestedReviewerCount,
    }
  }

  if (decision === 'REVIEW_REQUIRED') {
    return {
      status: 'review_required',
      summary: appendRequestedReviewerSummary('Review required', requestedReviewerCount),
      requestedReviewerCount,
    }
  }

  if (requestedReviewerCount > 0) {
    return {
      status: 'review_required',
      summary: `Review requested from ${requestedReviewerCount} ${pluralize('reviewer', requestedReviewerCount)}.`,
      requestedReviewerCount,
    }
  }

  return {
    status: 'unknown',
    summary: 'Review status unavailable.',
    requestedReviewerCount,
  }
}

function appendRequestedReviewerSummary(base: string, requestedReviewerCount: number): string {
  if (requestedReviewerCount <= 0) {
    return base
  }
  return `${base}; ${requestedReviewerCount} ${pluralize('reviewer', requestedReviewerCount)} still requested.`
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function normalizeUppercase(value: unknown): string | undefined {
  const text = readString(value)
  return text ? text.trim().toUpperCase() : undefined
}

function isMissingLinkedPullRequestError(error: unknown): boolean {
  return hasExecOutput(error, 'no pull requests found')
    || hasExecOutput(error, 'no pull request found')
    || hasExecOutput(error, 'could not find pull request')
}

function degradedCapability(
  detail: string,
  moreDetail: string | undefined,
  remediation: string,
  code: string,
): WorkspacePullRequestCapability {
  return {
    outcome: 'degraded',
    supported: false,
    summary: 'Pull request creation is currently unavailable.',
    detail,
    remediation,
    issues: [createIssue(code, 'Pull request creation is currently unavailable.', moreDetail ?? detail, remediation, 'gh')],
  }
}

function failedCapability(summary: string, detail: string, code: string): WorkspacePullRequestCapability {
  return {
    outcome: 'failure',
    supported: false,
    summary: 'Pull request capability probe failed.',
    detail: summary,
    issues: [createIssue(code, 'Pull request capability probe failed.', detail || summary, undefined, 'gh')],
  }
}

function hasExecOutput(error: unknown, text: string): boolean {
  return getExecOutput(error).toLowerCase().includes(text.toLowerCase())
}

function getExecOutput(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }

  const candidate = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
  return [candidate.stdout, candidate.stderr, candidate.message]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

function isMissingCommandError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === 'ENOENT'
    || (typeof candidate.message === 'string' && candidate.message.includes('ENOENT'))
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown ship failure'
}
