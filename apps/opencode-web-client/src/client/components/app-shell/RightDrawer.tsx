import React from 'react';
import { useStore, type RightPanel } from '../../runtime/store.js';
import { DiffPanel } from '../panels/DiffPanel.js';
import { FilesPanel } from '../panels/FilesPanel.js';
import { UsagePanel } from '../panels/UsagePanel.js';
import { PermissionsPanel } from '../panels/PermissionsPanel.js';
import { DiagnosticsPanel } from '../panels/DiagnosticsPanel.js';

const TABS: { key: RightPanel; label: string }[] = [
  { key: 'diff', label: 'Diff' },
  { key: 'files', label: 'Files' },
  { key: 'usage', label: 'Usage' },
  { key: 'permissions', label: 'Perms' },
  { key: 'diagnostics', label: 'Diag' },
];

export function RightDrawer() {
  const { rightPanel, setRightPanel } = useStore();

  return (
    <div className="right-drawer">
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #2a2a4a', marginBottom: 8 }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setRightPanel(tab.key)}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 11, cursor: 'pointer',
              background: rightPanel === tab.key ? '#2a2a4a' : 'transparent',
              color: rightPanel === tab.key ? '#4c9eff' : '#888',
              border: 'none', borderBottom: rightPanel === tab.key ? '2px solid #4c9eff' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {rightPanel === 'diff' && <DiffPanel />}
        {rightPanel === 'files' && <FilesPanel />}
        {rightPanel === 'usage' && <UsagePanel />}
        {rightPanel === 'permissions' && <PermissionsPanel />}
        {rightPanel === 'diagnostics' && <DiagnosticsPanel />}
      </div>
    </div>
  );
}
