import React, { startTransition, useEffect } from 'react';
import {
  deriveWorkspaceCapabilityGaps,
  getCachedUsage,
  readUsageCacheSnapshot,
  selectActiveWorkspaceCapabilities,
  selectWorkspaceSessionLanes,
  type SessionLaneSummary,
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
import { describeLaneAttribution } from '../../lib/lane-meta.js';
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
    workspaceBootstraps,
    sessionsByWorkspace,
    messagesBySession,
    taskEntriesByWorkspace,
    resultAnnotationsByWorkspace,
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
  const sessionLanes = React.useMemo(() => selectWorkspaceSessionLanes({
    sessionsByWorkspace,
    workspaceBootstraps,
    messagesBySession,
    taskEntriesByWorkspace,
    resultAnnotationsByWorkspace,
  }, activeWorkspaceId), [
    activeWorkspaceId,
    messagesBySession,
    resultAnnotationsByWorkspace,
    sessionsByWorkspace,
    taskEntriesByWorkspace,
    workspaceBootstraps,
  ]);

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
          {sessionLanes.length > 1 && <WorkspaceLaneSurface lanes={sessionLanes} activeSessionId={activeSessionId} />}
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

function WorkspaceLaneSurface({
  lanes,
  activeSessionId,
}: {
  lanes: SessionLaneSummary[];
  activeSessionId?: string;
}) {
  const orderedLanes = React.useMemo(() => {
    return [...lanes].sort((left, right) => {
      const leftIsActive = left.sessionId === activeSessionId;
      const rightIsActive = right.sessionId === activeSessionId;
      if (leftIsActive !== rightIsActive) {
        return leftIsActive ? -1 : 1;
      }

      const leftUpdatedAt = left.session?.updatedAt ?? '';
      const rightUpdatedAt = right.session?.updatedAt ?? '';
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt.localeCompare(leftUpdatedAt);
      }

      return left.sessionId.localeCompare(right.sessionId);
    });
  }, [activeSessionId, lanes]);

  return (
    <section className="oc-surface-card" style={{ margin: '16px 16px 0', padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Alternative attempts</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The open thread stays primary while sibling branch and worktree attempts remain visible inside this workspace.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {orderedLanes.map((lane, index) => {
          const laneDisplay = describeLaneAttribution(lane);
          const isActive = lane.sessionId === activeSessionId;
          const title = lane.session?.title?.trim() || `Session ${lane.sessionId.slice(0, 8)}`;

          return (
            <article
              key={`${lane.sessionId}:${laneDisplay.laneId ?? 'session-lane'}`}
              style={{
                padding: 12,
                borderRadius: 16,
                border: isActive
                  ? '1px solid rgba(37, 99, 235, 0.22)'
                  : '1px solid rgba(148, 163, 184, 0.18)',
                background: isActive
                  ? 'rgba(37, 99, 235, 0.06)'
                  : 'var(--bg-secondary)',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={lanePillStyle(isActive)}>{isActive ? `Open thread · Attempt ${index + 1}` : `Alternative attempt ${index + 1}`}</span>
                {lane.session?.state && (
                  <span style={laneStatePillStyle()}>{formatSessionState(lane.session.state)}</span>
                )}
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5 }}>{title}</div>
              {laneDisplay.label && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{laneDisplay.label}</div>
              )}
              {laneDisplay.detail && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>{laneDisplay.detail}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Session: <span style={laneMonoStyle}>{lane.sessionId}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatSessionState(state: Exclude<NonNullable<SessionLaneSummary['session']>['state'], undefined>): string {
  return state
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function lanePillStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '0 10px',
    borderRadius: 999,
    border: isActive
      ? '1px solid rgba(37, 99, 235, 0.22)'
      : '1px solid rgba(15, 23, 42, 0.12)',
    background: isActive
      ? 'rgba(37, 99, 235, 0.08)'
      : 'rgba(15, 23, 42, 0.04)',
    color: isActive ? 'rgb(29, 78, 216)' : 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function laneStatePillStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid rgba(15, 23, 42, 0.08)',
    background: 'rgba(15, 23, 42, 0.04)',
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  };
}

const laneMonoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
};

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}
