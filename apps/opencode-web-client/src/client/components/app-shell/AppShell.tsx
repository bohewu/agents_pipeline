import React, { startTransition, useEffect } from 'react';
import {
  deriveWorkspaceCapabilityGaps,
  getCachedUsage,
  readUsageCacheSnapshot,
  selectActiveWorkspaceCapabilities,
  selectWorkspaceLaneComparisonSummaries,
  type WorkspaceCapabilityGap,
  type WorkspaceLaneComparisonSummary,
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
import type {
  ResultReviewState,
  ResultShipState,
  ResultVerificationState,
  VerificationCommandKind,
  WorkspaceComparisonLaneReference,
} from '../../../shared/types.js';

type SurfaceTone = 'success' | 'warning' | 'danger' | 'neutral';

interface LaneReadinessTileModel {
  tone: SurfaceTone;
  statusLabel: string;
  summary: string;
  meta?: string;
  secondaryLabel?: string;
  secondaryTone?: SurfaceTone;
}

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
    workspaceCapabilitiesByWorkspace,
    workspaceGitStatusByWorkspace,
    sessionsByWorkspace,
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
  const laneComparisonSummaries = React.useMemo(() => selectWorkspaceLaneComparisonSummaries({
    sessionsByWorkspace,
    workspaceBootstraps,
    workspaceCapabilitiesByWorkspace,
    workspaceGitStatusByWorkspace,
    taskEntriesByWorkspace,
    resultAnnotationsByWorkspace,
  }, activeWorkspaceId), [
    activeWorkspaceId,
    resultAnnotationsByWorkspace,
    sessionsByWorkspace,
    taskEntriesByWorkspace,
    workspaceCapabilitiesByWorkspace,
    workspaceBootstraps,
    workspaceGitStatusByWorkspace,
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
          {laneComparisonSummaries.length > 1 && (
            <WorkspaceLaneSurface
              lanes={laneComparisonSummaries}
              activeSessionId={activeSessionId}
              workspaceId={activeWorkspaceId}
            />
          )}
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
  workspaceId,
}: {
  lanes: WorkspaceLaneComparisonSummary[];
  activeSessionId?: string;
  workspaceId?: string | null;
}) {
  const setWorkspaceBootstrap = useStore((store) => store.setWorkspaceBootstrap);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [pendingSelectedLaneKey, setPendingSelectedLaneKey] = React.useState<string>();
  const [selectingLaneKey, setSelectingLaneKey] = React.useState<string>();
  const [adoptingLaneKey, setAdoptingLaneKey] = React.useState<string>();
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
  const selectedLaneFromStore = React.useMemo(
    () => orderedLanes.find((lane) => lane.comparison.selected),
    [orderedLanes],
  );
  const selectedLaneKeyFromStore = React.useMemo(
    () => selectedLaneFromStore ? resolveWorkspaceLaneComparisonKey(selectedLaneFromStore) : undefined,
    [selectedLaneFromStore],
  );
  const adoptedLaneFromStore = React.useMemo(
    () => orderedLanes.find((lane) => lane.comparison.adopted),
    [orderedLanes],
  );
  const adoptedLaneKey = React.useMemo(
    () => adoptedLaneFromStore ? resolveWorkspaceLaneComparisonKey(adoptedLaneFromStore) : undefined,
    [adoptedLaneFromStore],
  );
  const effectiveSelectedLaneKey = pendingSelectedLaneKey ?? selectedLaneKeyFromStore;
  const selectedLane = React.useMemo(
    () => effectiveSelectedLaneKey
      ? orderedLanes.find((lane) => resolveWorkspaceLaneComparisonKey(lane) === effectiveSelectedLaneKey)
      : undefined,
    [effectiveSelectedLaneKey, orderedLanes],
  );
  const adoptedLane = React.useMemo(
    () => adoptedLaneKey
      ? orderedLanes.find((lane) => resolveWorkspaceLaneComparisonKey(lane) === adoptedLaneKey)
      : undefined,
    [adoptedLaneKey, orderedLanes],
  );
  const selectedLaneLabel = selectedLane ? formatLaneComparisonLabel(selectedLane) : undefined;
  const adoptedLaneLabel = adoptedLane ? formatLaneComparisonLabel(adoptedLane) : undefined;
  const activeSelectionRequest = React.useMemo(
    () => selectedLane && !selectingLaneKey && !selectedLane.comparison.adopted
      ? buildWorkspaceComparisonLaneReference(selectedLane)
      : undefined,
    [selectedLane, selectingLaneKey],
  );
  const interactionsLocked = !workspaceId || !!selectingLaneKey || !!adoptingLaneKey;

  const handleSelectLane = React.useCallback(async (lane: WorkspaceLaneComparisonSummary) => {
    if (!workspaceId) return;

    const laneKey = resolveWorkspaceLaneComparisonKey(lane);
    setActionError(null);
    setPendingSelectedLaneKey(laneKey);
    setSelectingLaneKey(laneKey);

    try {
      const bootstrap = await api.selectComparisonLane(workspaceId, buildWorkspaceComparisonLaneReference(lane));
      setWorkspaceBootstrap(workspaceId, bootstrap);
    } catch (error) {
      setActionError(resolveErrorMessage(error, 'Failed to select this lane for adoption.'));
    } finally {
      setSelectingLaneKey(undefined);
      setPendingSelectedLaneKey(undefined);
    }
  }, [setWorkspaceBootstrap, workspaceId]);

  const handleAdoptSelectedLane = React.useCallback(async () => {
    if (!workspaceId || !selectedLane || selectedLane.comparison.adopted || !activeSelectionRequest) {
      return;
    }

    const laneKey = resolveWorkspaceLaneComparisonKey(selectedLane);
    setActionError(null);
    setPendingSelectedLaneKey(laneKey);
    setAdoptingLaneKey(laneKey);

    try {
      const bootstrap = await api.adoptComparisonLane(workspaceId, activeSelectionRequest);
      setWorkspaceBootstrap(workspaceId, bootstrap);
    } catch (error) {
      setActionError(resolveErrorMessage(error, 'Failed to adopt the selected lane.'));
    } finally {
      setAdoptingLaneKey(undefined);
      setPendingSelectedLaneKey(undefined);
    }
  }, [activeSelectionRequest, selectedLane, setWorkspaceBootstrap, workspaceId]);

  return (
    <section className="oc-surface-card" style={{ margin: '16px 16px 0', padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Alternative attempts</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 720 }}>
            Select one alternative lane, then adopt it explicitly. Lane-local verification and ship readiness stay visible here, and there are no bulk follow-on controls.
          </div>
        </div>
        <span style={compareFlowPillStyle()}>Explicit adopt only</span>
      </div>

      <section className="oc-surface-card" style={compareActionSurfaceStyle()}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Compare and adopt
          </div>
          {!selectedLaneLabel && !adoptedLaneLabel && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Select one alternative lane to enable the explicit adopt action. Only one lane can be selected at a time.
            </div>
          )}
          {selectedLaneLabel && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {adoptingLaneKey
                ? `Adopting lane · ${selectedLaneLabel}`
                : `Selected lane · ${selectedLaneLabel}`}
            </div>
          )}
          {adoptedLaneLabel && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Adopted outcome · {adoptedLaneLabel}
            </div>
          )}
          {actionError && (
            <div role="alert" style={{ fontSize: 12, color: 'var(--error)', lineHeight: 1.6 }}>
              {actionError}
            </div>
          )}
        </div>

        {!selectingLaneKey && selectedLane && !selectedLane.comparison.adopted && (
          <button
            type="button"
            onClick={() => void handleAdoptSelectedLane()}
            disabled={interactionsLocked}
            style={surfaceActionButtonStyle({ disabled: interactionsLocked })}
          >
            {adoptingLaneKey ? 'Adopting lane…' : 'Adopt selected lane'}
          </button>
        )}
      </section>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {orderedLanes.map((lane, index) => {
          const laneDisplay = describeLaneAttribution(lane);
          const laneKey = resolveWorkspaceLaneComparisonKey(lane);
          const isActive = lane.sessionId === activeSessionId;
          const isSelected = laneKey === effectiveSelectedLaneKey;
          const isSelecting = laneKey === selectingLaneKey;
          const isAdopting = laneKey === adoptingLaneKey;
          const isAdopted = lane.comparison.adopted;
          const isNotAdopted = !!adoptedLaneKey && !isAdopted;
          const canSelectLane = !isActive && !isAdopted && !!workspaceId;
          const title = lane.title.trim() || `Session ${lane.sessionId.slice(0, 8)}`;
          const summary = lane.summary?.trim();
          const showSummary = !!summary && summary !== title;
          const verificationTile = buildVerificationTileModel(lane);
          const shipReadinessTile = buildShipReadinessTileModel(lane);

          return (
            <article
              key={`${lane.sessionId}:${laneDisplay.laneId ?? 'session-lane'}`}
              style={laneCardStyle({
                isActive,
                isSelected,
                isAdopted,
                isNotAdopted,
                isBusy: isSelecting || isAdopting,
              })}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={lanePillStyle(isActive)}>{isActive ? `Open thread · Attempt ${index + 1}` : `Alternative attempt ${index + 1}`}</span>
                  {laneDisplay.label && <span style={laneContextPillStyle()}>{laneDisplay.label}</span>}
                  {isSelected && !isAdopted && (
                    <span style={comparisonStatePillStyle('selected')}>
                      {isAdopting ? 'Selected · adopting…' : 'Selected for adoption'}
                    </span>
                  )}
                  {isAdopted && <span style={comparisonStatePillStyle('adopted')}>Adopted outcome</span>}
                  {isNotAdopted && <span style={comparisonStatePillStyle('other')}>Not adopted</span>}
                </div>
                {lane.session?.state && (
                  <span style={laneStatePillStyle()}>{formatSessionState(lane.session.state)}</span>
                )}
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5 }}>{title}</div>
                {showSummary && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{summary}</div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {laneDisplay.detail && <div>{laneDisplay.detail}</div>}
                <div>
                  Session: <span style={laneMonoStyle}>{lane.sessionId}</span>
                  {laneDisplay.laneId && (
                    <>
                      {' · '}
                      Lane: <span style={laneMonoStyle}>{laneDisplay.laneId}</span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <LaneReadinessTile heading="Verification" model={verificationTile} />
                <LaneReadinessTile heading="Ship readiness" model={shipReadinessTile} />
              </div>

              {!isActive && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, flex: '1 1 180px' }}>
                    {isAdopted
                      ? 'This adopted outcome stays visible here while sibling lanes remain available for comparison.'
                      : isSelected
                        ? 'This is the only selected lane in the current compare flow.'
                        : 'Select this lane to make it the next explicit adoption candidate.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSelectLane(lane)}
                    disabled={!canSelectLane || interactionsLocked || isSelected}
                    aria-pressed={isSelected}
                    style={laneSelectionButtonStyle({
                      disabled: !canSelectLane || interactionsLocked || isSelected,
                      selected: isSelected,
                      adopted: isAdopted,
                    })}
                  >
                    {isSelecting
                      ? 'Selecting lane…'
                      : isAdopted
                        ? 'Adopted lane'
                        : isSelected
                          ? 'Selected'
                          : 'Select lane'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatSessionState(state: NonNullable<NonNullable<WorkspaceLaneComparisonSummary['session']>['state']>): string {
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

function laneContextPillStyle(): React.CSSProperties {
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
    whiteSpace: 'nowrap',
  };
}

function compareFlowPillStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 28,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid rgba(37, 99, 235, 0.18)',
    background: 'rgba(37, 99, 235, 0.08)',
    color: 'rgb(29, 78, 216)',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function compareActionSurfaceStyle(): React.CSSProperties {
  return {
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    background: 'rgba(255, 255, 255, 0.82)',
  };
}

function surfaceActionButtonStyle({ disabled }: { disabled: boolean }): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    padding: '0 14px',
    borderRadius: 12,
    border: '1px solid rgba(37, 99, 235, 0.24)',
    background: disabled ? 'rgba(37, 99, 235, 0.1)' : 'rgb(37, 99, 235)',
    color: disabled ? 'rgba(29, 78, 216, 0.64)' : '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.72 : 1,
  };
}

function laneCardStyle({
  isActive,
  isSelected,
  isAdopted,
  isNotAdopted,
  isBusy,
}: {
  isActive: boolean;
  isSelected: boolean;
  isAdopted: boolean;
  isNotAdopted: boolean;
  isBusy: boolean;
}): React.CSSProperties {
  return {
    padding: 12,
    borderRadius: 16,
    border: isAdopted
      ? '1px solid rgba(16, 163, 127, 0.24)'
      : isSelected
        ? '1px solid rgba(37, 99, 235, 0.28)'
        : isActive
          ? '1px solid rgba(37, 99, 235, 0.22)'
          : isNotAdopted
            ? '1px solid rgba(148, 163, 184, 0.24)'
            : '1px solid rgba(148, 163, 184, 0.18)',
    background: isAdopted
      ? 'rgba(16, 163, 127, 0.08)'
      : isSelected
        ? 'rgba(37, 99, 235, 0.08)'
        : isActive
          ? 'rgba(37, 99, 235, 0.06)'
          : 'var(--bg-secondary)',
    boxShadow: isBusy || isSelected || isAdopted
      ? '0 14px 30px rgba(15, 23, 42, 0.06)'
      : 'none',
    display: 'grid',
    gap: 10,
  };
}

function comparisonStatePillStyle(kind: 'selected' | 'adopted' | 'other'): React.CSSProperties {
  if (kind === 'selected') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 24,
      padding: '0 10px',
      borderRadius: 999,
      border: '1px solid rgba(37, 99, 235, 0.2)',
      background: 'rgba(37, 99, 235, 0.1)',
      color: 'rgb(29, 78, 216)',
      fontSize: 10,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    };
  }

  if (kind === 'adopted') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 24,
      padding: '0 10px',
      borderRadius: 999,
      border: '1px solid rgba(16, 163, 127, 0.18)',
      background: 'var(--success-soft)',
      color: 'var(--success)',
      fontSize: 10,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    };
  }

  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid rgba(15, 23, 42, 0.1)',
    background: 'rgba(15, 23, 42, 0.04)',
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function laneSelectionButtonStyle({
  disabled,
  selected,
  adopted,
}: {
  disabled: boolean;
  selected: boolean;
  adopted: boolean;
}): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 10,
    border: selected
      ? '1px solid rgba(37, 99, 235, 0.24)'
      : adopted
        ? '1px solid rgba(16, 163, 127, 0.18)'
        : '1px solid rgba(15, 23, 42, 0.12)',
    background: selected
      ? 'rgba(37, 99, 235, 0.1)'
      : adopted
        ? 'var(--success-soft)'
        : 'rgba(15, 23, 42, 0.04)',
    color: selected
      ? 'rgb(29, 78, 216)'
      : adopted
        ? 'var(--success)'
        : 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.72 : 1,
  };
}

