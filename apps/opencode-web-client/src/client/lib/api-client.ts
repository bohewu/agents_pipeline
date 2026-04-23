import type {
  ApiEnvelope,
  BrowserEvidenceRecord,
  WorkspaceComparisonLaneReference,
  WorkspaceProfile,
  WorkspaceServerStatus,
  WorkspaceBootstrap,
  WorkspaceLaneRecord,
  WorkspaceLaneAdoptionRequest,
  WorkspaceLaneComparisonState,
  WorkspaceCapabilityProbe,
  WorkspaceContextCatalogResponse,
  WorkspaceLaneSelectionRequest,
  LaneAttribution,
  LaneContext,
  SessionSummary,
  NormalizedMessage,
  PermissionRequest,
  DiffResponse,
  FileStatusResponse,
  EffortStateSummary,
  UsageDetails,
  InstallDiagnostics,
  BffEvent,
  BffEventType,
  SetEffortRequest,
  TaskEntry,
  TaskLedgerRecord,
  ResultAnnotation,
  VerificationCommandKind,
  VerificationRun,
  WorkspaceGitStatusResult,
  CommitPreviewRequest,
  CommitPreviewResult,
  CommitExecuteRequest,
  CommitExecuteResult,
  PushRequest,
  PushResult,
  PullRequestCreateRequest,
  PullRequestCreateResult,
  SessionChatRequest,
  SessionChatResponse,
} from '../../shared/types.js';

const BASE = '';

interface WorkspaceStateResponse {
  workspaces: WorkspaceProfile[];
  activeWorkspaceId?: string;
  serverStatuses?: Record<string, WorkspaceServerStatus>;
}

const EVENT_TYPES: BffEventType[] = [
  'session.created',
  'session.updated',
  'message.created',
  'message.delta',
  'message.completed',
  'verification.updated',
  'permission.requested',
  'permission.resolved',
  'effort.changed',
  'workspace.changed',
  'connection.ping',
];

function deriveLaneId(laneContext?: LaneContext): string | undefined {
  if (!laneContext) return undefined;
  if (laneContext.kind === 'branch') {
    return `branch:${laneContext.branch}`;
  }
  return `worktree:${laneContext.worktreePath}`;
}

function normalizeLaneAttribution<T extends object>(record: T & Partial<LaneAttribution>): T & LaneAttribution {
  const laneId = record.laneId ?? deriveLaneId(record.laneContext);
  if (!laneId && !record.laneContext) {
    return record as T & LaneAttribution;
  }

  return {
    ...record,
    ...(laneId ? { laneId } : {}),
    ...(record.laneContext ? { laneContext: record.laneContext } : {}),
  };
}

function normalizeLaneAttributionWithFallback<T extends object>(
  record: T & Partial<LaneAttribution>,
  fallback: LaneAttribution | undefined,
): T & LaneAttribution {
  return normalizeLaneAttribution({
    ...(fallback?.laneId ? { laneId: fallback.laneId } : {}),
    ...(fallback?.laneContext ? { laneContext: fallback.laneContext } : {}),
    ...record,
  });
}

function normalizeTaskEntry(taskEntry: TaskEntry | undefined): TaskEntry | undefined {
  return taskEntry ? normalizeLaneAttribution(taskEntry) : undefined;
}

function normalizeResultAnnotation(annotation: ResultAnnotation | undefined): ResultAnnotation | undefined {
  return annotation ? normalizeLaneAttribution(annotation) : undefined;
}

function normalizeMessage(message: NormalizedMessage): NormalizedMessage {
  const taskEntry = normalizeTaskEntry(message.taskEntry);
  const resultAnnotation = normalizeResultAnnotation(message.resultAnnotation);

  return {
    ...message,
    ...(message.trace ? { trace: normalizeLaneAttribution(message.trace) } : {}),
    ...(taskEntry ? { taskEntry } : {}),
    ...(resultAnnotation ? { resultAnnotation } : {}),
  };
}

function normalizeVerificationRun(run: VerificationRun): VerificationRun {
  return normalizeLaneAttribution(run);
}

function normalizeBrowserEvidenceRecord(record: BrowserEvidenceRecord): BrowserEvidenceRecord {
  return normalizeLaneAttribution(record);
}

function normalizeTaskLedgerRecord(record: TaskLedgerRecord): TaskLedgerRecord {
  return normalizeLaneAttribution({
    ...record,
    ...(record.resultAnnotation ? { resultAnnotation: normalizeResultAnnotation(record.resultAnnotation) } : {}),
  });
}

function normalizeSessionSummary(session: SessionSummary): SessionSummary {
  return normalizeLaneAttribution(session);
}

function normalizeWorkspaceComparisonLaneReference(
  reference: WorkspaceComparisonLaneReference,
): WorkspaceComparisonLaneReference {
  return normalizeLaneAttribution(reference);
}

