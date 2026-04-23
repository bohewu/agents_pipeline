import type {
  LaneAttribution,
  LaneContext,
  LaneContextKind,
  MessageTraceLink,
  NormalizedMessage,
  WorkspaceComparisonLaneReference,
} from '../../shared/types.js'

const LANE_KIND_VALUES: LaneContextKind[] = ['branch', 'worktree']

export function extractLaneAttribution(...sources: unknown[]): LaneAttribution | undefined {
  const records = sources.flatMap((source) => collectLaneRecords(source))
  if (records.length === 0) return undefined

  const laneId = readLaneId(records)
  const laneContext = records
    .map((record) => normalizeLaneContext(record))
    .find((value): value is LaneContext => !!value)

  return finalizeLaneAttribution({
    ...(laneId ? { laneId } : {}),
    ...(laneContext ? { laneContext } : {}),
  })
}

export function validateLaneAttributionRecord(
  candidate: Record<string, unknown>,
  fieldPrefix: string,
): LaneAttribution | undefined {
  const laneId = candidate.laneId === undefined
    ? undefined
    : readString(candidate.laneId, `${fieldPrefix}.laneId`)
  const laneContext = candidate.laneContext === undefined
    ? undefined
    : validateLaneContext(candidate.laneContext, `${fieldPrefix}.laneContext`)

  return finalizeLaneAttribution({
    ...(laneId ? { laneId } : {}),
    ...(laneContext ? { laneContext } : {}),
  })
}

export function validateWorkspaceComparisonLaneReferenceRecord(
  candidate: Record<string, unknown>,
  fieldPrefix: string,
): WorkspaceComparisonLaneReference {
  const lane = validateLaneAttributionRecord(candidate, fieldPrefix)
  if (!lane) {
    throw new Error(`Expected ${fieldPrefix} to include lane metadata.`)
  }

  return {
    sessionId: readString(candidate.sessionId, `${fieldPrefix}.sessionId`),
    ...lane,
  }
}

export function mergeLaneAttribution(...values: Array<LaneAttribution | undefined>): LaneAttribution | undefined {
  const laneId = values.find((value) => value?.laneId)?.laneId
  const laneContext = values.find((value) => value?.laneContext)?.laneContext
  return finalizeLaneAttribution({
    ...(laneId ? { laneId } : {}),
    ...(laneContext ? { laneContext } : {}),
  })
}

export function attachLaneAttribution<T extends object>(record: T, lane: LaneAttribution | undefined): T & LaneAttribution {
  const nextLane = mergeLaneAttribution(record as LaneAttribution, lane)
  if (!nextLane) return record

  return {
    ...record,
    ...(nextLane.laneId ? { laneId: nextLane.laneId } : {}),
    ...(nextLane.laneContext ? { laneContext: nextLane.laneContext } : {}),
  }
}

export function applyLaneAttributionToMessage(
  message: NormalizedMessage,
  lane: LaneAttribution | undefined,
): NormalizedMessage {
  const nextLane = mergeLaneAttribution(message.trace, message.taskEntry, message.resultAnnotation, lane)
  if (!nextLane) return message

  return {
    ...message,
    trace: attachLaneAttribution<MessageTraceLink>(message.trace ?? { sourceMessageId: message.id }, nextLane),
    ...(message.taskEntry ? { taskEntry: attachLaneAttribution(message.taskEntry, nextLane) } : {}),
    ...(message.resultAnnotation ? { resultAnnotation: attachLaneAttribution(message.resultAnnotation, nextLane) } : {}),
  }
}

export function resolveLaneId(value: LaneAttribution | undefined): string | undefined {
  return value?.laneId ?? deriveLaneId(value?.laneContext)
}

function finalizeLaneAttribution(value: LaneAttribution): LaneAttribution | undefined {
  const laneContext = value.laneContext
  const laneId = value.laneId ?? deriveLaneId(laneContext)
  if (!laneId && !laneContext) return undefined

  return {
    ...(laneId ? { laneId } : {}),
    ...(laneContext ? { laneContext } : {}),
  }
}

