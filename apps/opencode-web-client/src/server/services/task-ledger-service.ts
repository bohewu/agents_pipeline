import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  BrowserEvidenceReference,
  PreviewRuntimeConsoleCaptureMetadata,
  PreviewRuntimeScreenshotMetadata,
  ResultAnnotation,
  ResultReviewState,
  ResultShipState,
  ResultVerificationState,
  ShipFixHandoffConditionKind,
  ShipActionOutcome,
  TaskEntryState,
  TaskLedgerRecord,
  TaskLedgerShipAction,
  TaskLedgerShipReference,
  TaskLedgerVerificationReference,
  VerificationCommandKind,
  VerificationRunStatus,
} from '../../shared/types.js'
import type { AppPaths } from './app-paths.js'
import { attachLaneAttribution, mergeLaneAttribution, resolveLaneId, validateLaneAttributionRecord } from './lane-attribution.js'

interface TaskLedgerStateFile {
  version: 1
  records: TaskLedgerRecord[]
}

export interface TaskLedgerRuntimeUpdate {
  workspaceId: string
  taskId: string
  updatedAt: string
  state?: TaskEntryState
  sessionId?: string
  sourceMessageId?: string
  laneId?: string
  laneContext?: ResultAnnotation['laneContext']
  title?: string
  summary?: string
  createdAt?: string
  completedAt?: string
  resultAnnotation?: ResultAnnotation
  recentVerificationRef?: TaskLedgerVerificationReference
  recentBrowserEvidenceRef?: BrowserEvidenceReference
  recentShipRef?: TaskLedgerShipReference
}

const TASK_LEDGER_STATE_VERSION = 1
const TASK_ENTRY_STATES: TaskEntryState[] = ['queued', 'running', 'blocked', 'completed', 'failed', 'cancelled']
const VERIFICATION_COMMAND_KINDS: VerificationCommandKind[] = ['lint', 'build', 'test']
const VERIFICATION_RUN_STATUSES: VerificationRunStatus[] = ['running', 'passed', 'failed', 'cancelled']
const RESULT_VERIFICATION_STATES: ResultVerificationState[] = ['verified', 'partially verified', 'unverified']
const RESULT_REVIEW_STATES: ResultReviewState[] = ['ready', 'approval-needed', 'needs-retry']
const RESULT_SHIP_STATES: ResultShipState[] = ['not-ready', 'local-ready', 'pr-ready', 'blocked-by-checks', 'blocked-by-requested-changes']
const SHIP_ACTION_OUTCOMES: ShipActionOutcome[] = ['success', 'degraded', 'blocked', 'failure']
const TASK_LEDGER_SHIP_ACTIONS: TaskLedgerShipAction[] = ['commit', 'push', 'pullRequest']
const SHIP_FIX_HANDOFF_CONDITION_KINDS: ShipFixHandoffConditionKind[] = ['failing-check', 'review-feedback', 'requested-changes']

export class TaskLedgerService {
  private stateDir: string

  constructor(appPaths: Pick<AppPaths, 'stateDir'>) {
    this.stateDir = appPaths.stateDir
  }

  listRecords(workspaceId: string): TaskLedgerRecord[] {
    return sortTaskLedgerRecords(this.readState(workspaceId).records)
  }

  getRecord(
    workspaceId: string,
    taskId: string,
    selector: Pick<TaskLedgerRuntimeUpdate, 'sessionId' | 'sourceMessageId' | 'laneId' | 'laneContext'> = {},
  ): TaskLedgerRecord | undefined {
    return this.listRecords(workspaceId).find((record) => matchesTaskLedgerRecord(record, taskId, selector))
  }

  replaceRecords(workspaceId: string, records: TaskLedgerRecord[]): TaskLedgerRecord[] {
    const normalizedRecords = records.map((record) => validateTaskLedgerRecord(record, workspaceId))
    this.writeState(workspaceId, normalizedRecords)
    return sortTaskLedgerRecords(normalizedRecords)
  }