function resolveWorkspaceLaneComparisonKey(lane: WorkspaceLaneComparisonSummary): string {
  return `${lane.sessionId}:${describeLaneAttribution(lane).laneId ?? 'session-lane'}`;
}

function buildWorkspaceComparisonLaneReference(lane: WorkspaceLaneComparisonSummary): WorkspaceComparisonLaneReference {
  return {
    sessionId: lane.sessionId,
    ...(lane.laneId ? { laneId: lane.laneId } : {}),
    ...(lane.laneContext ? { laneContext: lane.laneContext } : {}),
  };
}

function formatLaneComparisonLabel(lane: WorkspaceLaneComparisonSummary): string {
  const laneDisplay = describeLaneAttribution(lane);
  if (laneDisplay.label && lane.title && laneDisplay.label !== lane.title) {
    return `${laneDisplay.label} — ${lane.title}`;
  }

  return laneDisplay.label ?? (lane.title.trim() || `Session ${lane.sessionId.slice(0, 8)}`);
}

function LaneReadinessTile({
  heading,
  model,
}: {
  heading: string;
  model: LaneReadinessTileModel;
}) {
  return (
    <section
      className="oc-surface-card"
      style={{
        padding: '12px 14px',
        display: 'grid',
        gap: 8,
        background: 'rgba(255, 255, 255, 0.82)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {heading}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <span style={readinessBadgeStyle(model.tone)}>{model.statusLabel}</span>
          {model.secondaryLabel && model.secondaryTone && (
            <span style={readinessBadgeStyle(model.secondaryTone)}>{model.secondaryLabel}</span>
          )}
        </div>
      </div>

      <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>{model.summary}</div>
      {model.meta && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6 }}>{model.meta}</div>
      )}
    </section>
  );
}

