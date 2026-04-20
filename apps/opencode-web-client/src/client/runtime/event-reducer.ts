import type { BffEvent } from '../../shared/types.js';
import type { UIStore } from './store.js';
import { mergeSessionMessageEvent, sortSessionsForSidebar } from '../lib/session-meta.js';

export function handleBffEvent(event: BffEvent, store: UIStore): void {
  const p = event.payload;

  switch (event.type) {
    case 'message.created': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      const existing = sessionId && message?.id
        ? (store.messagesBySession[sessionId] ?? []).some((entry) => entry.id === message.id)
        : false;
      if (sessionId && message) {
        reconcileOptimisticUserMessage(store, sessionId, message);
        store.addMessage(sessionId, message);
      }
      if (workspaceId && sessionId && message) {
        const sessions = store.sessionsByWorkspace[workspaceId] ?? [];
        store.setSessions(workspaceId, sortSessionsForSidebar(mergeSessionMessageEvent(sessions, sessionId, message, existing ? 0 : 1)));
      }
      break;
    }
    case 'message.delta': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (sessionId && message) store.updateMessage(sessionId, message);
      if (workspaceId && sessionId && message) {
        const sessions = store.sessionsByWorkspace[workspaceId] ?? [];
        const current = sessions.find((session) => session.id === sessionId);
        if (current && current.state !== 'running') {
          const next = sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return { ...session, state: 'running' as const };
          });
          store.setSessions(workspaceId, next);
        }
      }
      store.setStreaming(true);
      break;
    }
    case 'message.completed': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (sessionId && message) store.updateMessage(sessionId, message);
      if (workspaceId && sessionId && message) {
        const sessions = store.sessionsByWorkspace[workspaceId] ?? [];
        const merged = mergeSessionMessageEvent(sessions, sessionId, message, 0).map((session) => {
          if (session.id !== sessionId) return session;
          return { ...session, state: 'idle' as const };
        });
        store.setSessions(workspaceId, sortSessionsForSidebar(merged));
      }
      store.setStreaming(false);
      break;
    }
    case 'session.created': {
      const workspaceId = p.workspaceId as string;
      const session = p.session as any;
      if (workspaceId && session) {
        const existing = store.sessionsByWorkspace[workspaceId] ?? [];
        store.setSessions(workspaceId, sortSessionsForSidebar(upsertSession(existing, session)));
      }
      break;
    }
    case 'session.updated': {
      const workspaceId = p.workspaceId as string;
      const session = p.session as any;
      if (workspaceId && session) {
        const existing = store.sessionsByWorkspace[workspaceId] ?? [];
        store.setSessions(workspaceId, sortSessionsForSidebar(upsertSession(existing, session)));
      }
      break;
    }
    case 'permission.requested': {
      const key = p.key as string ?? 'default';
      const permission = p.permission as any;
      if (permission) {
        const existing = store.pendingPermissions[key] ?? [];
        store.setPendingPermissions(key, [...existing, permission]);
      }
      break;
    }
    case 'permission.resolved': {
      const key = p.key as string ?? 'default';
      const permissionId = p.permissionId as string;
      if (permissionId) {
        const existing = store.pendingPermissions[key] ?? [];
        store.setPendingPermissions(key, existing.filter((pr) => pr.id !== permissionId));
      }
      break;
    }
    case 'effort.changed': {
      const workspaceId = p.workspaceId as string;
      const effort = p.effort as any;
      if (workspaceId && effort) store.setEffort(workspaceId, effort);
      break;
    }
    case 'workspace.changed': {
      // Reload workspaces on change
      break;
    }
    case 'connection.ping': {
      // Keep-alive, no action needed
      break;
    }
  }
}

function reconcileOptimisticUserMessage(store: UIStore, sessionId: string, message: any): void {
  if (message?.role !== 'user') return;
  const createdText = extractText(message);
  if (!createdText) return;

  const existing = store.messagesBySession[sessionId] ?? [];
  const optimistic = existing.find((entry) => entry.id.startsWith('local-user-') && extractText(entry) === createdText);
  if (!optimistic) return;

  store.setMessages(sessionId, existing.filter((entry) => entry.id !== optimistic.id));
}

function extractText(message: any): string {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function upsertSession<T extends { id: string }>(sessions: T[], session: T): T[] {
  const idx = sessions.findIndex((entry) => entry.id === session.id);
  if (idx === -1) {
    return [session, ...sessions];
  }

  const next = [...sessions];
  next[idx] = {
    ...next[idx],
    ...session,
  };
  return next;
}
