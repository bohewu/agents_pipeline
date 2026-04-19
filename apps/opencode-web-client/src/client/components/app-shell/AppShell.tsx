import React, { Suspense, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { handleBffEvent } from '../../runtime/event-reducer.js';
import { RuntimeProvider } from '../../runtime/runtime-provider.js';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { RightDrawer } from './RightDrawer.js';
import { Thread } from '../thread/Thread.js';
import { AddWorkspaceDialog } from '../workspaces/AddWorkspaceDialog.js';
import type { WorkspaceBootstrap } from '../../../shared/types.js';

export function AppShell() {
  const {
    activeWorkspaceId,
    sidebarOpen,
    rightDrawerOpen,
    workspaceDialogOpen,
    setConnection,
    setWorkspaceBootstrap,
    setSessions,
    setActiveSession,
    setMessages,
    setEffort,
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
        if (boot.effort) {
          setEffort(activeWorkspaceId, boot.effort);
        }

        let sessions = boot.sessions;
        let session = sessions[0];

        if (!session) {
          session = await api.createSession(activeWorkspaceId, {
            title: 'New chat',
            providerId: getDefaultProviderId(boot) ?? undefined,
            modelId: getDefaultModelId(boot) ?? undefined,
            agentId: getDefaultAgentId(boot) ?? undefined,
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
  }, [activeWorkspaceId]);

  const gridCols = [
    sidebarOpen ? '260px' : '0px',
    '1fr',
    rightDrawerOpen ? '340px' : '0px',
  ].join(' ');

  return (
    <div className="app-shell" style={{ gridTemplateColumns: gridCols }}>
      <TopBar />
      {sidebarOpen && <Sidebar />}
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

function getDefaultProviderId(boot?: WorkspaceBootstrap): string | null {
  const providers = boot?.opencode?.providers ?? []
  return providers.find((provider) => provider.connected)?.id ?? providers[0]?.id ?? null
}

function getDefaultModelId(boot?: WorkspaceBootstrap): string | null {
  const providers = boot?.opencode?.providers ?? []
  const models = boot?.opencode?.models ?? []
  const providerId = getDefaultProviderId(boot)
  if (!providerId) return null

  const provider = providers.find((entry) => entry.id === providerId)
  const providerModels = models.filter((model) => model.providerId === providerId)

  return provider?.defaultModelId
    ?? providerModels.find((model) => model.isDefault)?.id
    ?? providerModels[0]?.id
    ?? null
}

function getDefaultAgentId(boot?: WorkspaceBootstrap): string | null {
  const agents = boot?.opencode?.agents ?? []
  return agents.find((agent) => agent.id === 'build')?.id
    ?? agents.find((agent) => agent.mode === 'primary')?.id
    ?? agents[0]?.id
    ?? null
}
