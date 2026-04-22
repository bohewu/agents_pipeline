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

export type CapabilityProbeStatus = 'available' | 'unavailable' | 'error';

export type WorkspaceCapabilityKey = 'localGit' | 'ghCli' | 'ghAuth' | 'previewTarget' | 'browserEvidence';

export interface CapabilityProbeCheck {
  status: CapabilityProbeStatus;
  summary: string;
  detail?: string;
}

export interface WorkspaceCapabilityProbe {
  workspaceId: string;
  checkedAt: string;
  localGit: CapabilityProbeCheck;
  ghCli: CapabilityProbeCheck;
  ghAuth: CapabilityProbeCheck;
  previewTarget: CapabilityProbeCheck;
  browserEvidence: CapabilityProbeCheck;
}

export type ShipStatusOutcome = 'success' | 'degraded' | 'failure';

export type ShipActionOutcome = 'success' | 'degraded' | 'blocked' | 'failure';

export type GitRemoteProvider = 'github' | 'gitlab' | 'bitbucket' | 'unknown';

export interface ShipIssue {
  code: string;
  message: string;
  detail?: string;
  remediation?: string;
  source?: 'git' | 'gh' | 'opencode' | 'bff';
}

export interface GitStatusPathBucket {
  count: number;
  paths: string[];
  truncated: boolean;
}

export interface WorkspaceGitChangeSummary {
  staged: GitStatusPathBucket;
  unstaged: GitStatusPathBucket;
  untracked: GitStatusPathBucket;
  conflicted: GitStatusPathBucket;
  hasChanges: boolean;
  hasStagedChanges: boolean;
}

export interface WorkspaceGitBranchState {
  name?: string;
  detached: boolean;
  headSha?: string;
}

export interface WorkspaceGitUpstreamState {
  status: 'tracked' | 'missing' | 'detached' | 'unknown';
  ref?: string;
  remote?: string;
  branch?: string;
  ahead: number;
  behind: number;
  remoteUrl?: string;
  remoteHost?: string;
  remoteProvider?: GitRemoteProvider;
}

export interface WorkspacePullRequestCapability {
  outcome: ShipActionOutcome;
  supported: boolean;
  summary: string;
  detail?: string;
  remediation?: string;
  issues: ShipIssue[];
}

export type WorkspaceLinkedPullRequestChecksStatus = 'none' | 'passing' | 'failing' | 'pending';

export interface WorkspaceLinkedPullRequestFailingCheck {
  name: string;
  summary?: string;
  detailsUrl?: string;
}

export interface WorkspaceLinkedPullRequestChecksSummary {
  status: WorkspaceLinkedPullRequestChecksStatus;
  summary: string;
  total: number;
  passing: number;
  failing: number;
  pending: number;
  failingChecks: WorkspaceLinkedPullRequestFailingCheck[];
}

export type WorkspaceLinkedPullRequestReviewStatus = 'approved' | 'changes_requested' | 'review_required' | 'unknown';

export interface WorkspaceLinkedPullRequestReviewSummary {
  status: WorkspaceLinkedPullRequestReviewStatus;
  summary: string;
  requestedReviewerCount: number;
}

export interface WorkspaceLinkedPullRequestSummary {
  outcome: ShipStatusOutcome;
  linked: boolean;
  summary: string;
  detail?: string;
  remediation?: string;
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  isDraft?: boolean;
  headBranch?: string;
  baseBranch?: string;
  checks?: WorkspaceLinkedPullRequestChecksSummary;
  review?: WorkspaceLinkedPullRequestReviewSummary;
  issues: ShipIssue[];
}

export interface WorkspaceGitStatusSnapshot {
  workspaceId: string;
  checkedAt: string;
  branch: WorkspaceGitBranchState;
  upstream: WorkspaceGitUpstreamState;
  changeSummary: WorkspaceGitChangeSummary;
  pullRequest: WorkspacePullRequestCapability;
  linkedPullRequest: WorkspaceLinkedPullRequestSummary;
}

