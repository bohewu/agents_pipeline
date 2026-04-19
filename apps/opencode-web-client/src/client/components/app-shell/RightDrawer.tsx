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
          <button type="button" onClick={toggleRightDrawer} className="oc-icon-button oc-icon-button--soft" title="Show inspector">
            <PanelRightIcon size={16} className="oc-icon--flipped" />
          </button>
        </div>
      ) : (
        <div className="right-drawer right-drawer--open">
          <div className="right-drawer__header">
            <div className="right-drawer__toolbar" role="tablist" aria-label="Inspector panels">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRightPanel(tab.key)}
                  role="tab"
                  aria-selected={rightPanel === tab.key}
                  className={`right-drawer__tab ${rightPanel === tab.key ? 'is-active' : ''}`}
                  title={tab.label}
                >
                  <tab.icon size={16} />
                </button>
              ))}
            </div>

            <button type="button" onClick={toggleRightDrawer} className="right-drawer__close" title="Hide inspector">
              <PanelRightIcon size={16} />
            </button>
          </div>

          <div className="right-drawer__title">{activeTab.label}</div>
          <div key={rightPanel} className="right-drawer__content">
            {renderPanel()}
          </div>
        </div>
      )}
    </aside>
  );
}
