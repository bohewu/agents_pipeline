import { create } from 'zustand';
import { getItem, setItem } from '../lib/local-storage.js';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from '../lib/app-settings.js';
import {
  deriveBrowserEvidenceCapabilityState,
  deriveBrowserEvidenceProjection,
  pickLatestBrowserEvidenceReference,
  type BrowserEvidenceCapabilityState,
} from '../lib/browser-evidence.js';
import type {
  BrowserEvidenceRecord,
  BrowserEvidenceReference,
  CapabilityProbeStatus,
  CommitExecuteResult,
  CommitPreviewResult,
  InstallDiagnostics,
  LaneAttribution,
  LaneContext,
  MessageTraceLink,
  NormalizedMessage,
  PermissionRequest,
  PullRequestCreateResult,
  PushResult,
  ResultAnnotation,
  SessionSummary,
  TaskEntry,
  WorkspaceCapabilityEntry,
  WorkspaceContextCatalogResponse,
  WorkspaceInstructionSourceEntry,
  UsageDetails,
  WorkspaceComparisonLaneReference,
  WorkspaceGitStatusResult,
  WorkspaceBootstrap,
  WorkspaceCapabilityKey,
  WorkspaceCapabilityProbe,
  WorkspaceLaneComparisonFlags,
  WorkspaceLaneComparisonState,
  WorkspaceProfile,
  WorkspaceServerStatus,
  WorkspaceTraceabilitySummary,
  EffortStateSummary,
  ResultVerificationState,
  VerificationCommandKind,
  VerificationRun,
  TaskLedgerRecord,
  TaskLedgerShipReference,
  WorkspaceLaneRecord,
} from '../../shared/types.js';

export type RightPanel = 'tasks' | 'activity' | 'diff' | 'files' | 'context' | 'ship' | 'usage' | 'verification' | 'permissions' | 'diagnostics';
export type ComposerMode = 'ask' | 'command' | 'shell';

export interface ResolvedMessageResultTrace {
  trace: MessageTraceLink;
  annotation?: ResultAnnotation;
  taskEntry?: TaskEntry;
  shipReference?: TaskLedgerShipReference;
  browserEvidenceRef?: BrowserEvidenceReference;
  verification: ResultVerificationState;
  verificationSummary?: string;
  latestVerificationRun?: VerificationRun;
  linkedVerificationRuns: VerificationRun[];
  summary?: string;
}

export type ProjectedVerificationRun = VerificationRun & { browserEvidenceRef?: BrowserEvidenceReference };

export type ProjectedTaskLedgerRecord = TaskLedgerRecord & { browserEvidenceRef?: BrowserEvidenceReference };

export interface SessionLaneSummary extends LaneAttribution {
  workspaceId: string;
  sessionId: string;
  session?: SessionSummary;
}

export interface LaneVerificationSummary {
  state: ResultVerificationState;
  summary?: string;
  latestRun?: ProjectedVerificationRun;
  linkedRuns: ProjectedVerificationRun[];
}

export interface LaneShipReadinessSummary {
  shipState?: ResultAnnotation['shipState'];
  reviewState?: ResultAnnotation['reviewState'];
  summary?: string;
  pullRequestUrl?: string;
}

export interface WorkspaceLaneComparisonSummary extends SessionLaneSummary {
  title: string;
  summary?: string;
  latestTaskRecord?: ProjectedTaskLedgerRecord;
  comparison: WorkspaceLaneComparisonFlags;
  verification: LaneVerificationSummary;
  shipReadiness: LaneShipReadinessSummary;
}

interface ComparisonSessionLaneSummary extends SessionLaneSummary {
  comparison: WorkspaceLaneComparisonFlags;
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
  workspaceContextCatalogByWorkspace: Record<string, WorkspaceContextCatalogResponse>;
  workspaceContextCatalogLoadingByWorkspace: Record<string, boolean>;
  workspaceContextCatalogErrorByWorkspace: Record<string, string | null>;
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
  setWorkspaceContextCatalog: (workspaceId: string, catalog: WorkspaceContextCatalogResponse) => void;
  setWorkspaceContextCatalogLoading: (workspaceId: string, loading: boolean) => void;
  setWorkspaceContextCatalogError: (workspaceId: string, error: string | null) => void;
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
const EMPTY_WORKSPACE_INSTRUCTION_SOURCES: WorkspaceInstructionSourceEntry[] = [];
const EMPTY_WORKSPACE_CONTEXT_CAPABILITY_ENTRIES: WorkspaceCapabilityEntry[] = [];
const EMPTY_LANE_COMPARISON_FLAGS: WorkspaceLaneComparisonFlags = { selected: false, adopted: false };
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
  workspaceContextCatalogByWorkspace: {},
  workspaceContextCatalogLoadingByWorkspace: {},
  workspaceContextCatalogErrorByWorkspace: {},
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
      const rawLaneRecords = normalizeWorkspaceLaneRecords(workspaceId, bootstrap.laneRecords);
      const sessions = mergeBootstrapSessions(bootstrap.sessions, rawLaneRecords);
      const laneComparison = normalizeWorkspaceLaneComparisonState(rawLaneRecords, sessions, bootstrap.laneComparison);
      const laneRecords = rawLaneRecords;
      const taskLedgerRecords = mergeTaskLedgerRecordLists(
        normalizeTaskLedgerRecords(workspaceId, bootstrap.taskLedgerRecords),
        laneRecords?.flatMap((laneRecord) => laneRecord.taskLedgerRecords),
      );
      const verificationRuns = mergeVerificationRunLists(
        normalizeVerificationRuns(workspaceId, bootstrap.verificationRuns),
        laneRecords?.flatMap((laneRecord) => laneRecord.verificationRuns),
      );
      const browserEvidenceRecords = mergeBrowserEvidenceRecordLists(
        normalizeBrowserEvidenceRecords(workspaceId, bootstrap.browserEvidenceRecords),
        laneRecords?.flatMap((laneRecord) => laneRecord.browserEvidenceRecords),
      );
      const traceability = mergeWorkspaceTraceabilitySummaries(
        bootstrap.traceability,
        laneRecords ? {
          taskEntries: laneRecords.flatMap((laneRecord) => laneRecord.traceability.taskEntries),
          resultAnnotations: laneRecords.flatMap((laneRecord) => laneRecord.traceability.resultAnnotations),
        } : undefined,
      );

