import type { SessionSummary } from '../../shared/types.js'
import { attachLaneAttribution, extractLaneAttribution } from './lane-attribution.js'

export function normalizeSession(data: any): SessionSummary {
  const info = readNestedRecord(data, 'info') ?? data
  const summary = readNestedRecord(info, 'summary')
  const createdAt = normalizeTimestamp(info.time?.created ?? data.time?.created ?? info.createdAt ?? info.created_at)
  const updatedAt = normalizeTimestamp(info.time?.updated ?? data.time?.updated ?? info.updatedAt ?? info.updated_at)
  return attachLaneAttribution({
    id: info.id ?? data.id ?? info.sessionId ?? data.sessionId ?? '',
    title: info.title ?? data.title ?? info.name ?? data.name,
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? createdAt ?? new Date().toISOString(),
    messageCount: info.messageCount ?? data.messageCount ?? info.message_count ?? data.message_count ?? summary?.messages ?? 0,
    parentId: info.parentId ?? data.parentId ?? info.parentID ?? data.parentID,
    state: normalizeSessionState(info.state ?? data.state ?? info.status ?? data.status),
    changeSummary: summary
      ? {
          files: toNumber(summary.files),
          additions: toNumber(summary.additions),
          deletions: toNumber(summary.deletions),
        }
      : undefined,
  }, extractLaneAttribution(info, data))
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

function normalizeSessionState(value: unknown): SessionSummary['state'] | undefined {
  if (value === 'idle' || value === 'running' || value === 'error') {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'running' || normalized === 'streaming') return 'running'
  if (normalized === 'error' || normalized === 'failed') return 'error'
  if (normalized === 'idle' || normalized === 'completed' || normalized === 'ready') return 'idle'
  return undefined
}

function readNestedRecord(source: unknown, key: string): Record<string, any> | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const value = (source as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, any>
}
