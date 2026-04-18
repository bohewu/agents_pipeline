import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionList } from '../sessions/SessionList.js';
import { api } from '../../lib/api-client.js';

export function Sidebar() {
  const { activeWorkspaceId, setSessions, setActiveSession } = useStore();

  const handleNewSession = async () => {
    if (!activeWorkspaceId) return;
    try {
      const session = await api.createSession(activeWorkspaceId);
      const sessions = await api.listSessions(activeWorkspaceId);
      setSessions(activeWorkspaceId, sessions);
      setActiveSession(activeWorkspaceId, session.id);
    } catch { /* ignore */ }
  };

  return (
    <div className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
          Sessions
        </span>
        <button onClick={handleNewSession} style={{
          background: '#4c9eff', color: '#fff', border: 'none', borderRadius: 4,
          padding: '3px 10px', fontSize: 12, cursor: 'pointer',
        }}>
          + New
        </button>
      </div>
      <SessionList />
    </div>
  );
}
