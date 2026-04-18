import React, { useEffect } from 'react';
import { useStore } from './runtime/store.js';
import { api } from './lib/api-client.js';
import { AppShell } from './components/app-shell/AppShell.js';
import { OnboardingScreen } from './components/workspaces/OnboardingScreen.js';
import { LoadingSpinner } from './components/common/LoadingSpinner.js';

export function App() {
  const { install, workspaces, activeWorkspaceId, setInstall, setWorkspaces, setActiveWorkspace } = useStore();

  useEffect(() => {
    api.diagnostics().then(setInstall).catch(() => {});
    api.listWorkspaces().then((ws) => {
      setWorkspaces(ws);
      if (ws.length > 0 && !activeWorkspaceId) {
        setActiveWorkspace(ws[0].id);
      }
    }).catch(() => {});
  }, []);

  if (!install) return <LoadingSpinner />;
  if (workspaces.length === 0 || !activeWorkspaceId) return <OnboardingScreen />;
  return <AppShell />;
}