function normalizeWorkspaceLaneComparisonState(
  state: WorkspaceLaneComparisonState | undefined,
): WorkspaceLaneComparisonState | undefined {
  if (!state) return undefined;

  const selectedLane = state.selectedLane
    ? normalizeWorkspaceComparisonLaneReference(state.selectedLane)
    : undefined;
  const adoptedLane = state.adoptedLane
    ? normalizeWorkspaceComparisonLaneReference(state.adoptedLane)
    : undefined;

  if (!selectedLane && !adoptedLane) {
    return undefined;
  }

  return {
    ...(selectedLane ? { selectedLane } : {}),
    ...(adoptedLane ? { adoptedLane } : {}),
  };
}

function normalizeWorkspaceLaneRecord(record: WorkspaceLaneRecord): WorkspaceLaneRecord {
  const lane = normalizeLaneAttribution(record);

  return {
    ...lane,
    ...(record.session ? { session: normalizeLaneAttributionWithFallback(record.session, lane) } : {}),
    traceability: {
      taskEntries: record.traceability.taskEntries.map((taskEntry) => normalizeLaneAttributionWithFallback(taskEntry, lane)),
      resultAnnotations: record.traceability.resultAnnotations.map((annotation) => normalizeLaneAttributionWithFallback(annotation, lane)),
    },
    verificationRuns: record.verificationRuns.map((run) => normalizeLaneAttributionWithFallback(run, lane)),
    browserEvidenceRecords: record.browserEvidenceRecords.map((browserEvidenceRecord) =>
      normalizeLaneAttributionWithFallback(browserEvidenceRecord, lane)),
    taskLedgerRecords: record.taskLedgerRecords.map((taskLedgerRecord) => normalizeTaskLedgerRecord({
      ...(lane.laneId ? { laneId: lane.laneId } : {}),
      ...(lane.laneContext ? { laneContext: lane.laneContext } : {}),
      ...taskLedgerRecord,
      ...(taskLedgerRecord.resultAnnotation ? {
        resultAnnotation: normalizeLaneAttributionWithFallback(taskLedgerRecord.resultAnnotation, lane),
      } : {}),
    })),
  };
}

function normalizeWorkspaceBootstrap(bootstrap: WorkspaceBootstrap): WorkspaceBootstrap {
  return {
    ...bootstrap,
    sessions: bootstrap.sessions.map(normalizeSessionSummary),
    ...(bootstrap.laneComparison ? { laneComparison: normalizeWorkspaceLaneComparisonState(bootstrap.laneComparison) } : {}),
    ...(bootstrap.laneRecords ? { laneRecords: bootstrap.laneRecords.map(normalizeWorkspaceLaneRecord) } : {}),
    ...(bootstrap.traceability ? {
      traceability: {
        taskEntries: bootstrap.traceability.taskEntries.map((taskEntry) => normalizeLaneAttribution(taskEntry)),
        resultAnnotations: bootstrap.traceability.resultAnnotations.map((annotation) => normalizeLaneAttribution(annotation)),
      },
    } : {}),
    ...(bootstrap.verificationRuns ? { verificationRuns: bootstrap.verificationRuns.map(normalizeVerificationRun) } : {}),
    ...(bootstrap.browserEvidenceRecords ? { browserEvidenceRecords: bootstrap.browserEvidenceRecords.map(normalizeBrowserEvidenceRecord) } : {}),
    ...(bootstrap.taskLedgerRecords ? { taskLedgerRecords: bootstrap.taskLedgerRecords.map(normalizeTaskLedgerRecord) } : {}),
  };
}

function normalizeEventPayload(type: BffEventType, payload: Record<string, unknown>): Record<string, unknown> {
  if (type === 'session.created' || type === 'session.updated') {
    const session = payload.session as SessionSummary | undefined;
    return session ? { ...payload, session: normalizeSessionSummary(session) } : payload;
  }

  if (type === 'message.created' || type === 'message.delta' || type === 'message.completed') {
    const message = payload.message as NormalizedMessage | undefined;
    return message ? { ...payload, message: normalizeMessage(message) } : payload;
  }

  if (type === 'verification.updated') {
    return {
      ...payload,
      ...(payload.run ? { run: normalizeVerificationRun(payload.run as VerificationRun) } : {}),
      ...(payload.taskEntry ? { taskEntry: normalizeTaskEntry(payload.taskEntry as TaskEntry) } : {}),
      ...(payload.resultAnnotation ? { resultAnnotation: normalizeResultAnnotation(payload.resultAnnotation as ResultAnnotation) } : {}),
    };
  }

  return payload;
}