  upsertRecord(record: TaskLedgerRecord): TaskLedgerRecord[] {
    const normalizedRecord = validateTaskLedgerRecord(record, record.workspaceId)
    const state = this.readState(record.workspaceId)
    const nextRecords = [...state.records]
    const existingIndex = findMatchingTaskLedgerRecordIndex(nextRecords, normalizedRecord)

    if (existingIndex >= 0) {
      nextRecords[existingIndex] = normalizedRecord
    } else {
      nextRecords.unshift(normalizedRecord)
    }

    this.writeState(record.workspaceId, nextRecords)
    return sortTaskLedgerRecords(nextRecords)
  }

  upsertRuntimeRecord(update: TaskLedgerRuntimeUpdate): TaskLedgerRecord | undefined {
    const selector = {
      sessionId: update.sessionId ?? update.resultAnnotation?.sessionId,
      sourceMessageId: update.sourceMessageId ?? update.resultAnnotation?.sourceMessageId ?? update.recentShipRef?.messageId,
      laneId: update.laneId ?? update.resultAnnotation?.laneId,
      laneContext: update.laneContext ?? update.resultAnnotation?.laneContext,
    }
    const existing = this.getRecord(update.workspaceId, update.taskId, selector)
      ?? this.getRecord(update.workspaceId, update.taskId, {
        sessionId: selector.sessionId,
        laneId: selector.laneId,
        laneContext: selector.laneContext,
      })
    const nextRecord = buildRuntimeTaskLedgerRecord(existing, update)
    if (!nextRecord) {
      return existing
    }

    if (existing && haveEquivalentRuntimeFields(existing, nextRecord)) {
      return existing
    }

    this.upsertRecord(nextRecord)
    return nextRecord
  }

  removeRecord(workspaceId: string, taskId: string): TaskLedgerRecord[] {
    const nextRecords = this.readState(workspaceId).records.filter((record) => record.taskId !== taskId)
    this.writeState(workspaceId, nextRecords)
    return sortTaskLedgerRecords(nextRecords)
  }

  private readState(workspaceId: string): TaskLedgerStateFile {
    const filePath = this.getStateFilePath(workspaceId)
    if (!existsSync(filePath)) {
      return { version: TASK_LEDGER_STATE_VERSION, records: [] }
    }

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as TaskLedgerStateFile
      if (parsed.version !== TASK_LEDGER_STATE_VERSION || !Array.isArray(parsed.records)) {
        return { version: TASK_LEDGER_STATE_VERSION, records: [] }
      }

      return {
        version: TASK_LEDGER_STATE_VERSION,
        records: parsed.records.flatMap((record) => {
          try {
            return [validateTaskLedgerRecord(record, workspaceId)]
          } catch {
            return []
          }
        }),
      }
    } catch {
      return { version: TASK_LEDGER_STATE_VERSION, records: [] }
    }
  }

  private writeState(workspaceId: string, records: TaskLedgerRecord[]): void {
    const filePath = this.getStateFilePath(workspaceId)
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(
      tmpPath,
      JSON.stringify({ version: TASK_LEDGER_STATE_VERSION, records: sortTaskLedgerRecords(records) }, null, 2),
      'utf-8',
    )
    renameSync(tmpPath, filePath)
  }

  private getStateFilePath(workspaceId: string): string {
    return path.join(this.stateDir, 'task-ledger', `${workspaceId}.json`)
  }
}

function sortTaskLedgerRecords(records: TaskLedgerRecord[]): TaskLedgerRecord[] {
  return [...records].sort((left, right) => {
    const updatedSort = compareIsoDescending(left.updatedAt, right.updatedAt)
    if (updatedSort !== 0) return updatedSort

    const createdSort = compareIsoDescending(left.createdAt, right.createdAt)
    if (createdSort !== 0) return createdSort

    return left.taskId.localeCompare(right.taskId)
  })
}

function compareIsoDescending(left: string, right: string): number {
  if (left === right) return 0
  return left > right ? -1 : 1
}

function findMatchingTaskLedgerRecordIndex(records: TaskLedgerRecord[], candidate: TaskLedgerRecord): number {
  return records.findIndex((record) => isSameTaskLedgerIdentity(record, candidate))
}

