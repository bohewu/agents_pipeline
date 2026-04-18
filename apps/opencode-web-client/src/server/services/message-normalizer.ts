import type { NormalizedMessage, NormalizedPart, NormalizedPartType } from '../../shared/types.js'

/**
 * Normalize an upstream OpenCode message into the BFF NormalizedMessage format.
 */
export function normalizeMessage(raw: any): NormalizedMessage {
  return {
    id: raw.id ?? raw.messageId ?? '',
    role: normalizeRole(raw.role),
    parts: normalizeParts(raw),
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
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
    return raw.parts.map(normalizePart)
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

function normalizePart(part: any): NormalizedPart {
  const type = mapPartType(part.type)
  const result: NormalizedPart = { type }

  if (part.id) result.id = part.id
  if (part.text !== undefined) result.text = part.text
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
    return { type: 'text', text: part.text ?? '' }
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

function mapPartType(type: string): NormalizedPartType {
  switch (type) {
    case 'text': return 'text'
    case 'tool-call':
    case 'tool_use': return 'tool-call'
    case 'tool-result':
    case 'tool_result': return 'tool-result'
    case 'error': return 'error'
    case 'permission-request': return 'permission-request'
    default: return 'text'
  }
}
