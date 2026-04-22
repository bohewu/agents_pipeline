import React, { startTransition, useEffect } from 'react';
import {
  deriveWorkspaceCapabilityGaps,
  getCachedUsage,
  readUsageCacheSnapshot,
  selectActiveWorkspaceCapabilities,
  type WorkspaceCapabilityGap,
  useStore,
} from '../../runtime/store.js';
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
    activeSessionByWorkspace,
    sidebarOpen,
    rightDrawerOpen,
    workspaceDialogOpen,
    settingsDialogOpen,
    selectedProvider,
    selectedModel,
    selectedAgent,
    setConnection,
    setWorkspaceBootstrap,
    setWorkspaceCapabilities,
    setWorkspaceContextCatalog,
    setWorkspaceContextCatalogError,
    setWorkspaceContextCatalogLoading,
    setWorkspaceServerStatus,
    setSessions,
    setActiveSession,
    setMessages,
    setEffort,
    setUsage,
    setUsageLoading,
    setSelectedProvider,
    setSelectedModel,
    setSelectedModelVariant,
    setSelectedAgent,
    clearWorkspaceStreaming,
    setWorkspaceDialogOpen,
    setSettingsDialogOpen,
  } = useStore();
  const activeWorkspaceCapabilities = useStore(selectActiveWorkspaceCapabilities);
  const capabilityGaps = React.useMemo(
    () => deriveWorkspaceCapabilityGaps(activeWorkspaceCapabilities),
    [activeWorkspaceCapabilities],
  );
  const compactDesktop = useViewportWidth() <= 1440;
  const sidebarWidth = compactDesktop ? '248px' : '280px';
  const drawerWidth = compactDesktop ? '320px' : '384px';
  const activeSessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

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
    let hydrateRequestId = 0;
    const workspaceId = activeWorkspaceId;

    const restoreWorkspaceSession = async (
      boot: Awaited<ReturnType<typeof api.getBootstrap>>,
      providerId: string | null,
      modelId: string | null,
      agentId: string | null,
      requestId: number,
    ) => {
      let sessions = sortSessionsForSidebar(boot.sessions);
      const previousSessionId = useStore.getState().activeSessionByWorkspace[workspaceId];
      let session = sessions.find((entry) => entry.id === previousSessionId)
        ?? [...sessions].sort((left, right) => {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        })[0];

      if (!session) {
        session = await api.createSession(workspaceId, {
          title: 'New chat',
          providerId: providerId ?? undefined,
          modelId: modelId ?? undefined,
          agentId: agentId ?? undefined,
        });
        sessions = [session];
      }

      if (cancelled || requestId !== hydrateRequestId) return;

      const sortedSessions = sortSessionsForSidebar(sessions);
      setSessions(workspaceId, sortedSessions);
      setActiveSession(workspaceId, session.id);

      const messages = await api.listMessages(workspaceId, session.id).catch(() => []);
      if (cancelled || requestId !== hydrateRequestId) return;

      setMessages(workspaceId, session.id, messages);
      setSessions(workspaceId, mergeSessionMessages(sortedSessions, session.id, messages));
    };

    const hydrateWorkspace = async (reason: 'load' | 'reconnect' = 'load') => {
      const requestId = ++hydrateRequestId;
      if (reason === 'load') {
        clearWorkspaceStreaming(workspaceId);
      }
      setConnection(workspaceId, 'connecting');

      void (async () => {
        setWorkspaceContextCatalogLoading(workspaceId, true);
        setWorkspaceContextCatalogError(workspaceId, null);

        try {
          const catalog = await api.getWorkspaceContextCatalog(workspaceId);
          if (cancelled || requestId !== hydrateRequestId) return;

          setWorkspaceContextCatalog(workspaceId, catalog);
          setWorkspaceContextCatalogError(workspaceId, null);
        } catch (error) {
          if (!cancelled && requestId === hydrateRequestId) {
            setWorkspaceContextCatalogError(
              workspaceId,
              resolveErrorMessage(error, `Failed to load the workspace context catalog for ${workspaceId}.`),
            );
          }
        } finally {
          if (!cancelled && requestId === hydrateRequestId) {
            setWorkspaceContextCatalogLoading(workspaceId, false);
          }
        }
      })();

      try {
        const boot = await api.getBootstrap(workspaceId);
        if (cancelled || requestId !== hydrateRequestId) return;

        setWorkspaceBootstrap(workspaceId, boot);
        if (boot.server) {
          setWorkspaceServerStatus(workspaceId, boot.server);
        }
        const providerId = resolveProviderId(boot, selectedProvider);
        const modelId = resolveModelId(boot, providerId, selectedModel);
        const agentId = resolveAgentId(boot, selectedAgent);

        setSelectedProvider(providerId);
        setSelectedModel(modelId);
        setSelectedModelVariant(null);
        setSelectedAgent(agentId);

        if (boot.effort) {
          setEffort(workspaceId, boot.effort);
        }

        await restoreWorkspaceSession(boot, providerId, modelId, agentId, requestId);
        if (cancelled || requestId !== hydrateRequestId) return;

        setConnection(workspaceId, 'connected');
      } catch {
        if (!cancelled && requestId === hydrateRequestId) {
          await api.getWorkspaceCapabilities(workspaceId)
            .then((capabilities) => {
              if (!cancelled && requestId === hydrateRequestId) {
                setWorkspaceCapabilities(workspaceId, capabilities);
              }
            })
            .catch(() => {
              /* ignore capability fallback errors */
            });
          setConnection(workspaceId, 'error');
        }
      }
    };

    const close = api.connectEvents(
      workspaceId,
      (event) => {
        if (event.type === 'connection.ping' && event.payload.reconnected === true) {
          void hydrateWorkspace('reconnect');
          return;
        }

        startTransition(() => handleBffEvent(event, useStore.getState()));
      },
      () => {
        if (!cancelled) {
          setConnection(workspaceId, 'error');
        }
      },
    );

    void hydrateWorkspace();

    return () => {
      cancelled = true;
      close();
      clearWorkspaceStreaming(workspaceId);
      setWorkspaceContextCatalogLoading(workspaceId, false);
      setConnection(workspaceId, 'disconnected');
    };
  }, [
    activeWorkspaceId,
    setEffort,
    setMessages,
    setSelectedAgent,
    setSelectedModel,
    setSelectedModelVariant,
    setSelectedProvider,
    setWorkspaceCapabilities,
    setWorkspaceContextCatalog,
    setWorkspaceContextCatalogError,
    setWorkspaceContextCatalogLoading,
    setSessions,
    clearWorkspaceStreaming,
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
      <RuntimeProvider key={`${activeWorkspaceId ?? 'no-workspace'}:${activeSessionId ?? 'no-session'}`}>
        <div className="main-content">
          {capabilityGaps.length > 0 && <WorkspaceCapabilityBanner gaps={capabilityGaps} />}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Thread />
          </div>
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

function WorkspaceCapabilityBanner({ gaps }: { gaps: WorkspaceCapabilityGap[] }) {
  const hasErrors = gaps.some((gap) => gap.status === 'error');

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: '16px 16px 0',
        padding: '12px 14px',
        borderRadius: 18,
        border: `1px solid ${hasErrors ? 'var(--error)' : 'var(--warning)'}`,
        background: hasErrors ? 'var(--error-soft)' : 'rgba(245, 158, 11, 0.12)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: hasErrors ? 'var(--error)' : 'var(--warning)', marginBottom: 6 }}>
        {hasErrors ? 'Workspace capability probe needs attention' : 'Workspace capability gaps'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {hasErrors
          ? 'Some capability checks failed. Core chat flows still work, but the workspace needs manual attention before those extras are shown as ready.'
          : 'Core chat flows still work. These optional workspace capabilities are currently unavailable.'}
      </div>
      <ul style={{ margin: '10px 0 0 18px', padding: 0, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
        {gaps.map((gap) => (
          <li key={gap.key}>
            <strong style={{ color: 'var(--text-primary)' }}>{gap.label}:</strong>{' '}
            {gap.summary}
            {gap.detail ? ` — ${gap.detail}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}
