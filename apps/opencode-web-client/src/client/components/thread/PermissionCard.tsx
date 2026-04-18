import React from 'react';
import type { NormalizedPart } from '../../../shared/types.js';

export function PermissionCard({ part }: { part: NormalizedPart }) {
  // Permission resolution is handled via the PermissionsPanel or inline
  return (
    <div style={{
      background: '#2a1a00', border: '1px solid #ff9800', borderRadius: 4,
      padding: '10px 14px', marginTop: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: '#ff9800', fontSize: 14 }}>⚠</span>
        <span style={{ color: '#ffb74d', fontSize: 13, fontWeight: 500 }}>Permission Required</span>
      </div>
      <div style={{ color: '#ccc', fontSize: 13 }}>
        <span style={{ fontFamily: 'monospace', color: '#4c9eff' }}>{part.toolName}</span>
        {' requests approval'}
      </div>
      {part.args && (
        <pre style={{
          marginTop: 6, padding: 6, background: '#1a1200', borderRadius: 3,
          color: '#999', fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 100,
        }}>
          {JSON.stringify(part.args, null, 2)}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={{
          background: '#4caf50', color: '#fff', border: 'none', borderRadius: 3,
          padding: '4px 14px', fontSize: 12, cursor: 'pointer',
        }}>Allow</button>
        <button style={{
          background: '#f44336', color: '#fff', border: 'none', borderRadius: 3,
          padding: '4px 14px', fontSize: 12, cursor: 'pointer',
        }}>Deny</button>
      </div>
    </div>
  );
}
