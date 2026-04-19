import React from 'react';
import { useStore, type RightPanel } from '../../runtime/store.js';
import { DiffPanel } from '../panels/DiffPanel.js';
import { FilesPanel } from '../panels/FilesPanel.js';
import { UsagePanel } from '../panels/UsagePanel.js';
import { PermissionsPanel } from '../panels/PermissionsPanel.js';
import { DiagnosticsPanel } from '../panels/DiagnosticsPanel.js';
import { ActivityIcon, DiffIcon, FilesIcon, PanelRightIcon, ShieldIcon, UsageIcon } from '../common/Icons.js';

const TABS: { key: RightPanel; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'diff', label: 'Diff', icon: DiffIcon },
  { key: 'files', label: 'Files', icon: FilesIcon },
  { key: 'usage', label: 'Usage', icon: UsageIcon },
  { key: 'permissions', label: 'Permissions', icon: ShieldIcon },
  { key: 'diagnostics', label: 'Diagnostics', icon: ActivityIcon },
];

export function RightDrawer() {
  const { rightPanel, rightDrawerOpen, setRightPanel, toggleRightDrawer } = useStore();
  const activeTab = TABS.find((tab) => tab.key === rightPanel) ?? TABS[0];

  const openPanel = (panel: RightPanel) => {
    setRightPanel(panel);
    if (!rightDrawerOpen) {
      toggleRightDrawer();
    }
  };

  const renderPanel = () => {
    if (rightPanel === 'diff') return <DiffPanel />;
    if (rightPanel === 'files') return <FilesPanel />;
    if (rightPanel === 'usage') return <UsagePanel />;
    if (rightPanel === 'permissions') return <PermissionsPanel />;
    return <DiagnosticsPanel />;
  };

  return (
    <aside className={`right-drawer-shell ${rightDrawerOpen ? 'is-open' : 'is-closed'}`}>
      {!rightDrawerOpen ? (
        <div className="right-drawer right-drawer--collapsed">
          <div className="right-drawer__collapsed-rail" role="tablist" aria-label="Quick panels">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`right-drawer__collapsed-tab ${rightPanel === tab.key ? 'is-active' : ''}`}
                title={`Open ${tab.label}`}
                onClick={() => openPanel(tab.key)}
              >
                <tab.icon size={16} />
              </button>
            ))}
            <div className="right-drawer__collapsed-label">{activeTab.label}</div>
          </div>
        </div>
      ) : (
        <div className="right-drawer right-drawer--open">
          <div className="right-drawer__header">
            <div className="right-drawer__picker">
              <div className="right-drawer__picker-label">Side panel</div>
              <div className="right-drawer__picker-row">
                <div className="right-drawer__picker-icon" aria-hidden="true">
                  <activeTab.icon size={16} />
                </div>
                <select
                  name="right-panel"
                  value={rightPanel}
                  onChange={(event) => setRightPanel(event.target.value as RightPanel)}
                  className="oc-topbar-select right-drawer__select"
                  aria-label="Side panel"
                >
                  {TABS.map((tab) => (
                    <option key={tab.key} value={tab.key}>{tab.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="button" onClick={toggleRightDrawer} className="right-drawer__close" title="Hide side panel">
              <PanelRightIcon size={16} />
            </button>
          </div>
          <div key={rightPanel} className="right-drawer__content">
            {renderPanel()}
          </div>
        </div>
      )}
    </aside>
  );
}
