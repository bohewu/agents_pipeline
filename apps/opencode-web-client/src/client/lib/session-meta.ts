import type { NormalizedMessage, SessionSummary } from '../../shared/types.js';

export interface SessionGroup {
  root: SessionSummary;
  children: SessionSummary[];
  branchCount: number;
  latestActivityAt: string;
  latestSession: SessionSummary;
}

export type SessionKind = 'root' | 'branch' | 'subagent';

const SUBAGENT_TITLE_PATTERN = /\(@([^)]+?) subagent\)/i;

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

export function buildSessionGroups(sessions: SessionSummary[]): SessionGroup[] {
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

  return roots
    .map((root) => {
      const children = sortSessionsForSidebar(childrenByParent.get(root.id) ?? []);
      const latestSession = children.reduce((latest, child) => {
        return new Date(child.updatedAt).getTime() > new Date(latest.updatedAt).getTime()
          ? child
          : latest;
      }, root);

      return {
        root,
        children,
        branchCount: children.length,
        latestActivityAt: latestSession.updatedAt,
        latestSession,
      };
    })
    .sort((left, right) => {
      const delta = new Date(right.latestActivityAt).getTime() - new Date(left.latestActivityAt).getTime();
      if (delta !== 0) return delta;
      return left.root.title?.localeCompare(right.root.title ?? '') ?? 0;
    });
}

export function buildSessionTree(sessions: SessionSummary[]): Array<{ session: SessionSummary; depth: number }> {
  const flat: Array<{ session: SessionSummary; depth: number }> = [];
  for (const group of buildSessionGroups(sessions)) {
    flat.push({ session: group.root, depth: 0 });
    for (const child of group.children) {
      flat.push({ session: child, depth: 1 });
    }
  }

  return flat;
}

export function getSessionKind(session: SessionSummary): SessionKind {
  if (!session.parentId) return 'root';
  return SUBAGENT_TITLE_PATTERN.test(session.title ?? '') ? 'subagent' : 'branch';
}

export function getSessionBadgeLabel(session: SessionSummary): string | null {
  const match = (session.title ?? '').match(SUBAGENT_TITLE_PATTERN);
  if (match) {
    return `@${match[1]}`;
  }

  if (session.parentId) {
    return 'Branch';
  }

  return null;
}

export function matchesSessionQuery(session: SessionSummary, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const title = (session.title ?? '').toLowerCase();
  const id = session.id.toLowerCase();
  return tokens.every((token) => title.includes(token) || id.includes(token));
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
