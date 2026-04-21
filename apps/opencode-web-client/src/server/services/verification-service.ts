import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  BffEvent,
  NormalizedMessage,
  ResultAnnotation,
  TaskEntry,
  TaskEntryState,
  VerificationCommandKind,
  VerificationRun,
  VerificationRunStatus,
  WorkspaceTraceabilitySummary,
} from '../../shared/types.js'
import type { AppPaths } from './app-paths.js'
import type { EventBroker } from './event-broker.js'
import type { OpenCodeClientFactory, OpenCodeExecutionResult } from './opencode-client-factory.js'
import type { TaskLedgerService } from './task-ledger-service.js'

interface VerificationStateFile {
  version: 1
  runs: VerificationRun[]
}

interface VerificationProjection {
  sessionId: string
  sourceMessageId: string
  taskEntry: TaskEntry
  resultAnnotation: ResultAnnotation
}

export interface VerificationServiceOptions {
  now?: () => Date
  randomId?: () => string
  taskLedgerService?: Pick<TaskLedgerService, 'upsertRuntimeRecord'>
}

const RUN_STATE_VERSION = 1
const VERIFY_KIND_ORDER: VerificationCommandKind[] = ['lint', 'build', 'test']

export class VerificationService {
  private stateDir: string
  private clientFactory: Pick<OpenCodeClientFactory, 'forWorkspace'>
  private eventBroker?: Pick<EventBroker, 'broadcast'>
  private taskLedgerService?: Pick<TaskLedgerService, 'upsertRuntimeRecord'>
  private now: () => Date
  private randomId: () => string

  constructor(
    appPaths: Pick<AppPaths, 'stateDir'>,
    clientFactory: Pick<OpenCodeClientFactory, 'forWorkspace'>,
    eventBroker?: Pick<EventBroker, 'broadcast'>,
    options: VerificationServiceOptions = {},
  ) {
    this.stateDir = appPaths.stateDir
    this.clientFactory = clientFactory
    this.eventBroker = eventBroker
    this.taskLedgerService = options.taskLedgerService
    this.now = options.now ?? (() => new Date())
    this.randomId = options.randomId ?? (() => randomUUID())
  }

  listRuns(workspaceId: string): VerificationRun[] {
    return sortRuns(this.readState(workspaceId).runs)
  }

  getWorkspaceSummary(workspaceId: string): {
    runs: VerificationRun[]
    traceability: WorkspaceTraceabilitySummary
  } {
    const runs = this.listRuns(workspaceId)
    return {
      runs,
      traceability: buildWorkspaceTraceability(runs).traceability,
    }
  }

  decorateMessages(workspaceId: string, sessionId: string, messages: NormalizedMessage[]): NormalizedMessage[] {
    const { projections } = buildWorkspaceTraceability(this.listRuns(workspaceId))
    const projectionMap = new Map(
      projections
        .filter((projection) => projection.sessionId === sessionId)
        .map((projection) => [projection.sourceMessageId, projection]),
    )

    return messages.map((message) => {
      const sourceMessageId = message.resultAnnotation?.sourceMessageId
        ?? message.taskEntry?.sourceMessageId
        ?? message.trace?.sourceMessageId
        ?? message.id
      const projection = projectionMap.get(sourceMessageId)
      if (!projection) {
        return message
      }
      return applyProjectionToMessage(message, projection)
    })
  }

  async runPreset(args: {
    workspaceId: string
    workspaceRoot: string
    sessionId: string
    commandKind: VerificationCommandKind
    sourceMessageId?: string
    taskId?: string
  }): Promise<VerificationRun> {
    const startedAt = this.now().toISOString()
    const linkedTaskId = args.taskId ?? deriveStableTaskId(args.sourceMessageId) ?? `verify-${this.randomId()}`
    const command = resolvePresetCommand(args.workspaceRoot, args.commandKind)

    const initialRun: VerificationRun = {
      id: `verify-${this.randomId()}`,
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
      taskId: linkedTaskId,
      commandKind: args.commandKind,
      status: 'running',
      startedAt,
      summary: `Running ${args.commandKind} verification.`,
    }

    let runs = this.persistRun(initialRun)
    this.emitRunUpdate(args.workspaceId, initialRun, runs)

    try {
      const client = this.clientFactory.forWorkspace(args.workspaceId)
      const execution = await client.shell(args.sessionId, command)
      const finishedRun = this.completeRun(initialRun, execution, args.sourceMessageId)
      runs = this.persistRun(finishedRun)
      this.emitRunUpdate(args.workspaceId, finishedRun, runs)
      return finishedRun
    } catch (error) {
      const failedRun = this.failRun(initialRun, error, args.sourceMessageId)
      runs = this.persistRun(failedRun)
      this.emitRunUpdate(args.workspaceId, failedRun, runs)
      return failedRun
    }
  }

