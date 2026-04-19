import React from 'react';
import { getCachedUsage, readUsageCacheSnapshot, resolveUsageCacheKey, useStore } from '../../runtime/store.js';
import { getUsageBadgeSummary } from '../../lib/usage-display.js';

export function UsageBadge() {
  const {
    activeWorkspaceId,
    selectedProvider,
    usageByWorkspace,
    usageLoadingByWorkspace,
    rightDrawerOpen,
    setRightPanel,
    toggleRightDrawer,
  } = useStore();
  const usage = activeWorkspaceId
    ? getCachedUsage(usageByWorkspace, activeWorkspaceId, selectedProvider)
      ?? readUsageCacheSnapshot(activeWorkspaceId, selectedProvider)
    : undefined;
  const loading = activeWorkspaceId
    ? (usageLoadingByWorkspace[resolveUsageCacheKey(activeWorkspaceId, selectedProvider)] ?? false)
    : false;
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
