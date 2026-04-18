import React from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function PermissionsPanel() {
  const { activeWorkspaceId, activeSessionByWorkspace, pendingPermissions } = useStore();
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  const allPerms = Object.values(pendingPermissions).flat().filter((p) => p.status === 'pending');

  const handleResolve = async (perm: typeof allPerms[0], action: 'approve' | 'deny') => {
    if (!activeWorkspaceId || !sessionId) return;
    try {
      await api.resolvePermission(activeWorkspaceId, perm.sessionId, perm.id, { action });
    } catch { /* ignore */ }
  };

  if (allPerms.length === 0) {
    return <div style={{ color: '#666', fontSize: 12, padding: 8 }}>No pending permissions</div>;
  }

  return (
    <div>
      {allPerms.map((perm) => (
        <div key={perm.id} style={{
          background: '#1a1a00', border: '1px solid #ff9800', borderRadius: 4,
          padding: '8px 10px', marginBottom: 6,
        }}>
          <div style={{ fontSize: 12, color: '#ffb74d', fontFamily: 'monospace', marginBottom: 4 }}>
            {perm.toolName}
          </div>
          <pre style={{
            fontSize: 11, color: '#888', fontFamily: 'monospace', maxHeight: 80,
            overflow: 'auto', marginBottom: 6,
          }}>
            {JSON.stringify(perm.args, null, 2)}
          </pre>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleResolve(perm, 'approve')} style={{
              background: '#4caf50', color: '#fff', border: 'none', borderRadius: 3,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>Allow</button>
            <button onClick={() => handleResolve(perm, 'deny')} style={{
              background: '#f44336', color: '#fff', border: 'none', borderRadius: 3,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}