  private completeRun(
    initialRun: VerificationRun,
    execution: OpenCodeExecutionResult,
    requestedSourceMessageId?: string,
  ): VerificationRun {
    const status = resolveExecutionStatus(execution)
    const summary = resolveExecutionSummary(initialRun.commandKind, status, execution)
    const finishedAt = this.now().toISOString()
    const sourceMessageId = requestedSourceMessageId ?? execution.messageId
    const taskId = requestedSourceMessageId
      ? initialRun.taskId
      : execution.taskId ?? initialRun.taskId
    const terminalLogRef = this.writeTerminalLog(initialRun.workspaceId, initialRun.id, {
      commandKind: initialRun.commandKind,
      summary,
      startedAt: initialRun.startedAt,
      finishedAt,
      execution,
    })

    return {
      ...initialRun,
      ...(sourceMessageId ? { sourceMessageId } : {}),
      taskId,
      status,
      finishedAt,
      summary,
      ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
      terminalLogRef,
    }
  }

  private failRun(initialRun: VerificationRun, error: unknown, requestedSourceMessageId?: string): VerificationRun {
    const summary = resolveFailureSummary(initialRun.commandKind, error)
    const finishedAt = this.now().toISOString()
    const terminalLogRef = this.writeTerminalLog(initialRun.workspaceId, initialRun.id, {
      commandKind: initialRun.commandKind,
      summary,
      startedAt: initialRun.startedAt,
      finishedAt,
      error,
    })

    return {
      ...initialRun,
      ...(requestedSourceMessageId ? { sourceMessageId: requestedSourceMessageId } : {}),
      status: isAbortLikeError(error) ? 'cancelled' : 'failed',
      finishedAt,
      summary,
      terminalLogRef,
    }
  }

  private emitRunUpdate(workspaceId: string, run: VerificationRun, runs: VerificationRun[]): void {
    const projection = buildWorkspaceTraceability(runs).projections.find((entry) => {
      return entry.sessionId === run.sessionId && entry.sourceMessageId === run.sourceMessageId
    })

    const timestamp = this.now().toISOString()
    this.taskLedgerService?.upsertRuntimeRecord({
      workspaceId,
      taskId: run.taskId,
      sessionId: projection?.sessionId ?? run.sessionId,
      sourceMessageId: projection?.sourceMessageId ?? run.sourceMessageId,
      title: projection?.taskEntry.title,
      summary: projection?.taskEntry.latestSummary ?? run.summary,
      state: projection?.taskEntry.state ?? mapRunStatusToTaskState(run.status),
      createdAt: run.startedAt,
      updatedAt: timestamp,
      ...(run.finishedAt ? { completedAt: run.finishedAt } : {}),
      ...(projection?.resultAnnotation ? { resultAnnotation: projection.resultAnnotation } : {}),
      recentVerificationRef: {
        runId: run.id,
        commandKind: run.commandKind,
        status: run.status,
        ...(run.summary ? { summary: run.summary } : {}),
        ...(run.terminalLogRef ? { terminalLogRef: run.terminalLogRef } : {}),
      },
    })

    if (!this.eventBroker) return

    const event: BffEvent = {
      type: 'verification.updated',
      timestamp,
      payload: {
        workspaceId,
        run,
        ...(projection
          ? {
              sessionId: projection.sessionId,
              sourceMessageId: projection.sourceMessageId,
              taskEntry: projection.taskEntry,
              resultAnnotation: projection.resultAnnotation,
            }
          : {}),
      },
    }

    this.eventBroker.broadcast(workspaceId, event)
  }

