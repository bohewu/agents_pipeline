import React from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function EffortControl() {
  const { activeWorkspaceId, activeSessionByWorkspace, effortByWorkspace, setEffort } = useStore();

  const effort = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const currentLevel = sessionId
    ? effort?.sessionOverrides[sessionId] ?? effort?.projectDefault ?? 'medium'
    : effort?.projectDefault ?? 'medium';

  const handleChange = async (level: string) => {
    if (!activeWorkspaceId) return;
    try {
      await api.setEffort(activeWorkspaceId, {
        level,
        scope: sessionId ? 'session' : 'project',
        sessionId: sessionId ?? undefined,
      });
      const nextEffort = await api.getEffort(activeWorkspaceId);
      setEffort(activeWorkspaceId, nextEffort);
    } catch {
      /* ignore */
    }
  };

  return (
    <select
      value={currentLevel}
      onChange={(event) => handleChange(event.target.value)}
      className="oc-topbar-select oc-topbar-select--compact"
      aria-label="Effort"
      disabled={!activeWorkspaceId}
    >
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="xhigh">Max</option>
    </select>
  );
}
