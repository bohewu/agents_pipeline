import React from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function PermissionCard({ part }: { part: NormalizedPart }) {
  // Permission resolution is handled via the PermissionsPanel or inline
  return (
    <div style={{
      background: 'var(--warning-soft)', border: '1px solid rgba(179, 107, 0, 0.18)', borderRadius: 14,
      padding: '10px 14px', marginTop: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: 'var(--warning)', fontSize: 14 }}>⚠</span>
        <span style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>Permission Required</span>
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{part.toolName}</span>
        {' requests approval'}
      </div>
      {part.args && (
        <pre style={{
          marginTop: 6, padding: 6, background: 'rgba(255,255,255,0.55)', borderRadius: 10,
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 100,
        }}>
          {JSON.stringify(part.args, null, 2)}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={{
          background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 999,
          padding: '4px 14px', fontSize: 12, cursor: 'pointer',
        }}>Allow</button>
        <button style={{
          background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 999,
          padding: '4px 14px', fontSize: 12, cursor: 'pointer',
        }}>Deny</button>
      </div>
    </div>
  );
}
