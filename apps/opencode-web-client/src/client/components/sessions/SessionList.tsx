import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionItem } from './SessionItem.js';

export function SessionList() {
  const { activeWorkspaceId, sessionsByWorkspace, activeSessionByWorkspace } = useStore();
  if (!activeWorkspaceId) return null;

  const sessions = sessionsByWorkspace[activeWorkspaceId] ?? [];
  const activeSessionId = activeSessionByWorkspace[activeWorkspaceId];

  if (sessions.length === 0) {
    return <div className="oc-session-list__empty">No chats yet</div>;
  }

  return (
    <div className="oc-session-list">
      {sessions.map((session) => (
        <SessionItem key={session.id} session={session} active={session.id === activeSessionId} />
      ))}
    </div>
  );
}
