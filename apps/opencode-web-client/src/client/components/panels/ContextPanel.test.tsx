// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/local-storage.js', () => ({
  getItem: <T,>(_key: string, fallback: T) => fallback,
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

import { ContextPanel } from './ContextPanel.js';
import { useStore } from '../../runtime/store.js';
import type {
  WorkspaceBootstrap,
  WorkspaceCapabilityEntry,
  WorkspaceContextCatalogResponse,
  WorkspaceInstructionSourceEntry,
} from '../../../shared/types.js';

const baseState = useStore.getState();

describe('ContextPanel', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    resetStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
  });

  it('renders workspace-scoped instruction sources and capability inventory with honest labels and remediation', async () => {
    const workspaceId = 'workspace-context-1';

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo One'));
    useStore.getState().setWorkspaceContextCatalog(workspaceId, makeCatalog(workspaceId, {
      instructionSources: [
        makeInstructionEntry({
          id: 'project-local:agents-file',
          category: 'agents-file',
          label: 'Workspace AGENTS.md',
          status: 'available',
          path: '/tmp/repo-one/AGENTS.md',
        }),
        makeInstructionEntry({
          id: 'project-local:opencode-dir',
          category: 'opencode-dir',
          label: 'Workspace .opencode directory',
          status: 'missing',
          path: '/tmp/repo-one/.opencode',
          remediation: 'Restore the .opencode directory inside this workspace so project-local instructions are available.',
        }),
      ],
      capabilityEntries: [
        makeCapabilityEntry({
          id: 'project-local:plugins',
          category: 'plugin',
          sourceLayer: 'project-local',
          label: 'Project-local plugins',
          status: 'degraded',
          path: '/tmp/repo-one/opencode/plugins',
          detail: 'Path escapes workspace boundary.',
          remediation: 'Repair the project-local plugin assets inside this workspace before relying on them.',
        }),
        makeCapabilityEntry({
          id: 'user-global:provider-usage-tool',
          category: 'usage-asset',
          sourceLayer: 'user-global',
          label: 'User-global provider usage tool asset',
          status: 'missing',
          path: '/tmp/opencode/tools/provider-usage.py',
          remediation: 'Install or restore the user-global provider usage tool asset before expecting usage data here.',
        }),
        makeCapabilityEntry({
          id: 'app-bundled:skills',
          category: 'skill',
          sourceLayer: 'app-bundled',
          label: 'Bundled skill catalog',
          status: 'available',
          path: '/opt/app/assets/opencode/skills',
          itemCount: 2,
          items: ['repo-scout', 'planner'],
        }),
      ],
    }));
    useStore.getState().setActiveWorkspace(workspaceId);

    await renderPanel();

    expect(container.textContent).toContain('Read-only workspace context for Repo One');
    expect(container.textContent).toContain('Instruction sources');
    expect(container.textContent).toContain('Workspace AGENTS.md');
    expect(container.textContent).toContain('Workspace .opencode directory');
    expect(container.textContent).toContain('Capability inventory');
    expect(container.textContent).toContain('Project-local plugins');
    expect(container.textContent).toContain('Plugin');
    expect(container.textContent).toContain('Project-local');
    expect(container.textContent).toContain('Degraded');
    expect(container.textContent).toContain('User-global provider usage tool asset');
    expect(container.textContent).toContain('Usage asset');
    expect(container.textContent).toContain('User-global');
    expect(container.textContent).toContain('Missing');
    expect(container.textContent).toContain('Bundled skill catalog');
    expect(container.textContent).toContain('Skill');
    expect(container.textContent).toContain('App-bundled');
    expect(container.textContent).toContain('Available');
    expect(container.textContent).toContain('Restore the .opencode directory inside this workspace');
    expect(container.textContent).toContain('Repair the project-local plugin assets inside this workspace');
    expect(container.textContent).toContain('Install or restore the user-global provider usage tool asset');
  });

  it('handles loading, error, and empty drawer states inside the panel', async () => {
    const workspaceId = 'workspace-context-states';

    useStore.getState().setWorkspaceBootstrap(workspaceId, makeBootstrap(workspaceId, 'Repo States'));
    useStore.getState().setActiveWorkspace(workspaceId);
    useStore.getState().setWorkspaceContextCatalogLoading(workspaceId, true);

    await renderPanel();
    expect(container.textContent).toContain('Loading workspace context');
    expect(container.textContent).toContain('Collecting instruction sources and capability inventory for Repo States.');

    await act(async () => {
      useStore.getState().setWorkspaceContextCatalogLoading(workspaceId, false);
      useStore.getState().setWorkspaceContextCatalogError(workspaceId, 'Context catalog fetch failed for Repo States.');
    });
    expect(container.textContent).toContain('Context surface unavailable');
    expect(container.textContent).toContain('Context catalog fetch failed for Repo States.');

    await act(async () => {
      useStore.getState().setWorkspaceContextCatalogError(workspaceId, null);
      useStore.getState().setWorkspaceContextCatalog(workspaceId, makeCatalog(workspaceId, {
        instructionSources: [],
        capabilityEntries: [],
      }));
    });
    expect(container.textContent).toContain('No instruction sources surfaced');
    expect(container.textContent).toContain('No capability inventory surfaced');
    expect(container.textContent).toContain('No supported project-local instruction sources are currently visible for Repo States.');
    expect(container.textContent).toContain('No project-local, user-global, or app-bundled capability entries are currently visible for Repo States.');
  });

  it('switches active workspaces without mixing context data across workspaces', async () => {
    const workspaceOne = 'workspace-context-one';
    const workspaceTwo = 'workspace-context-two';

    useStore.getState().setWorkspaceBootstrap(workspaceOne, makeBootstrap(workspaceOne, 'Repo One'));
    useStore.getState().setWorkspaceBootstrap(workspaceTwo, makeBootstrap(workspaceTwo, 'Repo Two'));
    useStore.getState().setWorkspaceContextCatalog(workspaceOne, makeCatalog(workspaceOne, {
      instructionSources: [
        makeInstructionEntry({
          id: 'project-local:agents-file:one',
          category: 'agents-file',
          label: 'Repo One AGENTS.md',
          status: 'available',
          path: '/tmp/repo-one/AGENTS.md',
        }),
      ],
      capabilityEntries: [
        makeCapabilityEntry({
          id: 'project-local:commands:one',
          category: 'command',
          sourceLayer: 'project-local',
          label: 'Repo One commands',
          status: 'available',
          path: '/tmp/repo-one/opencode/commands',
        }),
      ],
    }));
    useStore.getState().setWorkspaceContextCatalog(workspaceTwo, makeCatalog(workspaceTwo, {
      instructionSources: [
        makeInstructionEntry({
          id: 'project-local:agents-file:two',
          category: 'agents-file',
          label: 'Repo Two AGENTS.md',
          status: 'available',
          path: '/tmp/repo-two/AGENTS.md',
        }),
      ],
      capabilityEntries: [
        makeCapabilityEntry({
          id: 'user-global:commands:two',
          category: 'command',
          sourceLayer: 'user-global',
          label: 'Repo Two global commands',
          status: 'available',
          path: '/tmp/global/commands',
        }),
      ],
    }));
    useStore.getState().setActiveWorkspace(workspaceOne);

    await renderPanel();

    expect(container.textContent).toContain('Repo One AGENTS.md');
    expect(container.textContent).toContain('Repo One commands');
    expect(container.textContent).not.toContain('Repo Two AGENTS.md');
    expect(container.textContent).not.toContain('Repo Two global commands');

    await act(async () => {
      useStore.getState().setActiveWorkspace(workspaceTwo);
    });

    expect(container.textContent).toContain('Repo Two AGENTS.md');
    expect(container.textContent).toContain('Repo Two global commands');
    expect(container.textContent).not.toContain('Repo One AGENTS.md');
    expect(container.textContent).not.toContain('Repo One commands');
  });

  async function renderPanel(): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(<ContextPanel />);
      await flushAsync();
    });
  }
});

