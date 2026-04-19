import React from 'react';
import { useStore } from '../../runtime/store.js';

const COLORS: Record<string, string> = {
  connected: 'var(--success)',
  connecting: 'var(--warning)',
  disconnected: 'var(--text-muted)',
  error: 'var(--error)',
};

export function ConnectionStatus() {
  const { activeWorkspaceId, connectionByWorkspace } = useStore();
  const state = activeWorkspaceId ? (connectionByWorkspace[activeWorkspaceId] ?? 'disconnected') : 'disconnected';
  const label = activeWorkspaceId ? state : 'No workspace';
  const color = activeWorkspaceId ? (COLORS[state] ?? 'var(--text-muted)') : 'var(--text-muted)';

  return (
    <div className="oc-status-pill">
      <span className="oc-status-pill__dot" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