      return {
        workspaceBootstraps: {
          ...s.workspaceBootstraps,
          [workspaceId]: {
            ...bootstrap,
            sessions,
            ...(laneComparison ? { laneComparison } : {}),
            ...(laneRecords !== undefined ? { laneRecords } : {}),
            ...(traceability !== undefined ? { traceability } : {}),
            ...(verificationRuns !== undefined ? { verificationRuns } : {}),
            ...(browserEvidenceRecords !== undefined ? { browserEvidenceRecords } : {}),
            ...(taskLedgerRecords !== undefined ? { taskLedgerRecords } : {}),
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
          [workspaceId]: groupTaskEntriesBySession(traceability, taskLedgerRecords),
        },
        resultAnnotationsByWorkspace: {
          ...s.resultAnnotationsByWorkspace,
          [workspaceId]: groupResultAnnotationsBySession(traceability, taskLedgerRecords),
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
  setWorkspaceContextCatalog: (workspaceId, catalog) =>
    set((s) => ({
      workspaceContextCatalogByWorkspace: {
        ...s.workspaceContextCatalogByWorkspace,
        [workspaceId]: catalog,
      },
    })),
  setWorkspaceContextCatalogLoading: (workspaceId, loading) =>
    set((s) => ({
      workspaceContextCatalogLoadingByWorkspace: {
        ...s.workspaceContextCatalogLoadingByWorkspace,
        [workspaceId]: loading,
      },
    })),
  setWorkspaceContextCatalogError: (workspaceId, error) =>
    set((s) => ({
      workspaceContextCatalogErrorByWorkspace: {
        ...s.workspaceContextCatalogErrorByWorkspace,
        [workspaceId]: error,
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
        verificationRuns: normalizeVerificationRuns(workspaceId, runs) ?? [],
      })),
    })),
  upsertVerificationRun: (workspaceId, run) =>
    set((s) => ({
      workspaceBootstraps: updateWorkspaceBootstrap(s.workspaceBootstraps, workspaceId, (bootstrap) => ({
        ...bootstrap,
        verificationRuns: upsertVerificationRuns(bootstrap.verificationRuns, normalizeVerificationRun(run)),
      })),
    })),
  applyVerificationProjection: (workspaceId, sessionId, sourceMessageId, taskEntry, resultAnnotation) =>
    set((s) => {
      const sessionKey = resolveWorkspaceSessionStoreKey(workspaceId, sessionId);
      const messages = s.messagesBySession[sessionKey] ?? EMPTY_MESSAGES;
      const lane = mergeLaneAttribution(taskEntry, resultAnnotation);
      const messageIndex = messages.findIndex((message) => {
        return resolveMessageSourceId(message) === sourceMessageId
          && matchesExpectedLane(resolveMessageLane(message), lane);
      });
      const taskKey = taskEntry ? resolveTaskEntryStoreKey(normalizeTaskEntry(taskEntry, {
        workspaceId,
        sessionId,
        sourceMessageId,
        taskId: taskEntry.taskId,
        summary: resultAnnotation?.summary,
        lane,
      }) ?? taskEntry) : undefined;
      const annotationKey = resultAnnotation ? resolveResultAnnotationStoreKey(normalizeResultAnnotation(resultAnnotation, {
        workspaceId,
        sessionId,
        sourceMessageId,
        taskId: taskEntry?.taskId ?? resultAnnotation.taskId,
        summary: taskEntry?.latestSummary,
        lane,
      }) ?? resultAnnotation) : undefined;

      if (messageIndex < 0) {
        return {
          taskEntriesByWorkspace: taskEntry?.taskId
            ? {
                ...s.taskEntriesByWorkspace,
                [workspaceId]: {
                  ...(s.taskEntriesByWorkspace[workspaceId] ?? {}),
                  [sessionId]: {
                    ...(s.taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {}),
                    [taskKey ?? resolveTaskEntryStoreKey(taskEntry)]: normalizeTaskEntry(taskEntry, {
                      workspaceId,
                      sessionId,
                      sourceMessageId,
                      taskId: taskEntry.taskId,
                      summary: resultAnnotation?.summary,
                      lane,
                    }) ?? taskEntry,
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
                    [annotationKey ?? resolveResultAnnotationStoreKey(resultAnnotation)]: normalizeResultAnnotation(resultAnnotation, {
                      workspaceId,
                      sessionId,
                      sourceMessageId,
                      taskId: taskEntry?.taskId ?? resultAnnotation.taskId,
                      summary: taskEntry?.latestSummary,
                      lane,
                    }) ?? resultAnnotation,
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
      const nextLane = mergeLaneAttribution(message.trace, message.taskEntry, message.resultAnnotation, taskEntry, resultAnnotation);
      const mergedTaskEntry = taskEntry
        ? attachLaneAttribution({
            taskId: nextTaskId ?? taskEntry.taskId,
            workspaceId: taskEntry.workspaceId,
            sessionId: taskEntry.sessionId,
            sourceMessageId: taskEntry.sourceMessageId,
            title: message.taskEntry?.title ?? taskEntry.title,
            state: message.taskEntry?.state ?? taskEntry.state,
            latestSummary: taskEntry.latestSummary ?? message.taskEntry?.latestSummary,
          }, nextLane)
        : message.taskEntry;
      const mergedAnnotation = resultAnnotation
        ? attachLaneAttribution({
            sourceMessageId,
            workspaceId: resultAnnotation.workspaceId,
            sessionId: resultAnnotation.sessionId,
            verification: resultAnnotation.verification,
            ...(nextTaskId ? { taskId: nextTaskId } : {}),
            ...(resultAnnotation.summary ? { summary: resultAnnotation.summary } : {}),
            ...(message.resultAnnotation?.reviewState ? { reviewState: message.resultAnnotation.reviewState } : {}),
            ...(message.resultAnnotation?.shipState ? { shipState: message.resultAnnotation.shipState } : {}),
            ...(pickLatestBrowserEvidenceReference([
              resultAnnotation.browserEvidenceRef,
              message.resultAnnotation?.browserEvidenceRef,
            ]) ? {
              browserEvidenceRef: pickLatestBrowserEvidenceReference([
                resultAnnotation.browserEvidenceRef,
                message.resultAnnotation?.browserEvidenceRef,
              ]),
            } : {}),
          }, nextLane)
        : message.resultAnnotation;

      nextMessages[messageIndex] = hydrateMessageTraceability({
        ...message,
        trace: attachLaneAttribution<MessageTraceLink>({
          sourceMessageId,
          workspaceId,
          sessionId,
          ...(nextTaskId ? { taskId: nextTaskId } : {}),
        }, nextLane),
        ...(mergedTaskEntry ? { taskEntry: mergedTaskEntry } : {}),
        ...(mergedAnnotation ? { resultAnnotation: mergedAnnotation } : {}),
      }, workspaceId, sessionId);
      const mergedTaskKey = mergedTaskEntry ? resolveTaskEntryStoreKey(mergedTaskEntry) : undefined;
      const mergedAnnotationKey = mergedAnnotation ? resolveResultAnnotationStoreKey(mergedAnnotation) : undefined;

      return {
        messagesBySession: { ...s.messagesBySession, [sessionKey]: nextMessages },
        taskEntriesByWorkspace: mergedTaskEntry?.taskId
          ? {
              ...s.taskEntriesByWorkspace,
              [workspaceId]: {
                ...(s.taskEntriesByWorkspace[workspaceId] ?? {}),
                [sessionId]: {
                  ...(s.taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {}),
                  [mergedTaskKey ?? resolveTaskEntryStoreKey(mergedTaskEntry)]: mergedTaskEntry,
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
                  [mergedAnnotationKey ?? resolveResultAnnotationStoreKey(mergedAnnotation)]: mergedAnnotation,
                },
              },
            }
          : s.resultAnnotationsByWorkspace,
      };
    }),
  setSessions: (workspaceId, sessions) =>
    set((s) => {
      const normalizedSessions = normalizeSessions(sessions);
      const previousSessions = s.sessionsByWorkspace[workspaceId] ?? [];
      const pruned = pruneRemovedWorkspaceSessionState(s, workspaceId, previousSessions, normalizedSessions);
      return {
        sessionsByWorkspace: { ...s.sessionsByWorkspace, [workspaceId]: normalizedSessions },
        messagesBySession: pruned.messagesBySession,
        taskEntriesByWorkspace: pruned.taskEntriesByWorkspace,
        resultAnnotationsByWorkspace: pruned.resultAnnotationsByWorkspace,
        streamingBySession: syncWorkspaceStreamingState(
          pruned.streamingBySession,
          workspaceId,
          previousSessions,
          normalizedSessions,
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
      const idx = findMessageIdentityIndex(messages, nextMessage);
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
      const idx = findMessageIdentityIndex(existing, nextMessage);
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

export function findMessageIdentityIndex(messages: NormalizedMessage[], target: NormalizedMessage): number {
  return messages.findIndex((message) => isSameMessageIdentity(message, target));
}

export function selectSessionLane(
  store: Pick<UIStore, 'sessionsByWorkspace' | 'workspaceBootstraps' | 'messagesBySession' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'>,
  workspaceId?: string | null,
  sessionId?: string,
): SessionLaneSummary | undefined {
  if (!workspaceId || !sessionId) return undefined;

  const session = (store.sessionsByWorkspace[workspaceId] ?? store.workspaceBootstraps[workspaceId]?.sessions ?? [])
    .find((entry) => entry.id === sessionId);
  const lane = mergeLaneAttribution(
    session,
    ...selectSessionMessages(store, workspaceId, sessionId).map(resolveMessageLane),
    ...Object.values(store.taskEntriesByWorkspace[workspaceId]?.[sessionId] ?? {}),
    ...Object.values(store.resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {}),
  );

  if (!session && !lane) return undefined;

  return {
    workspaceId,
    sessionId,
    ...(session ? { session } : {}),
    ...(lane?.laneId ? { laneId: lane.laneId } : {}),
    ...(lane?.laneContext ? { laneContext: lane.laneContext } : {}),
  };
}

export function selectWorkspaceSessionLanes(
  store: Pick<UIStore, 'sessionsByWorkspace' | 'workspaceBootstraps' | 'messagesBySession' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'>,
  workspaceId?: string | null,
): SessionLaneSummary[] {
  if (!workspaceId) return [];

  const sessionIds = new Set<string>([
    ...(store.sessionsByWorkspace[workspaceId] ?? []).map((session) => session.id),
    ...(store.workspaceBootstraps[workspaceId]?.sessions ?? []).map((session) => session.id),
    ...Object.keys(store.taskEntriesByWorkspace[workspaceId] ?? {}).filter((sessionId) => sessionId !== WORKSPACE_SCOPE_SESSION_KEY),
    ...Object.keys(store.resultAnnotationsByWorkspace[workspaceId] ?? {}),
  ]);

  return [...sessionIds]
    .map((sessionId) => selectSessionLane(store, workspaceId, sessionId))
    .filter((lane): lane is SessionLaneSummary => !!lane);
}

export function selectActiveWorkspaceSessionLanes(
  store: Pick<UIStore, 'activeWorkspaceId' | 'sessionsByWorkspace' | 'workspaceBootstraps' | 'messagesBySession' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'>,
): SessionLaneSummary[] {
  return selectWorkspaceSessionLanes(store, store.activeWorkspaceId);
}

export function selectWorkspaceLaneComparisonSummaries(
  store: Pick<UIStore, 'sessionsByWorkspace' | 'workspaceBootstraps' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace' | 'workspaceGitStatusByWorkspace'>
    & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
  workspaceId?: string | null,
): WorkspaceLaneComparisonSummary[] {
  if (!workspaceId) return [];

  return selectWorkspaceComparisonLanes(store, workspaceId).map((lane) => {
    const latestTaskRecord = selectSessionTaskLedgerRecords(store, workspaceId, lane.sessionId, lane)[0];
    const verificationRuns = selectLinkedLaneVerificationRuns(
      store,
      workspaceId,
      lane.sessionId,
      lane,
      latestTaskRecord,
    );
    const verificationEvidence = deriveVerificationEvidence(verificationRuns);
    const fallbackAnnotation = selectLaneComparisonResultAnnotation(
      store,
      workspaceId,
      lane.sessionId,
      lane,
      latestTaskRecord,
      verificationEvidence.latestRun,
    );
    const verificationSummary = verificationEvidence.latestSummary
      ?? latestTaskRecord?.recentVerificationRef?.summary
      ?? latestTaskRecord?.resultAnnotation?.summary
      ?? fallbackAnnotation?.summary
      ?? latestTaskRecord?.summary;
    const verificationState = verificationEvidence.verification
      ?? latestTaskRecord?.resultAnnotation?.verification
      ?? deriveVerificationStateFromTaskLedger(latestTaskRecord)
      ?? fallbackAnnotation?.verification
      ?? 'unverified';
    const laneSummary = latestTaskRecord?.summary
      ?? fallbackAnnotation?.summary
      ?? lane.session?.title;
    const title = lane.session?.title?.trim()
      || latestTaskRecord?.title?.trim()
      || `Session ${lane.sessionId.slice(0, 8)}`;

    return {
      ...lane,
      title,
      ...(laneSummary ? { summary: laneSummary } : {}),
      ...(latestTaskRecord ? { latestTaskRecord } : {}),
      comparison: lane.comparison,
      verification: {
        state: verificationState,
        ...(verificationSummary ? { summary: verificationSummary } : {}),
        ...(verificationEvidence.latestRun ? { latestRun: verificationEvidence.latestRun } : {}),
        linkedRuns: verificationRuns,
      },
      shipReadiness: {
        ...(latestTaskRecord?.resultAnnotation?.shipState ?? fallbackAnnotation?.shipState ? {
          shipState: latestTaskRecord?.resultAnnotation?.shipState ?? fallbackAnnotation?.shipState,
        } : {}),
        ...(latestTaskRecord?.resultAnnotation?.reviewState ?? fallbackAnnotation?.reviewState ? {
          reviewState: latestTaskRecord?.resultAnnotation?.reviewState ?? fallbackAnnotation?.reviewState,
        } : {}),
        ...(latestTaskRecord?.summary ?? latestTaskRecord?.resultAnnotation?.summary ?? fallbackAnnotation?.summary ? {
          summary: latestTaskRecord?.summary ?? latestTaskRecord?.resultAnnotation?.summary ?? fallbackAnnotation?.summary,
        } : {}),
        ...(latestTaskRecord?.recentShipRef?.pullRequestUrl ? {
          pullRequestUrl: latestTaskRecord.recentShipRef.pullRequestUrl,
        } : {}),
      },
    };
  });
}

export function selectActiveWorkspaceLaneComparisonSummaries(
  store: Pick<UIStore, 'activeWorkspaceId' | 'sessionsByWorkspace' | 'workspaceBootstraps' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace' | 'workspaceGitStatusByWorkspace'>
    & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
): WorkspaceLaneComparisonSummary[] {
  return selectWorkspaceLaneComparisonSummaries(store, store.activeWorkspaceId);
}

function selectWorkspaceComparisonLanes(
  store: Pick<UIStore, 'sessionsByWorkspace' | 'workspaceBootstraps' | 'taskEntriesByWorkspace' | 'resultAnnotationsByWorkspace'>,
  workspaceId: string,
): ComparisonSessionLaneSummary[] {
  const laneRecords = store.workspaceBootstraps[workspaceId]?.laneRecords;
  const laneComparison = store.workspaceBootstraps[workspaceId]?.laneComparison;
  if (!laneRecords?.length) {
    return sortComparisonSessionLaneSummaries(selectWorkspaceSessionLanes({
      sessionsByWorkspace: store.sessionsByWorkspace,
      workspaceBootstraps: store.workspaceBootstraps,
      messagesBySession: {},
      taskEntriesByWorkspace: store.taskEntriesByWorkspace,
      resultAnnotationsByWorkspace: store.resultAnnotationsByWorkspace,
    }, workspaceId).map((lane) => ({
      ...lane,
      comparison: resolveLaneComparisonFlags(lane, laneComparison),
    })));
  }

  const liveSessions = store.sessionsByWorkspace[workspaceId] ?? [];

  return sortComparisonSessionLaneSummaries(laneRecords.map((laneRecord) => {
    const liveSession = liveSessions.find((session) => {
      if (session.id !== laneRecord.sessionId) return false;
      return !hasConflictingLane(session, laneRecord);
    });
    const session = mergeSessionSummariesForLane(laneRecord.session, liveSession, laneRecord);

    return {
      workspaceId,
      sessionId: laneRecord.sessionId,
      ...(session ? { session } : {}),
      laneId: laneRecord.laneId,
      laneContext: laneRecord.laneContext,
      comparison: resolveLaneComparisonFlags(laneRecord, laneComparison),
    };
  }));
}

function sortComparisonSessionLaneSummaries(lanes: ComparisonSessionLaneSummary[]): ComparisonSessionLaneSummary[] {
  return sortSessionLaneSummaries(lanes) as ComparisonSessionLaneSummary[];
}

function sortSessionLaneSummaries(lanes: SessionLaneSummary[]): SessionLaneSummary[] {
  return [...lanes].sort((left, right) => {
    const leftUpdatedAt = left.session?.updatedAt ?? '';
    const rightUpdatedAt = right.session?.updatedAt ?? '';
    if (leftUpdatedAt !== rightUpdatedAt) {
      return rightUpdatedAt.localeCompare(leftUpdatedAt);
    }

    if (left.sessionId !== right.sessionId) {
      return left.sessionId.localeCompare(right.sessionId);
    }

    return (left.laneId ?? '').localeCompare(right.laneId ?? '');
  });
}

function mergeSessionSummariesForLane(
  base: SessionSummary | undefined,
  next: SessionSummary | undefined,
  lane: LaneAttribution | undefined,
): SessionSummary | undefined {
  if (!base && !next) return undefined;
  if (!base) return normalizeSessionSummary(next!, lane);
  if (!next) return normalizeSessionSummary(base, lane);

  return normalizeSessionSummary({
    ...base,
    ...next,
    id: next.id,
  }, mergeLaneAttribution(base, next, lane));
}

function selectLinkedLaneVerificationRuns(
  store: Pick<UIStore, 'workspaceBootstraps'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
  workspaceId: string,
  sessionId: string,
  lane: LaneAttribution | undefined,
  latestTaskRecord?: ProjectedTaskLedgerRecord,
): ProjectedVerificationRun[] {
  const laneRuns = selectWorkspaceVerificationRuns(store, workspaceId).filter((run) => {
    if (run.workspaceId !== workspaceId) return false;
    if (run.sessionId && run.sessionId !== sessionId) return false;
    return matchesExpectedLane(run, lane);
  });

  if (!latestTaskRecord) {
    return laneRuns;
  }

  const linkedRuns = laneRuns.filter((run) => {
    if (latestTaskRecord.sourceMessageId && run.sourceMessageId === latestTaskRecord.sourceMessageId) {
      return true;
    }
    return run.taskId === latestTaskRecord.taskId;
  });

  return linkedRuns.length > 0 ? linkedRuns : laneRuns;
}

function selectLaneComparisonResultAnnotation(
  store: Pick<UIStore, 'resultAnnotationsByWorkspace' | 'workspaceBootstraps'>,
  workspaceId: string,
  sessionId: string,
  lane: LaneAttribution | undefined,
  latestTaskRecord?: ProjectedTaskLedgerRecord,
  latestRun?: VerificationRun,
): ResultAnnotation | undefined {
  if (latestTaskRecord?.resultAnnotation) {
    return latestTaskRecord.resultAnnotation;
  }

  const laneRecords = store.workspaceBootstraps[workspaceId]?.laneRecords;
  const bootstrapTraceability = mergeWorkspaceTraceabilitySummaries(
    store.workspaceBootstraps[workspaceId]?.traceability,
    laneRecords ? {
      taskEntries: laneRecords.flatMap((laneRecord) => laneRecord.traceability.taskEntries),
      resultAnnotations: laneRecords.flatMap((laneRecord) => laneRecord.traceability.resultAnnotations),
    } : undefined,
  );
  const annotations = [
    ...Object.values(store.resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {}),
    ...(bootstrapTraceability?.resultAnnotations ?? []).filter((annotation) => annotation.sessionId === sessionId),
  ].filter((annotation) => matchesExpectedLane(annotation, lane));
  if (annotations.length === 0) {
    return undefined;
  }

  return annotations.find((annotation) => {
    if (latestTaskRecord?.sourceMessageId && annotation.sourceMessageId === latestTaskRecord.sourceMessageId) {
      return true;
    }
    if (latestTaskRecord?.taskId && annotation.taskId === latestTaskRecord.taskId) {
      return true;
    }
    if (latestRun?.sourceMessageId && annotation.sourceMessageId === latestRun.sourceMessageId) {
      return true;
    }
    return !!latestRun?.taskId && annotation.taskId === latestRun.taskId;
  }) ?? annotations[0];
}

function deriveVerificationStateFromTaskLedger(record: ProjectedTaskLedgerRecord | undefined): ResultVerificationState | undefined {
  if (!record?.recentVerificationRef) return undefined;
  return record.recentVerificationRef.status === 'passed' ? 'verified' : 'unverified';
}

export function selectWorkspaceCapabilities(
  store: Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace' | 'workspaceBootstraps'>>,
  workspaceId?: string | null,
): WorkspaceCapabilityProbe | undefined {
  if (!workspaceId) return undefined;
  return store.workspaceCapabilitiesByWorkspace?.[workspaceId] ?? store.workspaceBootstraps?.[workspaceId]?.capabilities;
}

export function selectActiveWorkspaceCapabilities(
  store: Pick<UIStore, 'activeWorkspaceId'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace' | 'workspaceBootstraps'>>,
): WorkspaceCapabilityProbe | undefined {
  return selectWorkspaceCapabilities(store, store.activeWorkspaceId);
}

export function selectWorkspaceBrowserEvidenceCapabilityState(
  store: Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace' | 'workspaceBootstraps'>>,
  workspaceId?: string | null,
): BrowserEvidenceCapabilityState | undefined {
  return deriveBrowserEvidenceCapabilityState(selectWorkspaceCapabilities(store, workspaceId));
}

export function selectActiveWorkspaceBrowserEvidenceCapabilityState(
  store: Pick<UIStore, 'activeWorkspaceId'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace' | 'workspaceBootstraps'>>,
): BrowserEvidenceCapabilityState | undefined {
  return selectWorkspaceBrowserEvidenceCapabilityState(store, store.activeWorkspaceId);
}

export function selectWorkspaceContextCatalog(
  store: Pick<UIStore, 'workspaceContextCatalogByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceContextCatalogResponse | undefined {
  if (!workspaceId) return undefined;
  return store.workspaceContextCatalogByWorkspace[workspaceId];
}

export function selectActiveWorkspaceContextCatalog(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceContextCatalogByWorkspace'>,
): WorkspaceContextCatalogResponse | undefined {
  return selectWorkspaceContextCatalog(store, store.activeWorkspaceId);
}

export function selectWorkspaceContextInstructionSources(
  store: Pick<UIStore, 'workspaceContextCatalogByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceInstructionSourceEntry[] {
  return selectWorkspaceContextCatalog(store, workspaceId)?.instructionSources ?? EMPTY_WORKSPACE_INSTRUCTION_SOURCES;
}

export function selectActiveWorkspaceContextInstructionSources(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceContextCatalogByWorkspace'>,
): WorkspaceInstructionSourceEntry[] {
  return selectWorkspaceContextInstructionSources(store, store.activeWorkspaceId);
}

export function selectWorkspaceContextCapabilityEntries(
  store: Pick<UIStore, 'workspaceContextCatalogByWorkspace'>,
  workspaceId?: string | null,
): WorkspaceCapabilityEntry[] {
  return selectWorkspaceContextCatalog(store, workspaceId)?.capabilityEntries ?? EMPTY_WORKSPACE_CONTEXT_CAPABILITY_ENTRIES;
}

export function selectActiveWorkspaceContextCapabilityEntries(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceContextCatalogByWorkspace'>,
): WorkspaceCapabilityEntry[] {
  return selectWorkspaceContextCapabilityEntries(store, store.activeWorkspaceId);
}

export function selectWorkspaceContextCatalogLoading(
  store: Pick<UIStore, 'workspaceContextCatalogLoadingByWorkspace'>,
  workspaceId?: string | null,
): boolean {
  if (!workspaceId) return false;
  return store.workspaceContextCatalogLoadingByWorkspace[workspaceId] ?? false;
}

export function selectActiveWorkspaceContextCatalogLoading(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceContextCatalogLoadingByWorkspace'>,
): boolean {
  return selectWorkspaceContextCatalogLoading(store, store.activeWorkspaceId);
}

export function selectWorkspaceContextCatalogError(
  store: Pick<UIStore, 'workspaceContextCatalogErrorByWorkspace'>,
  workspaceId?: string | null,
): string | null {
  if (!workspaceId) return null;
  return store.workspaceContextCatalogErrorByWorkspace[workspaceId] ?? null;
}

export function selectActiveWorkspaceContextCatalogError(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceContextCatalogErrorByWorkspace'>,
): string | null {
  return selectWorkspaceContextCatalogError(store, store.activeWorkspaceId);
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
  store: Pick<UIStore, 'activeWorkspaceId'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace' | 'workspaceBootstraps'>>,
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
  store: Pick<UIStore, 'workspaceBootstraps'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
  workspaceId?: string | null,
): ProjectedVerificationRun[] {
  if (!workspaceId) return [];
  const capabilities = selectWorkspaceCapabilities(store, workspaceId);
  const laneRecords = store.workspaceBootstraps[workspaceId]?.laneRecords;
  const browserEvidenceRecords = mergeBrowserEvidenceRecordLists(
    store.workspaceBootstraps[workspaceId]?.browserEvidenceRecords,
    laneRecords?.flatMap((laneRecord) => laneRecord.browserEvidenceRecords),
  );
  const verificationRuns = mergeVerificationRunLists(
    store.workspaceBootstraps[workspaceId]?.verificationRuns,
    laneRecords?.flatMap((laneRecord) => laneRecord.verificationRuns),
  ) ?? [];

  return verificationRuns.map((run) => {
    const browserEvidenceRef = deriveBrowserEvidenceProjection({
      capabilities,
      browserEvidenceRecords: filterBrowserEvidenceRecordsByLane(browserEvidenceRecords, run),
      sessionId: run.sessionId,
      sourceMessageId: run.sourceMessageId,
      taskId: run.taskId,
    })?.browserEvidenceRef;

    return browserEvidenceRef ? { ...run, browserEvidenceRef } : run;
  });
}

export function selectActiveWorkspaceVerificationRuns(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceBootstraps'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
): ProjectedVerificationRun[] {
  return selectWorkspaceVerificationRuns(store, store.activeWorkspaceId);
}

export function selectWorkspaceTaskLedgerRecords(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
  workspaceId?: string | null,
): ProjectedTaskLedgerRecord[] {
  if (!workspaceId) return [];
  const laneRecords = store.workspaceBootstraps[workspaceId]?.laneRecords;
  const records = mergeTaskLedgerRecordLists(
    normalizeTaskLedgerRecords(workspaceId, store.workspaceBootstraps[workspaceId]?.taskLedgerRecords),
    laneRecords?.flatMap((laneRecord) => laneRecord.taskLedgerRecords),
  ) ?? [];
  const status = store.workspaceGitStatusByWorkspace[workspaceId];
  const capabilities = selectWorkspaceCapabilities(store, workspaceId);
  const browserEvidenceRecords = mergeBrowserEvidenceRecordLists(
    store.workspaceBootstraps[workspaceId]?.browserEvidenceRecords,
    laneRecords?.flatMap((laneRecord) => laneRecord.browserEvidenceRecords),
  );
  return records.map((record) => projectTaskLedgerRecord(record, status, capabilities, browserEvidenceRecords));
}

export function selectActiveWorkspaceTaskLedgerRecords(
  store: Pick<UIStore, 'activeWorkspaceId' | 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
): ProjectedTaskLedgerRecord[] {
  return selectWorkspaceTaskLedgerRecords(store, store.activeWorkspaceId);
}

export function selectSessionTaskLedgerRecords(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
  workspaceId?: string | null,
  sessionId?: string,
  lane?: LaneAttribution,
): ProjectedTaskLedgerRecord[] {
  if (!workspaceId || !sessionId) return [];
  return selectWorkspaceTaskLedgerRecords(store, workspaceId).filter((record) => {
    if (resolveTaskLedgerRecordSessionId(record) !== sessionId) return false;
    return matchesExpectedLane(record, lane);
  });
}

export function selectMessageResultTrace(
  store: Pick<UIStore, 'resultAnnotationsByWorkspace' | 'taskEntriesByWorkspace' | 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'> & Partial<Pick<UIStore, 'workspaceCapabilitiesByWorkspace'>>,
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
  const messageLane = resolveMessageLane(message);

  if (!workspaceId || !sessionId || !sourceMessageId) {
    return undefined;
  }

  const annotation = selectResultAnnotation(store, workspaceId, sessionId, sourceMessageId, messageLane)
    ?? message.resultAnnotation;
  const linkedVerificationRuns = selectLinkedVerificationRuns(
    store,
    workspaceId,
    sessionId,
    sourceMessageId,
    annotation?.taskId ?? message.trace?.taskId ?? message.taskEntry?.taskId,
    messageLane,
  );
  const verificationProjection = deriveVerificationEvidence(linkedVerificationRuns);
  const taskId = annotation?.taskId
    ?? message.trace?.taskId
    ?? message.taskEntry?.taskId
    ?? verificationProjection.latestRun?.taskId;
  const linkedTaskRecord = selectLinkedTaskLedgerRecord(store, workspaceId, sessionId, sourceMessageId, taskId, messageLane);
  const taskEntry = taskId
    ? selectTaskEntry(store, workspaceId, taskId, sessionId, messageLane) ?? message.taskEntry
    : message.taskEntry;
  const projectedAnnotation = projectResultAnnotation(
    annotation,
    linkedTaskRecord?.recentShipRef?.pullRequestUrl,
    store.workspaceGitStatusByWorkspace[workspaceId],
  );
  const browserEvidenceRef = deriveBrowserEvidenceProjection({
    capabilities: selectWorkspaceCapabilities(store, workspaceId),
    annotation: projectedAnnotation,
    taskRecord: linkedTaskRecord,
    browserEvidenceRecords: filterBrowserEvidenceRecordsByLane(store.workspaceBootstraps[workspaceId]?.browserEvidenceRecords, messageLane),
    sessionId,
    sourceMessageId,
    taskId,
  })?.browserEvidenceRef;

  if (!annotation && !taskEntry && !taskId && linkedVerificationRuns.length === 0 && !browserEvidenceRef) {
    return undefined;
  }

  return {
    trace: attachLaneAttribution<MessageTraceLink>({
      sourceMessageId,
      workspaceId,
      sessionId,
      ...(taskId ? { taskId } : {}),
    }, mergeLaneAttribution(message.trace, annotation, taskEntry, verificationProjection.latestRun, linkedTaskRecord)),
    annotation: projectResultAnnotationBrowserEvidence(projectedAnnotation, browserEvidenceRef),
    taskEntry,
    shipReference: linkedTaskRecord?.recentShipRef,
    browserEvidenceRef,
    verification: verificationProjection.verification ?? projectedAnnotation?.verification ?? 'unverified',
    verificationSummary: verificationProjection.latestSummary,
    latestVerificationRun: verificationProjection.latestRun,
    linkedVerificationRuns,
    summary: verificationProjection.latestSummary ?? projectedAnnotation?.summary ?? taskEntry?.latestSummary ?? browserEvidenceRef?.summary,
  };
}

function selectLinkedTaskLedgerRecord(
  store: Pick<UIStore, 'workspaceBootstraps' | 'workspaceGitStatusByWorkspace'>,
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  taskId?: string,
  lane?: LaneAttribution,
): TaskLedgerRecord | undefined {
  const records = selectSessionTaskLedgerRecords(store, workspaceId, sessionId, lane);
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
  lane?: LaneAttribution,
): VerificationRun[] {
  const runs = selectWorkspaceVerificationRuns(store, workspaceId);
  return runs.filter((run) => {
    if (run.workspaceId !== workspaceId) return false;
    if (run.sessionId && run.sessionId !== sessionId) return false;
    if (!matchesExpectedLane(run, lane)) return false;
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
  lane?: LaneAttribution,
): TaskEntry | undefined {
  const entriesBySession = store.taskEntriesByWorkspace[workspaceId] ?? {};

  const selectFromEntries = (entries: Record<string, TaskEntry> | undefined): TaskEntry | undefined => {
    if (!entries) return undefined;
    return Object.values(entries).find((entry) => entry.taskId === taskId && matchesExpectedLane(entry, lane));
  };

  return selectFromEntries(preferredSessionId ? entriesBySession[preferredSessionId] : undefined)
    ?? selectFromEntries(entriesBySession[WORKSPACE_SCOPE_SESSION_KEY])
    ?? Object.values(entriesBySession)
      .flatMap((entries) => Object.values(entries))
      .find((entry) => entry.taskId === taskId && matchesExpectedLane(entry, lane));
}

function projectTaskLedgerRecord(
  record: TaskLedgerRecord,
  status: WorkspaceGitStatusResult | undefined,
  capabilities: WorkspaceCapabilityProbe | undefined,
  browserEvidenceRecords: BrowserEvidenceRecord[] | undefined,
): ProjectedTaskLedgerRecord {
  const projectedAnnotation = projectResultAnnotation(record.resultAnnotation, record.recentShipRef?.pullRequestUrl, status);
  const browserEvidenceRef = deriveBrowserEvidenceProjection({
    capabilities,
    annotation: projectedAnnotation,
    taskRecord: record,
    browserEvidenceRecords: filterBrowserEvidenceRecordsByLane(browserEvidenceRecords, record),
    sessionId: resolveTaskLedgerRecordSessionId(record),
    sourceMessageId: record.sourceMessageId ?? record.resultAnnotation?.sourceMessageId,
    taskId: record.taskId,
  })?.browserEvidenceRef;
  const nextAnnotation = projectResultAnnotationBrowserEvidence(projectedAnnotation, browserEvidenceRef);
  const { resultAnnotation: _resultAnnotation, recentBrowserEvidenceRef: _recentBrowserEvidenceRef, ...projectedRecord } = record;

  return {
    ...projectedRecord,
    ...(nextAnnotation ? { resultAnnotation: nextAnnotation } : {}),
    ...(browserEvidenceRef ? {
      recentBrowserEvidenceRef: browserEvidenceRef,
      browserEvidenceRef,
    } : {}),
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

  return attachLaneAttribution({
    sourceMessageId: annotation.sourceMessageId,
    workspaceId: annotation.workspaceId,
    sessionId: annotation.sessionId,
    verification: annotation.verification,
    ...(annotation.taskId ? { taskId: annotation.taskId } : {}),
    ...(annotation.summary ? { summary: annotation.summary } : {}),
    ...(projection.reviewState ? { reviewState: projection.reviewState } : {}),
    ...(projection.shipState ? { shipState: projection.shipState } : {}),
  }, annotation);
}

function projectResultAnnotationBrowserEvidence(
  annotation: ResultAnnotation | undefined,
  browserEvidenceRef: BrowserEvidenceReference | undefined,
): ResultAnnotation | undefined {
  if (!annotation) return undefined;

  return attachLaneAttribution({
    sourceMessageId: annotation.sourceMessageId,
    workspaceId: annotation.workspaceId,
    sessionId: annotation.sessionId,
    verification: annotation.verification,
    ...(annotation.taskId ? { taskId: annotation.taskId } : {}),
    ...(annotation.summary ? { summary: annotation.summary } : {}),
    ...(annotation.reviewState ? { reviewState: annotation.reviewState } : {}),
    ...(annotation.shipState ? { shipState: annotation.shipState } : {}),
    ...(browserEvidenceRef ? { browserEvidenceRef } : {}),
  }, annotation);
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
      taskEntries[resolveTaskEntryStoreKey(message.taskEntry)] = message.taskEntry;
    }
    if (message.resultAnnotation?.sourceMessageId) {
      resultAnnotations[resolveResultAnnotationStoreKey(message.resultAnnotation)] = message.resultAnnotation;
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
    const normalizedTaskEntry = attachLaneAttribution({ ...taskEntry }, taskEntry);
    grouped[sessionKey] = { ...(grouped[sessionKey] ?? {}), [resolveTaskEntryStoreKey(normalizedTaskEntry)]: normalizedTaskEntry };
  }

  for (const record of taskLedgerRecords ?? []) {
    const sessionKey = resolveTaskLedgerRecordSessionId(record) ?? WORKSPACE_SCOPE_SESSION_KEY;
    const taskEntry = taskLedgerRecordToTaskEntry(record, sessionKey);
    grouped[sessionKey] = {
      ...(grouped[sessionKey] ?? {}),
      [resolveTaskEntryStoreKey(taskEntry)]: taskEntry,
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
    const normalizedResultAnnotation = attachLaneAttribution({ ...resultAnnotation }, resultAnnotation);
    grouped[resultAnnotation.sessionId] = {
      ...(grouped[resultAnnotation.sessionId] ?? {}),
      [resolveResultAnnotationStoreKey(normalizedResultAnnotation)]: normalizedResultAnnotation,
    };
  }

  for (const record of taskLedgerRecords ?? []) {
    const resultAnnotation = taskLedgerRecordToResultAnnotation(record);
    if (!resultAnnotation) continue;

    grouped[resultAnnotation.sessionId] = {
      ...(grouped[resultAnnotation.sessionId] ?? {}),
      [resolveResultAnnotationStoreKey(resultAnnotation)]: resultAnnotation,
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

  return attachLaneAttribution({
    taskId: nextEntry.taskId,
    workspaceId: nextEntry.workspaceId,
    sessionId: nextEntry.sessionId ?? baseEntry.sessionId,
    sourceMessageId: nextEntry.sourceMessageId ?? baseEntry.sourceMessageId,
    title: baseEntry.title ?? nextEntry.title,
    state: baseEntry.state,
    latestSummary: baseEntry.latestSummary ?? nextEntry.latestSummary,
  }, mergeLaneAttribution(baseEntry, nextEntry));
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

  return attachLaneAttribution({
    sourceMessageId: nextAnnotation.sourceMessageId,
    workspaceId: nextAnnotation.workspaceId,
    sessionId: nextAnnotation.sessionId,
    verification: nextAnnotation.verification,
    ...(baseAnnotation.taskId ?? nextAnnotation.taskId ? { taskId: baseAnnotation.taskId ?? nextAnnotation.taskId } : {}),
    ...(baseAnnotation.summary ?? nextAnnotation.summary ? { summary: baseAnnotation.summary ?? nextAnnotation.summary } : {}),
    ...(baseAnnotation.reviewState ?? nextAnnotation.reviewState ? { reviewState: baseAnnotation.reviewState ?? nextAnnotation.reviewState } : {}),
    ...(baseAnnotation.shipState ?? nextAnnotation.shipState ? { shipState: baseAnnotation.shipState ?? nextAnnotation.shipState } : {}),
    ...(pickLatestBrowserEvidenceReference([
      baseAnnotation.browserEvidenceRef,
      nextAnnotation.browserEvidenceRef,
    ]) ? {
      browserEvidenceRef: pickLatestBrowserEvidenceReference([
        baseAnnotation.browserEvidenceRef,
        nextAnnotation.browserEvidenceRef,
      ]),
    } : {}),
  }, mergeLaneAttribution(baseAnnotation, nextAnnotation));
}

function taskLedgerRecordToTaskEntry(record: TaskLedgerRecord, sessionKey: string): TaskEntry {
  return attachLaneAttribution({
    taskId: record.taskId,
    workspaceId: record.workspaceId,
    ...(sessionKey !== WORKSPACE_SCOPE_SESSION_KEY ? { sessionId: sessionKey } : {}),
    ...(record.sourceMessageId ? { sourceMessageId: record.sourceMessageId } : {}),
    ...(record.title ? { title: record.title } : {}),
    state: record.state,
    latestSummary: record.summary,
  }, record);
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
    lane: record,
  });
}

function normalizeTaskLedgerRecords(workspaceId: string, records?: TaskLedgerRecord[]): TaskLedgerRecord[] {
  return sortTaskLedgerRecords(
    (records ?? [])
      .filter((record) => record.workspaceId === workspaceId)
      .map((record) => normalizeTaskLedgerRecord(record)),
  );
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
  const lane = mergeLaneAttribution(message.trace, message.taskEntry, message.resultAnnotation);
  const taskEntry = normalizeTaskEntry(message.taskEntry, {
    workspaceId,
    sessionId,
    sourceMessageId,
    taskId: linkedTaskId,
    summary: message.resultAnnotation?.summary,
    lane,
  });
  const resultAnnotation = normalizeResultAnnotation(message.resultAnnotation, {
    workspaceId,
    sessionId,
    sourceMessageId,
    taskId: linkedTaskId ?? taskEntry?.taskId,
    summary: taskEntry?.latestSummary,
    lane,
  });

  return {
    ...message,
    trace: attachLaneAttribution<MessageTraceLink>({
      sourceMessageId,
      workspaceId,
      sessionId,
      ...(resultAnnotation?.taskId ?? taskEntry?.taskId ? { taskId: resultAnnotation?.taskId ?? taskEntry?.taskId } : {}),
    }, mergeLaneAttribution(lane, taskEntry, resultAnnotation)),
    ...(taskEntry ? { taskEntry } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
  };
}

function normalizeTaskEntry(
  taskEntry: TaskEntry | undefined,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string; taskId?: string; summary?: string; lane?: LaneAttribution },
): TaskEntry | undefined {
  const taskId = taskEntry?.taskId ?? context.taskId;
  if (!taskId) return undefined;

  return attachLaneAttribution({
    taskId,
    workspaceId: taskEntry?.workspaceId ?? context.workspaceId,
    sessionId: taskEntry?.sessionId ?? context.sessionId,
    sourceMessageId: taskEntry?.sourceMessageId ?? context.sourceMessageId,
    title: taskEntry?.title,
    state: taskEntry?.state ?? 'completed',
    latestSummary: taskEntry?.latestSummary ?? context.summary,
  }, mergeLaneAttribution(taskEntry, context.lane));
}

function normalizeResultAnnotation(
  annotation: ResultAnnotation | undefined,
  context: { workspaceId: string; sessionId: string; sourceMessageId: string; taskId?: string; summary?: string; lane?: LaneAttribution },
): ResultAnnotation | undefined {
  const taskId = annotation?.taskId ?? context.taskId;
  const summary = annotation?.summary ?? context.summary;
  if (!annotation && !taskId && !summary) return undefined;

  return attachLaneAttribution({
    sourceMessageId: annotation?.sourceMessageId ?? context.sourceMessageId,
    workspaceId: annotation?.workspaceId ?? context.workspaceId,
    sessionId: annotation?.sessionId ?? context.sessionId,
    verification: annotation?.verification ?? 'unverified',
    ...(taskId ? { taskId } : {}),
    ...(summary ? { summary } : {}),
    ...(annotation?.reviewState ? { reviewState: annotation.reviewState } : {}),
    ...(annotation?.shipState ? { shipState: annotation.shipState } : {}),
    ...(annotation?.browserEvidenceRef ? { browserEvidenceRef: annotation.browserEvidenceRef } : {}),
  }, mergeLaneAttribution(annotation, context.lane));
}

function normalizeSessions(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.map((session) => normalizeSessionSummary(session));
}

function normalizeSessionSummary(session: SessionSummary, lane?: LaneAttribution): SessionSummary {
  return normalizeSessionSummaryWithLane(session, lane);
}

function normalizeSessionSummaryWithLane(session: SessionSummary, lane?: LaneAttribution): SessionSummary {
  return attachLaneAttribution({ ...session }, mergeLaneAttribution(session, lane));
}

function normalizeWorkspaceLaneComparisonState(
  laneRecords: WorkspaceLaneRecord[] | undefined,
  sessions: SessionSummary[],
  state?: WorkspaceLaneComparisonState,
): WorkspaceLaneComparisonState | undefined {
  if (!state) return undefined;

  const selectedLane = resolveWorkspaceComparisonLaneReference(
    laneRecords,
    sessions,
    normalizeWorkspaceComparisonLaneReference(state.selectedLane),
  );
  const adoptedLane = resolveWorkspaceComparisonLaneReference(
    laneRecords,
    sessions,
    normalizeWorkspaceComparisonLaneReference(state.adoptedLane),
  );

  if (!selectedLane && !adoptedLane) {
    return undefined;
  }

  return {
    ...(selectedLane ? { selectedLane } : {}),
    ...(adoptedLane ? { adoptedLane } : {}),
  };
}

function normalizeWorkspaceComparisonLaneReference(
  reference: WorkspaceComparisonLaneReference | undefined,
): WorkspaceComparisonLaneReference | undefined {
  if (!reference?.sessionId) return undefined;

  const lane = mergeLaneAttribution(reference);
  if (!lane) return undefined;

  return {
    sessionId: reference.sessionId,
    ...lane,
  };
}

function resolveWorkspaceComparisonLaneReference(
  laneRecords: WorkspaceLaneRecord[] | undefined,
  sessions: SessionSummary[],
  reference: WorkspaceComparisonLaneReference | undefined,
): WorkspaceComparisonLaneReference | undefined {
  if (!reference) return undefined;

  const laneId = resolveLaneId(reference);
  if (!laneId) return undefined;

  return buildWorkspaceComparisonLaneReferences(laneRecords, sessions)
    .find((candidate) => candidate.sessionId === reference.sessionId && candidate.laneId === laneId);
}

function buildWorkspaceComparisonLaneReferences(
  laneRecords: WorkspaceLaneRecord[] | undefined,
  sessions: SessionSummary[],
): WorkspaceComparisonLaneReference[] {
  const references = new Map<string, WorkspaceComparisonLaneReference>();

  const upsert = (sessionId: string | undefined, lane: LaneAttribution | undefined) => {
    if (!sessionId) return;

    const laneId = resolveLaneId(lane);
    const laneContext = lane?.laneContext ?? deriveLaneContext(laneId);
    if (!laneId || !laneContext) return;

    references.set(`${sessionId}::${laneId}`, {
      sessionId,
      laneId,
      laneContext,
    });
  };

  for (const session of sessions) {
    upsert(session.id, session);
  }

  for (const laneRecord of laneRecords ?? []) {
    upsert(laneRecord.sessionId, laneRecord);
  }

  return [...references.values()];
}

function normalizeWorkspaceLaneRecords(workspaceId: string, records?: WorkspaceLaneRecord[]): WorkspaceLaneRecord[] | undefined {
  if (!records) return undefined;
  return records
    .filter((record) => record.workspaceId === workspaceId)
    .map(normalizeWorkspaceLaneRecord);
}

function normalizeWorkspaceLaneRecord(record: WorkspaceLaneRecord): WorkspaceLaneRecord {
  const lane = mergeLaneAttribution(record);
  return attachLaneAttribution({
    ...record,
    ...(record.session ? { session: normalizeSessionSummaryWithLane(record.session, lane) } : {}),
    traceability: {
      taskEntries: record.traceability.taskEntries.map((taskEntry) => attachLaneAttribution({ ...taskEntry }, mergeLaneAttribution(taskEntry, lane))),
      resultAnnotations: record.traceability.resultAnnotations.map((annotation) =>
        attachLaneAttribution({ ...annotation }, mergeLaneAttribution(annotation, lane))),
    },
    verificationRuns: record.verificationRuns.map((run) => normalizeVerificationRun(run, lane)),
    browserEvidenceRecords: record.browserEvidenceRecords.map((browserEvidenceRecord) =>
      normalizeBrowserEvidenceRecord(browserEvidenceRecord, lane)),
    taskLedgerRecords: record.taskLedgerRecords.map((taskLedgerRecord) => normalizeTaskLedgerRecord(taskLedgerRecord, lane)),
  }, lane);
}

function normalizeVerificationRuns(workspaceId: string, runs?: VerificationRun[]): VerificationRun[] | undefined {
  if (!runs) return undefined;
  return sortVerificationRuns(runs.filter((run) => run.workspaceId === workspaceId).map((run) => normalizeVerificationRun(run)));
}

function normalizeVerificationRun(run: VerificationRun, lane?: LaneAttribution): VerificationRun {
  return attachLaneAttribution({ ...run }, mergeLaneAttribution(run, lane));
}

function normalizeBrowserEvidenceRecords(workspaceId: string, records?: BrowserEvidenceRecord[]): BrowserEvidenceRecord[] | undefined {
  if (!records) return undefined;
  return records
    .filter((record) => record.workspaceId === workspaceId)
    .map((record) => normalizeBrowserEvidenceRecord(record));
}

function normalizeBrowserEvidenceRecord(record: BrowserEvidenceRecord, lane?: LaneAttribution): BrowserEvidenceRecord {
  return attachLaneAttribution({ ...record }, mergeLaneAttribution(record, lane));
}

function normalizeTaskLedgerRecord(record: TaskLedgerRecord, fallbackLane?: LaneAttribution): TaskLedgerRecord {
  const sessionId = resolveTaskLedgerRecordSessionId(record);
  const lane = mergeLaneAttribution(record, record.resultAnnotation, fallbackLane);
  const resultAnnotation = record.resultAnnotation && sessionId
    ? normalizeResultAnnotation(record.resultAnnotation, {
        workspaceId: record.workspaceId,
        sessionId,
        sourceMessageId: record.resultAnnotation.sourceMessageId ?? record.sourceMessageId ?? record.taskId,
        taskId: record.taskId,
        summary: record.summary,
        lane,
      })
    : record.resultAnnotation
      ? attachLaneAttribution({ ...record.resultAnnotation }, lane)
      : undefined;

  return attachLaneAttribution({
    ...record,
    ...(resultAnnotation ? { resultAnnotation } : {}),
  }, lane);
}

function mergeBootstrapSessions(sessions: SessionSummary[], laneRecords?: WorkspaceLaneRecord[]): SessionSummary[] {
  const merged = new Map<string, SessionSummary>();

  for (const session of sessions) {
    merged.set(session.id, normalizeSessionSummary(session));
  }

  for (const laneRecord of laneRecords ?? []) {
    if (!laneRecord.session || merged.has(laneRecord.session.id)) continue;
    merged.set(laneRecord.session.id, normalizeSessionSummaryWithLane(laneRecord.session, laneRecord));
  }

  return [...merged.values()];
}

function resolveLaneComparisonFlags(
  lane: SessionLaneSummary,
  laneComparison: WorkspaceLaneComparisonState | undefined,
): WorkspaceLaneComparisonFlags {
  if (!laneComparison) return EMPTY_LANE_COMPARISON_FLAGS;

  return {
    selected: matchesWorkspaceComparisonLaneReference(lane, laneComparison?.selectedLane),
    adopted: matchesWorkspaceComparisonLaneReference(lane, laneComparison?.adoptedLane),
  };
}

function matchesWorkspaceComparisonLaneReference(
  lane: LaneAttribution & { sessionId?: string },
  reference: WorkspaceComparisonLaneReference | undefined,
): boolean {
  if (!reference?.sessionId || !lane.sessionId) return false;
  return lane.sessionId === reference.sessionId && resolveLaneId(lane) === resolveLaneId(reference);
}

function mergeWorkspaceTraceabilitySummaries(
  ...summaries: Array<WorkspaceTraceabilitySummary | undefined>
): WorkspaceTraceabilitySummary | undefined {
  if (!summaries.some((summary) => summary !== undefined)) {
    return undefined;
  }

  const taskEntries: Record<string, TaskEntry> = {};
  const resultAnnotations: Record<string, ResultAnnotation> = {};

  for (const summary of summaries) {
    for (const taskEntry of summary?.taskEntries ?? []) {
      const normalizedTaskEntry = attachLaneAttribution({ ...taskEntry }, taskEntry);
      taskEntries[resolveTaskEntryStoreKey(normalizedTaskEntry)] = normalizedTaskEntry;
    }
    for (const resultAnnotation of summary?.resultAnnotations ?? []) {
      const normalizedResultAnnotation = attachLaneAttribution({ ...resultAnnotation }, resultAnnotation);
      resultAnnotations[resolveResultAnnotationStoreKey(normalizedResultAnnotation)] = normalizedResultAnnotation;
    }
  }

  return {
    taskEntries: Object.values(taskEntries),
    resultAnnotations: Object.values(resultAnnotations),
  };
}

function mergeVerificationRunLists(...lists: Array<VerificationRun[] | undefined>): VerificationRun[] | undefined {
  if (!lists.some((list) => list !== undefined)) {
    return undefined;
  }

  const runs = new Map<string, VerificationRun>();
  for (const list of lists) {
    for (const run of list ?? []) {
      const normalizedRun = normalizeVerificationRun(run);
      runs.set(resolveVerificationRunStoreKey(normalizedRun), normalizedRun);
    }
  }

  return sortVerificationRuns([...runs.values()]);
}

function resolveVerificationRunStoreKey(run: VerificationRun): string {
  return `${run.id}::${resolveLaneId(run) ?? '__default__'}`;
}

function mergeBrowserEvidenceRecordLists(
  ...lists: Array<BrowserEvidenceRecord[] | undefined>
): BrowserEvidenceRecord[] | undefined {
  if (!lists.some((list) => list !== undefined)) {
    return undefined;
  }

  const records = new Map<string, BrowserEvidenceRecord>();
  for (const list of lists) {
    for (const record of list ?? []) {
      const normalizedRecord = normalizeBrowserEvidenceRecord(record);
      records.set(resolveBrowserEvidenceRecordStoreKey(normalizedRecord), normalizedRecord);
    }
  }

  return [...records.values()];
}

function resolveBrowserEvidenceRecordStoreKey(record: BrowserEvidenceRecord): string {
  return `${record.id}::${resolveLaneId(record) ?? '__default__'}`;
}

function mergeTaskLedgerRecordLists(...lists: Array<TaskLedgerRecord[] | undefined>): TaskLedgerRecord[] | undefined {
  if (!lists.some((list) => list !== undefined)) {
    return undefined;
  }

  const records = new Map<string, TaskLedgerRecord>();
  for (const list of lists) {
    for (const record of list ?? []) {
      const normalizedRecord = normalizeTaskLedgerRecord(record);
      records.set(resolveTaskLedgerRecordStoreKey(normalizedRecord), normalizedRecord);
    }
  }

  return sortTaskLedgerRecords([...records.values()]);
}

function resolveTaskLedgerRecordStoreKey(record: TaskLedgerRecord): string {
  return [
    resolveTaskLedgerRecordSessionId(record) ?? WORKSPACE_SCOPE_SESSION_KEY,
    record.sourceMessageId ?? record.taskId,
    record.taskId,
    resolveLaneId(mergeLaneAttribution(record, record.resultAnnotation)) ?? '__default__',
  ].join('::');
}

function selectResultAnnotation(
  store: Pick<UIStore, 'resultAnnotationsByWorkspace'>,
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  lane?: LaneAttribution,
): ResultAnnotation | undefined {
  return Object.values(store.resultAnnotationsByWorkspace[workspaceId]?.[sessionId] ?? {})
    .find((annotation) => annotation.sourceMessageId === sourceMessageId && matchesExpectedLane(annotation, lane));
}

function filterBrowserEvidenceRecordsByLane(
  records: BrowserEvidenceRecord[] | undefined,
  lane?: LaneAttribution,
): BrowserEvidenceRecord[] | undefined {
  if (!records) return undefined;
  const expectedLaneId = resolveLaneId(lane);
  if (!expectedLaneId) return records;
  return records.filter((record) => resolveLaneId(record) === expectedLaneId);
}

function resolveTaskEntryStoreKey(entry: TaskEntry): string {
  const laneId = resolveLaneId(entry);
  return laneId ? `${entry.taskId}::${laneId}` : entry.taskId;
}

function resolveResultAnnotationStoreKey(annotation: ResultAnnotation): string {
  const laneId = resolveLaneId(annotation);
  return laneId ? `${annotation.sourceMessageId}::${laneId}` : annotation.sourceMessageId;
}

function resolveMessageLane(message: NormalizedMessage): LaneAttribution | undefined {
  return mergeLaneAttribution(message.trace, message.taskEntry, message.resultAnnotation);
}

function resolveMessageSourceId(message: NormalizedMessage): string {
  return message.resultAnnotation?.sourceMessageId
    ?? message.taskEntry?.sourceMessageId
    ?? message.trace?.sourceMessageId
    ?? message.id;
}

function isSameMessageIdentity(left: NormalizedMessage, right: NormalizedMessage): boolean {
  if (left.id !== right.id) return false;
  return !hasConflictingLane(resolveMessageLane(left), resolveMessageLane(right));
}

function matchesExpectedLane(candidate: LaneAttribution | undefined, expected: LaneAttribution | undefined): boolean {
  const expectedLaneId = resolveLaneId(expected);
  if (!expectedLaneId) return true;
  return resolveLaneId(candidate) === expectedLaneId;
}

function hasConflictingLane(left: LaneAttribution | undefined, right: LaneAttribution | undefined): boolean {
  const leftLaneId = resolveLaneId(left);
  const rightLaneId = resolveLaneId(right);
  return !!leftLaneId && !!rightLaneId && leftLaneId !== rightLaneId;
}

function attachLaneAttribution<T extends object>(record: T, lane: LaneAttribution | undefined): T & LaneAttribution {
  const nextLane = mergeLaneAttribution(record as LaneAttribution, lane);
  if (!nextLane) return record as T & LaneAttribution;

  return {
    ...record,
    ...(nextLane.laneId ? { laneId: nextLane.laneId } : {}),
    ...(nextLane.laneContext ? { laneContext: nextLane.laneContext } : {}),
  };
}

function mergeLaneAttribution(...values: Array<LaneAttribution | undefined>): LaneAttribution | undefined {
  const laneId = values.map(resolveLaneId).find((value): value is string => !!value);
  const laneContext = values.find((value) => value?.laneContext)?.laneContext;
  if (!laneId && !laneContext) return undefined;

  return {
    ...(laneId ? { laneId } : {}),
    ...(laneContext ? { laneContext } : {}),
  };
}

function resolveLaneId(value: LaneAttribution | undefined): string | undefined {
  return value?.laneId ?? deriveLaneId(value?.laneContext);
}

function deriveLaneContext(laneId: string | undefined): LaneContext | undefined {
  if (!laneId) return undefined;
  if (laneId.startsWith('branch:')) {
    return {
      kind: 'branch',
      branch: laneId.slice('branch:'.length),
    };
  }
  if (laneId.startsWith('worktree:')) {
    return {
      kind: 'worktree',
      worktreePath: laneId.slice('worktree:'.length),
    };
  }
  return undefined;
}

function deriveLaneId(laneContext: LaneContext | undefined): string | undefined {
  if (!laneContext) return undefined;
  if (laneContext.kind === 'branch') {
    return `branch:${laneContext.branch}`;
  }
  return `worktree:${laneContext.worktreePath}`;
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
  const index = existing.findIndex((entry) => entry.id === run.id && !hasConflictingLane(entry, run));
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
