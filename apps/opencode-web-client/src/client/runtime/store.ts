import { create } from 'zustand';
import { getItem, setItem } from '../lib/local-storage.js';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from '../lib/app-settings.js';
import type {
  CapabilityProbeStatus,
  CommitExecuteResult,
  CommitPreviewResult,
  InstallDiagnostics,
  MessageTraceLink,
  NormalizedMessage,
  PermissionRequest,
  PullRequestCreateResult,
  PushResult,
  ResultAnnotation,
  SessionSummary,
  TaskEntry,
  UsageDetails,
  WorkspaceGitStatusResult,
  WorkspaceBootstrap,
  WorkspaceCapabilityKey,
  WorkspaceCapabilityProbe,
  WorkspaceProfile,
  WorkspaceServerStatus,
  WorkspaceTraceabilitySummary,
  EffortStateSummary,
  ResultVerificationState,
  VerificationCommandKind,
  VerificationRun,
  TaskLedgerRecord,
  TaskLedgerShipReference,
} from '../../shared/types.js';

export type RightPanel = 'tasks' | 'activity' | 'diff' | 'files' | 'ship' | 'usage' | 'verification' | 'permissions' | 'diagnostics';
export type ComposerMode = 'ask' | 'command' | 'shell';

export interface ResolvedMessageResultTrace {
  trace: MessageTraceLink;
  annotation?: ResultAnnotation;
  taskEntry?: TaskEntry;
  shipReference?: TaskLedgerShipReference;
  verification: ResultVerificationState;
  verificationSummary?: string;
  latestVerificationRun?: VerificationRun;
  linkedVerificationRuns: VerificationRun[];
  summary?: string;
}

export interface WorkspaceCapabilityGap {
  key: WorkspaceCapabilityKey;
  label: string;
  status: Exclude<CapabilityProbeStatus, 'available'>;
  summary: string;
  detail?: string;
}

export type WorkspaceShipActionKey = 'commitPreview' | 'commitExecute' | 'push' | 'pullRequest';

export interface WorkspaceShipActionResults {
  commitPreview?: CommitPreviewResult;
  commitExecute?: CommitExecuteResult;
  push?: PushResult;
  pullRequest?: PullRequestCreateResult;
}

type TaskEntriesBySession = Record<string, Record<string, TaskEntry>>;
type ResultAnnotationsBySession = Record<string, Record<string, ResultAnnotation>>;

export interface UIStore {
  install: InstallDiagnostics | null;
  workspaces: WorkspaceProfile[];
  activeWorkspaceId: string | null;
  workspaceDialogOpen: boolean;
  settingsDialogOpen: boolean;
  settings: AppSettings;
  serverStatusByWorkspace: Record<string, WorkspaceServerStatus>;
  workspaceBootstraps: Record<string, WorkspaceBootstrap>;
  workspaceCapabilitiesByWorkspace: Record<string, WorkspaceCapabilityProbe>;
  workspaceGitStatusByWorkspace: Record<string, WorkspaceGitStatusResult>;
  workspaceShipActionResultsByWorkspace: Record<string, WorkspaceShipActionResults>;
  sessionsByWorkspace: Record<string, SessionSummary[]>;
  activeSessionByWorkspace: Record<string, string | undefined>;
  messagesBySession: Record<string, NormalizedMessage[]>;
  taskEntriesByWorkspace: Record<string, TaskEntriesBySession>;
  resultAnnotationsByWorkspace: Record<string, ResultAnnotationsBySession>;
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
  streamingBySession: Record<string, boolean>;

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
  setWorkspaceCapabilities: (workspaceId: string, capabilities: WorkspaceCapabilityProbe) => void;
  setWorkspaceGitStatus: (workspaceId: string, status: WorkspaceGitStatusResult) => void;
  setWorkspaceShipActionResult: (workspaceId: string, action: WorkspaceShipActionKey, result: WorkspaceShipActionResults[WorkspaceShipActionKey]) => void;
  setVerificationRuns: (workspaceId: string, runs: VerificationRun[]) => void;
  upsertVerificationRun: (workspaceId: string, run: VerificationRun) => void;
  applyVerificationProjection: (
    workspaceId: string,
    sessionId: string,
    sourceMessageId: string,
    taskEntry?: TaskEntry,
    resultAnnotation?: ResultAnnotation,
  ) => void;
  setSessions: (workspaceId: string, sessions: SessionSummary[]) => void;
  setActiveSession: (workspaceId: string, sessionId: string | undefined) => void;
  setMessages: (workspaceId: string, sessionId: string, messages: NormalizedMessage[]) => void;
  updateMessage: (workspaceId: string, sessionId: string, message: NormalizedMessage) => void;
  addMessage: (workspaceId: string, sessionId: string, message: NormalizedMessage) => void;
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
  setSessionStreaming: (workspaceId: string, sessionId: string, streaming: boolean) => void;
  clearWorkspaceStreaming: (workspaceId: string) => void;
}

const EMPTY_MESSAGES: NormalizedMessage[] = [];
const EMPTY_CAPABILITY_GAPS: WorkspaceCapabilityGap[] = [];
const WORKSPACE_SCOPE_SESSION_KEY = '__workspace__';
const VERIFY_KIND_ORDER: VerificationCommandKind[] = ['lint', 'build', 'test'];
const WORKSPACE_CAPABILITY_KEYS: WorkspaceCapabilityKey[] = ['localGit', 'ghCli', 'ghAuth', 'previewTarget', 'browserEvidence'];
const WORKSPACE_CAPABILITY_LABELS: Record<WorkspaceCapabilityKey, string> = {
  localGit: 'Local git',
  ghCli: 'GitHub CLI',
  ghAuth: 'GitHub auth',
  previewTarget: 'Preview target',
  browserEvidence: 'Browser evidence',
};