function collectLaneRecords(source: unknown): Record<string, unknown>[] {
  const queue: Record<string, unknown>[] = []
  const seen = new Set<Record<string, unknown>>()

  const push = (value: unknown) => {
    const record = toRecord(value)
    if (!record || seen.has(record)) return
    seen.add(record)
    queue.push(record)
  }

  push(source)

  for (let index = 0; index < queue.length; index += 1) {
    const record = queue[index]!
    push(record.lane)
    push(record.laneContext)
    push(record.lane_context)
    push(record.metadata)
    push(record.meta)
    push(record.trace)
    push(record.traceability)
    push(record.context)
    push(record.project)
    push(record.workspace)
    push(record.info)

    const branch = toRecord(record.branch)
    if (branch) {
      push({ kind: 'branch', ...branch })
    }

    const worktree = toRecord(record.worktree)
    if (worktree) {
      push({ kind: 'worktree', ...worktree })
    }

    if (Array.isArray(record.parts)) {
      for (const part of record.parts) push(part)
    }
    if (Array.isArray(record.content)) {
      for (const part of record.content) push(part)
    }
    if (Array.isArray(record.annotations)) {
      for (const annotation of record.annotations) push(annotation)
    }
    push(record.task)
    push(record.taskEntry)
    push(record.task_entry)
    push(record.resultAnnotation)
    push(record.result_annotation)
    push(record.annotation)
    push(record.result)
  }

  return queue
}

function readLaneId(records: Record<string, unknown>[]): string | undefined {
  for (const record of records) {
    const value = readOptionalString(record, 'laneId', 'laneID', 'lane_id')
    if (value) return value
  }

  for (const record of records) {
    const lane = toRecord(record.lane)
    const value = lane ? readOptionalString(lane, 'id', 'laneId', 'laneID', 'lane_id') : undefined
    if (value) return value
  }

  return undefined
}

function normalizeLaneContext(record: Record<string, unknown>): LaneContext | undefined {
  const kind = normalizeLaneKind(record.kind ?? record.type)
  const branch = readBranchName(record)
  const worktreePath = readWorktreePath(record, kind)

  if ((kind === 'worktree' || (!kind && worktreePath)) && worktreePath) {
    return {
      kind: 'worktree',
      worktreePath,
      ...(branch ? { branch } : {}),
    }
  }

  if ((kind === 'branch' || (!kind && branch)) && branch) {
    return {
      kind: 'branch',
      branch,
    }
  }

  return undefined
}

function validateLaneContext(value: unknown, fieldName: string): LaneContext {
  const record = toRecord(value)
  if (!record) {
    throw new Error(`Expected ${fieldName} to be an object.`)
  }

  const kind = normalizeLaneKind(record.kind ?? record.type)
  if (!kind) {
    throw new Error(`Expected ${fieldName}.kind to be one of ${LANE_KIND_VALUES.join(', ')}.`)
  }

  const branch = readOptionalString(record, 'branch', 'branchName')
  if (kind === 'branch') {
    return {
      kind: 'branch',
      branch: readString(record.branch ?? record.branchName ?? record.name, `${fieldName}.branch`),
    }
  }

  return {
    kind: 'worktree',
    worktreePath: readString(record.worktreePath ?? record.worktree_path ?? record.path, `${fieldName}.worktreePath`),
    ...(branch ? { branch } : {}),
  }
}

function deriveLaneId(laneContext: LaneContext | undefined): string | undefined {
  if (!laneContext) return undefined
  if (laneContext.kind === 'branch') {
    return `branch:${laneContext.branch}`
  }
  return `worktree:${laneContext.worktreePath}`
}

function readBranchName(record: Record<string, unknown>): string | undefined {
  const direct = readOptionalString(record, 'branch', 'branchName', 'name')
  if (direct) return direct

  const branchRecord = toRecord(record.branch)
  return branchRecord ? readOptionalString(branchRecord, 'name', 'branch') : undefined
}

function readWorktreePath(
  record: Record<string, unknown>,
  kind: LaneContextKind | undefined,
): string | undefined {
  const direct = readOptionalString(record, 'worktreePath', 'worktree_path')
  if (direct) return direct

  if (kind === 'worktree') {
    return readOptionalString(record, 'path')
  }

  const worktreeRecord = toRecord(record.worktree)
  if (!worktreeRecord) return undefined
  return readOptionalString(worktreeRecord, 'worktreePath', 'worktree_path', 'path')
}

function normalizeLaneKind(value: unknown): LaneContextKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return LANE_KIND_VALUES.find((entry) => entry === normalized)
}

function readOptionalString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`)
  }
  return value.trim()
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
