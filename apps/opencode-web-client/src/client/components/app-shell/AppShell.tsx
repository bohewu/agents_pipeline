import React, { Suspense, useEffect } from 'react';
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
        let session = sessions[0];

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
      <Suspense fallback={<ChatShellFallback />}>
        <RuntimeProvider>
          <div className="main-content">
            <Thread />
          </div>
        </RuntimeProvider>
      </Suspense>
      <RightDrawer />
      {workspaceDialogOpen && <AddWorkspaceDialog onClose={() => setWorkspaceDialogOpen(false)} />}
    </div>
  );
}

function ChatShellFallback() {
  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: '28px 24px 12px' }}>
        <div style={{
          maxWidth: 880,
          margin: '0 auto',
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ maxWidth: 720 }}>
              <div className="oc-message-card" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', minHeight: 88 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div className="oc-message-card" style={{ background: 'var(--accent-soft)', border: '1px solid rgba(37, 99, 235, 0.12)', minHeight: 56, width: 'min(420px, 72%)' }} />
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingLeft: 4 }}>
              Connecting chat runtime...
            </div>
          </div>
          <div className="oc-composer-shell" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="oc-composer-root" style={{ opacity: 0.88 }}>
              <div className="oc-composer-toolbar">
                <div style={{ width: 180, height: 32, borderRadius: 999, background: 'var(--bg-primary)', border: '1px solid var(--border)' }} />
              </div>
              <div className="oc-composer-main">
                <div style={{ flex: 1, height: 92, borderRadius: 22, background: 'var(--bg-primary)', border: '1px solid var(--border)' }} />
                <div style={{ width: 84, height: 42, borderRadius: 999, background: 'var(--bg-hover)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