export interface WorkspaceGitStatusResult {
  outcome: ShipStatusOutcome;
  data?: WorkspaceGitStatusSnapshot;
  issues: ShipIssue[];
}

export interface ShipExecutionResult {
  sessionId: string;
  status?: string;
  summary?: string;
  exitCode?: number;
  terminalLogRef?: string;
  messageId?: string;
  taskId?: string;
  stdout?: string;
  stderr?: string;
}

export interface CommitPreviewRequest {
  message?: string;
}

export interface CommitPreviewResult {
  outcome: ShipActionOutcome;
  status: WorkspaceGitStatusResult;
  draftMessage?: string;
  issues: ShipIssue[];
}

export interface CommitExecuteRequest {
  sessionId: string;
  message: string;
  agentId?: string;
}

export interface CommitExecuteResult {
  outcome: ShipActionOutcome;
  status: WorkspaceGitStatusResult;
  execution?: ShipExecutionResult;
  commit?: {
    sha?: string;
    message: string;
  };
  issues: ShipIssue[];
}

export interface PushRequest {
  sessionId: string;
  agentId?: string;
}

export interface PushResult {
  outcome: ShipActionOutcome;
  status: WorkspaceGitStatusResult;
  execution?: ShipExecutionResult;
  upstream?: WorkspaceGitUpstreamState;
  issues: ShipIssue[];
}

export interface PullRequestCreateRequest {
  sessionId: string;
  agentId?: string;
  title?: string;
  body?: string;
  baseBranch?: string;
  headBranch?: string;
  draft?: boolean;
}

export interface PullRequestCreateResult {
  outcome: ShipActionOutcome;
  status: WorkspaceGitStatusResult;
  execution?: ShipExecutionResult;
  pullRequest?: {
    url: string;
  };
  issues: ShipIssue[];
}

export type VerificationCommandKind = 'lint' | 'build' | 'test';

export type VerificationRunStatus = 'running' | 'passed' | 'failed' | 'cancelled';

export interface VerificationRun {
  id: string;
  workspaceId: string;
  sessionId?: string;
  sourceMessageId?: string;
  taskId: string;
  commandKind: VerificationCommandKind;
  status: VerificationRunStatus;
  startedAt: string;
  finishedAt?: string;
  summary: string;
  exitCode?: number;
  terminalLogRef?: string;
}

export interface TaskLedgerVerificationReference {
  runId: string;
  commandKind: VerificationCommandKind;
  status: VerificationRunStatus;
  summary?: string;
  terminalLogRef?: string;
}

export type TaskLedgerShipAction = 'commit' | 'push' | 'pullRequest';

export interface TaskLedgerShipReference {
  action: TaskLedgerShipAction;
  outcome: ShipActionOutcome;
  sessionId: string;
  messageId?: string;
  taskId?: string;
  terminalLogRef?: string;
  commitSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  conditionKind?: ShipFixHandoffConditionKind;
  conditionLabel?: string;
  detailsUrl?: string;
}

export interface WorkspaceBootstrap {
  workspace: WorkspaceProfile;
  server?: WorkspaceServerStatus;
  opencode?: OpenCodeBootstrap;
  git?: WorkspaceGitStatusResult;
  sessions: SessionSummary[];
  effort?: EffortStateSummary;
  capabilities?: WorkspaceCapabilityProbe;
  traceability?: WorkspaceTraceabilitySummary;
  verificationRuns?: VerificationRun[];
  taskLedgerRecords?: TaskLedgerRecord[];
}

export type WorkspaceContextSourceLayer = 'project-local' | 'user-global' | 'app-bundled';

export type WorkspaceContextEntryStatus = 'available' | 'missing' | 'degraded';

export type WorkspaceInstructionSourceCategory =
  | 'agents-file'
  | 'opencode-dir'
  | 'claude-file'
  | 'claude-agent'
  | 'copilot-instructions'
  | 'cursor-rule';

