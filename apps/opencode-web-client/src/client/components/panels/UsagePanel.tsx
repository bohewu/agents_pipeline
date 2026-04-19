import React, { useEffect, useState } from 'react';
import { getCachedUsage, readUsageCacheSnapshot, resolveUsageCacheKey, useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { formatUsageTimestamp, formatUsageValue, getUsageHighlights } from '../../lib/usage-display.js';

export function UsagePanel() {
  const { activeWorkspaceId, usageByWorkspace, usageLoadingByWorkspace, setUsage, setUsageLoading, selectedProvider } = useStore();
  const [error, setError] = useState<string | null>(null);
  const loading = activeWorkspaceId
    ? (usageLoadingByWorkspace[resolveUsageCacheKey(activeWorkspaceId, selectedProvider)] ?? false)
    : false;

  const loadUsage = async () => {
    if (!activeWorkspaceId) {
      return;
    }

    setUsageLoading(activeWorkspaceId, true, selectedProvider);
    setError(null);

    try {
      const usage = await api.getUsage(activeWorkspaceId, selectedProvider ?? undefined);
      setUsage(activeWorkspaceId, usage, selectedProvider);
      if (usage.status !== 'ok' && usage.error) {
        setError(usage.error);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load usage data');
    } finally {
      setUsageLoading(activeWorkspaceId, false, selectedProvider);
    }
  };

  useEffect(() => { void loadUsage(); }, [activeWorkspaceId, selectedProvider]);

  const usage = activeWorkspaceId
    ? getCachedUsage(usageByWorkspace, activeWorkspaceId, selectedProvider)
      ?? readUsageCacheSnapshot(activeWorkspaceId, selectedProvider)
    : undefined;
  const highlights = getUsageHighlights(usage);
  const updatedAt = usage?.status === 'ok'
    ? formatUsageTimestamp((usage.data as Record<string, unknown>).generatedAt)
    : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Usage</span>
          <button type="button" onClick={() => void loadUsage()} disabled={loading} style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          }}>
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {!usage ? (
        loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>Loading usage data...</div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  background: 'var(--bg-primary)',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div className="oc-loading-bar" style={{ width: '38%' }} />
                <div className="oc-loading-bar" style={{ width: '62%', height: 18 }} />
                <div className="oc-loading-bar" style={{ width: '74%' }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: error ? 'var(--error)' : 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            {error ?? 'No usage data'}
          </div>
        )
      ) : (
        <div>
          {error && (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--error)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}
          {loading && (
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Showing the latest cached usage while the drawer refreshes.
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
          {updatedAt && (
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Updated: </span>
              <span style={{ color: 'var(--text-secondary)' }}>{updatedAt}</span>
            </div>
          )}

          {highlights.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
              {highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    background: 'var(--bg-primary)',
                    padding: '12px 12px 10px',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{highlight.label}</div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: highlight.tone === 'warning' ? 'var(--warning)' : 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    {highlight.value}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{highlight.detail}</div>
                </div>
              ))}
            </div>
          )}

          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
              Raw provider details
            </summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {Object.entries(usage.data).map(([key, val]) => (
                <UsageValueRow key={key} label={key} value={val} depth={0} />
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function UsageValueRow({
  label,
  value,
  depth,
}: {
  label: string;
  value: unknown;
  depth: number;
}) {
  const isNested = isRecord(value) || Array.isArray(value);

  if (!isNested) {
    return (
      <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textAlign: 'right', wordBreak: 'break-word' }}>
          {formatUsageValue(label, value)}
        </span>
      </div>
    );
  }

  return (
    <details open={depth === 0} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-primary)' }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
        {label}
      </summary>
      <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
        {Array.isArray(value)
          ? value.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No entries</div>
            : value.map((entry, index) => (
                <UsageValueRow key={`${label}-${index}`} label={`${index + 1}`} value={entry} depth={depth + 1} />
              ))
          : Object.keys(value).length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No fields</div>
            : Object.entries(value).map(([childKey, childValue]) => (
                <UsageValueRow key={childKey} label={childKey} value={childValue} depth={depth + 1} />
              ))}
      </div>
    </details>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
