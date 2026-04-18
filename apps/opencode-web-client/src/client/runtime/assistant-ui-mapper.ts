/**
 * assistant-ui-mapper.ts
 *
 * Converts NormalizedMessage (our Zustand store format) into ThreadMessageLike
 * (the format @assistant-ui/react ExternalStoreRuntime expects).
 *
 * Mapping:
 *   NormalizedPart.text          → { type: 'text', text }
 *   NormalizedPart.tool-call     → { type: 'tool-call', toolCallId, toolName, args }
 *   NormalizedPart.tool-result   → { type: 'tool-result', toolCallId, result }
 *   NormalizedPart.error         → { type: 'text', text: '[Error] ...' }  (rendered via custom component)
 *   NormalizedPart.permission-request → { type: 'text', text: '[Permission] ...' } (rendered via custom component)
 *
 * NOTE: assistant-ui ThreadMessageLike content parts only support:
 *   TextContentPart, ImageContentPart, AudioContentPart, ToolCallContentPart, ToolResultContentPart, UIContentPart
 * For error and permission-request, we encode them as text parts with a prefix marker
 * so the custom MessageCard renderer (which reads from the original NormalizedMessage
 * via Zustand store lookup) handles the full fidelity rendering.
 */

import type { ThreadMessageLike } from '@assistant-ui/react';
import type { NormalizedMessage, NormalizedPart } from '../../shared/types.js';

// Use the same shape as assistant-ui expects, but with looser internal typing
// The final output is cast to ThreadMessageLike['content'] at the return site
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown>; result?: string }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: string };

function convertPart(part: NormalizedPart): ContentPart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text ?? '' };

    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId ?? part.id ?? 'unknown',
        toolName: part.toolName ?? 'unknown',
        args: (part.args ?? {}) as Record<string, unknown>,
        ...(part.result !== undefined ? { result: String(part.result) } : {}),
      };

    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: part.toolCallId ?? part.id ?? 'unknown',
        toolName: part.toolName ?? 'unknown',
        result: part.result != null ? String(part.result) : '',
      };

    case 'error':
      // Encode as text — the custom renderer will use the original NormalizedMessage
      return { type: 'text', text: `[Error] ${part.error ?? part.text ?? 'Unknown error'}` };

    case 'permission-request':
      return {
        type: 'text',
        text: `[Permission] ${part.toolName ?? 'unknown'}: ${part.status ?? 'pending'}`,
      };

    default:
      return { type: 'text', text: '' };
  }
}

/**
 * Convert a NormalizedMessage from our Zustand store into a ThreadMessageLike
 * for assistant-ui's ExternalStoreRuntime.
 */
export function convertMessage(msg: NormalizedMessage): ThreadMessageLike {
  const content = msg.parts.map(convertPart);

  // Ensure there's at least one content part (assistant-ui requires non-empty content)
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: content as ThreadMessageLike['content'],
    createdAt: new Date(msg.createdAt),
  };
}
