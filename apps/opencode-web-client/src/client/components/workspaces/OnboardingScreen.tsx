import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView.js';
import { AddWorkspaceDialog } from './AddWorkspaceDialog.js';

export function OnboardingScreen() {
  const { install, setWorkspaces, setActiveWorkspace } = useStore();
  const [showAdd, setShowAdd] = useState(false);

  const handleDiscover = async () => {
    try {
      const discovered = await api.discoverWorkspaces({ path: '~' });
      if (discovered.length > 0) {
        const ws = await api.listWorkspaces();
        setWorkspaces(ws);
        setActiveWorkspace(ws[0].id);
      }
    } catch { /* ignore */ }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: 32, gap: 24,
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 300, color: '#e0e0e0' }}>
        Welcome to <span style={{ color: '#4c9eff', fontWeight: 600 }}>OpenCode Web</span>
      </h1>
      <p style={{ color: '#888', maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
        Connect to a workspace to start coding with AI assistance.
      </p>

      {install && (
        <div style={{
          background: '#16213e', borderRadius: 8, padding: 16, width: '100%', maxWidth: 480,
          border: '1px solid #2a2a4a',
        }}>
          <h3 style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>System Status</h3>
          <DiagnosticsView compact />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setShowAdd(true)} style={primaryBtn}>
          Add Workspace
        </button>
        <button onClick={handleDiscover} style={secondaryBtn}>
          Discover Workspaces
        </button>
      </div>

      {showAdd && <AddWorkspaceDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: '#4c9eff', color: '#fff', border: 'none', borderRadius: 6,
  padding: '10px 24px', fontSize: 14, cursor: 'pointer', fontWeight: 500,
};
const secondaryBtn: React.CSSProperties = {
  background: 'transparent', color: '#4c9eff', border: '1px solid #4c9eff',
  borderRadius: 6, padding: '10px 24px', fontSize: 14, cursor: 'pointer',
};
