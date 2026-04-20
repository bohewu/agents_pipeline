import type { NormalizedMessage, NormalizedPart } from '../../shared/types.js';

export interface RenderableReasoningPart {
  key: string;
  text: string;
}

export function getRenderableReasoningParts(parts: NormalizedPart[]): RenderableReasoningPart[] {
  const groupedText = new Map<string, string[]>();
  const orderedKeys: string[] = [];
  let anonymousIndex = 0;

  for (const part of parts) {
    if (part.type !== 'reasoning') continue;
    const text = part.text?.trim();
    if (!text) continue;

    const key = part.parentId ?? part.id ?? `reasoning-${anonymousIndex++}`;
    if (!groupedText.has(key)) {
      groupedText.set(key, []);
      orderedKeys.push(key);
    }
    groupedText.get(key)?.push(text);
  }

  return orderedKeys
    .map((key) => ({ key, text: (groupedText.get(key) ?? []).join('\n\n').trim() }))
    .filter((part) => part.text.length > 0);
}

export function getMessageTextPreview(message: NormalizedMessage): string | null {
  const preview = message.parts
    .filter((part) => part.type === 'text' && !!part.text?.trim())
    .map((part) => part.text?.trim() ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return preview ? preview : null;
}
