import React, { useEffect, useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import type { DiffResponse } from '../../../shared/types.js';

export function DiffPanel() {
  const { activeWorkspaceId, activeSessionByWorkspace } = useStore();
  const [diffs, setDiffs] = useState<DiffResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  const loadDiffs = async () => {
    if (!activeWorkspaceId || !sessionId) return;
    setLoading(true);
    try {
      const d = await api.getDiff(activeWorkspaceId, sessionId);
      setDiffs(d);
    } catch { setDiffs([]); }
    setLoading(false);
  };

  useEffect(() => { loadDiffs(); }, [activeWorkspaceId, sessionId]);

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>Loading diffs...</div>;
  if (diffs.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>No changes</div>;

  return (
    <div>
      {diffs.map((d, i) => {
        const diffText = typeof d.diff === 'string' ? d.diff : '';
        const lines = diffText.length > 0 ? diffText.split('\n') : [];

        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', padding: '4px 0',
              borderBottom: '1px solid var(--border)', marginBottom: 4,
            }}>
              {d.path}
            </div>
            <pre style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
              background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 14, padding: 8, overflow: 'auto', maxHeight: 300,
            }}>
              {lines.length > 0 ? lines.map((line, j) => (
                <div key={j} style={{
                  color: line.startsWith('+') ? 'var(--success)' : line.startsWith('-') ? 'var(--error)' : 'var(--text-muted)',
                  background: line.startsWith('+') ? 'rgba(31,143,95,0.08)' : line.startsWith('-') ? 'rgba(196,66,47,0.08)' : 'transparent',
                }}>
                  {line}
                </div>
              )) : <div style={{ color: 'var(--text-muted)' }}>No unified diff available</div>}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