export interface WorkspaceInstructionSourceEntry {
  id: string;
  category: WorkspaceInstructionSourceCategory;
  sourceLayer: Extract<WorkspaceContextSourceLayer, 'project-local'>;
  label: string;
  status: WorkspaceContextEntryStatus;
  path: string;
  detail?: string;
  remediation?: string;
  itemCount?: number;
  items?: string[];
}

export type WorkspaceCapabilityCategory =
  | 'plugin'
  | 'command'
  | 'tool'
  | 'usage-asset'
  | 'effort-asset'
  | 'skill'
  | 'mcp-asset';

export interface WorkspaceCapabilityEntry {
  id: string;
  category: WorkspaceCapabilityCategory;
  sourceLayer: WorkspaceContextSourceLayer;
  label: string;
  status: WorkspaceContextEntryStatus;
  path: string;
  detail?: string;
  remediation?: string;
  itemCount?: number;
  items?: string[];
}

export interface WorkspaceContextCatalogResponse {
  workspaceId: string;
  collectedAt: string;
  instructionSources: WorkspaceInstructionSourceEntry[];
  capabilityEntries: WorkspaceCapabilityEntry[];
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
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'error'
  | 'permission-request';

export interface NormalizedPart {
  type: NormalizedPartType;
  id?: string;
  parentId?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status?: string;
}

export type TaskEntryState =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ResultVerificationState = 'verified' | 'partially verified' | 'unverified';

export type ResultReviewState = 'ready' | 'approval-needed' | 'needs-retry';

export type ResultShipState =
  | 'not-ready'
  | 'local-ready'
  | 'pr-ready'
  | 'blocked-by-checks'
  | 'blocked-by-requested-changes';

export type ShipFixHandoffConditionKind = 'failing-check' | 'review-feedback' | 'requested-changes';

export interface ShipFixHandoffRequest {
  taskId: string;
  title: string;
  summary: string;
  shipState: ResultShipState;
  reviewState?: ResultReviewState;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  conditionKind: ShipFixHandoffConditionKind;
  conditionLabel: string;
  detailsUrl?: string;
}

export interface SessionChatRequest {
  text: string;
  providerId?: string;
  modelId?: string;
  agentId?: string;
  effort?: string;
  shipFixHandoff?: ShipFixHandoffRequest;
}

export interface SessionChatResponse {
  accepted: true;
  sessionId: string;
  messageId?: string;
  taskId?: string;
}

export interface MessageTraceLink {
  sourceMessageId: string;
  workspaceId?: string;
  sessionId?: string;
  taskId?: string;
}

export interface TaskEntry {
  taskId: string;
  workspaceId: string;
  sessionId?: string;
  sourceMessageId?: string;
  title?: string;
  state: TaskEntryState;
  latestSummary?: string;
}

export interface ResultAnnotation {
  sourceMessageId: string;
  workspaceId: string;
  sessionId: string;
  taskId?: string;
  summary?: string;
  verification: ResultVerificationState;
  reviewState?: ResultReviewState;
  shipState?: ResultShipState;
}

export interface TaskLedgerRecord {
  taskId: string;
  workspaceId: string;
  sessionId?: string;
  sourceMessageId?: string;
  title?: string;
  summary: string;
  state: TaskEntryState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  resultAnnotation?: ResultAnnotation;
  recentVerificationRef?: TaskLedgerVerificationReference;
  recentShipRef?: TaskLedgerShipReference;
}

export interface WorkspaceTraceabilitySummary {
  taskEntries: TaskEntry[];
  resultAnnotations: ResultAnnotation[];
}

export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: NormalizedPart[];
  createdAt: string;
  trace?: MessageTraceLink;
  taskEntry?: TaskEntry;
  resultAnnotation?: ResultAnnotation;
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
  | 'verification.updated'
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