function matchesTaskLedgerRecord(
  record: TaskLedgerRecord,
  taskId: string,
  selector: Pick<TaskLedgerRuntimeUpdate, 'sessionId' | 'sourceMessageId' | 'laneId' | 'laneContext'>,
): boolean {
  if (record.taskId !== taskId) return false

  const selectorLaneId = resolveLaneId(selector)
  if (selectorLaneId && resolveLaneId(record) !== selectorLaneId) return false
  if (selector.sessionId && record.sessionId !== selector.sessionId) return false
  if (selector.sourceMessageId && record.sourceMessageId !== selector.sourceMessageId) return false

  return true
}

function isSameTaskLedgerIdentity(left: TaskLedgerRecord, right: TaskLedgerRecord): boolean {
  if (left.taskId !== right.taskId || left.workspaceId !== right.workspaceId) {
    return false
  }

  const leftLaneId = resolveLaneId(left)
  const rightLaneId = resolveLaneId(right)
  if (leftLaneId || rightLaneId) {
    if (!leftLaneId || !rightLaneId || leftLaneId !== rightLaneId) {
      return false
    }
  }

  if (left.sessionId || right.sessionId) {
    if (!left.sessionId || !right.sessionId || left.sessionId !== right.sessionId) {
      return false
    }
  }

  if (left.sourceMessageId || right.sourceMessageId) {
    if (!left.sourceMessageId || !right.sourceMessageId || left.sourceMessageId !== right.sourceMessageId) {
      return false
    }
  }

  return true
}