function buildVerificationTileModel(lane: WorkspaceLaneComparisonSummary): LaneReadinessTileModel {
  const hasVerificationEvidence = lane.verification.linkedRuns.length > 0
    || !!lane.verification.summary?.trim()
    || !!lane.latestTaskRecord?.recentVerificationRef;

  if (!hasVerificationEvidence) {
    return {
      tone: 'neutral',
      statusLabel: 'Not run',
      summary: 'No verification evidence is linked to this lane yet.',
    };
  }

  const latestRun = lane.verification.latestRun;
  const latestReference = lane.latestTaskRecord?.recentVerificationRef;

  return {
    tone: verificationTone(lane.verification.state),
    statusLabel: formatVerificationState(lane.verification.state),
    summary: lane.verification.summary?.trim()
      || latestReference?.summary?.trim()
      || 'Verification evidence is available for this lane.',
    meta: latestRun?.commandKind
      ? `Latest run · ${formatCommandKind(latestRun.commandKind)}`
      : latestReference?.commandKind
        ? `Latest run · ${formatCommandKind(latestReference.commandKind)}`
        : undefined,
  };
}

function buildShipReadinessTileModel(lane: WorkspaceLaneComparisonSummary): LaneReadinessTileModel {
  const shipState = lane.shipReadiness.shipState;
  const reviewState = lane.shipReadiness.reviewState;
  const pullRequestUrl = lane.shipReadiness.pullRequestUrl ?? lane.latestTaskRecord?.recentShipRef?.pullRequestUrl;
  const hasShipSignal = !!shipState || !!reviewState || !!pullRequestUrl || !!lane.latestTaskRecord?.recentShipRef;

  if (!hasShipSignal) {
    return {
      tone: 'neutral',
      statusLabel: 'Pending',
      summary: 'No ship-readiness signal is linked to this lane yet.',
    };
  }

  return {
    tone: shipState ? shipTone(shipState) : reviewState ? reviewTone(reviewState) : 'neutral',
    statusLabel: shipState ? formatShipState(shipState) : reviewState ? formatReviewState(reviewState) : 'Pending',
    summary: buildShipReadinessSummary(lane, shipState, reviewState),
    secondaryLabel: shipState && reviewState ? formatReviewState(reviewState) : undefined,
    secondaryTone: shipState && reviewState ? reviewTone(reviewState) : undefined,
    meta: pullRequestUrl ? `Pull request · ${formatPullRequestReference(pullRequestUrl)}` : undefined,
  };
}

