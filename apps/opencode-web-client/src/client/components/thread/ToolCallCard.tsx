import React, { useState } from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function ToolCallCard({ part }: { part: NormalizedPart }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: '#12192e', border: '1px solid #2a2a4a', borderRadius: 4,
      padding: '8px 12px', marginTop: 6, fontSize: 13,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ color: '#ff9800', fontSize: 12 }}>⚙</span>
        <span style={{ color: '#4c9eff', fontFamily: 'monospace' }}>{part.toolName}</span>
        <span style={{ color: '#666', fontSize: 11 }}>{part.status ?? ''}</span>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && part.args && (
        <pre style={{
          marginTop: 8, padding: 8, background: '#0d1117', borderRadius: 4,
          color: '#aaa', fontSize: 12, overflow: 'auto', maxHeight: 200,
          fontFamily: 'monospace',
        }}>
          {JSON.stringify(part.args, null, 2)}
        </pre>
      )}
    </div>
  );
}
