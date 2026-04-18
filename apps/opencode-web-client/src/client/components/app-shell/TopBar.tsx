import React from 'react';
import { useStore } from '../../runtime/store.js';
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector.js';
import { EffortControl } from '../effort/EffortControl.js';
import { UsageBadge } from '../usage/UsageBadge.js';
import { ConnectionStatus } from '../common/ConnectionStatus.js';

export function TopBar() {
  const {
    selectedProvider, selectedModel, selectedAgent,
    setSelectedProvider, setSelectedModel, setSelectedAgent,
    toggleSidebar, toggleRightDrawer, sidebarOpen, rightDrawerOpen,
  } = useStore();

  return (
    <div className="top-bar">
      <button onClick={toggleSidebar} style={iconBtnStyle} title="Toggle sidebar">
        {sidebarOpen ? '◀' : '▶'}
      </button>

      <WorkspaceSelector />

      <div style={{ display: 'flex', gap: 8, marginLeft: 16, alignItems: 'center' }}>
        <Select label="Provider" value={selectedProvider ?? ''} onChange={setSelectedProvider}
          options={['codex', 'copilot', 'openai', 'anthropic']} />
        <Select label="Model" value={selectedModel ?? ''} onChange={setSelectedModel}
          options={['o4-mini', 'o3', 'gpt-4.1', 'claude-sonnet-4']} />
        <Select label="Agent" value={selectedAgent ?? ''} onChange={setSelectedAgent}
          options={['executor', 'generalist', 'peon']} />
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <EffortControl />
        <UsageBadge />
        <ConnectionStatus />
        <button onClick={toggleRightDrawer} style={iconBtnStyle} title="Toggle panel">
          {rightDrawerOpen ? '▶' : '◀'}
        </button>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string | null) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      title={label}
      style={{
        background: '#1a1a2e', color: '#ccc', border: '1px solid #2a2a4a',
        borderRadius: 4, padding: '2px 6px', fontSize: 12, cursor: 'pointer',
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
  fontSize: 14, padding: '4px 8px',
};
