import React, { useEffect, useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function UsagePanel() {
  const { activeWorkspaceId, usageByWorkspace, setUsage } = useStore();
  const [loading, setLoading] = useState(false);

  const loadUsage = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const usage = await api.getUsage(activeWorkspaceId);
      setUsage(activeWorkspaceId, usage);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadUsage(); }, [activeWorkspaceId]);

  const usage = activeWorkspaceId ? usageByWorkspace[activeWorkspaceId] : undefined;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Usage</span>
        <button onClick={loadUsage} disabled={loading} style={{
          background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999,
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        }}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {!usage ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No usage data</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>Provider: </span>
            <span style={{ color: 'var(--accent)' }}>{usage.provider}</span>
          </div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>Status: </span>
            <span style={{ color: usage.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>{usage.status}</span>
          </div>
          {Object.entries(usage.data).map(([key, val]) => (
            <div key={key} style={{ fontSize: 12, padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{key}</span>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{String(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