function resetStore(): void {
  useStore.setState({
    ...baseState,
    workspaces: [],
    activeWorkspaceId: null,
    workspaceDialogOpen: false,
    settingsDialogOpen: false,
    serverStatusByWorkspace: {},
    workspaceBootstraps: {},
    workspaceCapabilitiesByWorkspace: {},
    workspaceContextCatalogByWorkspace: {},
    workspaceContextCatalogLoadingByWorkspace: {},
    workspaceContextCatalogErrorByWorkspace: {},
    workspaceGitStatusByWorkspace: {},
    workspaceShipActionResultsByWorkspace: {},
    sessionsByWorkspace: {},
    activeSessionByWorkspace: {},
    messagesBySession: {},
    taskEntriesByWorkspace: {},
    resultAnnotationsByWorkspace: {},
    pendingPermissions: {},
    selectedProvider: null,
    selectedModel: null,
    selectedModelVariant: null,
    selectedAgent: null,
    effortByWorkspace: {},
    usageByWorkspace: {},
    usageLoadingByWorkspace: {},
    rightPanel: 'usage',
    selectedReasoningMessageId: null,
    activityFocusMessageId: null,
    activityFocusNonce: 0,
    composerMode: 'ask',
    sidebarOpen: true,
    rightDrawerOpen: false,
    connectionByWorkspace: {},
    streamingBySession: {},
  }, false);
}

function makeBootstrap(workspaceId: string, workspaceName: string): WorkspaceBootstrap {
  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      rootPath: `/tmp/${workspaceId}`,
      addedAt: '2026-04-22T00:00:00.000Z',
    },
    sessions: [],
    traceability: { taskEntries: [], resultAnnotations: [] },
  };
}

function makeCatalog(
  workspaceId: string,
  overrides: {
    instructionSources: WorkspaceInstructionSourceEntry[];
    capabilityEntries: WorkspaceCapabilityEntry[];
  },
): WorkspaceContextCatalogResponse {
  return {
    workspaceId,
    collectedAt: '2026-04-22T03:00:00.000Z',
    instructionSources: overrides.instructionSources,
    capabilityEntries: overrides.capabilityEntries,
  };
}

function makeInstructionEntry(
  entry: Omit<WorkspaceInstructionSourceEntry, 'sourceLayer'> & { sourceLayer?: WorkspaceInstructionSourceEntry['sourceLayer'] },
): WorkspaceInstructionSourceEntry {
  return {
    sourceLayer: entry.sourceLayer ?? 'project-local',
    ...entry,
  };
}

function makeCapabilityEntry(entry: WorkspaceCapabilityEntry): WorkspaceCapabilityEntry {
  return entry;
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
