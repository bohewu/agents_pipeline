import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionList } from '../sessions/SessionList.js';
import { api } from '../../lib/api-client.js';
import { PanelLeftIcon, PlusIcon } from '../common/Icons.js';
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector.js';
import { sortSessionsForSidebar } from '../../lib/session-meta.js';

export function Sidebar() {
  const {
    activeWorkspaceId,
    selectedProvider,
    selectedModel,
    selectedAgent,
    sidebarOpen,
    setSessions,
    setActiveSession,
    setWorkspaceDialogOpen,
    toggleSidebar,
  } = useStore();

  const handleNewSession = async () => {
    if (!activeWorkspaceId) return;
    try {
      const session = await api.createSession(activeWorkspaceId, {
        providerId: selectedProvider ?? undefined,
        modelId: selectedModel ?? undefined,
        agentId: selectedAgent ?? undefined,
      });
      const existingSessions = useStore.getState().sessionsByWorkspace[activeWorkspaceId] ?? [];
      setSessions(activeWorkspaceId, sortSessionsForSidebar([session, ...existingSessions]));
      setActiveSession(activeWorkspaceId, session.id);
      useStore.getState().setMessages(session.id, []);
    } catch {
      /* ignore */
    }
  };

  if (!sidebarOpen) {
    return (
      <aside className="sidebar sidebar--collapsed" aria-label="Chats sidebar collapsed">
        <button type="button" onClick={toggleSidebar} className="oc-icon-button oc-icon-button--soft" title="Show chats">
          <PanelLeftIcon size={16} className="oc-icon--flipped" />
        </button>
      </aside>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <aside className="sidebar sidebar--open oc-sidebar-shell">
        <div className="oc-sidebar-header">
          <button type="button" onClick={toggleSidebar} className="oc-icon-button" title="Hide chats">
            <PanelLeftIcon size={16} />
          </button>
          <div className="oc-sidebar-title">Workspace</div>
          <div className="oc-sidebar-header__spacer" />
        </div>
        <div className="oc-sidebar-workspace">
          <button type="button" onClick={() => setWorkspaceDialogOpen(true)} className="oc-primary-button oc-primary-button--full">
            Open workspace
          </button>
        </div>
        <div className="oc-sidebar-divider" />
        <div className="oc-sidebar-title">Sessions</div>
        <div className="oc-sidebar-empty">
          Open a workspace first. Each repo keeps its own session history here.
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar sidebar--open oc-sidebar-shell">
      <div className="oc-sidebar-header">
        <button type="button" onClick={toggleSidebar} className="oc-icon-button" title="Hide chats">
          <PanelLeftIcon size={16} />
        </button>
        <span className="oc-sidebar-title">Workspace</span>
        <button type="button" onClick={() => setWorkspaceDialogOpen(true)} className="oc-icon-button oc-icon-button--soft" title="Add workspace">
          <PlusIcon size={16} />
        </button>
      </div>
      <div className="oc-sidebar-workspace">
        <WorkspaceSelector fullWidth />
      </div>
      <div className="oc-sidebar-divider" />
      <div className="oc-sidebar-header oc-sidebar-header--tight">
        <span className="oc-sidebar-title">Sessions</span>
        <button type="button" onClick={handleNewSession} className="oc-icon-button oc-icon-button--soft" title="New session">
          <PlusIcon size={16} />
        </button>
      </div>
      <SessionList />
    </aside>
  );
}
