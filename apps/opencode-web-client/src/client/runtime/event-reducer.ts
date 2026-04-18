import type { BffEvent } from '../../shared/types.js';
import type { UIStore } from './store.js';

export function handleBffEvent(event: BffEvent, store: UIStore): void {
  const p = event.payload;

  switch (event.type) {
    case 'message.created': {
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (sessionId && message) store.addMessage(sessionId, message);
      break;
    }
    case 'message.delta': {
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (sessionId && message) store.updateMessage(sessionId, message);
      store.setStreaming(true);
      break;
    }
    case 'message.completed': {
      const sessionId = p.sessionId as string;
      const message = p.message as any;
      if (sessionId && message) store.updateMessage(sessionId, message);
      store.setStreaming(false);
      break;
    }
    case 'session.created': {
      const workspaceId = p.workspaceId as string;
      const session = p.session as any;
      if (workspaceId && session) {
        const existing = store.sessionsByWorkspace[workspaceId] ?? [];
        store.setSessions(workspaceId, [...existing, session]);
      }
      break;
    }
    case 'session.updated': {
      const workspaceId = p.workspaceId as string;
      const session = p.session as any;
      if (workspaceId && session) {
        const existing = store.sessionsByWorkspace[workspaceId] ?? [];
        const idx = existing.findIndex((s) => s.id === session.id);
        if (idx >= 0) {
          const next = [...existing];
          next[idx] = session;
          store.setSessions(workspaceId, next);
        }
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
