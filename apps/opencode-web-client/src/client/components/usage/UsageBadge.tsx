import React from 'react';
import { useStore } from '../../runtime/store.js';

export function UsageBadge() {
  const { activeWorkspaceId, usageByWorkspace } = useStore();
  const usage = activeWorkspaceId ? usageByWorkspace[activeWorkspaceId] : undefined;

  if (!usage) return null;

  return (
    <div style={{
      background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 4,
      padding: '2px 8px', fontSize: 11, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ color: usage.status === 'ok' ? '#4caf50' : '#ff9800' }}>●</span>
      <span>{usage.provider}</span>
    </div>
  );
}
