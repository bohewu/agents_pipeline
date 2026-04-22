import type {
  MessageTraceLink,
  NormalizedMessage,
  NormalizedPart,
  NormalizedPartType,
  ResultAnnotation,
  ResultReviewState,
  ResultShipState,
  ResultVerificationState,
  TaskEntry,
  TaskEntryState,
} from '../../shared/types.js'
import { attachLaneAttribution, extractLaneAttribution } from './lane-attribution.js'

interface NormalizeMessageScope {
  workspaceId?: string
  sessionId?: string
}

interface TraceDefaults {
  sourceMessageId: string
  workspaceId?: string
  sessionId?: string
  taskId?: string
  summary?: string
  laneId?: string
  laneContext?: TaskEntry['laneContext']
}

interface TaskCandidate {
  record: Record<string, unknown>
  allowBareId: boolean
}

/**
 * Normalize an upstream OpenCode message into the BFF NormalizedMessage format.
 */
export function normalizeMessage(raw: any, scope: NormalizeMessageScope = {}): NormalizedMessage {
  const info = readNestedRecord(raw, 'info') ?? raw
  const id = readString(info, 'id') ?? readString(raw, 'id', 'messageId') ?? ''
  const sessionId = readString(info, 'sessionID', 'sessionId')
    ?? readString(raw, 'sessionID', 'sessionId')
    ?? scope.sessionId
  const workspaceId = readString(info, 'workspaceId', 'workspaceID', 'workspace_id')
    ?? readString(raw, 'workspaceId', 'workspaceID', 'workspace_id')
    ?? scope.workspaceId
  const defaults: TraceDefaults = {
    sourceMessageId: id,
    workspaceId,
    sessionId,
    ...extractLaneAttribution(raw, info),
  }
  const taskEntry = extractTaskEntry(raw, defaults)
  const resultAnnotation = extractResultAnnotation(raw, {
    ...defaults,
    taskId: taskEntry?.taskId,
    summary: taskEntry?.latestSummary,
  })
  const trace = buildTraceLink({
    ...defaults,
    taskId: resultAnnotation?.taskId ?? taskEntry?.taskId,
  })

  return {
    id,
    role: normalizeRole(info.role ?? raw.role),
    parts: normalizeParts(raw),
    createdAt: normalizeCreatedAt(info, raw),
    ...(trace ? { trace } : {}),
    ...(taskEntry ? { taskEntry } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
  }
}

export function normalizeMessages(data: any, scope: NormalizeMessageScope = {}): NormalizedMessage[] {
  if (Array.isArray(data)) return data.map((message: any) => normalizeMessage(message, scope))
  if (data && typeof data === 'object' && Array.isArray(data.messages)) {
    return data.messages.map((message: any) => normalizeMessage(message, scope))
  }
  return []
}

function normalizeRole(role: string): NormalizedMessage['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') return role
  return 'assistant'
}

function normalizeParts(raw: any): NormalizedPart[] {
  // If upstream already has parts array, use it
  if (Array.isArray(raw.parts)) {
    return raw.parts
      .map(normalizePart)
      .filter((part: NormalizedPart | null): part is NormalizedPart => !!part)
  }

  // If upstream has content array (OpenAI-style)
  if (Array.isArray(raw.content)) {
    return raw.content.map(normalizeContentPart)
  }

  // Simple text content
  const text = raw.content ?? raw.text ?? ''
  if (typeof text === 'string' && text) {
    return [{ type: 'text', text }]
  }

  return []
}

function normalizePart(part: any): NormalizedPart | null {
  const type = mapPartType(part.type)
  if (!type) return null
  const result: NormalizedPart = { type }

  if (part.id) result.id = part.id
  const text = extractPartText(part)
  if (text !== undefined) result.text = text
  if (part.parentId) result.parentId = part.parentId
  if (part.parent_id) result.parentId = part.parent_id
  if (part.toolName) result.toolName = part.toolName
  if (part.toolCallId) result.toolCallId = part.toolCallId
  if (part.args) result.args = part.args
  if (part.result !== undefined) result.result = part.result
  if (part.error) result.error = part.error
  if (part.status) result.status = part.status

  return result
}

function normalizeContentPart(part: any): NormalizedPart {
  if (part.type === 'text') {
    return { type: 'text', text: extractPartText(part) ?? '' }
  }
  if (part.type === 'reasoning' || part.type === 'thinking' || part.type === 'reasoning_summary' || part.type === 'summary_text') {
    const parentId = part.parentId ?? part.parent_id ?? part.id
    return {
      type: 'reasoning',
      text: extractPartText(part) ?? '',
      ...(parentId ? { parentId } : {}),
    }
  }
  if (part.type === 'tool_use' || part.type === 'tool-call') {
    return {
      type: 'tool-call',
      id: part.id,
      toolName: part.name ?? part.toolName,
      toolCallId: part.id,
      args: part.input ?? part.args,
    }
  }
  if (part.type === 'tool_result' || part.type === 'tool-result') {
    return {
      type: 'tool-result',
      toolCallId: part.tool_use_id ?? part.toolCallId,
      result: part.content ?? part.result,
    }
  }
  return { type: 'text', text: JSON.stringify(part) }
}

