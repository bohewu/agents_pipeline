import React from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function ErrorCard({ part }: { part: NormalizedPart }) {
  return (
    <div style={{
      background: '#2a0a0a', border: '1px solid #f44336', borderRadius: 4,
      padding: '10px 14px', marginTop: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: '#f44336', fontSize: 14 }}>✕</span>
        <span style={{ color: '#ef9a9a', fontSize: 13, fontWeight: 500 }}>Error</span>
      </div>
      <div style={{ color: '#ef9a9a', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {part.error ?? part.text ?? 'Unknown error'}
      </div>
    </div>
  );
}
