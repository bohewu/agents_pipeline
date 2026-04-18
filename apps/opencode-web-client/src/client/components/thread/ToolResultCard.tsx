import React, { useState } from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function ToolResultCard({ part }: { part: NormalizedPart }) {
  const [expanded, setExpanded] = useState(false);
  const resultStr = part.result != null ? (typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2)) : '';
  const preview = resultStr.length > 120 ? resultStr.slice(0, 120) + '…' : resultStr;

  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1e3a1e', borderRadius: 4,
      padding: '8px 12px', marginTop: 4, fontSize: 12,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ color: '#4caf50' }}>✓</span>
        <span style={{ color: '#888', fontFamily: 'monospace' }}>{part.toolName ?? 'result'}</span>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {!expanded && preview && (
        <div style={{ color: '#777', fontFamily: 'monospace', marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 11 }}>
          {preview}
        </div>
      )}
      {expanded && resultStr && (
        <pre style={{
          marginTop: 8, padding: 8, background: '#080c14', borderRadius: 4,
          color: '#aaa', fontSize: 11, overflow: 'auto', maxHeight: 300,
          fontFamily: 'monospace', whiteSpace: 'pre-wrap',
        }}>
          {resultStr}
        </pre>
      )}
    </div>
  );
}