function mapPartType(type: string | undefined): NormalizedPartType | null {
  switch (type) {
    case 'text': return 'text'
    case 'reasoning':
    case 'thinking':
    case 'reasoning_summary':
    case 'summary_text': return 'reasoning'
    case 'tool-call':
    case 'tool_use': return 'tool-call'
    case 'tool-result':
    case 'tool_result': return 'tool-result'
    case 'error': return 'error'
    case 'permission-request': return 'permission-request'
    default: return null
  }
}

function buildTraceLink(defaults: TraceDefaults): MessageTraceLink | undefined {
  if (!defaults.sourceMessageId) return undefined
  if (!defaults.workspaceId && !defaults.sessionId && !defaults.taskId && !defaults.laneId && !defaults.laneContext) {
    return undefined
  }

  return {
    sourceMessageId: defaults.sourceMessageId,
    ...(defaults.workspaceId ? { workspaceId: defaults.workspaceId } : {}),
    ...(defaults.sessionId ? { sessionId: defaults.sessionId } : {}),
    ...(defaults.taskId ? { taskId: defaults.taskId } : {}),
    ...(defaults.laneId ? { laneId: defaults.laneId } : {}),
    ...(defaults.laneContext ? { laneContext: defaults.laneContext } : {}),
  }
}

function extractTaskEntry(raw: any, defaults: TraceDefaults): TaskEntry | undefined {
  for (const candidate of collectTaskCandidates(raw)) {
    const taskEntry = normalizeTaskEntryCandidate(candidate.record, defaults, candidate.allowBareId)
    if (taskEntry) return taskEntry
  }
  return undefined
}

function extractResultAnnotation(raw: any, defaults: TraceDefaults): ResultAnnotation | undefined {
  for (const candidate of collectAnnotationCandidates(raw)) {
    const resultAnnotation = normalizeResultAnnotationCandidate(candidate, defaults)
    if (resultAnnotation) return resultAnnotation
  }

  if (!defaults.sourceMessageId || !defaults.workspaceId || !defaults.sessionId) {
    return undefined
  }

  if (!defaults.taskId && !defaults.summary) {
    return undefined
  }

  return attachLaneAttribution({
    sourceMessageId: defaults.sourceMessageId,
    workspaceId: defaults.workspaceId,
    sessionId: defaults.sessionId,
    verification: 'unverified' as const,
    ...(defaults.taskId ? { taskId: defaults.taskId } : {}),
    ...(defaults.summary ? { summary: defaults.summary } : {}),
  }, defaults)
}

function collectTaskCandidates(raw: any): TaskCandidate[] {
  const candidates: TaskCandidate[] = []

  for (const container of collectTraceContainers(raw)) {
    pushTaskCandidate(candidates, readNestedRecord(container, 'task'), true)
    pushTaskCandidate(candidates, readNestedRecord(container, 'taskEntry'), true)
    pushTaskCandidate(candidates, readNestedRecord(container, 'task_entry'), true)
    pushTaskCandidate(candidates, container, false)
  }

  return candidates
}

function collectAnnotationCandidates(raw: any): Record<string, unknown>[] {
  const explicitCandidates: Record<string, unknown>[] = []
  const fallbackCandidates: Record<string, unknown>[] = []

  for (const container of collectTraceContainers(raw)) {
    pushRecord(explicitCandidates, readNestedRecord(container, 'annotation'))
    pushRecord(explicitCandidates, readNestedRecord(container, 'resultAnnotation'))
    pushRecord(explicitCandidates, readNestedRecord(container, 'result_annotation'))
    const annotations = container.annotations
    if (Array.isArray(annotations)) {
      for (const entry of annotations) {
        pushRecord(explicitCandidates, toRecord(entry))
      }
    }
    pushRecord(fallbackCandidates, container)
  }

  return [...explicitCandidates, ...fallbackCandidates]
}

function collectTraceContainers(raw: any): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = []
  const seen = new Set<Record<string, unknown>>()

  const pushContainer = (value: unknown) => {
    const record = toRecord(value)
    if (!record || seen.has(record)) return
    seen.add(record)
    containers.push(record)
  }

  pushContainer(raw)
  pushContainer(readNestedRecord(raw, 'info'))
  pushContainer(readNestedRecord(raw, 'metadata'))
  pushContainer(readNestedRecord(raw, 'meta'))
  pushContainer(readNestedRecord(raw, 'trace'))
  pushContainer(readNestedRecord(raw, 'traceability'))

  for (const part of readSourceParts(raw)) {
    pushContainer(part)
    pushContainer(readNestedRecord(part, 'metadata'))
    pushContainer(readNestedRecord(part, 'meta'))
    pushContainer(readNestedRecord(part, 'trace'))
    pushContainer(readNestedRecord(part, 'traceability'))
    pushContainer(readNestedRecord(part, 'result'))
  }

  return containers
}