function buildShipReadinessSummary(
  lane: WorkspaceLaneComparisonSummary,
  shipState?: ResultShipState,
  reviewState?: ResultReviewState,
): string {
  const dedicatedSummary = lane.shipReadiness.summary?.trim();
  if (!shipState && !reviewState) {
    return dedicatedSummary && dedicatedSummary !== lane.summary
      ? dedicatedSummary
      : 'This lane has ship-linked context, but it is not yet classified as ready.';
  }

  if (shipState === 'pr-ready') {
    return reviewState === 'approval-needed'
      ? 'The linked pull request looks ready apart from remaining approval work.'
      : 'The linked pull request is currently in a ready-to-ship state.';
  }
  if (shipState === 'local-ready') {
    return 'This lane looks locally ready, but it still needs pull-request follow-through.';
  }
  if (shipState === 'blocked-by-checks') {
    return 'Ship readiness is blocked by failing or incomplete pull-request checks.';
  }
  if (shipState === 'blocked-by-requested-changes') {
    return 'Ship readiness is blocked by requested review changes on the linked pull request.';
  }
  if (shipState === 'not-ready') {
    return 'This lane still needs more work before it looks ready for ship actions.';
  }
  if (reviewState === 'ready') {
    return 'Review signals look ready for this lane.';
  }
  if (reviewState === 'approval-needed') {
    return 'This lane still needs approval before it is ready to ship.';
  }
  if (reviewState === 'needs-retry') {
    return 'This lane still needs follow-up work before it is ready to ship.';
  }
  return dedicatedSummary ?? 'Ship-readiness context is available for this lane.';
}

