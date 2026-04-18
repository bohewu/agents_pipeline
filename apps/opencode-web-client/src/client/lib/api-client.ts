import type {
  WorkspaceProfile,
  WorkspaceBootstrap,
  SessionSummary,
  NormalizedMessage,
  PermissionRequest,
  DiffResponse,
  FileStatusResponse,
  EffortStateSummary,
  UsageDetails,
  InstallDiagnostics,
  BffEvent,
  SetEffortRequest,
} from '../../shared/types.js';

const BASE = '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  const envelope = await res.json();
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'API error');
  return envelope.data as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const envelope = await res.json();
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'API error');
  return envelope.data as T;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const envelope = await res.json();
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'API error');
  return envelope.data as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  const envelope = await res.json();
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'API error');
  return envelope.data as T;
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
  listWorkspaces: () => get<WorkspaceProfile[]>('/api/workspaces'),
  addWorkspace: (data: { rootPath: string; name?: string }) =>
    post<WorkspaceProfile>('/api/workspaces', data),
  validateWorkspace: (data: { rootPath: string }) =>
    post<{ valid: boolean; error?: string }>('/api/workspaces/validate', data),
  discoverWorkspaces: (data: { basePath: string }) =>
    post<WorkspaceProfile[]>('/api/workspaces/discover', data),
  selectWorkspace: (id: string) => post<void>(`/api/workspaces/${id}/select`),
  updateWorkspace: (id: string, data: Partial<WorkspaceProfile>) =>
    patch<WorkspaceProfile>(`/api/workspaces/${id}`, data),
  deleteWorkspace: (id: string) => del<void>(`/api/workspaces/${id}`),
  startServer: (id: string) => post<void>(`/api/workspaces/${id}/server/start`),
  stopServer: (id: string) => post<void>(`/api/workspaces/${id}/server/stop`),
  restartServer: (id: string) => post<void>(`/api/workspaces/${id}/server/restart`),
  getBootstrap: (id: string) => get<WorkspaceBootstrap>(`/api/workspaces/${id}/bootstrap`),

  // Sessions
  listSessions: (wsId: string) =>
    get<SessionSummary[]>(`/api/workspaces/${wsId}/sessions`),
  createSession: (wsId: string, data?: { title?: string }) =>
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
  sendChat: (wsId: string, sid: string, data: { content: string }) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/chat`, data),
  sendCommand: (wsId: string, sid: string, data: { command: string }) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/command`, data),
  sendShell: (wsId: string, sid: string, data: { command: string }) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/shell`, data),
  abort: (wsId: string, sid: string) =>
    post<void>(`/api/workspaces/${wsId}/sessions/${sid}/abort`),

  // Permissions
  listPermissions: (wsId: string, sid: string) =>
    get<PermissionRequest[]>(`/api/workspaces/${wsId}/sessions/${sid}/permissions`),
  resolvePermission: (wsId: string, sid: string, pid: string, data: { action: 'approve' | 'deny' }) =>
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
    post<void>(`/api/workspaces/${wsId}/effort`, data),

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
    const es = new EventSource(`/api/workspaces/${wsId}/events`);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as BffEvent;
        onEvent(parsed);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = (e) => onError?.(e);
    return () => es.close();
  },
};