export const useStore = create<UIStore>((set) => ({
  install: null,
  workspaces: [],
  activeWorkspaceId: null,
  workspaceDialogOpen: false,
  settingsDialogOpen: false,
  settings: loadAppSettings(),
  serverStatusByWorkspace: {},
  workspaceBootstraps: {},
  workspaceCapabilitiesByWorkspace: {},
  workspaceGitStatusByWorkspace: {},
  workspaceShipActionResultsByWorkspace: {},
  sessionsByWorkspace: {},
  activeSessionByWorkspace: getItem<Record<string, string | undefined>>('active-sessions', {}),
  messagesBySession: {},
  taskEntriesByWorkspace: {},
  resultAnnotationsByWorkspace: {},
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
  streamingBySession: {},

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
    set((s) => {
      const taskLedgerRecords = normalizeTaskLedgerRecords(workspaceId, bootstrap.taskLedgerRecords);
      return {
        workspaceBootstraps: {
          ...s.workspaceBootstraps,
          [workspaceId]: {
            ...bootstrap,
            ...(bootstrap.verificationRuns ? { verificationRuns: sortVerificationRuns(bootstrap.verificationRuns) } : {}),
            ...(bootstrap.taskLedgerRecords !== undefined ? { taskLedgerRecords } : {}),
          },
        },
        workspaceCapabilitiesByWorkspace: bootstrap.capabilities
          ? { ...s.workspaceCapabilitiesByWorkspace, [workspaceId]: bootstrap.capabilities }
          : s.workspaceCapabilitiesByWorkspace,
        workspaceGitStatusByWorkspace: bootstrap.git
          ? { ...s.workspaceGitStatusByWorkspace, [workspaceId]: bootstrap.git }
          : s.workspaceGitStatusByWorkspace,
        taskEntriesByWorkspace: {
          ...s.taskEntriesByWorkspace,
          [workspaceId]: groupTaskEntriesBySession(bootstrap.traceability, taskLedgerRecords),
        },
        resultAnnotationsByWorkspace: {
          ...s.resultAnnotationsByWorkspace,
          [workspaceId]: groupResultAnnotationsBySession(bootstrap.traceability, taskLedgerRecords),
        },
      };
    }),
  setWorkspaceCapabilities: (workspaceId, capabilities) =>
    set((s) => ({
      workspaceCapabilitiesByWorkspace: {
        ...s.workspaceCapabilitiesByWorkspace,
        [workspaceId]: capabilities,
      },
    })),
  setWorkspaceGitStatus: (workspaceId, status) =>
    set((s) => ({
      workspaceGitStatusByWorkspace: {
        ...s.workspaceGitStatusByWorkspace,
        [workspaceId]: status,
      },
      workspaceBootstraps: updateWorkspaceBootstrap(s.workspaceBootstraps, workspaceId, (bootstrap) => ({
        ...bootstrap,
        git: status,
      })),
    })),
  setWorkspaceShipActionResult: (workspaceId, action, result) =>
    set((s) => ({
      workspaceShipActionResultsByWorkspace: {
        ...s.workspaceShipActionResultsByWorkspace,
        [workspaceId]: {
          ...(s.workspaceShipActionResultsByWorkspace[workspaceId] ?? {}),
          [action]: result,
        },
      },
    })),
  setVerificationRuns: (workspaceId, runs) =>
    set((s) => ({
      workspaceBootstraps: updateWorkspaceBootstrap(s.workspaceBootstraps, workspaceId, (bootstrap) => ({
        ...bootstrap,
        verificationRuns: sortVerificationRuns(runs),
      })),
    })),
  upsertVerificationRun: (workspaceId, run) =>
    set((s) => ({
      workspaceBootstraps: updateWorkspaceBootstrap(s.workspaceBootstraps, workspaceId, (bootstrap) => ({
        ...bootstrap,
        verificationRuns: upsertVerificationRuns(bootstrap.verificationRuns, run),
      })),
    })),
  applyVerificationProjection: (workspaceId, sessionId, sourceMessageId, taskEntry, resultAnnotation) =>
    set((s) => {
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      const messages = s.messagesBySession[sessionKey] ?? EMPTY_MESSAGES;
      const messageIndex = messages.findIndex((message) => {
        const messageSourceId = message.resultAnnotation?.sourceMessageId
          ?? message.taskEntry?.sourceMessageId
          ?? message.trace?.sourceMessageId
          ?? message.id;
        return messageSourceId === sourceMessageId;
      });

      if (messageIndex < 0) {
        return {
          taskEntriesByWorkspace: taskEntry?.taskId
            ? {
                ...s.taskEntriesByWorkspace,
                [workspaceId]: {
                  ...(s.taskEntriesByWorkspace[workspaceId] ?? {}),
                  [sessionId]: {
                    ...(s.taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {}),
                    [taskEntry.taskId]: taskEntry,
                  },
                },
              }
            : s.taskEntriesByWorkspace,
          resultAnnotationsByWorkspace: resultAnnotation
            ? {
                ...s.resultAnnotationsByWorkspace,
                [workspaceId]: {
                  ...(s.resultAnnotationsByWorkspace[workspaceId] ?? {}),
                  [sessionId]: {
                    ...(s.resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {}),
                    [sourceMessageId]: resultAnnotation,
                  },
                },
              }
            : s.resultAnnotationsByWorkspace,
        };
      }

      const nextMessages = [...messages];
      const message = nextMessages[messageIndex]!;
      const nextTaskId = taskEntry?.taskId
        ?? resultAnnotation?.taskId
        ?? message.taskEntry?.taskId
        ?? message.resultAnnotation?.taskId
        ?? message.trace?.taskId;
      const mergedTaskEntry = taskEntry
        ? {
            taskId: nextTaskId ?? taskEntry.taskId,
            workspaceId: taskEntry.workspaceId,
            sessionId: taskEntry.sessionId,
            sourceMessageId: taskEntry.sourceMessageId,
            title: message.taskEntry?.title ?? taskEntry.title,
            state: message.taskEntry?.state ?? taskEntry.state,
            latestSummary: taskEntry.latestSummary ?? message.taskEntry?.latestSummary,
          }
        : message.taskEntry;
      const mergedAnnotation = resultAnnotation
        ? {
            sourceMessageId,
            workspaceId: resultAnnotation.workspaceId,
            sessionId: resultAnnotation.sessionId,
            verification: resultAnnotation.verification,
            ...(nextTaskId ? { taskId: nextTaskId } : {}),
            ...(resultAnnotation.summary ? { summary: resultAnnotation.summary } : {}),
            ...(message.resultAnnotation?.reviewState ? { reviewState: message.resultAnnotation.reviewState } : {}),
            ...(message.resultAnnotation?.shipState ? { shipState: message.resultAnnotation.shipState } : {}),
          }
        : message.resultAnnotation;

      nextMessages[messageIndex] = hydrateMessageTraceability({
        ...message,
        trace: {
          sourceMessageId,
          workspaceId,
          sessionId,
          ...(nextTaskId ? { taskId: nextTaskId } : {}),
        },
        ...(mergedTaskEntry ? { taskEntry: mergedTaskEntry } : {}),
        ...(mergedAnnotation ? { resultAnnotation: mergedAnnotation } : {}),
      }, workspaceId, sessionId);

      return {
        messagesBySession: { ...s.messagesBySession, [sessionKey]: nextMessages },
        taskEntriesByWorkspace: mergedTaskEntry?.taskId
          ? {
              ...s.taskEntriesByWorkspace,
              [workspaceId]: {
                ...(s.taskEntriesByWorkspace[workspaceId] ?? {}),
                [sessionId]: {
                  ...(s.taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {}),
                  [mergedTaskEntry.taskId]: mergedTaskEntry,
                },
              },
            }
          : s.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: mergedAnnotation
          ? {
              ...s.resultAnnotationsByWorkspace,
              [workspaceId]: {
                ...(s.resultAnnotationsByWorkspace[workspaceId] ?? {}),
                [sessionId]: {
                  ...(s.resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {}),
                  [sourceMessageId]: mergedAnnotation,
                },
              },
            }
          : s.resultAnnotationsByWorkspace,
      };
    }),
  setSessions: (workspaceId, sessions) =>
    set((s) => {
      const previousSessions = s.sessionsByWorkspace[workspaceId] ?? [];
      const pruned = pruneRemovedWorkspaceSessionState(s, workspaceId, previousSessions, sessions);
      return {
        sessionsByWorkspace: { ...s.sessionsByWorkspace, [workspaceId]: sessions },
        messagesBySession: pruned.messagesBySession,
        taskEntriesByWorkspace: pruned.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: pruned.resultAnnotationsByWorkspace,
        streamingBySession: syncWorkspaceStreamingState(
          pruned.streamingBySession,
          workspaceId,
          previousSessions,
          sessions,
        ),
      };
    }),
  setActiveSession: (workspaceId, sessionId) =>
    set((s) => {
      const next = { ...s.activeSessionByWorkspace, [workspaceId]: sessionId };
      setItem('active-sessions', next);
      return { activeSessionByWorkspace: next };
    }),
  setMessages: (workspaceId, sessionId, messages) =>
    set((s) => {
      const normalizedMessages = messages.map((message) => hydrateMessageTraceability(message, workspaceId, sessionId));
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      const nextState = applyWorkspaceSessionTraceability(
        s.taskEntriesByWorkspace,
        s.resultAnnotationsByWorkspace,
        workspaceId,
        sessionId,
        normalizedMessages,
        s.workspaceBootstraps[workspaceId],
      );
      return {
        messagesBySession: { ...s.messagesBySession, [sessionKey]: normalizedMessages },
        taskEntriesByWorkspace: nextState.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: nextState.resultAnnotationsByWorkspace,
      };
    }),
  updateMessage: (workspaceId, sessionId, message) =>
    set((s) => {
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      const messages = s.messagesBySession[sessionKey] ?? EMPTY_MESSAGES;
      const nextMessage = hydrateMessageTraceability(message, workspaceId, sessionId);
      const idx = messages.findIndex((entry) => entry.id === nextMessage.id);
      const nextMessages = idx === -1
        ? [...messages, nextMessage]
        : messages.map((entry, index) => index === idx ? nextMessage : entry);
      const nextState = applyWorkspaceSessionTraceability(
        s.taskEntriesByWorkspace,
        s.resultAnnotationsByWorkspace,
        workspaceId,
        sessionId,
        nextMessages,
        s.workspaceBootstraps[workspaceId],
      );
      return {
        messagesBySession: { ...s.messagesBySession, [sessionKey]: nextMessages },
        taskEntriesByWorkspace: nextState.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: nextState.resultAnnotationsByWorkspace,
      };
    }),
  addMessage: (workspaceId, sessionId, message) =>
    set((s) => {
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      const existing = s.messagesBySession[sessionKey] ?? EMPTY_MESSAGES;
      const nextMessage = hydrateMessageTraceability(message, workspaceId, sessionId);
      const idx = existing.findIndex((entry) => entry.id === nextMessage.id);
      const nextMessages = idx >= 0
        ? existing.map((entry, index) => index === idx ? nextMessage : entry)
        : [...existing, nextMessage];
      const nextState = applyWorkspaceSessionTraceability(
        s.taskEntriesByWorkspace,
        s.resultAnnotationsByWorkspace,
        workspaceId,
        sessionId,
        nextMessages,
        s.workspaceBootstraps[workspaceId],
      );
      return {
        messagesBySession: { ...s.messagesBySession, [sessionKey]: nextMessages },
        taskEntriesByWorkspace: nextState.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: nextState.resultAnnotationsByWorkspace,
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
  setSessionStreaming: (workspaceId, sessionId, streaming) =>
    set((s) => {
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      if (streaming) {
        if (s.streamingBySession[sessionKey]) return s;
        return { streamingBySession: { ...s.streamingBySession, [sessionKey]: true } };
      }

      if (!s.streamingBySession[sessionKey]) return s;

      const next = { ...s.streamingBySession };
      delete next[sessionKey];
      return { streamingBySession: next };
    }),
  clearWorkspaceStreaming: (workspaceId) =>
    set((s) => ({
      streamingBySession: clearWorkspaceStreamingState(
        s.streamingBySession,
        workspaceId,
        s.sessionsByWorkspace[workspaceId] ?? [],
      ),
    })),
}));

export function resolveWorkspaceSessionStoreKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}::${sessionId}`;
}

export function selectSessionMessages(
  store: Pick<UIStore, 'messagesBySession'>,
  workspaceId?: string | null,
  sessionId?: string,
): NormalizedMessage[] {
  if (!workspaceId || !sessionId) return EMPTY_MESSAGES;
  return store.messagesBySession[resolveWorkspaceSessionStoreKey(workspaceId, sessionId)] ?? EMPTY_MESSAGES;
}

export function selectSessionStreaming(
  store: Pick<UIStore, 'streamingBySession'>,
  workspaceId?: string | null,
  sessionId?: string,
): boolean {
  if (!workspaceId || !sessionId) return false;
  return !!store.streamingBySession[resolveWorkspaceSessionStoreKey(workspaceId, sessionId)];
}

export function selectWorkspaceCapabilities(
  store: Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceCapabilityProbe | undefined {
  if (!workspaceId) return undefined;
  return store.workspaceCapabilitiesByWorkspace[workspaceId];
}

export function selectActiveWorkspaceCapabilities(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceCapabilitiesByWorkspace'>,
): WorkspaceCapabilityProbe | undefined {
  return selectWorkspaceCapabilities(store, store.activeWorkspaceId);
}

export function selectWorkspaceGitStatus(
  store: Pick<UIStore, 'workspaceGitStatusByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceGitStatusResult | undefined {
  if (!workspaceId) return undefined;
  return store.workspaceGitStatusByWorkspace[workspaceId];
}

export function selectActiveWorkspaceGitStatus(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceGitStatusByWorkspace'>,
): WorkspaceGitStatusResult | undefined {
  return selectWorkspaceGitStatus(store, store.activeWorkspaceId);
}

export function selectWorkspaceShipActionResults(
  store: Pick<UIStore, 'workspaceShipActionResultsByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceShipActionResults | undefined {
  if (!workspaceId) return undefined;
  return store.workspaceShipActionResultsByWorkspace[workspaceId];
}

export function selectActiveWorkspaceShipActionResults(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceShipActionResultsByWorkspace'>,
): WorkspaceShipActionResults | undefined {
  return selectWorkspaceShipActionResults(store, store.activeWorkspaceId);
}

export function selectActiveWorkspaceCapabilityGaps(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceCapabilitiesByWorkspace'>,
): WorkspaceCapabilityGap[] {
  return deriveWorkspaceCapabilityGaps(selectActiveWorkspaceCapabilities(store));
}

export function deriveWorkspaceCapabilityGaps(
  capabilities?: WorkspaceCapabilityProbe,
): WorkspaceCapabilityGap[] {
  if (!capabilities) return EMPTY_CAPABILITY_GAPS;

  const gaps = WORKSPACE_CAPABILITY_KEYS.flatMap((key) => {
    const probe = capabilities[key];
    if (!probe || probe.status === 'available') {
      return [];
    }

    return [{
      key,
      label: WORKSPACE_CAPABILITY_LABELS[key],
      status: probe.status,
      summary: probe.summary,
      detail: probe.detail,
    }];
  });

  return gaps.length > 0 ? gaps : EMPTY_CAPABILITY_GAPS;
}

export function selectWorkspaceVerificationRuns(
  store: Pick<UIStore, 'workspaceBootstraps'>,
  workspaceId?: string | null,
): VerificationRun[] {
  if (!workspaceId) return [];
  return store.workspaceBootstraps[workspaceId]?.verificationRuns ?? [];
}

export function selectActiveWorkspaceVerificationRuns(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceBootstraps'>,
): VerificationRun[] {
  return selectWorkspaceVerificationRuns(store, store.activeWorkspaceId);
}

export function selectWorkspaceTaskLedgerRecords(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
  workspaceId?: string | null,
): TaskLedgerRecord[] {
  if (!workspaceId) return [];
  const records = normalizeTaskLedgerRecords(workspaceId, store.workspaceBootstraps[workspaceId]?.taskLedgerRecords);
  const status = store.workspaceGitStatusByWorkspace[workspaceId];
  return records.map((record) => projectTaskLedgerRecord(record, status));
}

export function selectActiveWorkspaceTaskLedgerRecords(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
): TaskLedgerRecord[] {
  return selectWorkspaceTaskLedgerRecords(store, store.activeWorkspaceId);
}

export function selectSessionTaskLedgerRecords(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
  workspaceId?: string | null,
  sessionId?: string,
): TaskLedgerRecord[] {
  if (!workspaceId || !sessionId) return [];
  return selectWorkspaceTaskLedgerRecords(store, workspaceId).filter((record) => resolveTaskLedgerRecordSessionId(record) === sessionId);
}

export function selectMessageResultTrace(
  store: Pick<UIStore, 'resultAnnotationsByWorkspace' | 'taskEntriesByWorkspace' | 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
  message: NormalizedMessage,
): ResolvedMessageResultTrace | undefined {
  const workspaceId = message.trace?.workspaceId
    ?? message.resultAnnotation?.workspaceId
    ?? message.taskEntry?.workspaceId;
  const sessionId = message.trace?.sessionId
    ?? message.resultAnnotation?.sessionId
    ?? message.taskEntry?.sessionId;
  const sourceMessageId = message.resultAnnotation?.sourceMessageId
    ?? message.taskEntry?.sourceMessageId
    ?? message.trace?.sourceMessageId
    ?? message.id;

  if (!workspaceId || !sessionId || !sourceMessageId) {
    return undefined;
  }

  const annotation = store.resultAnnotationsByWorkspace[workspaceId]?.[sessionId]?.[sourceMessageId]
    ?? message.resultAnnotation;
  const linkedVerificationRuns = selectLinkedVerificationRuns(store, workspaceId, sessionId, sourceMessageId, annotation?.taskId ?? message.trace?.taskId ?? message.taskEntry?.taskId);
  const verificationProjection = deriveVerificationEvidence(linkedVerificationRuns);
  const taskId = annotation?.taskId
    ?? message.trace?.taskId
    ?? message.taskEntry?.taskId
    ?? verificationProjection.latestRun?.taskId;
  const linkedTaskRecord = selectLinkedTaskLedgerRecord(store, workspaceId, sessionId, sourceMessageId, taskId);
  const taskEntry = taskId
    ? selectTaskEntry(store, workspaceId, taskId, sessionId) ?? message.taskEntry
    : message.taskEntry;
  const projectedAnnotation = projectResultAnnotation(
    annotation,
    linkedTaskRecord?.recentShipRef?.pullRequestUrl,
    store.workspaceGitStatusByWorkspace[workspaceId],
  );

  if (!annotation && !taskEntry && !taskId && linkedVerificationRuns.length === 0) {
    return undefined;
  }

  return {
    trace: {
      sourceMessageId,
      workspaceId,
      sessionId,
      ...(taskId ? { taskId } : {}),
    },
    annotation: projectedAnnotation,
    taskEntry,
    shipReference: linkedTaskRecord?.recentShipRef,
    verification: verificationProjection.verification ?? projectedAnnotation?.verification ?? 'unverified',
    verificationSummary: verificationProjection.latestSummary,
    latestVerificationRun: verificationProjection.latestRun,
    linkedVerificationRuns,
    summary: verificationProjection.latestSummary ?? projectedAnnotation?.summary ?? taskEntry?.latestSummary,
  };
}

function selectLinkedTaskLedgerRecord(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId?: string,
): TaskLedgerRecord | undefined {
  const records = selectSessionTaskLedgerRecords(store, workspaceId, sessionId);
  return records.find((record) => {
    if (record.sourceMessageId === sourceMessageId) return true;
    return !!taskId && record.taskId === taskId;
  });
}

function selectLinkedVerificationRuns(
  store: Pick<UIStore, 'workspaceBootstraps'>,
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId?: string,
): VerificationRun[] {
  const runs = selectWorkspaceVerificationRuns(store, workspaceId);
  return runs.filter((run) => {
    if (run.workspaceId !== workspaceId) return false;
    if (run.sessionId && run.sessionId !== sessionId) return false;
    if (run.sourceMessageId === sourceMessageId) return true;
    return !!taskId && run.taskId === taskId;
  });
}

function deriveVerificationEvidence(runs: VerificationRun[]): {
  verification?: ResultVerificationState;
  latestSummary?: string;
  latestRun?: VerificationRun;
} {
  if (runs.length === 0) {
    return {};
  }

  const sortedRuns = sortVerificationRuns(runs);
  const latestByKind = new Map<VerificationCommandKind, VerificationRun>();
  for (const run of sortedRuns) {
    if (!latestByKind.has(run.commandKind)) {
      latestByKind.set(run.commandKind, run);
    }
  }

  const selectedRuns = VERIFY_KIND_ORDER
    .map((kind) => latestByKind.get(kind))
    .filter((run): run is VerificationRun => !!run);
  const latestRun = sortedRuns[0];
  const hasPassed = selectedRuns.some((run) => run.status === 'passed');
  const verification: ResultVerificationState = selectedRuns.length > 0 && selectedRuns.every((run) => run.status === 'passed')
    ? 'verified'
    : hasPassed
      ? 'partially verified'
      : 'unverified';

  return {
    verification,
    latestSummary: latestRun.summary,
    latestRun,
  };
}

function selectTaskEntry(
  store: Pick<UIStore, 'taskEntriesByWorkspace'>,
  workspaceId: string,
  taskId: string,
  preferredSessionId?: string,
): TaskEntry | undefined {
  const entriesBySession = store.taskEntriesByWorkspace[workspaceId] ?? {};
  if (preferredSessionId && entriesBySession[preferredSessionId]?.[taskId]) {
    return entriesBySession[preferredSessionId][taskId];
  }
  if (entriesBySession[WORKSPACE_SCOPE_SESSION_KEY]?.[taskId]) {
    return entriesBySession[WORKSPACE_SCOPE_SESSION_KEY][taskId];
  }
  return Object.values(entriesBySession).find((entries) => entries[taskId])?.[taskId];
}

function projectTaskLedgerRecord(
  record: TaskLedgerRecord,
  status?: WorkspaceGitStatusResult,
): TaskLedgerRecord {
  const projectedAnnotation = projectResultAnnotation(record.resultAnnotation, record.recentShipRef?.pullRequestUrl, status);
  if (projectedAnnotation === record.resultAnnotation) {
    return record;
  }

  return {
    ...record,
    ...(projectedAnnotation ? { resultAnnotation: projectedAnnotation } : {}),
  };
}

function projectResultAnnotation(
  annotation: ResultAnnotation | undefined,
  pullRequestUrl: string | undefined,
  status?: WorkspaceGitStatusResult,
): ResultAnnotation | undefined {
  if (!annotation || !pullRequestUrl) {
    return annotation;
  }

  const projection = deriveLinkedPullRequestProjection(status);
  if (!projection || projection.pullRequestUrl !== pullRequestUrl) {
    return annotation;
  }

  return {
    sourceMessageId: annotation.sourceMessageId,
    workspaceId: annotation.workspaceId,
    sessionId: annotation.sessionId,
    verification: annotation.verification,
    ...(annotation.taskId ? { taskId: annotation.taskId } : {}),
    ...(annotation.summary ? { summary: annotation.summary } : {}),
    ...(projection.reviewState ? { reviewState: projection.reviewState } : {}),
    ...(projection.shipState ? { shipState: projection.shipState } : {}),
  };
}

function deriveLinkedPullRequestProjection(status?: WorkspaceGitStatusResult): {
  pullRequestUrl: string;
  reviewState?: ResultAnnotation['reviewState'];
  shipState?: ResultAnnotation['shipState'];
} | undefined {
  const linkedPullRequest = status?.outcome === 'success' ? status.data?.linkedPullRequest : undefined;
  if (!linkedPullRequest?.linked || !linkedPullRequest.url) {
    return undefined;
  }

  const checksStatus = linkedPullRequest.checks?.status;
  const reviewStatus = linkedPullRequest.review?.status;

  return {
    pullRequestUrl: linkedPullRequest.url,
    ...(reviewStatus === 'approved'
      ? { reviewState: 'ready' as const }
      : reviewStatus === 'changes_requested'
        ? { reviewState: 'needs-retry' as const }
        : reviewStatus === 'review_required'
          ? { reviewState: 'approval-needed' as const }
          : {}),
    ...(checksStatus === 'failing'
      ? { shipState: 'blocked-by-checks' as const }
      : reviewStatus === 'changes_requested'
        ? { shipState: 'blocked-by-requested-changes' as const }
        : checksStatus === 'passing' && reviewStatus === 'approved'
          ? { shipState: 'pr-ready' as const }
          : checksStatus === 'none' && reviewStatus === 'approved'
            ? { shipState: 'pr-ready' as const }
            : { shipState: 'not-ready' as const }),
  };
}

function syncWorkspaceStreamingState(
  streamingBySession: Record<string, boolean>,
  workspaceId: string,
  previousSessions: SessionSummary[],
  nextSessions: SessionSummary[],
): Record<string, boolean> {
  const nextStreaming = { ...streamingBySession };
  const previousIds = new Set(previousSessions.map((session) => session.id));

  for (const session of nextSessions) {
    previousIds.delete(session.id);
    const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, session.id);

    if (session.state === 'running') {
      nextStreaming[sessionKey] = true;
      continue;
    }

    if (session.state === 'idle' || session.state === 'error') {
      delete nextStreaming[sessionKey];
    }
  }

  for (const sessionId of previousIds) {
    delete nextStreaming[resolveWorkspaceSessionStoreKey(workspaceId, sessionId)];
  }

  return nextStreaming;
}

function clearWorkspaceStreamingState(
  streamingBySession: Record<string, boolean>,
  workspaceId: string,
  sessions: SessionSummary[],
): Record<string, boolean> {
  if (sessions.length === 0) return streamingBySession;

  const nextStreaming = { ...streamingBySession };
  for (const session of sessions) {
    delete nextStreaming[resolveWorkspaceSessionStoreKey(workspaceId, session.id)];
  }
  return nextStreaming;
}

function pruneRemovedWorkspaceSessionState(
  state: Pick<UIStore, 'messagesBySession' | 'streamingBySession' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'>,
  workspaceId: string,
  previousSessions: SessionSummary[],
  nextSessions: SessionSummary[],
): Pick<UIStore, 'messagesBySession' | 'streamingBySession' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'> {
  const removedIds = new Set(previousSessions.map((session) => session.id));
  for (const session of nextSessions) {
    removedIds.delete(session.id);
  }

  if (removedIds.size === 0) {
    return {
      messagesBySession: state.messagesBySession,
      streamingBySession: state.streamingBySession,
      taskEntriesByWorkspace: state.taskEntriesByWorkspace,
      resultAnnotationsByWorkspace: state.resultAnnotationsByWorkspace,
    };
  }

  const messagesBySession = { ...state.messagesBySession };
  const streamingBySession = { ...state.streamingBySession };
  const workspaceTasks = { ...(state.taskEntriesByWorkspace[workspaceId] ?? {}) };
  const workspaceAnnotations = { ...(state.resultAnnotationsByWorkspace[workspaceId] ?? {}) };

  for (const sessionId of removedIds) {
    delete messagesBySession[resolveWorkspaceSessionStoreKey(workspaceId, sessionId)];
    delete streamingBySession[resolveWorkspaceSessionStoreKey(workspaceId, sessionId)];
    delete workspaceTasks[sessionId];
    delete workspaceAnnotations[sessionId];
  }

  return {
    messagesBySession,
    streamingBySession,
    taskEntriesByWorkspace: { ...state.taskEntriesByWorkspace, [workspaceId]: workspaceTasks },
    resultAnnotationsByWorkspace: { ...state.resultAnnotationsByWorkspace, [workspaceId]: workspaceAnnotations },
  };
}

function applyWorkspaceSessionTraceability(
  taskEntriesByWorkspace: Record<string, TaskEntriesBySession>,
  resultAnnotationsByWorkspace: Record<string, ResultAnnotationsBySession>,
  workspaceId: string,
  sessionId: string,
  messages: NormalizedMessage[],
  bootstrap?: WorkspaceBootstrap,
): Pick<UIStore, 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'> {
  const traceability = buildSessionTraceability(messages);
  const bootstrapTraceability = buildWorkspaceSessionBootstrapTraceability(bootstrap, sessionId);
  return {
    taskEntriesByWorkspace: {
      ...taskEntriesByWorkspace,
      [workspaceId]: {
        ...(taskEntriesByWorkspace[workspaceId] ?? {}),
        [sessionId]: mergeTaskEntryMaps(bootstrapTraceability.taskEntries, traceability.taskEntries),
      },
    },
    resultAnnotationsByWorkspace: {
      ...resultAnnotationsByWorkspace,
      [workspaceId]: {
        ...(resultAnnotationsByWorkspace[workspaceId] ?? {}),
        [sessionId]: mergeResultAnnotationMaps(bootstrapTraceability.resultAnnotations, traceability.resultAnnotations),
      },
    },
  };
}

function buildSessionTraceability(messages: NormalizedMessage[]): {
  taskEntries: Record<string, TaskEntry>;
  resultAnnotations: Record<string, ResultAnnotation>;
} {
  const taskEntries: Record<string, TaskEntry> = {};
  const resultAnnotations: Record<string, ResultAnnotation> = {};

  for (const message of messages) {
    if (message.taskEntry?.taskId) {
      taskEntries[message.taskEntry.taskId] = message.taskEntry;
    }
    if (message.resultAnnotation?.sourceMessageId) {
      resultAnnotations[message.resultAnnotation.sourceMessageId] = message.resultAnnotation;
    }
  }

  return {
    taskEntries,
    resultAnnotations,
  };
}

function groupTaskEntriesBySession(
  traceability?: WorkspaceTraceabilitySummary,
  taskLedgerRecords?: TaskLedgerRecord[],
): TaskEntriesBySession {
  const grouped: TaskEntriesBySession = {};
  for (const taskEntry of traceability?.taskEntries ?? []) {
    const sessionKey = taskEntry.sessionId ?? WORKSPACE_SCOPE_SESSION_KEY;
    grouped[sessionKey] = { ...(grouped[sessionKey] ?? {}), [taskEntry.taskId]: taskEntry };
  }

  for (const record of taskLedgerRecords ?? []) {
    const sessionKey = resolveTaskLedgerRecordSessionId(record) ?? WORKSPACE_SCOPE_SESSION_KEY;
    grouped[sessionKey] = {
      ...(grouped[sessionKey] ?? {}),
      [record.taskId]: taskLedgerRecordToTaskEntry(record, sessionKey),
    };
  }

  return grouped;
}

function groupResultAnnotationsBySession(
  traceability?: WorkspaceTraceabilitySummary,
  taskLedgerRecords?: TaskLedgerRecord[],
): ResultAnnotationsBySession {
  const grouped: ResultAnnotationsBySession = {};
  for (const resultAnnotation of traceability?.resultAnnotations ?? []) {
    grouped[resultAnnotation.sessionId] = {
      ...(grouped[resultAnnotation.sessionId] ?? {}),
      [resultAnnotation.sourceMessageId]: resultAnnotation,
    };
  }

  for (const record of taskLedgerRecords ?? []) {
    const resultAnnotation = taskLedgerRecordToResultAnnotation(record);
    if (!resultAnnotation) continue;

    grouped[resultAnnotation.sessionId] = {
      ...(grouped[resultAnnotation.sessionId] ?? {}),
      [resultAnnotation.sourceMessageId]: resultAnnotation,
    };
  }

  return grouped;
}

function buildWorkspaceSessionBootstrapTraceability(
  bootstrap: WorkspaceBootstrap | undefined,
  sessionId: string,
): {
  taskEntries: Record<string, TaskEntry>;
  resultAnnotations: Record<string, ResultAnnotation>;
} {
  const groupedTaskEntries = groupTaskEntriesBySession(bootstrap?.traceability, bootstrap?.taskLedgerRecords);
  const groupedResultAnnotations = groupResultAnnotationsBySession(bootstrap?.traceability, bootstrap?.taskLedgerRecords);

  return {
    taskEntries: groupedTaskEntries[sessionId] ?? {},
    resultAnnotations: groupedResultAnnotations[sessionId] ?? {},
  };
}

function mergeTaskEntryMaps(
  baseEntries: Record<string, TaskEntry>,
  nextEntries: Record<string, TaskEntry>,
): Record<string, TaskEntry> {
  const merged: Record<string, TaskEntry> = {};
  const taskIds = new Set([...Object.keys(baseEntries), ...Object.keys(nextEntries)]);

  for (const taskId of taskIds) {
    const taskEntry = mergeTaskEntries(baseEntries[taskId], nextEntries[taskId]);
    if (taskEntry) {
      merged[taskId] = taskEntry;
    }
  }

  return merged;
}

function mergeTaskEntries(baseEntry?: TaskEntry, nextEntry?: TaskEntry): TaskEntry | undefined {
  if (!baseEntry) return nextEntry;
  if (!nextEntry) return baseEntry;

  return {
    taskId: nextEntry.taskId,
    workspaceId: nextEntry.workspaceId,
    sessionId: nextEntry.sessionId ?? baseEntry.sessionId,
    sourceMessageId: nextEntry.sourceMessageId ?? baseEntry.sourceMessageId,
    title: baseEntry.title ?? nextEntry.title,
    state: baseEntry.state,
    latestSummary: baseEntry.latestSummary ?? nextEntry.latestSummary,
  };
}

function mergeResultAnnotationMaps(
  baseAnnotations: Record<string, ResultAnnotation>,
  nextAnnotations: Record<string, ResultAnnotation>,
): Record<string, ResultAnnotation> {
  const merged: Record<string, ResultAnnotation> = {};
  const sourceMessageIds = new Set([...Object.keys(baseAnnotations), ...Object.keys(nextAnnotations)]);

  for (const sourceMessageId of sourceMessageIds) {
    const annotation = mergeResultAnnotations(baseAnnotations[sourceMessageId], nextAnnotations[sourceMessageId]);
    if (annotation) {
      merged[sourceMessageId] = annotation;
    }
  }

  return merged;
}

function mergeResultAnnotations(
  baseAnnotation?: ResultAnnotation,
  nextAnnotation?: ResultAnnotation,
): ResultAnnotation | undefined {
  if (!baseAnnotation) return nextAnnotation;
  if (!nextAnnotation) return baseAnnotation;

  return {
    sourceMessageId: nextAnnotation.sourceMessageId,
    workspaceId: nextAnnotation.workspaceId,
    sessionId: nextAnnotation.sessionId,
    verification: nextAnnotation.verification,
    ...(baseAnnotation.taskId ?? nextAnnotation.taskId ? { taskId: baseAnnotation.taskId ?? nextAnnotation.taskId } : {}),
    ...(baseAnnotation.summary ?? nextAnnotation.summary ? { summary: baseAnnotation.summary ?? nextAnnotation.summary } : {}),
    ...(baseAnnotation.reviewState ?? nextAnnotation.reviewState ? { reviewState: baseAnnotation.reviewState ?? nextAnnotation.reviewState } : {}),
    ...(baseAnnotation.shipState ?? nextAnnotation.shipState ? { shipState: baseAnnotation.shipState ?? nextAnnotation.shipState } : {}),
  };
}

function taskLedgerRecordToTaskEntry(record: TaskLedgerRecord, sessionKey: string): TaskEntry {
  return {
    taskId: record.taskId,
    workspaceId: record.workspaceId,
    ...(sessionKey !== WORKSPACE_SCOPE_SESSION_KEY ? { sessionId: sessionKey } : {}),
    ...(record.sourceMessageId ? { sourceMessageId: record.sourceMessageId } : {}),
    ...(record.title ? { title: record.title } : {}),
    state: record.state,
    latestSummary: record.summary,
  };
}

function taskLedgerRecordToResultAnnotation(record: TaskLedgerRecord): ResultAnnotation | undefined {
  const sessionId = resolveTaskLedgerRecordSessionId(record);
  if (!record.resultAnnotation || !sessionId) return undefined;

  return normalizeResultAnnotation(record.resultAnnotation, {
    workspaceId: record.workspaceId,
    sessionId,
    sourceMessageId: record.resultAnnotation.sourceMessageId,
    taskId: record.taskId,
    summary: record.summary,
  });
}

function normalizeTaskLedgerRecords(workspaceId: string, records?: TaskLedgerRecord[]): TaskLedgerRecord[] {
  return sortTaskLedgerRecords((records ?? []).filter((record) => record.workspaceId === workspaceId));
}

function resolveTaskLedgerRecordSessionId(record: TaskLedgerRecord): string | undefined {
  return record.sessionId ?? record.resultAnnotation?.sessionId;
}

function sortTaskLedgerRecords(records: TaskLedgerRecord[]): TaskLedgerRecord[] {
  return [...records].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt > right.updatedAt ? -1 : 1;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt > right.createdAt ? -1 : 1;
    }
    return left.taskId.localeCompare(right.taskId);
  });
}

function hydrateMessageTraceability(
  message: NormalizedMessage,
  workspaceId: string,
  sessionId: string,
): NormalizedMessage {
  const sourceMessageId = message.resultAnnotation?.sourceMessageId
    ?? message.taskEntry?.sourceMessageId
    ?? message.trace?.sourceMessageId
    ?? message.id;
  const linkedTaskId = message.resultAnnotation?.taskId
    ?? message.taskEntry?.taskId
    ?? message.trace?.taskId;
  const taskEntry = normalizeTaskEntry(message.taskEntry, {
    workspaceId,
    sessionId,
    sourceMessageId,
    taskId: linkedTaskId,
    summary: message.resultAnnotation?.summary,
  });
  const resultAnnotation = normalizeResultAnnotation(message.resultAnnotation, {
    workspaceId,
    sessionId,
    sourceMessageId,
    taskId: linkedTaskId ?? taskEntry?.taskId,
    summary: taskEntry?.latestSummary,
  });

  return {
    ...message,
    trace: {
      sourceMessageId,
      workspaceId,
      sessionId,
      ...(resultAnnotation?.taskId ?? taskEntry?.taskId ? { taskId: resultAnnotation?.taskId ?? taskEntry?.taskId } : {}),
    },
    ...(taskEntry ? { taskEntry } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
  };
}

function normalizeTaskEntry(
  taskEntry: TaskEntry | undefined,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string; taskId?: string; summary?: string },
): TaskEntry | undefined {
  const taskId = taskEntry?.taskId ?? context.taskId;
  if (!taskId) return undefined;

  return {
    taskId,
    workspaceId: taskEntry?.workspaceId ?? context.workspaceId,
    sessionId: taskEntry?.sessionId ?? context.sessionId,
    sourceMessageId: taskEntry?.sourceMessageId ?? context.sourceMessageId,
    title: taskEntry?.title,
    state: taskEntry?.state ?? 'completed',
    latestSummary: taskEntry?.latestSummary ?? context.summary,
  };
}

function normalizeResultAnnotation(
  annotation: ResultAnnotation | undefined,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string; taskId?: string; summary?: string },
): ResultAnnotation | undefined {
  const taskId = annotation?.taskId ?? context.taskId;
  const summary = annotation?.summary ?? context.summary;
  if (!annotation && !taskId && !summary) return undefined;

  return {
    sourceMessageId: annotation?.sourceMessageId ?? context.sourceMessageId,
    workspaceId: annotation?.workspaceId ?? context.workspaceId,
    sessionId: annotation?.sessionId ?? context.sessionId,
    verification: annotation?.verification ?? 'unverified',
    ...(taskId ? { taskId } : {}),
    ...(summary ? { summary } : {}),
    ...(annotation?.reviewState ? { reviewState: annotation.reviewState } : {}),
    ...(annotation?.shipState ? { shipState: annotation.shipState } : {}),
  };
}

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

function sortVerificationRuns(runs: VerificationRun[]): VerificationRun[] {
  return [...runs].sort((left, right) => {
    const delta = new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
    if (delta !== 0) return delta;
    return right.id.localeCompare(left.id);
  });
}

function upsertVerificationRuns(runs: VerificationRun[] | undefined, run: VerificationRun): VerificationRun[] {
  const existing = runs ?? [];
  const index = existing.findIndex((entry) => entry.id === run.id);
  if (index === -1) {
    return sortVerificationRuns([run, ...existing]);
  }

  const next = [...existing];
  next[index] = run;
  return sortVerificationRuns(next);
}

function updateWorkspaceBootstrap(
  bootstraps: Record<string, WorkspaceBootstrap>,
  workspaceId: string,
  updater: (bootstrap: WorkspaceBootstrap) => WorkspaceBootstrap,
): Record<string, WorkspaceBootstrap> {
  const current = bootstraps[workspaceId];
  if (!current) return bootstraps;
  return { ...bootstraps, [workspaceId]: updater(current) };
}
