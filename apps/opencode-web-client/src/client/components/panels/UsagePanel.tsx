import React, { useEffect, useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function UsagePanel() {
  const { activeWorkspaceId, usageByWorkspace, setUsage, selectedProvider } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const usage = await api.getUsage(activeWorkspaceId, selectedProvider ?? undefined);
      setUsage(activeWorkspaceId, usage);
      if (usage.status !== 'ok' && usage.error) {
        setError(usage.error);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load usage data');
    }
    setLoading(false);
  };

  useEffect(() => { void loadUsage(); }, [activeWorkspaceId, selectedProvider]);

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
        <div style={{ color: error ? 'var(--error)' : 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
          {error ?? 'No usage data'}
        </div>
      ) : (
        <div>
          {error && (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--error)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}
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
