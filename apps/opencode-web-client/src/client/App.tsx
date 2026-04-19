import React, { useEffect } from 'react';
import { useStore } from './runtime/store.js';
import { api } from './lib/api-client.js';
import { AppShell } from './components/app-shell/AppShell.js';
import type { SessionSummary, WorkspaceServerStatus } from '../shared/types.js';

export function App() {
  const {
    activeWorkspaceId,
    settings,
    setInstall,
    setWorkspaces,
    setActiveWorkspace,
    setWorkspaceServerStatuses,
    setWorkspaceServerStatus,
    setSessions,
  } = useStore();

  useEffect(() => {
    let cancelled = false;

    const refreshWorkspaceState = async () => {
      const { workspaces: nextWorkspaces, activeWorkspaceId: serverActiveWorkspaceId, serverStatuses } = await api.listWorkspaceState();
      if (cancelled) return;

      setWorkspaces(nextWorkspaces);
      setWorkspaceServerStatuses(serverStatuses ?? {});
      if (nextWorkspaces.length > 0 && !useStore.getState().activeWorkspaceId) {
        setActiveWorkspace(serverActiveWorkspaceId ?? nextWorkspaces[0].id);
      }

      const inactiveWorkspaceIds = nextWorkspaces
        .map((workspace) => workspace.id)
        .filter((workspaceId) => workspaceId !== useStore.getState().activeWorkspaceId)
        .filter((workspaceId) => {
          const status = serverStatuses?.[workspaceId]?.state;
          return status != null && status !== 'stopped';
        });

      await Promise.allSettled(
        inactiveWorkspaceIds.map(async (workspaceId) => {
          const sessions = await api.listSessions(workspaceId);
          if (cancelled) return;

          setSessions(workspaceId, sessions);

          const serverStatus = serverStatuses?.[workspaceId];
          if (shouldAutoSleepWorkspace(serverStatus, sessions, settings.inactiveWorkspaceAutoSleepMinutes)) {
            await api.stopServer(workspaceId).catch(() => {});
            if (!cancelled) {
              setWorkspaceServerStatus(workspaceId, {
                ...serverStatus,
                state: 'stopped',
              });
            }
          }
        }),
      );
    };

    api.diagnostics().then(setInstall).catch(() => {});

    void refreshWorkspaceState().catch(() => {});

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshWorkspaceState().catch(() => {});
    }, settings.inactiveWorkspacePollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeWorkspaceId,
    settings,
    setActiveWorkspace,
    setInstall,
    setSessions,
    setWorkspaceServerStatus,
    setWorkspaceServerStatuses,
    setWorkspaces,
  ]);

  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}

function shouldAutoSleepWorkspace(
  serverStatus: WorkspaceServerStatus | undefined,
  sessions: SessionSummary[],
  autoSleepMinutes: number,
): boolean {
  if (autoSleepMinutes <= 0) return false;
  if (!serverStatus || serverStatus.state === 'stopped') return false;
  if (sessions.some((session) => session.state === 'running')) return false;

  const lastActivityAt = getWorkspaceLastActivityAt(serverStatus, sessions);
  if (!lastActivityAt) return false;

  return Date.now() - lastActivityAt.getTime() >= autoSleepMinutes * 60 * 1000;
}

function getWorkspaceLastActivityAt(
  serverStatus: WorkspaceServerStatus,
  sessions: SessionSummary[],
): Date | null {
  const timestamps = [
    serverStatus.startedAt,
    ...sessions.map((session) => session.updatedAt),
  ].filter(Boolean);

  let latest: Date | null = null;
  for (const value of timestamps) {
    const date = new Date(value!);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) {
      latest = date;
    }
  }

  return latest;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={{ minHeight: '100vh', padding: 32, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 24, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: 12, color: 'var(--error)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Render Error</div>
          <h1 style={{ marginTop: 10, marginBottom: 8, fontSize: 28 }}>The app shell failed to render.</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>This fallback is shown instead of a blank screen so browser validation can surface the actual exception.</p>
          <pre style={{ margin: 0, padding: 14, borderRadius: 16, background: 'var(--error-soft)', color: 'var(--error)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