  private persistRun(run: VerificationRun): VerificationRun[] {
    const state = this.readState(run.workspaceId)
    const existingIndex = state.runs.findIndex((entry) => entry.id === run.id)
    const nextRuns = [...state.runs]

    if (existingIndex >= 0) {
      nextRuns[existingIndex] = run
    } else {
      nextRuns.unshift(run)
    }

    this.writeState(run.workspaceId, nextRuns)
    return sortRuns(nextRuns)
  }

  private readState(workspaceId: string): VerificationStateFile {
    const filePath = this.getStateFilePath(workspaceId)
    if (!existsSync(filePath)) {
      return { version: RUN_STATE_VERSION, runs: [] }
    }

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as VerificationStateFile
      if (parsed.version !== RUN_STATE_VERSION || !Array.isArray(parsed.runs)) {
        return { version: RUN_STATE_VERSION, runs: [] }
      }
      return {
        version: RUN_STATE_VERSION,
        runs: parsed.runs.filter(isVerificationRun),
      }
    } catch {
      return { version: RUN_STATE_VERSION, runs: [] }
    }
  }

  private writeState(workspaceId: string, runs: VerificationRun[]): void {
    const filePath = this.getStateFilePath(workspaceId)
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(tmpPath, JSON.stringify({ version: RUN_STATE_VERSION, runs: sortRuns(runs) }, null, 2), 'utf-8')
    renameSync(tmpPath, filePath)
  }

  private getStateFilePath(workspaceId: string): string {
    return path.join(this.stateDir, 'verification', `${workspaceId}.json`)
  }

  private writeTerminalLog(
    workspaceId: string,
    runId: string,
    payload: {
      commandKind: VerificationCommandKind
      summary: string
      startedAt: string
      finishedAt: string
      execution?: OpenCodeExecutionResult
      error?: unknown
    },
  ): string {
    const logDir = path.join(this.stateDir, 'verification-logs', workspaceId)
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

    const logPath = path.join(logDir, `${runId}.log`)
    const lines = [
      `commandKind: ${payload.commandKind}`,
      `summary: ${payload.summary}`,
      `startedAt: ${payload.startedAt}`,
      `finishedAt: ${payload.finishedAt}`,
    ]

    if (payload.execution?.status) lines.push(`status: ${payload.execution.status}`)
    if (payload.execution?.exitCode !== undefined) lines.push(`exitCode: ${payload.execution.exitCode}`)
    if (payload.execution?.stdout) lines.push('', 'stdout:', payload.execution.stdout)
    if (payload.execution?.stderr) lines.push('', 'stderr:', payload.execution.stderr)
    if (payload.execution?.terminalLogRef) lines.push('', `upstreamTerminalLogRef: ${payload.execution.terminalLogRef}`)
    if (payload.execution?.raw !== undefined) {
      lines.push('', 'raw:')
      lines.push(formatUnknown(payload.execution.raw))
    }
    if (payload.error !== undefined) {
      lines.push('', 'error:')
      lines.push(formatUnknown(payload.error))
    }

    writeFileSync(logPath, lines.join('\n'), 'utf-8')
    return path.relative(this.stateDir, logPath)
  }
}

function buildWorkspaceTraceability(runs: VerificationRun[]): {
  traceability: WorkspaceTraceabilitySummary
  projections: VerificationProjection[]
} {
  const grouped = new Map<string, VerificationRun[]>()

  for (const run of sortRuns(runs)) {
    if (!run.sessionId || !run.sourceMessageId) continue
    const key = `${run.sessionId}::${run.sourceMessageId}`
    const bucket = grouped.get(key) ?? []
    bucket.push(run)
    grouped.set(key, bucket)
  }

  const projections = Array.from(grouped.values()).map(buildProjectionFromRuns)
  return {
    traceability: {
      taskEntries: projections.map((projection) => projection.taskEntry),
      resultAnnotations: projections.map((projection) => projection.resultAnnotation),
    },
    projections,
  }
}

