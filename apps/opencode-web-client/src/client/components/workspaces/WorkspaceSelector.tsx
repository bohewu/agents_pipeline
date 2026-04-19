import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { shortenPath } from '../../lib/path-display.js';
import { ChevronDownIcon, FolderIcon, PlusIcon } from '../common/Icons.js';

export function WorkspaceSelector() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, setWorkspaceDialogOpen } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (id: string) => {
    try {
      await api.selectWorkspace(id);
      setActiveWorkspace(id);
      setOpen(false);
    } catch {
      /* ignore */
    }
  };

  const handleOpenWorkspaceDialog = () => {
    setOpen(false);
    setWorkspaceDialogOpen(true);
  };

  return (
    <div ref={ref} className="oc-workspace-selector">
      <button
        type="button"
        onClick={() => (workspaces.length === 0 ? handleOpenWorkspaceDialog() : setOpen(!open))}
        className="oc-pill-button oc-pill-button--workspace"
      >
        <FolderIcon size={15} />
        <span className="oc-workspace-selector__label">
          {active ? active.name || shortenPath(active.rootPath) : 'Open workspace'}
        </span>
        {workspaces.length > 0 && <ChevronDownIcon size={14} className={`oc-workspace-selector__chevron ${open ? 'is-open' : ''}`} />}
      </button>

      {open && (
        <div className="oc-workspace-menu">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => handleSelect(workspace.id)}
              className={`oc-workspace-menu__item ${workspace.id === activeWorkspaceId ? 'is-active' : ''}`}
            >
              <div className="oc-workspace-menu__name">{workspace.name || shortenPath(workspace.rootPath)}</div>
              <div className="oc-workspace-menu__path">{shortenPath(workspace.rootPath)}</div>
            </button>
          ))}

          <div className="oc-workspace-menu__footer">
            <button type="button" onClick={handleOpenWorkspaceDialog} className="oc-link-button">
              <PlusIcon size={14} />
              <span>Add workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
