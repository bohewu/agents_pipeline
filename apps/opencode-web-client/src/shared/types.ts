// ── API Envelope ──

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

// ── Workspaces ──

export interface WorkspaceProfile {
  id: string;
  name: string;
  rootPath: string;
  opencodeConfigDir?: string;
  addedAt: string;
}

export interface WorkspaceBootstrap {
  workspace: WorkspaceProfile;
  sessions: SessionSummary[];
}

// ── Sessions ──

export interface SessionSummary {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// ── Messages ──

export type NormalizedPartType =
  | 'text'
  | 'tool-call'
  | 'tool-result'
  | 'error'
  | 'permission-request';

export interface NormalizedPart {
  type: NormalizedPartType;
  id?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status?: string;
}

export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: NormalizedPart[];
  createdAt: string;
}

// ── Permissions ──

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
}

// ── Diffs / Files ──

export interface DiffResponse {
  path: string;
  diff: string;
  language?: string;
}

export interface FileStatusResponse {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
}

// ── Effort ──

export interface EffortStateSummary {
  projectDefault?: string;
  sessionOverrides: Record<string, string>;
}

export interface SetEffortRequest {
  level: string;
  scope: 'project' | 'session';
  sessionId?: string;
}

// ── Usage ──

export interface UsageDetails {
  provider: string;
  status: string;
  data: Record<string, unknown>;
}

// ── Events (SSE) ──

export type BffEventType =
  | 'session.created'
  | 'session.updated'
  | 'message.created'
  | 'message.delta'
  | 'message.completed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'effort.changed'
  | 'workspace.changed'
  | 'connection.ping';

export interface BffEvent {
  type: BffEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ── Diagnostics ──

export interface AssetStatus {
  installed: boolean;
  path?: string;
}

export interface RuntimeStatus {
  found: boolean;
  version?: string;
  path?: string;
}

export interface InstallDiagnostics {
  app: {
    version: string;
    installed: boolean;
    sourceRepoRequired: false;
    dataDir: string;
    configDir: string;
    stateDir: string;
    cacheDir: string;
  };
  opencode: {
    found: boolean;
    binaryPath?: string;
    version?: string;
    configDir: string;
    configDirSource: 'default' | 'env' | 'settings' | 'installer';
  };
  assets: {
    effortPlugin: AssetStatus;
    effortStateHelper: AssetStatus;
    usageCommand: AssetStatus;
    providerUsageTool: AssetStatus;
  };
  runtimes: {
    node: RuntimeStatus;
    python: RuntimeStatus;
    git: RuntimeStatus;
  };
}