function buildProjectionFromRuns(runs: VerificationRun[]): VerificationProjection {
  const latestByKind = new Map<VerificationCommandKind, VerificationRun>()
  for (const run of sortRuns(runs)) {
    if (!latestByKind.has(run.commandKind)) {
      latestByKind.set(run.commandKind, run)
    }
  }

  const selectedRuns = VERIFY_KIND_ORDER
    .map((kind) => latestByKind.get(kind))
    .filter((run): run is VerificationRun => !!run)
  const latestRun = sortRuns(selectedRuns)[0] ?? sortRuns(runs)[0]!
  const hasPassed = selectedRuns.some((run) => run.status === 'passed')
  const verification = selectedRuns.every((run) => run.status === 'passed')
    ? 'verified'
    : hasPassed
      ? 'partially verified'
      : 'unverified'

  return {
    sessionId: latestRun.sessionId!,
    sourceMessageId: latestRun.sourceMessageId!,
    taskEntry: {
      taskId: latestRun.taskId,
      workspaceId: latestRun.workspaceId,
      sessionId: latestRun.sessionId,
      sourceMessageId: latestRun.sourceMessageId,
      title: selectedRuns.length === 1
        ? `${capitalize(selectedRuns[0].commandKind)} verification`
        : 'Verification',
      state: deriveTaskState(selectedRuns),
      latestSummary: buildProjectionSummary(selectedRuns),
    },
    resultAnnotation: {
      sourceMessageId: latestRun.sourceMessageId!,
      workspaceId: latestRun.workspaceId,
      sessionId: latestRun.sessionId!,
      taskId: latestRun.taskId,
      verification,
      summary: buildProjectionSummary(selectedRuns),
    },
  }
}

function applyProjectionToMessage(message: NormalizedMessage, projection: VerificationProjection): NormalizedMessage {
  const existingTaskEntry = message.taskEntry
  const existingAnnotation = message.resultAnnotation
  const taskId = existingTaskEntry?.taskId
    ?? existingAnnotation?.taskId
    ?? message.trace?.taskId
    ?? projection.taskEntry.taskId

  return {
    ...message,
    trace: {
      sourceMessageId: message.trace?.sourceMessageId ?? projection.sourceMessageId,
      workspaceId: message.trace?.workspaceId ?? projection.taskEntry.workspaceId,
      sessionId: message.trace?.sessionId ?? projection.sessionId,
      ...(taskId ? { taskId } : {}),
    },
    taskEntry: {
      taskId,
      workspaceId: projection.taskEntry.workspaceId,
      sessionId: projection.sessionId,
      sourceMessageId: projection.sourceMessageId,
      title: existingTaskEntry?.title ?? projection.taskEntry.title,
      state: existingTaskEntry?.state ?? projection.taskEntry.state,
      latestSummary: projection.taskEntry.latestSummary ?? existingTaskEntry?.latestSummary,
    },
    resultAnnotation: {
      sourceMessageId: existingAnnotation?.sourceMessageId ?? projection.sourceMessageId,
      workspaceId: projection.resultAnnotation.workspaceId,
      sessionId: projection.sessionId,
      verification: projection.resultAnnotation.verification,
      ...(taskId ? { taskId } : {}),
      ...(projection.resultAnnotation.summary ? { summary: projection.resultAnnotation.summary } : {}),
      ...(existingAnnotation?.reviewState ? { reviewState: existingAnnotation.reviewState } : {}),
      ...(existingAnnotation?.shipState ? { shipState: existingAnnotation.shipState } : {}),
    },
  }
}

function deriveTaskState(runs: VerificationRun[]): TaskEntryState {
  if (runs.some((run) => run.status === 'running')) return 'running'
  if (runs.some((run) => run.status === 'failed')) return 'failed'
  if (runs.some((run) => run.status === 'cancelled') && !runs.some((run) => run.status === 'passed')) {
    return 'cancelled'
  }
  if (runs.some((run) => run.status === 'passed')) return 'completed'
  return 'queued'
}

function mapRunStatusToTaskState(status: VerificationRunStatus): TaskEntryState {
  switch (status) {
    case 'running':
      return 'running'
    case 'passed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
  }
}

