import { create } from 'zustand';
import type {
  WorkspaceProfile,
  WorkspaceBootstrap,
  SessionSummary,
  NormalizedMessage,
  PermissionRequest,
  EffortStateSummary,
  UsageDetails,
  InstallDiagnostics,
} from '../../shared/types.js';

export type RightPanel = 'diff' | 'files' | 'usage' | 'permissions' | 'diagnostics';
export type ComposerMode = 'ask' | 'command' | 'shell';

export interface UIStore {
  install: InstallDiagnostics | null;
  workspaces: WorkspaceProfile[];
  activeWorkspaceId: string | null;
  workspaceDialogOpen: boolean;
  workspaceBootstraps: Record<string, WorkspaceBootstrap>;
  sessionsByWorkspace: Record<string, SessionSummary[]>;
  activeSessionByWorkspace: Record<string, string | undefined>;
  messagesBySession: Record<string, NormalizedMessage[]>;
  pendingPermissions: Record<string, PermissionRequest[]>;
  selectedProvider: string | null;
  selectedModel: string | null;
  selectedAgent: string | null;
  effortByWorkspace: Record<string, EffortStateSummary>;
  usageByWorkspace: Record<string, UsageDetails>;
  rightPanel: RightPanel;
  composerMode: ComposerMode;
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  connectionByWorkspace: Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  streaming: boolean;

  setInstall: (install: InstallDiagnostics) => void;
  setWorkspaces: (workspaces: WorkspaceProfile[]) => void;
  setActiveWorkspace: (id: string | null) => void;
  setWorkspaceDialogOpen: (open: boolean) => void;
  setWorkspaceBootstrap: (workspaceId: string, bootstrap: WorkspaceBootstrap) => void;
  setSessions: (workspaceId: string, sessions: SessionSummary[]) => void;
  setActiveSession: (workspaceId: string, sessionId: string | undefined) => void;
  setMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
  updateMessage: (sessionId: string, message: NormalizedMessage) => void;
  addMessage: (sessionId: string, message: NormalizedMessage) => void;
  setPendingPermissions: (key: string, permissions: PermissionRequest[]) => void;
  setSelectedProvider: (id: string | null) => void;
  setSelectedModel: (id: string | null) => void;
  setSelectedAgent: (id: string | null) => void;
  setEffort: (workspaceId: string, effort: EffortStateSummary) => void;
  setUsage: (workspaceId: string, usage: UsageDetails) => void;
  setRightPanel: (panel: RightPanel) => void;
  setComposerMode: (mode: ComposerMode) => void;
  toggleSidebar: () => void;
  toggleRightDrawer: () => void;
  setConnection: (workspaceId: string, state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  setStreaming: (streaming: boolean) => void;
}

export const useStore = create<UIStore>((set) => ({
  install: null,
  workspaces: [],
  activeWorkspaceId: null,
  workspaceDialogOpen: false,
  workspaceBootstraps: {},
  sessionsByWorkspace: {},
  activeSessionByWorkspace: {},
  messagesBySession: {},
  pendingPermissions: {},
  selectedProvider: null,
  selectedModel: null,
  selectedAgent: null,
  effortByWorkspace: {},
  usageByWorkspace: {},
  rightPanel: 'diagnostics',
  composerMode: 'ask',
  sidebarOpen: true,
  rightDrawerOpen: false,
  connectionByWorkspace: {},
  streaming: false,

  setInstall: (install) => set({ install }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  setWorkspaceDialogOpen: (open) => set({ workspaceDialogOpen: open }),
  setWorkspaceBootstrap: (workspaceId, bootstrap) =>
    set((s) => ({ workspaceBootstraps: { ...s.workspaceBootstraps, [workspaceId]: bootstrap } })),
  setSessions: (workspaceId, sessions) =>
    set((s) => ({ sessionsByWorkspace: { ...s.sessionsByWorkspace, [workspaceId]: sessions } })),
  setActiveSession: (workspaceId, sessionId) =>
    set((s) => ({ activeSessionByWorkspace: { ...s.activeSessionByWorkspace, [workspaceId]: sessionId } })),
  setMessages: (sessionId, messages) =>
    set((s) => ({ messagesBySession: { ...s.messagesBySession, [sessionId]: messages } })),
  updateMessage: (sessionId, message) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? [];
      const idx = msgs.findIndex((m) => m.id === message.id);
      if (idx === -1) {
        return {
          messagesBySession: {
            ...s.messagesBySession,
            [sessionId]: [...msgs, message],
          },
        };
      }
      const next = [...msgs];
      next[idx] = message;
      return { messagesBySession: { ...s.messagesBySession, [sessionId]: next } };
    }),
  addMessage: (sessionId, message) =>
    set((s) => {
      const existing = s.messagesBySession[sessionId] ?? [];
      const idx = existing.findIndex((entry) => entry.id === message.id);
      if (idx >= 0) {
        const next = [...existing];
        next[idx] = message;
        return { messagesBySession: { ...s.messagesBySession, [sessionId]: next } };
      }

      return {
        messagesBySession: {
          ...s.messagesBySession,
          [sessionId]: [...existing, message],
        },
      };
    }),
  setPendingPermissions: (key, permissions) =>
    set((s) => ({ pendingPermissions: { ...s.pendingPermissions, [key]: permissions } })),
  setSelectedProvider: (id) => set({ selectedProvider: id }),
  setSelectedModel: (id) => set({ selectedModel: id }),
  setSelectedAgent: (id) => set({ selectedAgent: id }),
  setEffort: (workspaceId, effort) =>
    set((s) => ({ effortByWorkspace: { ...s.effortByWorkspace, [workspaceId]: effort } })),
  setUsage: (workspaceId, usage) =>
    set((s) => ({ usageByWorkspace: { ...s.usageByWorkspace, [workspaceId]: usage } })),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  setComposerMode: (mode) => set({ composerMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightDrawer: () => set((s) => ({ rightDrawerOpen: !s.rightDrawerOpen })),
  setConnection: (workspaceId, state) =>
    set((s) => ({ connectionByWorkspace: { ...s.connectionByWorkspace, [workspaceId]: state } })),
  setStreaming: (streaming) => set({ streaming }),
}));
