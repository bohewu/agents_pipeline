import React from 'react';
import { useStore } from '../../runtime/store.js';

const COLORS: Record<string, string> = {
  connected: 'var(--success)',
  connecting: 'var(--warning)',
  disconnected: 'var(--text-muted)',
  error: 'var(--error)',
};

const LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Disconnected',
  error: 'Connection issue',
};

export function ConnectionStatus({ className = '' }: { className?: string }) {
  const { activeWorkspaceId, connectionByWorkspace } = useStore();
  const state = activeWorkspaceId ? (connectionByWorkspace[activeWorkspaceId] ?? 'disconnected') : 'disconnected';
  const label = activeWorkspaceId ? (LABELS[state] ?? state) : 'No workspace';
  const color = activeWorkspaceId ? (COLORS[state] ?? 'var(--text-muted)') : 'var(--text-muted)';

  return (
    <div className={`oc-status-pill ${className}`.trim()} data-state={state}>
      <span className="oc-status-pill__dot" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
