import { create } from 'zustand';
import { getItem, setItem } from '../lib/local-storage.js';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from '../lib/app-settings.js';
import type {
  WorkspaceProfile,
  WorkspaceServerStatus,
  WorkspaceBootstrap,
  SessionSummary,
  NormalizedMessage,
  PermissionRequest,
  EffortStateSummary,
  UsageDetails,
  InstallDiagnostics,
} from '../../shared/types.js';

export type RightPanel = 'activity' | 'diff' | 'files' | 'usage' | 'permissions' | 'diagnostics';
export type ComposerMode = 'ask' | 'command' | 'shell';

export interface UIStore {
  install: InstallDiagnostics | null;
  workspaces: WorkspaceProfile[];
  activeWorkspaceId: string | null;
  workspaceDialogOpen: boolean;
  settingsDialogOpen: boolean;
  settings: AppSettings;
  serverStatusByWorkspace: Record<string, WorkspaceServerStatus>;
  workspaceBootstraps: Record<string, WorkspaceBootstrap>;
  sessionsByWorkspace: Record<string, SessionSummary[]>;
  activeSessionByWorkspace: Record<string, string | undefined>;
  messagesBySession: Record<string, NormalizedMessage[]>;
  pendingPermissions: Record<string, PermissionRequest[]>;
  selectedProvider: string | null;
  selectedModel: string | null;
  selectedModelVariant: string | null;
  selectedAgent: string | null;
  effortByWorkspace: Record<string, EffortStateSummary>;
  usageByWorkspace: Record<string, UsageDetails>;
  usageLoadingByWorkspace: Record<string, boolean>;
  rightPanel: RightPanel;
  selectedReasoningMessageId: string | null;
  activityFocusMessageId: string | null;
  activityFocusNonce: number;
  composerMode: ComposerMode;
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  connectionByWorkspace: Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
  streaming: boolean;

