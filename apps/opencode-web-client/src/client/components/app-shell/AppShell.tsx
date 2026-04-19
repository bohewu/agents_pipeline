import React, { useEffect } from 'react';
import { getCachedUsage, readUsageCacheSnapshot, useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { handleBffEvent } from '../../runtime/event-reducer.js';
import { RuntimeProvider } from '../../runtime/runtime-provider.js';
import { Sidebar } from './Sidebar.js';
import { RightDrawer } from './RightDrawer.js';
import { Thread } from '../thread/Thread.js';
import { AddWorkspaceDialog } from '../workspaces/AddWorkspaceDialog.js';
import { AppSettingsDialog } from '../settings/AppSettingsDialog.js';
import { resolveAgentId, resolveModelId, resolveProviderId } from '../../lib/opencode-controls.js';
import { mergeSessionMessages, sortSessionsForSidebar } from '../../lib/session-meta.js';

export function AppShell() {
  const {
    activeWorkspaceId,
    sidebarOpen,
    rightDrawerOpen,
    workspaceDialogOpen,
    settingsDialogOpen,
    selectedProvider,
    selectedModel,
    selectedAgent,
    setConnection,
    setWorkspaceBootstrap,
    setWorkspaceServerStatus,
    setSessions,
    setActiveSession,
    setMessages,
    setEffort,
    setUsage,
    setUsageLoading,
    setSelectedProvider,
    setSelectedModel,
    setSelectedAgent,
    setWorkspaceDialogOpen,
    setSettingsDialogOpen,
  } = useStore();
  const compactDesktop = useViewportWidth() <= 1440;
  const sidebarWidth = compactDesktop ? '248px' : '280px';
  const drawerWidth = compactDesktop ? '300px' : '360px';

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;

    const cachedUsage = getCachedUsage(useStore.getState().usageByWorkspace, activeWorkspaceId, selectedProvider)
      ?? readUsageCacheSnapshot(activeWorkspaceId, selectedProvider);

    if (cachedUsage) {
      setUsage(activeWorkspaceId, cachedUsage, selectedProvider);
    }

    setUsageLoading(activeWorkspaceId, true, selectedProvider);
    void api.getUsage(activeWorkspaceId, selectedProvider ?? undefined)
      .then((usage) => {
        if (!cancelled) {
          setUsage(activeWorkspaceId, usage, selectedProvider);
        }
      })
      .catch(() => {
        /* ignore usage prefetch errors */
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(activeWorkspaceId, false, selectedProvider);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, selectedProvider, setUsage, setUsageLoading]);

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
        if (boot.server) {
          setWorkspaceServerStatus(activeWorkspaceId, boot.server);
        }
        const providerId = resolveProviderId(boot, selectedProvider);
        const modelId = resolveModelId(boot, providerId, selectedModel);
        const agentId = resolveAgentId(boot, selectedAgent);

        setSelectedProvider(providerId);
        setSelectedModel(modelId);
        setSelectedAgent(agentId);

        if (boot.effort) {
          setEffort(activeWorkspaceId, boot.effort);
        }

        let sessions = sortSessionsForSidebar(boot.sessions);
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

        setSessions(activeWorkspaceId, sortSessionsForSidebar(sessions));
        setActiveSession(activeWorkspaceId, session.id);

        const messages = await api.listMessages(activeWorkspaceId, session.id).catch(() => []);
        if (cancelled) return;

        setMessages(session.id, messages);
        setSessions(activeWorkspaceId, mergeSessionMessages(sessions, session.id, messages));
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
    setEffort,
    setMessages,
    setSelectedAgent,
    setSelectedModel,
    setSelectedProvider,
    setSessions,
    setWorkspaceBootstrap,
    setWorkspaceServerStatus,
    setConnection,
    setActiveSession,
  ]);

  const gridCols = [
    sidebarOpen ? sidebarWidth : '56px',
    'minmax(0, 1fr)',
    rightDrawerOpen ? drawerWidth : '56px',
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
      {settingsDialogOpen && <AppSettingsDialog onClose={() => setSettingsDialogOpen(false)} />}
    </div>
  );
}

function useViewportWidth() {
  const [width, setWidth] = React.useState(() => window.innerWidth);

  React.useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}
