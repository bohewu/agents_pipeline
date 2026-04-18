import React from 'react';
import { useStore } from '../../runtime/store.js';

const COLORS: Record<string, string> = {
  connected: '#4caf50',
  connecting: '#ff9800',
  disconnected: '#888',
  error: '#f44336',
};

export function ConnectionStatus() {
  const { activeWorkspaceId, connectionByWorkspace } = useStore();
  const state = activeWorkspaceId ? (connectionByWorkspace[activeWorkspaceId] ?? 'disconnected') : 'disconnected';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: COLORS[state] ?? '#888',
      }} />
      <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{state}</span>
    </div>
  );
}
