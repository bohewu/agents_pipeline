import React from 'react';
import { useStore } from '../../runtime/store.js';
import { SessionList } from '../sessions/SessionList.js';
import { api } from '../../lib/api-client.js';
import { PlusIcon } from '../common/Icons.js';

export function Sidebar() {
  const {
    activeWorkspaceId,
    selectedProvider,
    selectedModel,
    selectedAgent,
    setSessions,
    setActiveSession,
    setWorkspaceDialogOpen,
  } = useStore();

  const handleNewSession = async () => {
    if (!activeWorkspaceId) return;
    try {
      const session = await api.createSession(activeWorkspaceId, {
        providerId: selectedProvider ?? undefined,
        modelId: selectedModel ?? undefined,
        agentId: selectedAgent ?? undefined,
      });
      const sessions = await api.listSessions(activeWorkspaceId);
      setSessions(activeWorkspaceId, sessions);
      setActiveSession(activeWorkspaceId, session.id);
    } catch {
      /* ignore */
    }
  };

  if (!activeWorkspaceId) {
    return (
      <div className="sidebar oc-sidebar-shell">
        <div className="oc-sidebar-title">Chats</div>
        <div className="oc-sidebar-empty">
          Open a workspace first, then each repo gets its own chat history here.
        </div>
        <button type="button" onClick={() => setWorkspaceDialogOpen(true)} className="oc-primary-button oc-primary-button--full">
          Open workspace
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar oc-sidebar-shell">
      <div className="oc-sidebar-header">
        <span className="oc-sidebar-title">Chats</span>
        <button type="button" onClick={handleNewSession} className="oc-icon-button oc-icon-button--soft" title="New chat">
          <PlusIcon size={16} />
        </button>
      </div>
      <SessionList />
    </div>
  );
}
