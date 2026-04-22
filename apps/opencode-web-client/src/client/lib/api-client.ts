import type {
  ApiEnvelope,
  WorkspaceProfile,
  WorkspaceServerStatus,
  WorkspaceBootstrap,
  WorkspaceCapabilityProbe,
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

function normalizeEvent(value: any): BffEvent {
  return {
    type: value.type,
    timestamp: value.timestamp ?? value.time ?? new Date().toISOString(),
    payload: value.payload ?? {},
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
  selectWorkspace: (id: string) => post<WorkspaceBootstrap>(`/api/workspaces/${id}/select`),
  updateWorkspace: (id: string, data: Partial<WorkspaceProfile>) =>
    patch<WorkspaceProfile>(`/api/workspaces/${id}`, data),
  deleteWorkspace: (id: string) => del<void>(`/api/workspaces/${id}`),
  startServer: (id: string) => post<void>(`/api/workspaces/${id}/server/start`),
  stopServer: (id: string) => post<void>(`/api/workspaces/${id}/server/stop`),
  restartServer: (id: string) => post<void>(`/api/workspaces/${id}/server/restart`),
  getBootstrap: (id: string) => get<WorkspaceBootstrap>(`/api/workspaces/${id}/bootstrap`),
  getWorkspaceCapabilities: (id: string) => get<WorkspaceCapabilityProbe>(`/api/workspaces/${id}/capabilities`),
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
    get<VerificationRun[]>(`/api/workspaces/${wsId}/verify/runs`),
  runVerification: (
    wsId: string,
    data: { sessionId: string; commandKind: VerificationCommandKind; sourceMessageId?: string; taskId?: string },
    signal?: AbortSignal,
  ) =>
    post<VerificationRun>(`/api/workspaces/${wsId}/verify/run`, data, signal),

  // Sessions
  listSessions: (wsId: string) =>
    get<SessionSummary[]>(`/api/workspaces/${wsId}/sessions`),
  createSession: (wsId: string, data?: { title?: string; providerId?: string; modelId?: string; agentId?: string }) =>
    post<SessionSummary>(`/api/workspaces/${wsId}/sessions`, data ?? {}),
  updateSession: (wsId: string, sid: string, data: { title: string }) =>
    patch<SessionSummary>(`/api/workspaces/${wsId}/sessions/${sid}`, data),
  deleteSession: (wsId: string, sid: string) =>
    del<void>(`/api/workspaces/${wsId}/sessions/${sid}`),
  forkSession: (wsId: string, sid: string, data?: { title?: string }) =>
    post<SessionSummary>(`/api/workspaces/${wsId}/sessions/${sid}/fork`, data ?? {}),

  // Messages
  listMessages: (wsId: string, sid: string) =>
    get<NormalizedMessage[]>(`/api/workspaces/${wsId}/sessions/${sid}/messages`),
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