function normalizeEvent(value: any): BffEvent {
  return {
    type: value.type,
    timestamp: value.timestamp ?? value.time ?? new Date().toISOString(),
    payload: normalizeEventPayload(value.type, value.payload ?? {}),
  };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly envelope?: ApiEnvelope<unknown>;

  constructor(message: string, options: { code: string; status: number; envelope?: ApiEnvelope<unknown> }) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.status = options.status;
    this.envelope = options.envelope;
  }
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const envelope = await res.json() as ApiEnvelope<T>;
  if (!res.ok || !envelope.ok) {
    throw new ApiClientError(
      !envelope.ok ? envelope.error?.message ?? 'API error' : `HTTP ${res.status}`,
      {
        code: !envelope.ok ? envelope.error?.code ?? 'API_ERROR' : 'HTTP_ERROR',
        status: res.status,
        envelope,
      },
    );
  }
  return envelope.data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  return parseEnvelope<T>(res);
}

async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  return parseEnvelope<T>(res);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseEnvelope<T>(res);
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  return parseEnvelope<T>(res);
}

export const api = {
  health: () => get<{ status: string }>('/api/health'),
  diagnostics: () => get<InstallDiagnostics>('/api/diagnostics/install'),

  // Filesystem browsing
  browse: (path?: string) =>
    post<{
      currentPath: string;
      parentPath: string | null;
      entries: Array<{ name: string; path: string; isDirectory: boolean; isGitRepo: boolean }>;
      homePath: string;
    }>('/api/fs/browse', { path }),

  // Workspaces
  listWorkspaceState: () => get<WorkspaceStateResponse>('/api/workspaces'),
  listWorkspaces: () => api.listWorkspaceState().then((state) => state.workspaces),
  addWorkspace: (data: { path: string; name?: string; opencodeConfigDir?: string }) =>
    post<WorkspaceProfile>('/api/workspaces', data),
  validateWorkspace: (data: { path: string; useExactPath?: boolean; confirmed?: boolean }) =>
    post<{ valid: boolean; resolvedPath?: string; gitRoot?: string; error?: string }>(
      '/api/workspaces/validate',
      data,
    ),
  discoverWorkspaces: (data: { path: string; maxDepth?: number }) =>
    post<{ repos: string[] }>('/api/workspaces/discover', data).then((result) => result.repos),
  selectWorkspace: (id: string) => post<WorkspaceBootstrap>(`/api/workspaces/${id}/select`).then(normalizeWorkspaceBootstrap),
  updateWorkspace: (id: string, data: Partial<WorkspaceProfile>) =>
    patch<WorkspaceProfile>(`/api/workspaces/${id}`, data),
  deleteWorkspace: (id: string) => del<void>(`/api/workspaces/${id}`),
  startServer: (id: string) => post<void>(`/api/workspaces/${id}/server/start`),
  stopServer: (id: string) => post<void>(`/api/workspaces/${id}/server/stop`),
  restartServer: (id: string) => post<void>(`/api/workspaces/${id}/server/restart`),
  getBootstrap: (id: string) => get<WorkspaceBootstrap>(`/api/workspaces/${id}/bootstrap`).then(normalizeWorkspaceBootstrap),
  getWorkspaceCapabilities: (id: string) => get<WorkspaceCapabilityProbe>(`/api/workspaces/${id}/capabilities`),
  getWorkspaceContextCatalog: (id: string) =>
    get<WorkspaceContextCatalogResponse>(`/api/workspaces/${id}/context/catalog`),
  selectComparisonLane: (id: string, data: WorkspaceLaneSelectionRequest) =>
    post<WorkspaceBootstrap>(`/api/workspaces/${id}/compare/select-lane`, data).then(normalizeWorkspaceBootstrap),
  adoptComparisonLane: (id: string, data: WorkspaceLaneAdoptionRequest) =>
    post<WorkspaceBootstrap>(`/api/workspaces/${id}/compare/adopt-lane`, data).then(normalizeWorkspaceBootstrap),
  getGitStatus: (id: string) => get<WorkspaceGitStatusResult>(`/api/workspaces/${id}/git/status`),
  previewCommit: (id: string, data?: CommitPreviewRequest) =>
    post<CommitPreviewResult>(`/api/workspaces/${id}/git/commit/preview`, data ?? {}),
  executeCommit: (id: string, data: CommitExecuteRequest, signal?: AbortSignal) =>
    post<CommitExecuteResult>(`/api/workspaces/${id}/git/commit`, data, signal),
  push: (id: string, data: PushRequest, signal?: AbortSignal) =>
    post<PushResult>(`/api/workspaces/${id}/git/push`, data, signal),
  createPullRequest: (id: string, data: PullRequestCreateRequest, signal?: AbortSignal) =>
    post<PullRequestCreateResult>(`/api/workspaces/${id}/git/pr`, data, signal),
  listVerificationRuns: (wsId: string) =>
    get<VerificationRun[]>(`/api/workspaces/${wsId}/verify/runs`).then((runs) => runs.map(normalizeVerificationRun)),
  runVerification: (
    wsId: string,
    data: { sessionId: string; commandKind: VerificationCommandKind; sourceMessageId?: string; taskId?: string },
    signal?: AbortSignal,
  ) =>
    post<VerificationRun>(`/api/workspaces/${wsId}/verify/run`, data, signal),

  // Sessions
  listSessions: (wsId: string) =>
    get<SessionSummary[]>(`/api/workspaces/${wsId}/sessions`).then((sessions) => sessions.map(normalizeSessionSummary)),
  createSession: (wsId: string, data?: { title?: string; providerId?: string; modelId?: string; agentId?: string }) =>
    post<SessionSummary>(`/api/workspaces/${wsId}/sessions`, data ?? {}).then(normalizeSessionSummary),
  updateSession: (wsId: string, sid: string, data: { title: string }) =>
    patch<SessionSummary>(`/api/workspaces/${wsId}/sessions/${sid}`, data).then(normalizeSessionSummary),
  deleteSession: (wsId: string, sid: string) =>
    del<void>(`/api/workspaces/${wsId}/sessions/${sid}`),
  forkSession: (wsId: string, sid: string, data?: { title?: string }) =>
    post<SessionSummary>(`/api/workspaces/${wsId}/sessions/${sid}/fork`, data ?? {}).then(normalizeSessionSummary),

  // Messages
  listMessages: (wsId: string, sid: string) =>
    get<NormalizedMessage[]>(`/api/workspaces/${wsId}/sessions/${sid}/messages`).then((messages) => messages.map(normalizeMessage)),
  sendChat: (
    wsId: string,
    sid: string,
    data: SessionChatRequest,
    signal?: AbortSignal,
  ) =>
    post<SessionChatResponse>(`/api/workspaces/${wsId}/sessions/${sid}/chat`, data, signal),
  sendCommand: (wsId: string, sid: string, data: { command: string }, signal?: AbortSignal) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/command`, data, signal),
  sendShell: (wsId: string, sid: string, data: { command: string }, signal?: AbortSignal) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/shell`, data, signal),
  abort: (wsId: string, sid: string) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/abort`),

  // Permissions
  listPermissions: (wsId: string, sid: string) =>
    get<PermissionRequest[]>(`/api/workspaces/${wsId}/sessions/${sid}/permissions`),
  resolvePermission: (
    wsId: string,
    sid: string,
    pid: string,
    data: { decision: 'allow' | 'allow_remember' | 'deny' },
  ) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/permissions/${pid}`, data),

  // Files
  getDiff: (wsId: string, sid: string) =>
    get<DiffResponse[]>(`/api/workspaces/${wsId}/sessions/${sid}/diff`),
  getFileStatus: (wsId: string) =>
    get<FileStatusResponse[]>(`/api/workspaces/${wsId}/files/status`),
  getFileContent: (wsId: string, path: string) =>
    get<{ content: string }>(`/api/workspaces/${wsId}/files/content?path=${encodeURIComponent(path)}`),
  searchFiles: (wsId: string, q: string) =>
    get<string[]>(`/api/workspaces/${wsId}/files/find?q=${encodeURIComponent(q)}`),

  // Effort
  getEffort: (wsId: string, sessionId?: string) =>
    get<EffortStateSummary>(`/api/workspaces/${wsId}/effort${sessionId ? `?sessionId=${sessionId}` : ''}`),
  setEffort: (wsId: string, data: SetEffortRequest) =>
    post<void>(`/api/workspaces/${wsId}/effort`, {
      scope: data.scope,
      action: 'set',
      effort: data.level,
      sessionId: data.sessionId,
    }),

  // Usage
  getUsage: (wsId: string, provider?: string, copilotReportPath?: string) => {
    const params = new URLSearchParams();
    if (provider) params.set('provider', provider);
    if (copilotReportPath) params.set('copilotReportPath', copilotReportPath);
    const qs = params.toString();
    return get<UsageDetails>(`/api/workspaces/${wsId}/usage${qs ? `?${qs}` : ''}`);
  },

  // SSE
  connectEvents: (
    wsId: string,
    onEvent: (event: BffEvent) => void,
    onError?: (err: Event) => void,
  ): (() => void) => {
    const es = new EventSource(`/api/events?workspaceId=${encodeURIComponent(wsId)}`);
    const handleMessage = (e: MessageEvent<string>) => {
      try {
        onEvent(normalizeEvent(JSON.parse(e.data)));
      } catch { /* ignore parse errors */ }
    };
    es.onmessage = handleMessage;
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, handleMessage as EventListener);
    }
    es.onerror = (e) => onError?.(e);
    return () => es.close();
  },
};
