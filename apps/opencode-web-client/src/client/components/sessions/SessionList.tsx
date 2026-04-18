import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionItem } from './SessionItem.js';

export function SessionList() {
  const { activeWorkspaceId, sessionsByWorkspace, activeSessionByWorkspace } = useStore();
  if (!activeWorkspaceId) return null;

  const sessions = sessionsByWorkspace[activeWorkspaceId] ?? [];
  const activeSessionId = activeSessionByWorkspace[activeWorkspaceId];

  if (sessions.length === 0) {
    return <div style={{ color: '#666', fontSize: 12, padding: 8 }}>No sessions yet</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {sessions.map((s) => (
        <SessionItem key={s.id} session={s} active={s.id === activeSessionId} />
      ))}
    </div>
  );
}
