import type { SessionSummary } from '../../shared/types.js'

export function normalizeSession(data: any): SessionSummary {
  return {
    id: data.id ?? data.sessionId ?? '',
    title: data.title ?? data.name,
    createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? data.updated_at ?? data.createdAt ?? new Date().toISOString(),
    messageCount: data.messageCount ?? data.message_count ?? 0,
  }
}

export function normalizeSessions(data: any): SessionSummary[] {
  if (Array.isArray(data)) return data.map(normalizeSession)
  if (data && typeof data === 'object' && Array.isArray(data.sessions)) {
    return data.sessions.map(normalizeSession)
  }
  return []
}
