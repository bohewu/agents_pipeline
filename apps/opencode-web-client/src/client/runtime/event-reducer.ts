import type { BffEvent } from '../../shared/types.js';
import type { UIStore } from './store.js';
import { findMessageIdentityIndex, selectSessionMessages } from './store.js';
import { mergeSessionMessageEvent, sortSessionsForSidebar } from '../lib/session-meta.js';

export function handleBffEvent(event: BffEvent, store: UIStore): void {
  const p = event.payload;

  switch (event.type) {
    case 'message.created': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      const existing = workspaceId && sessionId && message?.id
        ? findMessageIdentityIndex(selectSessionMessages(store, workspaceId, sessionId), message) >= 0
        : false;
      if (workspaceId && sessionId && message) {
        reconcileOptimisticUserMessage(store, workspaceId, sessionId, message);
        store.addMessage(workspaceId, sessionId, message);
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
      if (workspaceId && sessionId && message) store.updateMessage(workspaceId, sessionId, message);
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
      if (workspaceId && sessionId) store.setSessionStreaming(workspaceId, sessionId, true);
      break;
    }
    case 'message.completed': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (workspaceId && sessionId && message) store.updateMessage(workspaceId, sessionId, message);
      if (workspaceId && sessionId && message) {
        const sessions = store.sessionsByWorkspace[workspaceId] ?? [];
        const merged = mergeSessionMessageEvent(sessions, sessionId, message, 0).map((session) => {
          if (session.id !== sessionId) return session;
          return { ...session, state: 'idle' as const };
        });
        store.setSessions(workspaceId, sortSessionsForSidebar(merged));
      }
      if (workspaceId && sessionId) store.setSessionStreaming(workspaceId, sessionId, false);
      break;
    }
    case 'verification.updated': {
      const workspaceId = p.workspaceId as string;
      const sessionId = p.sessionId as string | undefined;
      const sourceMessageId = p.sourceMessageId as string | undefined;
      const run = p.run as any;
      const taskEntry = p.taskEntry as any;
      const resultAnnotation = p.resultAnnotation as any;
      if (workspaceId && run) {
        store.upsertVerificationRun(workspaceId, run);
      }
      if (workspaceId && sessionId && sourceMessageId) {
        store.applyVerificationProjection(workspaceId, sessionId, sourceMessageId, taskEntry, resultAnnotation);
      }
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

function reconcileOptimisticUserMessage(store: UIStore, workspaceId: string, sessionId: string, message: any): void {
  if (message?.role !== 'user') return;
  const createdText = extractText(message);
  if (!createdText) return;
  const expectedLaneId = resolveLaneId(message);

  const existing = selectSessionMessages(store, workspaceId, sessionId);
  const optimistic = existing.find((entry) => entry.id.startsWith('local-user-')
    && extractText(entry) === createdText
    && (!expectedLaneId || !resolveLaneId(entry) || resolveLaneId(entry) === expectedLaneId));
  if (!optimistic) return;

  store.setMessages(workspaceId, sessionId, existing.filter((entry) => entry.id !== optimistic.id));
}

function extractText(message: any): string {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function resolveLaneId(value: any): string | undefined {
  const directLaneId = [
    value?.laneId,
    value?.trace?.laneId,
    value?.taskEntry?.laneId,
    value?.resultAnnotation?.laneId,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  if (typeof directLaneId === 'string') {
    return directLaneId.trim();
  }

  const laneContext = value?.laneContext ?? value?.trace?.laneContext ?? value?.taskEntry?.laneContext ?? value?.resultAnnotation?.laneContext;
  if (!laneContext || typeof laneContext !== 'object') return undefined;
  if (laneContext.kind === 'branch' && typeof laneContext.branch === 'string' && laneContext.branch.trim().length > 0) {
    return `branch:${laneContext.branch.trim()}`;
  }
  if (laneContext.kind === 'worktree' && typeof laneContext.worktreePath === 'string' && laneContext.worktreePath.trim().length > 0) {
    return `worktree:${laneContext.worktreePath.trim()}`;
  }
  return undefined;
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