function formatVerificationState(state: ResultVerificationState): string {
  if (state === 'partially verified') {
    return 'Partially verified';
  }
  return capitalizeWords(state);
}

function formatShipState(state: ResultShipState): string {
  if (state === 'pr-ready') return 'PR ready';
  if (state === 'local-ready') return 'Local ready';
  if (state === 'blocked-by-checks') return 'Blocked by checks';
  if (state === 'blocked-by-requested-changes') return 'Blocked by requested changes';
  return 'Not ready';
}

function formatReviewState(state: ResultReviewState): string {
  if (state === 'approval-needed') return 'Approval needed';
  if (state === 'needs-retry') return 'Needs retry';
  return 'Review ready';
}

function formatCommandKind(commandKind: VerificationCommandKind): string {
  return capitalizeWords(commandKind);
}

function formatPullRequestReference(pullRequestUrl: string): string {
  const match = /\/pull\/(\d+)(?:$|[/?#])/.exec(pullRequestUrl);
  return match ? `#${match[1]}` : pullRequestUrl;
}

function verificationTone(state: ResultVerificationState): SurfaceTone {
  if (state === 'verified') return 'success';
  if (state === 'partially verified') return 'warning';
  return 'danger';
}

function shipTone(state: ResultShipState): SurfaceTone {
  if (state === 'pr-ready' || state === 'local-ready') return 'success';
  if (state === 'not-ready') return 'warning';
  return 'danger';
}

function reviewTone(state: ResultReviewState): SurfaceTone {
  if (state === 'ready') return 'success';
  if (state === 'approval-needed') return 'warning';
  return 'danger';
}

function readinessBadgeStyle(tone: SurfaceTone): React.CSSProperties {
  if (tone === 'success') {
    return {
      color: 'var(--success)',
      border: '1px solid rgba(16, 163, 127, 0.18)',
      background: 'var(--success-soft)',
      padding: '2px 8px',
      borderRadius: 999,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    };
  }
  if (tone === 'warning') {
    return {
      color: 'var(--warning)',
      border: '1px solid rgba(183, 121, 31, 0.2)',
      background: 'var(--warning-soft)',
      padding: '2px 8px',
      borderRadius: 999,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    };
  }
  if (tone === 'danger') {
    return {
      color: 'var(--error)',
      border: '1px solid rgba(220, 38, 38, 0.18)',
      background: 'var(--error-soft)',
      padding: '2px 8px',
      borderRadius: 999,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    };
  }
  return {
    color: 'var(--text-secondary)',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    background: 'rgba(15, 23, 42, 0.04)',
    padding: '2px 8px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
}

function capitalizeWords(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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
