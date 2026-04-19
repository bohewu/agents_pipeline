import React, { useEffect } from 'react';
import { useStore } from './runtime/store.js';
import { api } from './lib/api-client.js';
import { AppShell } from './components/app-shell/AppShell.js';

export function App() {
  const { activeWorkspaceId, setInstall, setWorkspaces, setActiveWorkspace } = useStore();

  useEffect(() => {
    let cancelled = false;

    api.diagnostics().then(setInstall).catch(() => {});
    api.listWorkspaceState().then(({ workspaces: nextWorkspaces, activeWorkspaceId: serverActiveWorkspaceId }) => {
      if (cancelled) return;
      setWorkspaces(nextWorkspaces);
      if (nextWorkspaces.length > 0 && !activeWorkspaceId) {
        setActiveWorkspace(serverActiveWorkspaceId ?? nextWorkspaces[0].id);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
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
