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

export type SessionState = 'idle' | 'running' | 'error';

export interface WorkspaceServerStatus {
  state: 'starting' | 'ready' | 'unhealthy' | 'stopped';
  port?: number;
  baseUrl?: string;
  startedAt?: string;
  lastHealthAt?: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  connected: boolean;
  defaultModelId?: string;
  modelCount: number;
}

export interface ModelSummary {
  id: string;
  providerId: string;
  name: string;
  connected: boolean;
  isDefault: boolean;
  variants?: ModelVariantSummary[];
}

export interface ModelVariantSummary {
  id: string;
  name: string;
  reasoningEffort?: string;
  hasAdditionalOptions: boolean;
}

export interface AgentSummary {
  id: string;
  name: string;
  mode?: string;
  description?: string;
}

export interface CommandSummary {
  id: string;
  name: string;
  description?: string;
}

export interface OpenCodeBootstrap {
  health: { healthy: boolean; version?: string };
  project?: { id?: string; path?: string; name?: string; branch?: string };
  providers: ProviderSummary[];
  models: ModelSummary[];
  agents: AgentSummary[];
  commands: CommandSummary[];
  connectedProviderIds: string[];
}

export interface WorkspaceBootstrap {
  workspace: WorkspaceProfile;
  server?: WorkspaceServerStatus;
  opencode?: OpenCodeBootstrap;
  sessions: SessionSummary[];
  effort?: EffortStateSummary;
}

// ── Sessions ──

export interface SessionSummary {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  parentId?: string;
  state?: SessionState;
  changeSummary?: {
    files: number;
    additions: number;
    deletions: number;
  };
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
  error?: string;
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