function buildProjectionSummary(runs: VerificationRun[]): string {
  if (runs.length === 1) {
    return runs[0].summary
  }

  return runs
    .map((run) => `${run.commandKind} ${formatRunStatus(run)}`)
    .join(' · ')
}

function formatRunStatus(run: VerificationRun): string {
  if (run.status === 'passed') return 'passed'
  if (run.status === 'running') return 'running'
  if (run.status === 'cancelled') return 'cancelled'
  return run.exitCode !== undefined ? `failed (exit ${run.exitCode})` : 'failed'
}

function resolveExecutionStatus(execution: OpenCodeExecutionResult): VerificationRunStatus {
  const normalizedStatus = execution.status?.trim().toLowerCase()
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedStatus === 'aborted') {
    return 'cancelled'
  }
  if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'errored') {
    return 'failed'
  }
  if (normalizedStatus === 'running' || normalizedStatus === 'pending' || normalizedStatus === 'queued') {
    return 'running'
  }
  if (execution.exitCode !== undefined) {
    return execution.exitCode === 0 ? 'passed' : 'failed'
  }
  return 'passed'
}

function resolveExecutionSummary(
  commandKind: VerificationCommandKind,
  status: VerificationRunStatus,
  execution: OpenCodeExecutionResult,
): string {
  if (execution.summary) {
    return execution.summary
  }
  if (status === 'running') {
    return `Running ${commandKind} verification.`
  }
  if (status === 'cancelled') {
    return `${capitalize(commandKind)} verification cancelled.`
  }
  if (status === 'passed') {
    return `${capitalize(commandKind)} verification passed.`
  }
  return execution.exitCode !== undefined
    ? `${capitalize(commandKind)} verification failed with exit code ${execution.exitCode}.`
    : `${capitalize(commandKind)} verification failed.`
}

function resolveFailureSummary(commandKind: VerificationCommandKind, error: unknown): string {
  const base = isAbortLikeError(error)
    ? `${capitalize(commandKind)} verification cancelled.`
    : `${capitalize(commandKind)} verification failed.`
  const detail = toErrorMessage(error)
  return detail ? `${base} ${detail}` : base
}

function resolvePresetCommand(workspaceRoot: string, commandKind: VerificationCommandKind): string {
  const packageJson = readPackageJson(workspaceRoot)
  const packageManager = resolvePackageManager(workspaceRoot, packageJson)

  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${commandKind}`
    case 'yarn':
      return `yarn run ${commandKind}`
    case 'bun':
      return `bun run ${commandKind}`
    default:
      return `npm run ${commandKind}`
  }
}

function readPackageJson(workspaceRoot: string): Record<string, unknown> | null {
  const packageJsonPath = path.join(workspaceRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const raw = readFileSync(packageJsonPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function resolvePackageManager(
  workspaceRoot: string,
  packageJson: Record<string, unknown> | null,
): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  const declared = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager.split('@')[0]?.trim().toLowerCase()
    : ''

  if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') {
    return declared
  }
  if (existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(workspaceRoot, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(workspaceRoot, 'bun.lock')) || existsSync(path.join(workspaceRoot, 'bun.lockb'))) {
    return 'bun'
  }
  return 'npm'
}

function deriveStableTaskId(sourceMessageId?: string): string | undefined {
  if (!sourceMessageId) return undefined
  const hash = createHash('sha256').update(sourceMessageId).digest('hex').slice(0, 12)
  return `verify-${hash}`
}

function sortRuns(runs: VerificationRun[]): VerificationRun[] {
  return [...runs].sort((left, right) => {
    const delta = new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
    if (delta !== 0) return delta
    return right.id.localeCompare(left.id)
  })
}

function isVerificationRun(value: unknown): value is VerificationRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<VerificationRun>
  return typeof candidate.id === 'string'
    && typeof candidate.workspaceId === 'string'
    && typeof candidate.taskId === 'string'
    && typeof candidate.commandKind === 'string'
    && typeof candidate.status === 'string'
    && typeof candidate.startedAt === 'string'
    && typeof candidate.summary === 'string'
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return undefined
}

function isAbortLikeError(error: unknown): boolean {
  const message = toErrorMessage(error)?.toLowerCase() ?? ''
  return message.includes('abort') || message.includes('cancel')
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
