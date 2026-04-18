import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

export function AddWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const { setWorkspaces, setActiveWorkspace } = useStore();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    if (!path.trim()) { setError('Path is required'); return; }
    setValidating(true);
    setError('');
    try {
      const check = await api.validateWorkspace({ rootPath: path.trim() });
      if (!check.valid) { setError(check.error ?? 'Invalid path'); setValidating(false); return; }
      await api.addWorkspace({ rootPath: path.trim(), name: name.trim() || undefined });
      const ws = await api.listWorkspaces();
      setWorkspaces(ws);
      if (ws.length > 0) setActiveWorkspace(ws[ws.length - 1].id);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add workspace');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#16213e', borderRadius: 8, padding: 24, width: 420,
        border: '1px solid #2a2a4a',
      }}>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: '#e0e0e0' }}>Add Workspace</h2>

        <label style={labelStyle}>Path</label>
        <input value={path} onChange={(e) => setPath(e.target.value)}
          placeholder="/home/user/project" style={inputStyle} autoFocus />

        <label style={labelStyle}>Name (optional)</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="My Project" style={inputStyle} />

        {error && <div style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'transparent', color: '#aaa', border: '1px solid #2a2a4a',
            borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={validating} style={{
            background: '#4c9eff', color: '#fff', border: 'none',
            borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
            opacity: validating ? 0.6 : 1,
          }}>{validating ? 'Validating...' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#888', marginBottom: 4, marginTop: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
  borderRadius: 4, padding: '8px 10px', fontSize: 13, outline: 'none',
};
