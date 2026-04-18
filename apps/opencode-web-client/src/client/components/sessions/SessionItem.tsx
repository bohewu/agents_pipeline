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
      const msgs = await api.listMessages(activeWorkspaceId, session.id);
      setMessages(session.id, msgs);
    } catch { /* ignore */ }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWorkspaceId) return;
    try {
      await api.deleteSession(activeWorkspaceId, session.id);
      const sessions = await api.listSessions(activeWorkspaceId);
      setSessions(activeWorkspaceId, sessions);
    } catch { /* ignore */ }
    setShowMenu(false);
  };

  const timeAgo = formatTimeAgo(session.updatedAt);

  return (
    <div
      onClick={handleSelect}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
      style={{
        padding: '8px 10px', borderRadius: 4, cursor: 'pointer',
        background: active ? '#2a2a4a' : 'transparent',
        borderLeft: active ? '2px solid #4c9eff' : '2px solid transparent',
      }}
    >
      <div style={{ fontSize: 13, color: active ? '#e0e0e0' : '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {session.title || `Session ${session.id.slice(0, 8)}`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginTop: 2 }}>
        <span>{session.messageCount} msgs</span>
        <span>{timeAgo}</span>
      </div>
      {showMenu && (
        <div style={{ marginTop: 4 }}>
          <button onClick={handleDelete} style={{
            background: '#f44336', color: '#fff', border: 'none', borderRadius: 3,
            padding: '2px 8px', fontSize: 11, cursor: 'pointer',
          }}>Delete</button>
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
