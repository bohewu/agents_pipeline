import React from 'react';
import { useStore } from '../../runtime/store.js';

export function UsageBadge() {
  const { activeWorkspaceId, usageByWorkspace } = useStore();
  const usage = activeWorkspaceId ? usageByWorkspace[activeWorkspaceId] : undefined;

  if (!usage) return null;

  return (
    <div className="oc-status-pill">
      <span className="oc-status-pill__dot" style={{ backgroundColor: usage.status === 'ok' ? 'var(--success)' : 'var(--warning)' }} />
      <span>{usage.provider}</span>
    </div>
  );
}
