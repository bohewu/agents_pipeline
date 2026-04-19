/**
 * assistant-ui-mapper.ts
 *
 * Converts NormalizedMessage (our Zustand store format) into ThreadMessageLike
 * (the format @assistant-ui/react ExternalStoreRuntime expects).
 *
 * Mapping:
 *   NormalizedPart.text          → { type: 'text', text }
 *   NormalizedPart.tool-call     → { type: 'tool-call', toolCallId, toolName, args, result? }
 *   NormalizedPart.tool-result   → merged back into the matching tool-call part
 *   NormalizedPart.error         → omitted from assistant-ui content; rendered as custom extras
 *   NormalizedPart.permission-request → omitted from assistant-ui content; rendered as custom extras
 *
 * NOTE: assistant-ui ThreadMessageLike assistant content only supports tool-call parts
 * with an optional inline result. It does not accept our standalone `tool-result`
 * normalized part, so we merge results into the prior tool-call before handing the
 * message to assistant-ui.
 */

import type { ThreadMessageLike } from '@assistant-ui/react';
import type { NormalizedMessage, NormalizedPart } from '../../shared/types.js';

// Use the same shape as assistant-ui expects, but with looser internal typing
// The final output is cast to ThreadMessageLike['content'] at the return site
type ContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      argsText: string;
      result?: unknown;
      isError?: boolean;
    };

function convertParts(parts: NormalizedPart[]): ContentPart[] {
  const content: ContentPart[] = [];

  for (const part of parts) {
    switch (part.type) {
      case 'text': {
        content.push({ type: 'text', text: part.text ?? '' });
        break;
      }

      case 'tool-call': {
        const args = (part.args ?? {}) as Record<string, unknown>;
        content.push({
          type: 'tool-call',
          toolCallId: part.toolCallId ?? part.id ?? 'unknown',
          toolName: part.toolName ?? 'unknown',
          args,
          argsText: JSON.stringify(args, null, 2),
          ...(part.result !== undefined ? { result: part.result } : {}),
        });
        break;
      }

      case 'tool-result': {
        const toolCallId = part.toolCallId ?? part.id;
        const target = [...content].reverse().find(
          (entry): entry is Extract<ContentPart, { type: 'tool-call' }> =>
            entry.type === 'tool-call' && entry.toolCallId === toolCallId,
        );

        if (target) {
          target.result = part.result;
          if (part.error) {
            target.isError = true;
          }
        } else {
          content.push({
            type: 'tool-call',
            toolCallId: toolCallId ?? 'unknown',
            toolName: part.toolName ?? 'unknown',
            args: {},
            argsText: '{}',
            result: part.result,
            ...(part.error ? { isError: true } : {}),
          });
        }
        break;
      }

      case 'error':
      case 'permission-request':
        break;

      default:
        content.push({ type: 'text', text: part.text ?? '' });
        break;
    }
  }

  return content;
}

/**
 * Convert a NormalizedMessage from our Zustand store into a ThreadMessageLike
 * for assistant-ui's ExternalStoreRuntime.
 */
export function convertMessage(msg: NormalizedMessage): ThreadMessageLike {
  const content = convertParts(msg.parts);

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