  setInstall: (install: InstallDiagnostics) => void;
  setWorkspaces: (workspaces: WorkspaceProfile[]) => void;
  setActiveWorkspace: (id: string | null) => void;
  setWorkspaceDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setWorkspaceServerStatuses: (statuses: Record<string, WorkspaceServerStatus>) => void;
  setWorkspaceServerStatus: (workspaceId: string, status: WorkspaceServerStatus) => void;
  setWorkspaceBootstrap: (workspaceId: string, bootstrap: WorkspaceBootstrap) => void;
  setSessions: (workspaceId: string, sessions: SessionSummary[]) => void;
  setActiveSession: (workspaceId: string, sessionId: string | undefined) => void;
  setMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
  updateMessage: (sessionId: string, message: NormalizedMessage) => void;
  addMessage: (sessionId: string, message: NormalizedMessage) => void;
  setPendingPermissions: (key: string, permissions: PermissionRequest[]) => void;
  setSelectedProvider: (id: string | null) => void;
  setSelectedModel: (id: string | null) => void;
  setSelectedModelVariant: (id: string | null) => void;
  setSelectedAgent: (id: string | null) => void;
  setEffort: (workspaceId: string, effort: EffortStateSummary) => void;
  setUsage: (workspaceId: string, usage: UsageDetails, provider?: string | null) => void;
  setUsageLoading: (workspaceId: string, loading: boolean, provider?: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  setSelectedReasoningMessage: (messageId: string | null) => void;
  focusActivityMessage: (messageId: string) => void;
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
  settingsDialogOpen: false,
  settings: loadAppSettings(),
  serverStatusByWorkspace: {},
  workspaceBootstraps: {},
  sessionsByWorkspace: {},
  activeSessionByWorkspace: getItem<Record<string, string | undefined>>('active-sessions', {}),
  messagesBySession: {},
  pendingPermissions: {},
  selectedProvider: null,
  selectedModel: null,
  selectedModelVariant: null,
  selectedAgent: null,
  effortByWorkspace: {},
  usageByWorkspace: loadUsageCache(),
  usageLoadingByWorkspace: {},
  rightPanel: getItem<RightPanel>('right-panel', 'usage'),
  selectedReasoningMessageId: null,
  activityFocusMessageId: null,
  activityFocusNonce: 0,
  composerMode: 'ask',
  sidebarOpen: true,
  rightDrawerOpen: getItem<boolean>('right-drawer-open', false),
  connectionByWorkspace: {},
  streaming: false,

  setInstall: (install) => set({ install }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  setWorkspaceDialogOpen: (open) => set({ workspaceDialogOpen: open }),
  setSettingsDialogOpen: (open) => set({ settingsDialogOpen: open }),
  updateSettings: (settings) => set((s) => {
    const next = { ...s.settings, ...settings };
    saveAppSettings(next);
    return { settings: next };
  }),
  resetSettings: () => {
    saveAppSettings(DEFAULT_APP_SETTINGS);
    set({ settings: DEFAULT_APP_SETTINGS });
  },
  setWorkspaceServerStatuses: (statuses) => set({ serverStatusByWorkspace: statuses }),
  setWorkspaceServerStatus: (workspaceId, status) =>
    set((s) => ({ serverStatusByWorkspace: { ...s.serverStatusByWorkspace, [workspaceId]: status } })),
  setWorkspaceBootstrap: (workspaceId, bootstrap) =>
    set((s) => ({ workspaceBootstraps: { ...s.workspaceBootstraps, [workspaceId]: bootstrap } })),
  setSessions: (workspaceId, sessions) =>
    set((s) => ({ sessionsByWorkspace: { ...s.sessionsByWorkspace, [workspaceId]: sessions } })),
  setActiveSession: (workspaceId, sessionId) =>
    set((s) => {
      const next = { ...s.activeSessionByWorkspace, [workspaceId]: sessionId };
      setItem('active-sessions', next);
      return { activeSessionByWorkspace: next };
    }),
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
  setSelectedModelVariant: (id) => set({ selectedModelVariant: id }),
  setSelectedAgent: (id) => set({ selectedAgent: id }),
  setEffort: (workspaceId, effort) =>
    set((s) => ({ effortByWorkspace: { ...s.effortByWorkspace, [workspaceId]: effort } })),
  setUsage: (workspaceId, usage, provider) =>
    set((s) => {
      const nextUsage = {
        ...s.usageByWorkspace,
        [resolveUsageCacheKey(workspaceId, provider)]: usage,
      };
      saveUsageCache(nextUsage);
      return { usageByWorkspace: nextUsage };
    }),
  setUsageLoading: (workspaceId, loading, provider) =>
    set((s) => ({
      usageLoadingByWorkspace: {
        ...s.usageLoadingByWorkspace,
        [resolveUsageCacheKey(workspaceId, provider)]: loading,
      },
    })),
  setRightPanel: (panel) => {
    setItem('right-panel', panel);
    set({ rightPanel: panel });
  },
  setSelectedReasoningMessage: (messageId) => set({ selectedReasoningMessageId: messageId }),
  focusActivityMessage: (messageId) =>
    set((s) => ({
      selectedReasoningMessageId: messageId,
      activityFocusMessageId: messageId,
      activityFocusNonce: s.activityFocusNonce + 1,
    })),
  setComposerMode: (mode) => set({ composerMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightDrawer: () => set((s) => {
    const next = !s.rightDrawerOpen;
    setItem('right-drawer-open', next);
    return { rightDrawerOpen: next };
  }),
  setConnection: (workspaceId, state) =>
    set((s) => ({ connectionByWorkspace: { ...s.connectionByWorkspace, [workspaceId]: state } })),
  setStreaming: (streaming) => set({ streaming }),
}));

const USAGE_CACHE_KEY = 'opencode-web-client:usage-cache';

export function resolveUsageCacheKey(workspaceId: string, provider?: string | null): string {
  return `${workspaceId}::${normalizeUsageScope(provider)}`;
}

function loadAppSettings(): AppSettings {
  return normalizeAppSettings(getItem<unknown>('app-settings', DEFAULT_APP_SETTINGS));
}

function saveAppSettings(settings: AppSettings): void {
  setItem('app-settings', settings);
}

export function getCachedUsage(
  cache: Record<string, UsageDetails>,
  workspaceId: string,
  provider?: string | null,
): UsageDetails | undefined {
  const exact = cache[resolveUsageCacheKey(workspaceId, provider)];
  if (exact) return exact;

  const auto = cache[resolveUsageCacheKey(workspaceId, null)];
  if (auto) return auto;

  const legacy = cache[workspaceId];
  if (legacy) return legacy;

  const prefix = `${workspaceId}::`;
  const fallbackKey = Object.keys(cache).find((key) => key.startsWith(prefix));
  return fallbackKey ? cache[fallbackKey] : undefined;
}

export function readUsageCacheSnapshot(
  workspaceId: string,
  provider?: string | null,
): UsageDetails | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return undefined;
    return getCachedUsage(normalizeUsageCache(JSON.parse(raw)), workspaceId, provider);
  } catch {
    return undefined;
  }
}

function loadUsageCache(): Record<string, UsageDetails> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeUsageCache(parsed);
  } catch {
    return {};
  }
}

function saveUsageCache(cache: Record<string, UsageDetails>): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore storage failures */
  }
}

function normalizeUsageCache(value: unknown): Record<string, UsageDetails> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const next: Record<string, UsageDetails> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isUsageDetails(entry)) continue;
    next[key.includes('::') ? key : resolveUsageCacheKey(key, null)] = entry;
  }
  return next;
}

function isUsageDetails(value: unknown): value is UsageDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<UsageDetails>;
  return typeof candidate.provider === 'string'
    && typeof candidate.status === 'string'
    && !!candidate.data
    && typeof candidate.data === 'object';
}

function normalizeUsageScope(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'auto';
}
