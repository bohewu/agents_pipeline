import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  BffEvent,
  BrowserEvidenceRecord,
  BrowserEvidenceReference,
  LaneAttribution,
  NormalizedMessage,
  PreviewRuntimeCaptureResult,
  PreviewRuntimeConsoleCaptureMetadata,
  PreviewRuntimeScreenshotMetadata,
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
import { applyLaneAttributionToMessage, attachLaneAttribution, mergeLaneAttribution, resolveLaneId, validateLaneAttributionRecord } from './lane-attribution.js'

interface VerificationStateFile {
  version: 1
  runs: VerificationRun[]
  browserEvidenceRecords: BrowserEvidenceRecord[]
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
  resolveSessionLane?: (workspaceId: string, sessionId: string) => LaneAttribution | undefined
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
  private resolveSessionLane?: (workspaceId: string, sessionId: string) => LaneAttribution | undefined

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
    this.resolveSessionLane = options.resolveSessionLane
  }

  listRuns(workspaceId: string): VerificationRun[] {
    return sortRuns(this.readState(workspaceId).runs)
  }

  listBrowserEvidence(workspaceId: string): BrowserEvidenceRecord[] {
    return sortBrowserEvidenceRecords(this.readState(workspaceId).browserEvidenceRecords)
  }

  getWorkspaceSummary(workspaceId: string): {
    runs: VerificationRun[]
    browserEvidenceRecords: BrowserEvidenceRecord[]
    traceability: WorkspaceTraceabilitySummary
  } {
    const state = this.readState(workspaceId)
    const runs = sortRuns(state.runs)
    const browserEvidenceRecords = sortBrowserEvidenceRecords(state.browserEvidenceRecords)
    return {
      runs,
      browserEvidenceRecords,
      traceability: buildWorkspaceTraceability(runs, browserEvidenceRecords).traceability,
    }
  }

  decorateMessages(workspaceId: string, sessionId: string, messages: NormalizedMessage[]): NormalizedMessage[] {
    const state = this.readState(workspaceId)
    const runs = sortRuns(state.runs)
    const browserEvidenceRecords = sortBrowserEvidenceRecords(state.browserEvidenceRecords)
    const { projections } = buildWorkspaceTraceability(runs, browserEvidenceRecords)
    const projectionMap = new Map(
      projections
        .filter((projection) => projection.sessionId === sessionId)
        .map((projection) => [buildTraceabilityKey(projection.sessionId, projection.sourceMessageId, projection.taskEntry), projection]),
    )
    const browserEvidenceMap = new Map(
      Array.from(selectLatestBrowserEvidenceByMessage(browserEvidenceRecords).entries())
        .filter(([, record]) => record.sessionId === sessionId)
    )

    return messages.map((message) => {
      const sessionLane = this.resolveSessionLane?.(workspaceId, sessionId)
      const sourceMessageId = message.resultAnnotation?.sourceMessageId
        ?? message.taskEntry?.sourceMessageId
        ?? message.trace?.sourceMessageId
        ?? message.id
      const key = buildTraceabilityKey(
        sessionId,
        sourceMessageId,
        mergeLaneAttribution(message.trace, message.taskEntry, message.resultAnnotation, sessionLane),
      )
      const projection = projectionMap.get(key)
      const browserEvidenceRecord = browserEvidenceMap.get(key)

      let nextMessage = projection
        ? applyProjectionToMessage(message, projection)
        : message

      if (browserEvidenceRecord) {
        nextMessage = applyBrowserEvidenceToMessage(nextMessage, browserEvidenceRecord, {
          workspaceId,
          sessionId,
          sourceMessageId,
        })
      }

      return applyLaneAttributionToMessage(nextMessage, sessionLane)
    })
  }

  recordBrowserEvidence(args: {
    workspaceId: string
    sessionId?: string
    sourceMessageId?: string
    taskId?: string
    laneId?: string
    laneContext?: BrowserEvidenceRecord['laneContext']
    captureResult: PreviewRuntimeCaptureResult
  }): BrowserEvidenceRecord {
    if (args.captureResult.outcome !== 'captured' || !args.captureResult.previewUrl) {
      throw new Error('Captured preview runtime evidence is required for persistence.')
    }

    const capturedAt = args.captureResult.consoleCapture?.capturedAt
      ?? args.captureResult.screenshot?.capturedAt
      ?? this.now().toISOString()
    const lane = mergeLaneAttribution(
      args,
      args.sessionId ? this.resolveSessionLane?.(args.workspaceId, args.sessionId) : undefined,
    )
    const record: BrowserEvidenceRecord = attachLaneAttribution({
      id: `browser-evidence-${this.randomId()}`,
      workspaceId: args.workspaceId,
      capturedAt,
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
      ...(args.taskId ? { taskId: args.taskId } : {}),
      summary: buildBrowserEvidenceSummary(args.captureResult.previewUrl),
      previewUrl: args.captureResult.previewUrl,
      ...(args.captureResult.consoleCapture ? { consoleCapture: args.captureResult.consoleCapture } : {}),
      ...(args.captureResult.screenshot ? { screenshot: args.captureResult.screenshot } : {}),
    }, lane)

    this.persistBrowserEvidenceRecord(record)

    if (record.taskId) {
      this.taskLedgerService?.upsertRuntimeRecord({
        workspaceId: args.workspaceId,
        taskId: record.taskId,
        updatedAt: capturedAt,
        ...(record.sessionId ? { sessionId: record.sessionId } : {}),
        ...(record.sourceMessageId ? { sourceMessageId: record.sourceMessageId } : {}),
        ...(record.laneId ? { laneId: record.laneId } : {}),
        ...(record.laneContext ? { laneContext: record.laneContext } : {}),
        recentBrowserEvidenceRef: toBrowserEvidenceReference(record),
      })
    }

    return record
  }

  async runPreset(args: {
    workspaceId: string
    workspaceRoot: string
    sessionId: string
    commandKind: VerificationCommandKind
    sourceMessageId?: string
    taskId?: string
    laneId?: string
    laneContext?: VerificationRun['laneContext']
  }): Promise<VerificationRun> {
    const startedAt = this.now().toISOString()
    const linkedTaskId = args.taskId ?? deriveStableTaskId(args.sourceMessageId) ?? `verify-${this.randomId()}`
    const command = resolvePresetCommand(args.workspaceRoot, args.commandKind)
    const lane = mergeLaneAttribution(
      args,
      this.resolveSessionLane?.(args.workspaceId, args.sessionId),
    )

    const initialRun: VerificationRun = attachLaneAttribution({
      id: `verify-${this.randomId()}`,
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
      taskId: linkedTaskId,
      commandKind: args.commandKind,
      status: 'running',
      startedAt,
      summary: `Running ${args.commandKind} verification.`,
    }, lane)

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
    const projection = buildWorkspaceTraceability(runs, this.listBrowserEvidence(workspaceId)).projections.find((entry) => {
      return entry.sessionId === run.sessionId
        && entry.sourceMessageId === run.sourceMessageId
        && resolveLaneId(entry.taskEntry) === resolveLaneId(run)
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
      ...(projection?.taskEntry.laneId ?? run.laneId ? { laneId: projection?.taskEntry.laneId ?? run.laneId } : {}),
      ...(projection?.taskEntry.laneContext ?? run.laneContext ? { laneContext: projection?.taskEntry.laneContext ?? run.laneContext } : {}),
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

    this.writeState(run.workspaceId, nextRuns, state.browserEvidenceRecords)
    return sortRuns(nextRuns)
  }

  private persistBrowserEvidenceRecord(record: BrowserEvidenceRecord): BrowserEvidenceRecord[] {
    const state = this.readState(record.workspaceId)
    const existingIndex = state.browserEvidenceRecords.findIndex((entry) => entry.id === record.id)
    const nextRecords = [...state.browserEvidenceRecords]

    if (existingIndex >= 0) {
      nextRecords[existingIndex] = record
    } else {
      nextRecords.unshift(record)
    }

    this.writeState(record.workspaceId, state.runs, nextRecords)
    return sortBrowserEvidenceRecords(nextRecords)
  }

  private readState(workspaceId: string): VerificationStateFile {
    const filePath = this.getStateFilePath(workspaceId)
    if (!existsSync(filePath)) {
      return { version: RUN_STATE_VERSION, runs: [], browserEvidenceRecords: [] }
    }

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<VerificationStateFile>
      if (parsed.version !== RUN_STATE_VERSION || !Array.isArray(parsed.runs)) {
        return { version: RUN_STATE_VERSION, runs: [], browserEvidenceRecords: [] }
      }
      return {
        version: RUN_STATE_VERSION,
        runs: parsed.runs.flatMap((run) => {
          try {
            return [validateVerificationRun(run, workspaceId)]
          } catch {
            return []
          }
        }),
        browserEvidenceRecords: Array.isArray(parsed.browserEvidenceRecords)
          ? parsed.browserEvidenceRecords.flatMap((record) => {
              try {
                return [validateBrowserEvidenceRecord(record, workspaceId)]
              } catch {
                return []
              }
            })
          : [],
      }
    } catch {
      return { version: RUN_STATE_VERSION, runs: [], browserEvidenceRecords: [] }
    }
  }

  private writeState(workspaceId: string, runs: VerificationRun[], browserEvidenceRecords: BrowserEvidenceRecord[]): void {
    const filePath = this.getStateFilePath(workspaceId)
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(
      tmpPath,
      JSON.stringify({
        version: RUN_STATE_VERSION,
        runs: sortRuns(runs),
        browserEvidenceRecords: sortBrowserEvidenceRecords(browserEvidenceRecords),
      }, null, 2),
      'utf-8',
    )
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

function buildWorkspaceTraceability(runs: VerificationRun[], browserEvidenceRecords: BrowserEvidenceRecord[]): {
  traceability: WorkspaceTraceabilitySummary
  projections: VerificationProjection[]
} {
  const grouped = new Map<string, VerificationRun[]>()

  for (const run of sortRuns(runs)) {
    if (!run.sessionId || !run.sourceMessageId) continue
    const key = buildTraceabilityKey(run.sessionId, run.sourceMessageId, run)
    const bucket = grouped.get(key) ?? []
    bucket.push(run)
    grouped.set(key, bucket)
  }

  const projections = Array.from(grouped.values()).map(buildProjectionFromRuns)
  return {
    traceability: {
      taskEntries: projections.map((projection) => projection.taskEntry),
      resultAnnotations: mergeBrowserEvidenceIntoResultAnnotations(
        projections.map((projection) => projection.resultAnnotation),
        browserEvidenceRecords,
      ),
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

  const lane = mergeLaneAttribution(...selectedRuns)

  return {
    sessionId: latestRun.sessionId!,
    sourceMessageId: latestRun.sourceMessageId!,
    taskEntry: attachLaneAttribution({
      taskId: latestRun.taskId,
      workspaceId: latestRun.workspaceId,
      sessionId: latestRun.sessionId,
      sourceMessageId: latestRun.sourceMessageId,
      title: selectedRuns.length === 1
        ? `${capitalize(selectedRuns[0].commandKind)} verification`
        : 'Verification',
      state: deriveTaskState(selectedRuns),
      latestSummary: buildProjectionSummary(selectedRuns),
    }, lane),
    resultAnnotation: attachLaneAttribution({
      sourceMessageId: latestRun.sourceMessageId!,
      workspaceId: latestRun.workspaceId,
      sessionId: latestRun.sessionId!,
      taskId: latestRun.taskId,
      verification,
      summary: buildProjectionSummary(selectedRuns),
    }, lane),
  }
}

function applyProjectionToMessage(message: NormalizedMessage, projection: VerificationProjection): NormalizedMessage {
  const existingTaskEntry = message.taskEntry
  const existingAnnotation = message.resultAnnotation
  const taskId = existingTaskEntry?.taskId
    ?? existingAnnotation?.taskId
    ?? message.trace?.taskId
    ?? projection.taskEntry.taskId

  return applyLaneAttributionToMessage({
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
  }, mergeLaneAttribution(projection.taskEntry, projection.resultAnnotation))
}

function applyBrowserEvidenceToMessage(
  message: NormalizedMessage,
  record: BrowserEvidenceRecord,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string },
): NormalizedMessage {
  const taskId = message.resultAnnotation?.taskId
    ?? message.taskEntry?.taskId
    ?? message.trace?.taskId
    ?? record.taskId
  return applyLaneAttributionToMessage({
    ...message,
    trace: {
      sourceMessageId: message.trace?.sourceMessageId ?? context.sourceMessageId,
      workspaceId: message.trace?.workspaceId ?? context.workspaceId,
      sessionId: message.trace?.sessionId ?? context.sessionId,
      ...(taskId ? { taskId } : {}),
    },
    resultAnnotation: mergeBrowserEvidenceIntoResultAnnotation(message.resultAnnotation, record, {
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      sourceMessageId: context.sourceMessageId,
      taskId,
    }),
  }, record)
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

function buildTraceabilityKey(sessionId: string, sourceMessageId: string, lane: LaneAttribution | undefined): string {
  return `${sessionId}::${resolveLaneId(lane) ?? '__default__'}::${sourceMessageId}`
}

function sortRuns(runs: VerificationRun[]): VerificationRun[] {
  return [...runs].sort((left, right) => {
    const delta = new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
    if (delta !== 0) return delta
    return right.id.localeCompare(left.id)
  })
}

function sortBrowserEvidenceRecords(records: BrowserEvidenceRecord[]): BrowserEvidenceRecord[] {
  return [...records].sort((left, right) => {
    if (left.capturedAt !== right.capturedAt) {
      return left.capturedAt > right.capturedAt ? -1 : 1
    }
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

function validateVerificationRun(value: unknown, workspaceId: string): VerificationRun {
  if (!isVerificationRun(value)) {
    throw new Error('Verification run must be an object.')
  }

  const candidate = value as unknown as Record<string, unknown>
  const recordWorkspaceId = readString(candidate.workspaceId, 'verificationRun.workspaceId')
  if (recordWorkspaceId !== workspaceId) {
    throw new Error('Verification run workspace mismatch.')
  }

  const lane = validateLaneAttributionRecord(candidate, 'verificationRun')

  return attachLaneAttribution({
    id: readString(candidate.id, 'verificationRun.id'),
    workspaceId: recordWorkspaceId,
    ...(candidate.sessionId !== undefined ? { sessionId: readString(candidate.sessionId, 'verificationRun.sessionId') } : {}),
    ...(candidate.sourceMessageId !== undefined ? { sourceMessageId: readString(candidate.sourceMessageId, 'verificationRun.sourceMessageId') } : {}),
    taskId: readString(candidate.taskId, 'verificationRun.taskId'),
    commandKind: readString(candidate.commandKind, 'verificationRun.commandKind') as VerificationRun['commandKind'],
    status: readString(candidate.status, 'verificationRun.status') as VerificationRun['status'],
    startedAt: readString(candidate.startedAt, 'verificationRun.startedAt'),
    ...(candidate.finishedAt !== undefined ? { finishedAt: readString(candidate.finishedAt, 'verificationRun.finishedAt') } : {}),
    summary: readString(candidate.summary, 'verificationRun.summary'),
    ...(candidate.exitCode !== undefined ? { exitCode: readNumber(candidate.exitCode, 'verificationRun.exitCode') } : {}),
    ...(candidate.terminalLogRef !== undefined ? { terminalLogRef: readString(candidate.terminalLogRef, 'verificationRun.terminalLogRef') } : {}),
  }, lane)
}

function validateBrowserEvidenceRecord(value: unknown, workspaceId: string): BrowserEvidenceRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Browser evidence record must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const recordWorkspaceId = readString(candidate.workspaceId, 'browserEvidenceRecord.workspaceId')
  if (recordWorkspaceId !== workspaceId) {
    throw new Error('Browser evidence record workspace mismatch.')
  }

  const summary = readString(candidate.summary, 'browserEvidenceRecord.summary')
  const lane = validateLaneAttributionRecord(candidate, 'browserEvidenceRecord')
  const consoleCapture = candidate.consoleCapture === undefined
    ? undefined
    : validateConsoleCaptureMetadata(candidate.consoleCapture, 'browserEvidenceRecord.consoleCapture')
  const screenshot = candidate.screenshot === undefined
    ? undefined
    : validateScreenshotMetadata(candidate.screenshot, 'browserEvidenceRecord.screenshot')

  return attachLaneAttribution({
    id: readString(candidate.id, 'browserEvidenceRecord.id'),
    workspaceId: recordWorkspaceId,
    capturedAt: readString(candidate.capturedAt, 'browserEvidenceRecord.capturedAt'),
    ...(candidate.sessionId !== undefined ? { sessionId: readString(candidate.sessionId, 'browserEvidenceRecord.sessionId') } : {}),
    ...(candidate.sourceMessageId !== undefined ? { sourceMessageId: readString(candidate.sourceMessageId, 'browserEvidenceRecord.sourceMessageId') } : {}),
    ...(candidate.taskId !== undefined ? { taskId: readString(candidate.taskId, 'browserEvidenceRecord.taskId') } : {}),
    summary,
    previewUrl: readString(candidate.previewUrl, 'browserEvidenceRecord.previewUrl'),
    ...(consoleCapture ? { consoleCapture } : {}),
    ...(screenshot ? { screenshot } : {}),
  }, lane)
}

function mergeBrowserEvidenceIntoResultAnnotations(
  annotations: ResultAnnotation[],
  browserEvidenceRecords: BrowserEvidenceRecord[],
): ResultAnnotation[] {
  const merged = new Map<string, ResultAnnotation>()

  for (const annotation of annotations) {
    merged.set(buildTraceabilityKey(annotation.sessionId, annotation.sourceMessageId, annotation), annotation)
  }

  for (const [key, record] of selectLatestBrowserEvidenceByMessage(browserEvidenceRecords).entries()) {
    const sessionId = record.sessionId!
    const sourceMessageId = record.sourceMessageId!
    merged.set(
      key,
      mergeBrowserEvidenceIntoResultAnnotation(merged.get(key), record, {
        workspaceId: record.workspaceId,
        sessionId,
        sourceMessageId,
        taskId: record.taskId,
      }),
    )
  }

  return Array.from(merged.values())
}

function selectLatestBrowserEvidenceByMessage(
  browserEvidenceRecords: BrowserEvidenceRecord[],
): Map<string, BrowserEvidenceRecord> {
  const latest = new Map<string, BrowserEvidenceRecord>()

  for (const record of sortBrowserEvidenceRecords(browserEvidenceRecords)) {
    if (!record.sessionId || !record.sourceMessageId) continue
      const key = buildTraceabilityKey(record.sessionId, record.sourceMessageId, record)
      if (!latest.has(key)) {
        latest.set(key, record)
      }
  }

  return latest
}

function mergeBrowserEvidenceIntoResultAnnotation(
  annotation: ResultAnnotation | undefined,
  record: BrowserEvidenceRecord,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string; taskId?: string },
): ResultAnnotation {
  const taskId = annotation?.taskId ?? context.taskId
  const summary = annotation?.summary ?? record.summary

  return attachLaneAttribution({
    sourceMessageId: annotation?.sourceMessageId ?? context.sourceMessageId,
    workspaceId: annotation?.workspaceId ?? context.workspaceId,
    sessionId: annotation?.sessionId ?? context.sessionId,
    verification: annotation?.verification ?? 'unverified',
    ...(taskId ? { taskId } : {}),
    ...(summary ? { summary } : {}),
    ...(annotation?.reviewState ? { reviewState: annotation.reviewState } : {}),
    ...(annotation?.shipState ? { shipState: annotation.shipState } : {}),
    browserEvidenceRef: toBrowserEvidenceReference(record),
  }, mergeLaneAttribution(annotation, record))
}

function toBrowserEvidenceReference(record: BrowserEvidenceRecord): BrowserEvidenceReference {
  return {
    recordId: record.id,
    capturedAt: record.capturedAt,
    previewUrl: record.previewUrl,
    ...(record.summary ? { summary: record.summary } : {}),
    ...(record.consoleCapture ? { consoleCapture: record.consoleCapture } : {}),
    ...(record.screenshot ? { screenshot: record.screenshot } : {}),
  }
}

function buildBrowserEvidenceSummary(previewUrl: string): string {
  return `Captured browser evidence for ${previewUrl}.`
}

function validateConsoleCaptureMetadata(value: unknown, label: string): PreviewRuntimeConsoleCaptureMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }

  const candidate = value as Record<string, unknown>
  const levels = candidate.levels
  if (!Array.isArray(levels) || levels.some((level) => typeof level !== 'string')) {
    throw new Error(`${label}.levels must be a string array.`)
  }

  return {
    capturedAt: readString(candidate.capturedAt, `${label}.capturedAt`),
    entryCount: readNumber(candidate.entryCount, `${label}.entryCount`),
    errorCount: readNumber(candidate.errorCount, `${label}.errorCount`),
    warningCount: readNumber(candidate.warningCount, `${label}.warningCount`),
    exceptionCount: readNumber(candidate.exceptionCount, `${label}.exceptionCount`),
    levels,
  }
}

function validateScreenshotMetadata(value: unknown, label: string): PreviewRuntimeScreenshotMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }

  const candidate = value as Record<string, unknown>
  const mimeType = readString(candidate.mimeType, `${label}.mimeType`)
  if (mimeType !== 'image/png') {
    throw new Error(`${label}.mimeType must be image/png.`)
  }

  return {
    artifactRef: readString(candidate.artifactRef, `${label}.artifactRef`),
    mimeType: 'image/png',
    bytes: readNumber(candidate.bytes, `${label}.bytes`),
    width: readNumber(candidate.width, `${label}.width`),
    height: readNumber(candidate.height, `${label}.height`),
    capturedAt: readString(candidate.capturedAt, `${label}.capturedAt`),
  }
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${fieldName} to be a string.`)
  }
  return value
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected ${fieldName} to be a finite number.`)
  }
  return value
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
