import type { NormalizedMessage, NormalizedPart, NormalizedPartType } from '../../shared/types.js'

/**
 * Normalize an upstream OpenCode message into the BFF NormalizedMessage format.
 */
export function normalizeMessage(raw: any): NormalizedMessage {
  const info = readNestedRecord(raw, 'info') ?? raw
  return {
    id: info.id ?? raw.id ?? raw.messageId ?? '',
    role: normalizeRole(info.role ?? raw.role),
    parts: normalizeParts(raw),
    createdAt: normalizeCreatedAt(info, raw),
  }
}

export function normalizeMessages(data: any): NormalizedMessage[] {
  if (Array.isArray(data)) return data.map(normalizeMessage)
  if (data && typeof data === 'object' && Array.isArray(data.messages)) {
    return data.messages.map(normalizeMessage)
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
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const value = (source as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
