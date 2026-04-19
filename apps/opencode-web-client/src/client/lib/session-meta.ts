import type { NormalizedMessage, SessionSummary } from '../../shared/types.js';

export function sortSessionsForSidebar(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => {
    const delta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (delta !== 0) return delta;
    return left.title?.localeCompare(right.title ?? '') ?? 0;
  });
}

export function mergeSessionMessages(
  sessions: SessionSummary[],
  sessionId: string,
  messages: NormalizedMessage[],
): SessionSummary[] {
  if (messages.length === 0) return sessions;
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    return {
      ...session,
      messageCount: Math.max(session.messageCount, messages.length),
      updatedAt: getLatestMessageTimestamp(messages, session.updatedAt),
    };
  });
}

export function mergeSessionMessageEvent(
  sessions: SessionSummary[],
  sessionId: string,
  message: NormalizedMessage,
  countDelta: number,
): SessionSummary[] {
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    return {
      ...session,
      messageCount: Math.max(0, session.messageCount + countDelta),
      updatedAt: message.createdAt || session.updatedAt,
    };
  });
}

export function getLatestMessageTimestamp(messages: NormalizedMessage[], fallback: string): string {
  if (messages.length === 0) return fallback;
  return messages.reduce((latest, message) => {
    return new Date(message.createdAt).getTime() > new Date(latest).getTime()
      ? message.createdAt
      : latest;
  }, fallback);
}

export function buildSessionTree(sessions: SessionSummary[]): Array<{ session: SessionSummary; depth: number }> {
  const sorted = sortSessionsForSidebar(sessions);
  const sessionIds = new Set(sorted.map((session) => session.id));
  const childrenByParent = new Map<string, SessionSummary[]>();
  const roots: SessionSummary[] = [];

  for (const session of sorted) {
    if (session.parentId && sessionIds.has(session.parentId)) {
      const children = childrenByParent.get(session.parentId) ?? [];
      children.push(session);
      childrenByParent.set(session.parentId, children);
      continue;
    }

    roots.push(session);
  }

  const flat: Array<{ session: SessionSummary; depth: number }> = [];
  const visit = (session: SessionSummary, depth: number) => {
    flat.push({ session, depth });
    const children = childrenByParent.get(session.id) ?? [];
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  for (const root of roots) {
    visit(root, 0);
  }

  return flat;
}

export function getSessionMetaLabel(session: SessionSummary): string | null {
  if (session.messageCount > 0) {
    return `${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`;
  }

  if (session.changeSummary?.files) {
    return `${session.changeSummary.files} file${session.changeSummary.files === 1 ? '' : 's'} changed`;
  }

  if (session.parentId) {
    return 'Branch session';
  }

  return null;
}
