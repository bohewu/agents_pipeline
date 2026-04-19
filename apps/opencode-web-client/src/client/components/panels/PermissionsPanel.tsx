import React from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function PermissionsPanel() {
  const { activeWorkspaceId, activeSessionByWorkspace, pendingPermissions } = useStore();
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  const allPerms = Object.values(pendingPermissions).flat().filter((p) => p.status === 'pending');

  const handleResolve = async (perm: typeof allPerms[0], decision: 'allow' | 'deny') => {
    if (!activeWorkspaceId || !sessionId) return;
    try {
      await api.resolvePermission(activeWorkspaceId, perm.sessionId, perm.id, { decision });
    } catch { /* ignore */ }
  };

  if (allPerms.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>No pending permissions</div>;
  }

  return (
    <div>
      {allPerms.map((perm) => (
        <div key={perm.id} style={{
          background: 'var(--warning-soft)', border: '1px solid rgba(179, 107, 0, 0.18)', borderRadius: 14,
          padding: '8px 10px', marginBottom: 6,
        }}>
          <div style={{ fontSize: 12, color: 'var(--warning)', fontFamily: 'monospace', marginBottom: 4 }}>
            {perm.toolName}
          </div>
          <pre style={{
            fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', maxHeight: 80,
            overflow: 'auto', marginBottom: 6,
          }}>
            {JSON.stringify(perm.args, null, 2)}
          </pre>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleResolve(perm, 'allow')} style={{
              background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 999,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>Allow</button>
            <button onClick={() => handleResolve(perm, 'deny')} style={{
              background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 999,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}
