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

  if (loading) return <div style={{ color: '#888', fontSize: 12, padding: 8 }}>Loading diffs...</div>;
  if (diffs.length === 0) return <div style={{ color: '#666', fontSize: 12, padding: 8 }}>No changes</div>;

  return (
    <div>
      {diffs.map((d, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 12, fontFamily: 'monospace', color: '#4c9eff', padding: '4px 0',
            borderBottom: '1px solid #2a2a4a', marginBottom: 4,
          }}>
            {d.path}
          </div>
          <pre style={{
            fontSize: 11, fontFamily: 'monospace', color: '#aaa', whiteSpace: 'pre-wrap',
            background: '#0d1117', borderRadius: 4, padding: 8, overflow: 'auto', maxHeight: 300,
          }}>
            {d.diff.split('\n').map((line, j) => (
              <div key={j} style={{
                color: line.startsWith('+') ? '#4caf50' : line.startsWith('-') ? '#f44336' : '#888',
                background: line.startsWith('+') ? 'rgba(76,175,80,0.08)' : line.startsWith('-') ? 'rgba(244,67,54,0.08)' : 'transparent',
              }}>
                {line}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
