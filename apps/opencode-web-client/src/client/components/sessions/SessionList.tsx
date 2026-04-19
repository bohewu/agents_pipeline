import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionItem } from './SessionItem.js';
import { buildSessionTree } from '../../lib/session-meta.js';

export function SessionList() {
  const { activeWorkspaceId, sessionsByWorkspace, activeSessionByWorkspace } = useStore();
  if (!activeWorkspaceId) return null;

  const sessions = sessionsByWorkspace[activeWorkspaceId] ?? [];
  const activeSessionId = activeSessionByWorkspace[activeWorkspaceId];
  const tree = buildSessionTree(sessions);

  if (tree.length === 0) {
    return <div className="oc-session-list__empty">No sessions yet</div>;
  }

  return (
    <div className="oc-session-list">
      {tree.map(({ session, depth }) => (
        <SessionItem key={session.id} session={session} depth={depth} active={session.id === activeSessionId} />
      ))}
    </div>
  );
}
