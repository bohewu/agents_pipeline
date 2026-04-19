import React from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function ErrorCard({ part }: { part: NormalizedPart }) {
  return (
    <div style={{
      background: 'var(--error-soft)', border: '1px solid rgba(196, 66, 47, 0.18)', borderRadius: 14,
      padding: '10px 14px', marginTop: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: 'var(--error)', fontSize: 14 }}>✕</span>
        <span style={{ color: 'var(--error)', fontSize: 13, fontWeight: 600 }}>Error</span>
      </div>
      <div style={{ color: 'var(--error)', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {part.error ?? part.text ?? 'Unknown error'}
      </div>
    </div>
  );
}