function buildRuntimeTaskLedgerRecord(
  existing: TaskLedgerRecord | undefined,
  update: TaskLedgerRuntimeUpdate,
): TaskLedgerRecord | undefined {
  const sessionId = update.sessionId
    ?? update.resultAnnotation?.sessionId
    ?? update.recentShipRef?.sessionId
    ?? existing?.sessionId
    ?? existing?.resultAnnotation?.sessionId
    ?? existing?.recentShipRef?.sessionId
  const sourceMessageId = update.sourceMessageId
    ?? update.resultAnnotation?.sourceMessageId
    ?? update.recentShipRef?.messageId
    ?? existing?.sourceMessageId
    ?? existing?.resultAnnotation?.sourceMessageId
    ?? existing?.recentShipRef?.messageId
  const state = update.state ?? deriveRuntimeTaskState(existing, update)
  const lane = mergeLaneAttribution(update, update.resultAnnotation, existing, existing?.resultAnnotation)
  const title = update.title ?? existing?.title
  const summary = update.summary
    ?? update.resultAnnotation?.summary
    ?? update.recentVerificationRef?.summary
    ?? existing?.summary
    ?? update.recentBrowserEvidenceRef?.summary
    ?? title

  if (!state || !summary) {
    return undefined
  }

  const resultAnnotation = mergeRuntimeResultAnnotation(existing?.resultAnnotation, update.resultAnnotation, {
    workspaceId: update.workspaceId,
    taskId: update.taskId,
    sessionId,
    sourceMessageId,
    summary,
    lane,
  })

  const completedAt = isTerminalTaskState(state)
    ? update.completedAt ?? existing?.completedAt ?? update.updatedAt
    : undefined
  const recentVerificationRef = update.recentVerificationRef ?? existing?.recentVerificationRef
  const recentBrowserEvidenceRef = update.recentBrowserEvidenceRef ?? existing?.recentBrowserEvidenceRef
  const recentShipRef = update.recentShipRef ?? existing?.recentShipRef

  return validateTaskLedgerRecord(attachLaneAttribution({
    taskId: update.taskId,
    workspaceId: update.workspaceId,
    summary,
    state,
    createdAt: existing?.createdAt ?? update.createdAt ?? update.updatedAt,
    updatedAt: update.updatedAt,
    ...(sessionId ? { sessionId } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(title ? { title } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
    ...(recentVerificationRef ? { recentVerificationRef } : {}),
    ...(recentBrowserEvidenceRef ? { recentBrowserEvidenceRef } : {}),
    ...(recentShipRef ? { recentShipRef } : {}),
  }, lane), update.workspaceId)
}

function deriveRuntimeTaskState(
  existing: TaskLedgerRecord | undefined,
  update: TaskLedgerRuntimeUpdate,
): TaskEntryState | undefined {
  if (update.recentVerificationRef) {
    switch (update.recentVerificationRef.status) {
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

  if (update.recentShipRef) {
    switch (update.recentShipRef.outcome) {
      case 'blocked':
        return 'blocked'
      case 'failure':
        return 'failed'
      case 'success':
      case 'degraded':
        return existing?.state ?? 'completed'
    }
  }

  if (update.recentBrowserEvidenceRef) {
    return existing?.state ?? 'completed'
  }

  return existing?.state
}

function isTerminalTaskState(state: TaskEntryState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
}

function mergeRuntimeResultAnnotation(
  existing: ResultAnnotation | undefined,
  incoming: ResultAnnotation | undefined,
  context: {
    workspaceId: string
    taskId: string
    sessionId?: string
    sourceMessageId?: string
    summary: string
    lane?: Pick<ResultAnnotation, 'laneId' | 'laneContext'>
  },
): ResultAnnotation | undefined {
  if (!existing && !incoming) {
    return undefined
  }

  const sourceMessageId = incoming?.sourceMessageId ?? existing?.sourceMessageId ?? context.sourceMessageId
  const sessionId = incoming?.sessionId ?? existing?.sessionId ?? context.sessionId
  if (!sourceMessageId || !sessionId) {
    return undefined
  }

  return attachLaneAttribution({
    sourceMessageId,
    workspaceId: context.workspaceId,
    sessionId,
    verification: incoming?.verification ?? existing?.verification ?? 'unverified',
    taskId: incoming?.taskId ?? existing?.taskId ?? context.taskId,
    summary: incoming?.summary ?? existing?.summary ?? context.summary,
    ...(incoming?.reviewState ?? existing?.reviewState
      ? { reviewState: incoming?.reviewState ?? existing?.reviewState }
      : {}),
    ...(incoming?.shipState ?? existing?.shipState
      ? { shipState: incoming?.shipState ?? existing?.shipState }
      : {}),
    ...(incoming?.browserEvidenceRef ?? existing?.browserEvidenceRef
      ? { browserEvidenceRef: incoming?.browserEvidenceRef ?? existing?.browserEvidenceRef }
      : {}),
  }, mergeLaneAttribution(incoming, existing, context.lane))
}

function haveEquivalentRuntimeFields(left: TaskLedgerRecord, right: TaskLedgerRecord): boolean {
  return JSON.stringify({ ...left, updatedAt: '__ignored__' }) === JSON.stringify({ ...right, updatedAt: '__ignored__' })
}

function validateTaskLedgerRecord(record: unknown, workspaceId: string): TaskLedgerRecord {
  if (!record || typeof record !== 'object') {
    throw new Error('Task ledger record must be an object.')
  }

  const candidate = record as Record<string, unknown>
  const taskId = readString(candidate.taskId, 'taskId')
  const recordWorkspaceId = readString(candidate.workspaceId, 'workspaceId')
  if (recordWorkspaceId !== workspaceId) {
    throw new Error(`Task ledger record workspace mismatch for ${taskId}.`)
  }

  const summary = readString(candidate.summary, 'summary')
  const state = readEnum(candidate.state, 'state', TASK_ENTRY_STATES)
  const createdAt = readString(candidate.createdAt, 'createdAt')
  const updatedAt = readString(candidate.updatedAt, 'updatedAt')
  const sessionId = readOptionalString(candidate.sessionId, 'sessionId')
  const sourceMessageId = readOptionalString(candidate.sourceMessageId, 'sourceMessageId')
  const lane = validateLaneAttributionRecord(candidate, 'taskLedgerRecord')
  const title = readOptionalString(candidate.title, 'title')
  const completedAt = readOptionalString(candidate.completedAt, 'completedAt')
  const resultAnnotation = candidate.resultAnnotation === undefined
    ? undefined
    : validateResultAnnotation(candidate.resultAnnotation, recordWorkspaceId, sessionId, taskId, lane)
  const recentVerificationRef = candidate.recentVerificationRef === undefined
    ? undefined
    : validateTaskLedgerVerificationReference(candidate.recentVerificationRef)
  const recentBrowserEvidenceRef = candidate.recentBrowserEvidenceRef === undefined
    ? undefined
    : validateBrowserEvidenceReference(candidate.recentBrowserEvidenceRef, 'recentBrowserEvidenceRef')
  const recentShipRef = candidate.recentShipRef === undefined
    ? undefined
    : validateTaskLedgerShipReference(candidate.recentShipRef, sessionId, taskId)

  return attachLaneAttribution({
    taskId,
    workspaceId: recordWorkspaceId,
    summary,
    state,
    createdAt,
    updatedAt,
    ...(sessionId ? { sessionId } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(title ? { title } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
    ...(recentVerificationRef ? { recentVerificationRef } : {}),
    ...(recentBrowserEvidenceRef ? { recentBrowserEvidenceRef } : {}),
    ...(recentShipRef ? { recentShipRef } : {}),
  }, lane)
}

function validateResultAnnotation(
  value: unknown,
  workspaceId: string,
  sessionId: string | undefined,
  taskId: string,
  expectedLane: Pick<ResultAnnotation, 'laneId' | 'laneContext'> | undefined,
): ResultAnnotation {
  if (!value || typeof value !== 'object') {
    throw new Error('Task ledger resultAnnotation must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const annotationWorkspaceId = readString(candidate.workspaceId, 'resultAnnotation.workspaceId')
  if (annotationWorkspaceId !== workspaceId) {
    throw new Error('Task ledger resultAnnotation workspaceId mismatch.')
  }

  const annotationSessionId = readString(candidate.sessionId, 'resultAnnotation.sessionId')
  if (sessionId && annotationSessionId !== sessionId) {
    throw new Error('Task ledger resultAnnotation sessionId mismatch.')
  }

  const annotationTaskId = readOptionalString(candidate.taskId, 'resultAnnotation.taskId')
  if (annotationTaskId && annotationTaskId !== taskId) {
    throw new Error('Task ledger resultAnnotation taskId mismatch.')
  }

  const lane = validateLaneAttributionRecord(candidate, 'resultAnnotation')
  const expectedLaneId = resolveLaneId(expectedLane)
  const annotationLaneId = resolveLaneId(lane)
  if (expectedLaneId && annotationLaneId && expectedLaneId !== annotationLaneId) {
    throw new Error('Task ledger resultAnnotation laneId mismatch.')
  }

  const summary = readOptionalString(candidate.summary, 'resultAnnotation.summary')

  return attachLaneAttribution({
    sourceMessageId: readString(candidate.sourceMessageId, 'resultAnnotation.sourceMessageId'),
    workspaceId: annotationWorkspaceId,
    sessionId: annotationSessionId,
    verification: readEnum(candidate.verification, 'resultAnnotation.verification', RESULT_VERIFICATION_STATES),
    ...(annotationTaskId ? { taskId: annotationTaskId } : {}),
    ...(summary ? { summary } : {}),
    ...(candidate.reviewState !== undefined
      ? { reviewState: readEnum(candidate.reviewState, 'resultAnnotation.reviewState', RESULT_REVIEW_STATES) }
      : {}),
    ...(candidate.shipState !== undefined
      ? { shipState: readEnum(candidate.shipState, 'resultAnnotation.shipState', RESULT_SHIP_STATES) }
      : {}),
    ...(candidate.browserEvidenceRef !== undefined
      ? { browserEvidenceRef: validateBrowserEvidenceReference(candidate.browserEvidenceRef, 'resultAnnotation.browserEvidenceRef') }
      : {}),
  }, mergeLaneAttribution(lane, expectedLane))
}

function validateTaskLedgerVerificationReference(value: unknown): TaskLedgerVerificationReference {
  if (!value || typeof value !== 'object') {
    throw new Error('Task ledger recentVerificationRef must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const summary = readOptionalString(candidate.summary, 'recentVerificationRef.summary')
  const terminalLogRef = readOptionalString(candidate.terminalLogRef, 'recentVerificationRef.terminalLogRef')

  return {
    runId: readString(candidate.runId, 'recentVerificationRef.runId'),
    commandKind: readEnum(candidate.commandKind, 'recentVerificationRef.commandKind', VERIFICATION_COMMAND_KINDS),
    status: readEnum(candidate.status, 'recentVerificationRef.status', VERIFICATION_RUN_STATUSES),
    ...(summary ? { summary } : {}),
    ...(terminalLogRef ? { terminalLogRef } : {}),
  }
}

function validateBrowserEvidenceReference(value: unknown, label: string): BrowserEvidenceReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }

  const candidate = value as Record<string, unknown>
  const summary = readOptionalString(candidate.summary, `${label}.summary`)
  const consoleCapture = candidate.consoleCapture === undefined
    ? undefined
    : validateConsoleCaptureMetadata(candidate.consoleCapture, `${label}.consoleCapture`)
  const screenshot = candidate.screenshot === undefined
    ? undefined
    : validateScreenshotMetadata(candidate.screenshot, `${label}.screenshot`)

  return {
    recordId: readString(candidate.recordId, `${label}.recordId`),
    capturedAt: readString(candidate.capturedAt, `${label}.capturedAt`),
    previewUrl: readString(candidate.previewUrl, `${label}.previewUrl`),
    ...(summary ? { summary } : {}),
    ...(consoleCapture ? { consoleCapture } : {}),
    ...(screenshot ? { screenshot } : {}),
  }
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

function validateTaskLedgerShipReference(
  value: unknown,
  sessionId: string | undefined,
  taskId: string,
): TaskLedgerShipReference {
  if (!value || typeof value !== 'object') {
    throw new Error('Task ledger recentShipRef must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const shipSessionId = readString(candidate.sessionId, 'recentShipRef.sessionId')
  if (sessionId && shipSessionId !== sessionId) {
    throw new Error('Task ledger recentShipRef sessionId mismatch.')
  }

  const shipTaskId = readOptionalString(candidate.taskId, 'recentShipRef.taskId')
  if (shipTaskId && shipTaskId !== taskId) {
    throw new Error('Task ledger recentShipRef taskId mismatch.')
  }

  const messageId = readOptionalString(candidate.messageId, 'recentShipRef.messageId')
  const terminalLogRef = readOptionalString(candidate.terminalLogRef, 'recentShipRef.terminalLogRef')
  const commitSha = readOptionalString(candidate.commitSha, 'recentShipRef.commitSha')
  const pullRequestUrl = readOptionalString(candidate.pullRequestUrl, 'recentShipRef.pullRequestUrl')
  const pullRequestNumber = readOptionalNumber(candidate.pullRequestNumber, 'recentShipRef.pullRequestNumber')
  const conditionLabel = readOptionalString(candidate.conditionLabel, 'recentShipRef.conditionLabel')
  const detailsUrl = readOptionalString(candidate.detailsUrl, 'recentShipRef.detailsUrl')
  const conditionKind = candidate.conditionKind === undefined
    ? undefined
    : readEnum(candidate.conditionKind, 'recentShipRef.conditionKind', SHIP_FIX_HANDOFF_CONDITION_KINDS)

  return {
    action: readEnum(candidate.action, 'recentShipRef.action', TASK_LEDGER_SHIP_ACTIONS),
    outcome: readEnum(candidate.outcome, 'recentShipRef.outcome', SHIP_ACTION_OUTCOMES),
    sessionId: shipSessionId,
    ...(messageId ? { messageId } : {}),
    ...(shipTaskId ? { taskId: shipTaskId } : {}),
    ...(terminalLogRef ? { terminalLogRef } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(pullRequestUrl ? { pullRequestUrl } : {}),
    ...(pullRequestNumber !== undefined ? { pullRequestNumber } : {}),
    ...(conditionKind ? { conditionKind } : {}),
    ...(conditionLabel ? { conditionLabel } : {}),
    ...(detailsUrl ? { detailsUrl } : {}),
  }
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${fieldName} to be a string.`)
  }
  return value
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined
  return readString(value, fieldName)
}

function readOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected ${fieldName} to be a finite number.`)
  }
  return value
}

function readNumber(value: unknown, fieldName: string): number {
  const parsed = readOptionalNumber(value, fieldName)
  if (parsed === undefined) {
    throw new Error(`Expected ${fieldName} to be a finite number.`)
  }
  return parsed
}

function readEnum<T extends string>(value: unknown, fieldName: string, allowedValues: readonly T[]): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw new Error(`Expected ${fieldName} to be one of ${allowedValues.join(', ')}.`)
  }
  return value as T
}
