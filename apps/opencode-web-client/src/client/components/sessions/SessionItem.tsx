import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import type { SessionSummary } from '../../../shared/types.js';

export function SessionItem({ session, active }: { session: SessionSummary; active: boolean }) {
  const { activeWorkspaceId, setActiveSession, setSessions, setMessages } = useStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleSelect = async () => {
    if (!activeWorkspaceId) return;
    setActiveSession(activeWorkspaceId, session.id);
    try {
      const messages = await api.listMessages(activeWorkspaceId, session.id);
      setMessages(session.id, messages);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!activeWorkspaceId) return;
    try {
      await api.deleteSession(activeWorkspaceId, session.id);
      const sessions = await api.listSessions(activeWorkspaceId);
      setSessions(activeWorkspaceId, sessions);
    } catch {
      /* ignore */
    }
    setShowMenu(false);
  };

  return (
    <div
      onClick={handleSelect}
      onContextMenu={(event) => { event.preventDefault(); setShowMenu(!showMenu); }}
      title={session.title || session.id}
      className={`oc-session-item ${active ? 'is-active' : ''}`}
    >
      <div className="oc-session-item__title">{session.title || `Session ${session.id.slice(0, 8)}`}</div>
      <div className="oc-session-item__meta">
        <span>{session.messageCount} msgs</span>
        <span>{formatTimeAgo(session.updatedAt)}</span>
      </div>
      {showMenu && (
        <div className="oc-session-item__menu">
          <button type="button" onClick={handleDelete} className="oc-inline-delete">Delete</button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
