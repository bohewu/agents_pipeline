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
        <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>Usage</span>
        <button onClick={loadUsage} disabled={loading} style={{
          background: '#2a2a4a', color: '#aaa', border: 'none', borderRadius: 3,
          padding: '2px 8px', fontSize: 11, cursor: 'pointer',
        }}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {!usage ? (
        <div style={{ color: '#666', fontSize: 12 }}>No usage data</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Provider: </span>
            <span style={{ color: '#4c9eff' }}>{usage.provider}</span>
          </div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Status: </span>
            <span style={{ color: usage.status === 'ok' ? '#4caf50' : '#ff9800' }}>{usage.status}</span>
          </div>
          {Object.entries(usage.data).map(([key, val]) => (
            <div key={key} style={{ fontSize: 12, padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>{key}</span>
              <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{String(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
