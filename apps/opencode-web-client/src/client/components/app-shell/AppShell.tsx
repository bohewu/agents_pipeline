import React, { useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { handleBffEvent } from '../../runtime/event-reducer.js';
import { RuntimeProvider } from '../../runtime/runtime-provider.js';
import { Sidebar } from './Sidebar.js';
import { RightDrawer } from './RightDrawer.js';
import { Thread } from '../thread/Thread.js';
import { AddWorkspaceDialog } from '../workspaces/AddWorkspaceDialog.js';
import { resolveAgentId, resolveModelId, resolveProviderId } from '../../lib/opencode-controls.js';

export function AppShell() {
  const {
    activeWorkspaceId,
    sidebarOpen,
    rightDrawerOpen,
    workspaceDialogOpen,
    selectedProvider,
    selectedModel,
    selectedAgent,
    setConnection,
    setWorkspaceBootstrap,
    setSessions,
    setActiveSession,
    setMessages,
    setEffort,
    setSelectedProvider,
    setSelectedModel,
    setSelectedAgent,
    setWorkspaceDialogOpen,
  } = useStore();

  // Bootstrap workspace on selection
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;

    const hydrateWorkspace = async () => {
      setConnection(activeWorkspaceId, 'connecting');

      try {
        const boot = await api.getBootstrap(activeWorkspaceId);
        if (cancelled) return;

        setWorkspaceBootstrap(activeWorkspaceId, boot);
        const providerId = resolveProviderId(boot, selectedProvider);
        const modelId = resolveModelId(boot, providerId, selectedModel);
        const agentId = resolveAgentId(boot, selectedAgent);

        setSelectedProvider(providerId);
        setSelectedModel(modelId);
        setSelectedAgent(agentId);

        if (boot.effort) {
          setEffort(activeWorkspaceId, boot.effort);
        }

        let sessions = boot.sessions;
        const previousSessionId = useStore.getState().activeSessionByWorkspace[activeWorkspaceId];
        let session = sessions.find((entry) => entry.id === previousSessionId)
          ?? [...sessions].sort((left, right) => {
            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
          })[0];

        if (!session) {
          session = await api.createSession(activeWorkspaceId, {
            title: 'New chat',
            providerId: providerId ?? undefined,
            modelId: modelId ?? undefined,
            agentId: agentId ?? undefined,
          });
          sessions = [session];
        }

        if (cancelled) return;

        setSessions(activeWorkspaceId, sessions);
        setActiveSession(activeWorkspaceId, session.id);

        const messages = await api.listMessages(activeWorkspaceId, session.id).catch(() => []);
        if (cancelled) return;

        setMessages(session.id, messages);
        setConnection(activeWorkspaceId, 'connected');
      } catch {
        if (!cancelled) {
          setConnection(activeWorkspaceId, 'error');
        }
      }
    };

    const close = api.connectEvents(
      activeWorkspaceId,
      (event) => handleBffEvent(event, useStore.getState()),
      () => {
        if (!cancelled) {
          setConnection(activeWorkspaceId, 'error');
        }
      },
    );

    hydrateWorkspace();

    return () => {
      cancelled = true;
      close();
      setConnection(activeWorkspaceId, 'disconnected');
    };
  }, [
    activeWorkspaceId,
    selectedAgent,
    selectedModel,
    selectedProvider,
    setEffort,
    setMessages,
    setSelectedAgent,
    setSelectedModel,
    setSelectedProvider,
    setSessions,
    setWorkspaceBootstrap,
    setConnection,
    setActiveSession,
  ]);

  const gridCols = [
    sidebarOpen ? '280px' : '56px',
    'minmax(0, 1fr)',
    rightDrawerOpen ? '360px' : '56px',
  ].join(' ');

  return (
    <div className="app-shell" style={{ gridTemplateColumns: gridCols }}>
      <Sidebar />
      <RuntimeProvider>
        <div className="main-content">
          <Thread />
        </div>
      </RuntimeProvider>
      <RightDrawer />
      {workspaceDialogOpen && <AddWorkspaceDialog onClose={() => setWorkspaceDialogOpen(false)} />}
    </div>
  );
}
