import React from 'react';
import { useStore } from '../../runtime/store.js';
import { getUsageBadgeSummary } from '../../lib/usage-display.js';

export function UsageBadge() {
  const { activeWorkspaceId, usageByWorkspace, usageLoadingByWorkspace, rightDrawerOpen, setRightPanel, toggleRightDrawer } = useStore();
  const usage = activeWorkspaceId ? usageByWorkspace[activeWorkspaceId] : undefined;
  const loading = activeWorkspaceId ? (usageLoadingByWorkspace[activeWorkspaceId] ?? false) : false;
  const summary = getUsageBadgeSummary(usage);

  if (!usage && !loading) return null;

  return (
    <button
      type="button"
      className="oc-status-pill oc-status-pill--button"
      onClick={() => {
        setRightPanel('usage');
        if (!rightDrawerOpen) toggleRightDrawer();
      }}
      title="Open usage panel"
    >
      <span className="oc-status-pill__dot" style={{ backgroundColor: loading ? 'var(--warning)' : usage?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }} />
      <span>{loading && !summary ? 'Loading usage' : summary ?? usage?.provider}</span>
    </button>
  );
}
