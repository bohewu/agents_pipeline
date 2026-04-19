import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { shortenPath } from '../../lib/path-display.js';
import { ChevronDownIcon, FolderIcon, PlusIcon } from '../common/Icons.js';

export function WorkspaceSelector({ fullWidth = false }: { fullWidth?: boolean }) {
  const {
    workspaces,
    activeWorkspaceId,
    settings,
    serverStatusByWorkspace,
    sessionsByWorkspace,
    setActiveWorkspace,
    setWorkspaceDialogOpen,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const pendingWorkspace = workspaces.find((workspace) => workspace.id === pendingWorkspaceId) ?? null;
  const hasInactiveActivity = workspaces.some((workspace) => {
    return workspace.id !== activeWorkspaceId && hasRunningSession(sessionsByWorkspace[workspace.id] ?? []);
  });
  const hasInactiveWarning = workspaces.some((workspace) => {
    return workspace.id !== activeWorkspaceId && serverStatusByWorkspace[workspace.id]?.state === 'unhealthy';
  });
  const selectorIndicator = hasInactiveActivity
    ? { className: 'is-active-work', label: 'Background activity in another workspace' }
    : hasInactiveWarning
      ? { className: 'is-warning', label: 'Another workspace needs attention' }
      : null;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (id: string) => {
    if (id === activeWorkspaceId || pendingWorkspaceId) {
      setOpen(false);
      return;
    }

    setPendingWorkspaceId(id);
    setOpen(false);

    try {
      await api.selectWorkspace(id);
      setActiveWorkspace(id);
    } catch {
      /* ignore */
    } finally {
      setPendingWorkspaceId(null);
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
        className={`oc-pill-button oc-pill-button--workspace ${fullWidth ? 'oc-pill-button--full' : ''}`.trim()}
        aria-busy={pendingWorkspaceId ? 'true' : 'false'}
        disabled={!!pendingWorkspaceId}
      >
        <FolderIcon size={15} />
        <span className="oc-workspace-selector__label">
          {pendingWorkspace
            ? `Switching to ${pendingWorkspace.name || shortenPath(pendingWorkspace.rootPath)}`
            : active
              ? active.name || shortenPath(active.rootPath)
              : 'Open workspace'}
        </span>
        {selectorIndicator && (
          <span
            className={`oc-workspace-status-dot ${selectorIndicator.className}`}
            title={selectorIndicator.label}
            aria-label={selectorIndicator.label}
          />
        )}
        {workspaces.length > 0 && <ChevronDownIcon size={14} className={`oc-workspace-selector__chevron ${open ? 'is-open' : ''}`} />}
      </button>

      {pendingWorkspace && (
        <div className="oc-workspace-selector__hint" role="status" aria-live="polite">
          Starting the workspace runtime and loading chats...
        </div>
      )}

      {open && (
        <div className="oc-workspace-menu">
          {workspaces.map((workspace) => {
            const indicator = getWorkspaceIndicator(
              workspace.id === activeWorkspaceId,
              serverStatusByWorkspace[workspace.id],
              sessionsByWorkspace[workspace.id] ?? [],
            );

            return (
              <button
                key={workspace.id}
                type="button"
                onClick={() => handleSelect(workspace.id)}
                className={`oc-workspace-menu__item ${workspace.id === activeWorkspaceId ? 'is-active' : ''} ${workspace.id === pendingWorkspaceId ? 'is-pending' : ''}`}
                title={indicator?.label}
                disabled={!!pendingWorkspaceId}
              >
                <div className="oc-workspace-menu__row">
                  <div className="oc-workspace-menu__name">{workspace.name || shortenPath(workspace.rootPath)}</div>
                  {workspace.id === pendingWorkspaceId && <span className="oc-workspace-menu__pending">Switching...</span>}
                  {indicator && (
                    <span className="oc-workspace-menu__status">
                      <span
                        className={`oc-workspace-status-dot ${indicator.className}`}
                        title={indicator.label}
                        aria-label={indicator.label}
                      />
                      {settings.workspaceIndicatorStyle === 'dot-label' && (
                        <span className="oc-workspace-menu__status-label">{indicator.shortLabel}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="oc-workspace-menu__path">{shortenPath(workspace.rootPath)}</div>
              </button>
            );
          })}

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

function getWorkspaceIndicator(
  isActive: boolean,
  serverStatus: ReturnType<typeof useStore.getState>['serverStatusByWorkspace'][string] | undefined,
  sessions: ReturnType<typeof useStore.getState>['sessionsByWorkspace'][string],
): {
  className: string;
  label: string;
  shortLabel: string;
} | null {
  if (!isActive && hasRunningSession(sessions)) {
    return { className: 'is-active-work', label: 'Background activity', shortLabel: 'Running' };
  }

  if (!isActive && serverStatus?.state === 'unhealthy') {
    return { className: 'is-warning', label: 'Needs attention', shortLabel: 'Alert' };
  }

  return null;
}

function hasRunningSession(sessions: ReturnType<typeof useStore.getState>['sessionsByWorkspace'][string]): boolean {
  return (sessions ?? []).some((session) => session.state === 'running');
}
