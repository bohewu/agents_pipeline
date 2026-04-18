import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { shortenPath } from '../../lib/path-display.js';

export function WorkspaceSelector() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, setWorkspaces } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (id: string) => {
    setActiveWorkspace(id);
    setOpen(false);
    try { await api.selectWorkspace(id); } catch { /* ignore */ }
  };

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
        borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: '#4c9eff' }}>⬡</span>
        {active ? active.name || shortenPath(active.rootPath) : 'Select workspace'}
        <span style={{ fontSize: 10, color: '#888' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#16213e', border: '1px solid #2a2a4a', borderRadius: 6,
          minWidth: 240, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {workspaces.map((ws) => (
            <button key={ws.id} onClick={() => handleSelect(ws.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
              background: ws.id === activeWorkspaceId ? '#2a2a4a' : 'transparent',
              color: '#e0e0e0', border: 'none', cursor: 'pointer', fontSize: 13,
            }}>
              <div>{ws.name || shortenPath(ws.rootPath)}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{shortenPath(ws.rootPath)}</div>
            </button>
          ))}
          <div style={{ borderTop: '1px solid #2a2a4a', padding: '6px 12px' }}>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#4c9eff', cursor: 'pointer', fontSize: 12,
            }}>
              + Add workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
