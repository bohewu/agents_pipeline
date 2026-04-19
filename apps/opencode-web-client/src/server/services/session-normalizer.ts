import type { SessionSummary } from '../../shared/types.js'

export function normalizeSession(data: any): SessionSummary {
  const createdAt = normalizeTimestamp(data.time?.created ?? data.createdAt ?? data.created_at)
  const updatedAt = normalizeTimestamp(data.time?.updated ?? data.updatedAt ?? data.updated_at)
  return {
    id: data.id ?? data.sessionId ?? '',
    title: data.title ?? data.name,
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? createdAt ?? new Date().toISOString(),
    messageCount: data.messageCount ?? data.message_count ?? data.summary?.messages ?? 0,
    parentId: data.parentId ?? data.parentID,
    changeSummary: data.summary && typeof data.summary === 'object'
      ? {
          files: toNumber(data.summary.files),
          additions: toNumber(data.summary.additions),
          deletions: toNumber(data.summary.deletions),
        }
      : undefined,
  }
}

export function normalizeSessions(data: any): SessionSummary[] {
  if (Array.isArray(data)) return data.map(normalizeSession)
  if (data && typeof data === 'object' && Array.isArray(data.sessions)) {
    return data.sessions.map(normalizeSession)
  }
  return []
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  return undefined
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