function readSourceParts(raw: any): Record<string, unknown>[] {
  const parts = [
    ...(Array.isArray(raw?.parts) ? raw.parts : []),
    ...(Array.isArray(raw?.content) ? raw.content : []),
  ]

  return parts
    .map((part) => toRecord(part))
    .filter((part): part is Record<string, unknown> => !!part)
}

function normalizeTaskEntryCandidate(
  candidate: Record<string, unknown>,
  defaults: TraceDefaults,
  allowBareId: boolean,
): TaskEntry | undefined {
  const taskId = readString(candidate, 'taskId', 'taskID', 'task_id')
    ?? (allowBareId ? readString(candidate, 'id') : undefined)
  const workspaceId = readString(candidate, 'workspaceId', 'workspaceID', 'workspace_id')
    ?? defaults.workspaceId

  if (!taskId || !workspaceId) {
    return undefined
  }

  const sessionId = readString(candidate, 'sessionId', 'sessionID', 'session_id')
    ?? defaults.sessionId
  const sourceMessageId = readString(candidate, 'sourceMessageId', 'sourceMessageID', 'source_message_id')
    ?? defaults.sourceMessageId
  const state = normalizeTaskState(readString(candidate, 'state', 'status')) ?? 'completed'
  const title = readString(candidate, 'title', 'label')
  const latestSummary = readString(candidate, 'latestSummary', 'latest_summary', 'resultSummary', 'result_summary', 'summary')

  return attachLaneAttribution({
    taskId,
    workspaceId,
    state,
    ...(sessionId ? { sessionId } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(title ? { title } : {}),
    ...(latestSummary ? { latestSummary } : {}),
  }, extractLaneAttribution(candidate, defaults))
}

function normalizeResultAnnotationCandidate(
  candidate: Record<string, unknown>,
  defaults: TraceDefaults,
): ResultAnnotation | undefined {
  const sourceMessageId = readString(candidate, 'sourceMessageId', 'sourceMessageID', 'source_message_id')
    ?? defaults.sourceMessageId
  const workspaceId = readString(candidate, 'workspaceId', 'workspaceID', 'workspace_id')
    ?? defaults.workspaceId
  const sessionId = readString(candidate, 'sessionId', 'sessionID', 'session_id')
    ?? defaults.sessionId

  if (!sourceMessageId || !workspaceId || !sessionId) {
    return undefined
  }

  const verification = readVerificationState(candidate)
  const reviewState = readReviewState(candidate)
  const shipState = readShipState(candidate)
  const taskId = readString(candidate, 'taskId', 'taskID', 'task_id')
    ?? defaults.taskId
  const summary = readString(candidate, 'summary', 'latestSummary', 'latest_summary', 'resultSummary', 'result_summary')
    ?? defaults.summary
  const hasSignal = verification !== null
    || !!reviewState
    || !!shipState
    || !!taskId
    || !!summary
    || hasExplicitAnnotationSignal(candidate)

  if (!hasSignal) {
    return undefined
  }

  return attachLaneAttribution({
    sourceMessageId,
    workspaceId,
    sessionId,
    verification: verification ?? 'unverified',
    ...(taskId ? { taskId } : {}),
    ...(summary ? { summary } : {}),
    ...(reviewState ? { reviewState } : {}),
    ...(shipState ? { shipState } : {}),
  }, extractLaneAttribution(candidate, defaults))
}

function hasExplicitAnnotationSignal(candidate: Record<string, unknown>): boolean {
  return Boolean(
    readString(candidate, 'taskId', 'taskID', 'task_id', 'sourceMessageId', 'sourceMessageID', 'source_message_id')
      || candidate.verification !== undefined
      || candidate.verificationStatus !== undefined
      || candidate.verification_status !== undefined
      || candidate.reviewState !== undefined
      || candidate.review_state !== undefined
      || candidate.shipState !== undefined
      || candidate.ship_state !== undefined,
  )
}

function readVerificationState(source: Record<string, unknown>): ResultVerificationState | null {
  return normalizeVerificationState(
    source.verification
    ?? source.verificationStatus
    ?? source.verification_status
    ?? source.verify,
  )
}

function readReviewState(source: Record<string, unknown>): ResultReviewState | null {
  return normalizeReviewState(
    source.reviewState
    ?? source.review_state
    ?? source.review,
  )
}

function readShipState(source: Record<string, unknown>): ResultShipState | null {
  return normalizeShipState(
    source.shipState
    ?? source.ship_state
    ?? source.ship,
  )
}

function normalizeTaskState(value: unknown): TaskEntryState | null {
  const normalized = normalizeScalarToken(value)
  switch (normalized) {
    case 'queued':
    case 'pending':
    case 'ready':
      return 'queued'
    case 'running':
    case 'in_progress':
    case 'in-progress':
    case 'in progress':
      return 'running'
    case 'blocked':
    case 'waiting_for_user':
    case 'waiting-for-user':
      return 'blocked'
    case 'completed':
    case 'complete':
    case 'done':
    case 'success':
    case 'succeeded':
      return 'completed'
    case 'failed':
    case 'error':
      return 'failed'
    case 'cancelled':
    case 'canceled':
    case 'skipped':
    case 'stale':
      return 'cancelled'
    default:
      return null
  }
}

function normalizeVerificationState(value: unknown): ResultVerificationState | null {
  const normalized = normalizeScalarToken(value)
  switch (normalized) {
    case 'verified':
    case 'pass':
    case 'passed':
    case 'success':
      return 'verified'
    case 'partially_verified':
    case 'partially-verified':
    case 'partially verified':
    case 'partial':
    case 'partial_success':
    case 'partial-success':
      return 'partially verified'
    case 'unverified':
    case 'unknown':
    case 'not_run':
    case 'not-run':
    case 'failed':
    case 'fail':
      return 'unverified'
    default:
      if (value === true) return 'verified'
      if (value === false) return 'unverified'
      return null
  }
}

function normalizeReviewState(value: unknown): ResultReviewState | null {
  const normalized = normalizeScalarToken(value)
  switch (normalized) {
    case 'ready':
    case 'approved':
      return 'ready'
    case 'approval_needed':
    case 'approval-needed':
    case 'approval needed':
    case 'needs_approval':
    case 'needs-approval':
      return 'approval-needed'
    case 'needs_retry':
    case 'needs-retry':
    case 'needs retry':
    case 'retry':
      return 'needs-retry'
    default:
      return null
  }
}

function normalizeShipState(value: unknown): ResultShipState | null {
  const normalized = normalizeScalarToken(value)
  switch (normalized) {
    case 'blocked_by_checks':
    case 'blocked-by-checks':
    case 'blocked by checks':
      return 'blocked-by-checks'
    case 'blocked_by_requested_changes':
    case 'blocked-by-requested-changes':
    case 'blocked by requested changes':
      return 'blocked-by-requested-changes'
    case 'not_ready':
    case 'not-ready':
    case 'not ready':
    case 'blocked':
      return 'not-ready'
    case 'local_ready':
    case 'local-ready':
    case 'local ready':
      return 'local-ready'
    case 'pr_ready':
    case 'pr-ready':
    case 'pr ready':
      return 'pr-ready'
    default:
      return null
  }
}

function normalizeScalarToken(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return readString(value as Record<string, unknown>, 'status', 'state', 'type', 'value')?.trim().toLowerCase() ?? null
}

function normalizeCreatedAt(info: any, raw: any): string {
  const created = info?.time?.created ?? raw?.createdAt ?? raw?.created_at
  if (typeof created === 'number' && Number.isFinite(created)) {
    return new Date(created).toISOString()
  }
  if (typeof created === 'string' && created.length > 0) {
    return created
  }
  return new Date().toISOString()
}

function extractPartText(part: any): string | undefined {
  if (!part || typeof part !== 'object') return undefined

  const directText = readString(part, 'text', 'content')
  if (directText) return directText

  const summaryText = collectTextSegments(part.summary)
  if (summaryText) return summaryText

  const contentText = collectTextSegments(part.content)
  if (contentText) return contentText

  return undefined
}

function collectTextSegments(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined

  const text = value
    .flatMap((entry) => {
      if (typeof entry === 'string') return [entry]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []

      const directText = readString(entry, 'text', 'content')
      if (directText) return [directText]

      const nestedSummary = collectTextSegments((entry as Record<string, unknown>).summary)
      return nestedSummary ? [nestedSummary] : []
    })
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join('\n\n')

  return text || undefined
}

function pushTaskCandidate(candidates: TaskCandidate[], value: unknown, allowBareId: boolean): void {
  const record = toRecord(value)
  if (!record) return
  candidates.push({ record, allowBareId })
}

function pushRecord(records: Record<string, unknown>[], value: unknown): void {
  const record = toRecord(value)
  if (!record) return
  records.push(record)
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

function readNestedRecord(source: unknown, key: string): Record<string, unknown> | null {
  const record = toRecord(source)
  if (!record) return null
  return toRecord(record[key])
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
