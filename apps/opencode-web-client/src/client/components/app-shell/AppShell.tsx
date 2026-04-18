import React, { useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { handleBffEvent } from '../../runtime/event-reducer.js';
import { RuntimeProvider } from '../../runtime/runtime-provider.js';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { RightDrawer } from './RightDrawer.js';
import { Thread } from '../thread/Thread.js';
import { Composer } from '../composer/Composer.js';

export function AppShell() {
  const { activeWorkspaceId, sidebarOpen, rightDrawerOpen, setConnection, setSessions, setActiveSession } = useStore();
  const store = useStore;

  // Bootstrap workspace on selection
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setConnection(activeWorkspaceId, 'connecting');

    api.getBootstrap(activeWorkspaceId).then((boot) => {
      useStore.getState().setWorkspaceBootstrap(activeWorkspaceId, boot);
      useStore.getState().setSessions(activeWorkspaceId, boot.sessions);
      if (boot.sessions.length > 0) {
        useStore.getState().setActiveSession(activeWorkspaceId, boot.sessions[0].id);
      }
    }).catch(() => {});

    // Connect SSE
    const close = api.connectEvents(
      activeWorkspaceId,
      (event) => handleBffEvent(event, useStore.getState()),
      () => setConnection(activeWorkspaceId, 'error'),
    );
    setConnection(activeWorkspaceId, 'connected');

    return () => {
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
      <RuntimeProvider>
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Thread />
          </div>
          <Composer />
        </div>
      </RuntimeProvider>
      {rightDrawerOpen && <RightDrawer />}
    </div>
  );
}
