import React from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function EffortControl({ className = '' }: { className?: string }) {
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
      name="reasoning-effort"
      value={currentLevel}
      onChange={(event) => handleChange(event.target.value)}
      className={`oc-topbar-select oc-topbar-select--compact ${className}`.trim()}
      aria-label="Reasoning effort"
      title="Current session reasoning effort. Child and subagent sessions can inherit it on supported GPT-5 models."
      disabled={!activeWorkspaceId}
    >
      <option value="low">low</option>
      <option value="medium">medium</option>
      <option value="high">high</option>
      <option value="xhigh">xhigh</option>
    </select>
  );
}
