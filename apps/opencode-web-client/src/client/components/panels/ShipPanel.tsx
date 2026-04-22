import React from 'react';
import type {
  CommitExecuteResult,
  CommitPreviewResult,
  GitStatusPathBucket,
  NormalizedMessage,
  PullRequestCreateResult,
  PushResult,
  ResultReviewState,
  SessionChatRequest,
  ShipIssue,
  TaskLedgerRecord,
  WorkspaceCapabilityProbe,
  WorkspaceGitStatusResult,
  WorkspaceGitStatusSnapshot,
  WorkspaceGitUpstreamState,
  WorkspaceLinkedPullRequestChecksSummary,
  WorkspaceLinkedPullRequestReviewSummary,
  WorkspaceLinkedPullRequestSummary,
  WorkspacePullRequestCapability,
} from '../../../shared/types.js';
import { api } from '../../lib/api-client.js';
import {
  selectActiveWorkspaceCapabilities,
  selectActiveWorkspaceGitStatus,
  selectActiveWorkspaceShipActionResults,
  selectSessionMessages,
  useStore,
} from '../../runtime/store.js';
import { ArrowDownIcon, ArrowUpIcon, GitBranchIcon } from '../common/Icons.js';

type SurfaceTone = 'success' | 'warning' | 'danger' | 'neutral';
type ActionState = 'ready' | 'blocked' | 'unavailable';

interface SurfaceFeedback {
  tone: SurfaceTone;
  message: string;
}

interface StatusBannerModel {
  tone: SurfaceTone;
  title: string;
  summary: string;
  detail?: string;
  remediation?: string;
  issues: ShipIssue[];
  kind: 'status-unavailable' | 'status-incomplete' | 'status-idle';
}

interface ActionCardModel {
  key: 'commit' | 'push' | 'pullRequest';
  label: string;
  state: ActionState;
  summary: string;
  detail?: string;
  remediation?: string;
  controlLabel: string;
}

interface OutcomeBannerModel {
  tone: SurfaceTone;
  title: string;
  summary: string;
  detail?: string;
  remediation?: string;
}

interface LinkedPullRequestSurfaceModel {
  tone: SurfaceTone;
  stateLabel: string;
}

export function ShipPanel() {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((state) => state.activeSessionByWorkspace);
  const workspaceBootstraps = useStore((state) => state.workspaceBootstraps);
  const selectedProvider = useStore((state) => state.selectedProvider);
  const selectedModel = useStore((state) => state.selectedModel);
  const selectedAgent = useStore((state) => state.selectedAgent);
  const effortByWorkspace = useStore((state) => state.effortByWorkspace);
  const status = useStore((state) => selectActiveWorkspaceGitStatus(state));
  const shipActionResults = useStore(selectActiveWorkspaceShipActionResults);
  const capabilities = useStore(selectActiveWorkspaceCapabilities);
  const addMessage = useStore((state) => state.addMessage);
  const setMessages = useStore((state) => state.setMessages);
  const setSessionStreaming = useStore((state) => state.setSessionStreaming);
  const setWorkspaceBootstrap = useStore((state) => state.setWorkspaceBootstrap);
  const setWorkspaceGitStatus = useStore((state) => state.setWorkspaceGitStatus);
  const setWorkspaceShipActionResult = useStore((state) => state.setWorkspaceShipActionResult);
  const workspaceName = activeWorkspaceId
    ? workspaceBootstraps[activeWorkspaceId]?.workspace.name ?? activeWorkspaceId
    : null;
  const workspaceLabel = workspaceName ?? activeWorkspaceId ?? 'this workspace';
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const effortState = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const effectiveEffort = sessionId
    ? effortState?.sessionOverrides[sessionId] ?? effortState?.projectDefault
    : effortState?.projectDefault;
  const snapshot = status?.data;
  const commitPreviewResult = shipActionResults?.commitPreview;
  const commitExecuteResult = shipActionResults?.commitExecute;
  const pushResult = shipActionResults?.push;
  const pullRequestResult = shipActionResults?.pullRequest;
  const [loading, setLoading] = React.useState(false);
  const [feedback, setFeedback] = React.useState<SurfaceFeedback | null>(null);
  const [commitPreviewOpen, setCommitPreviewOpen] = React.useState(false);
  const [commitPreviewLoading, setCommitPreviewLoading] = React.useState(false);
  const [commitExecuting, setCommitExecuting] = React.useState(false);
  const [commitDraftMessage, setCommitDraftMessage] = React.useState('');
  const [commitFlowError, setCommitFlowError] = React.useState<string | null>(null);
  const [pushExecuting, setPushExecuting] = React.useState(false);
  const [pushFlowError, setPushFlowError] = React.useState<string | null>(null);
  const [pullRequestExecuting, setPullRequestExecuting] = React.useState(false);
  const [pullRequestFlowError, setPullRequestFlowError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFeedback(null);
    setCommitPreviewOpen(false);
    setCommitPreviewLoading(false);
    setCommitExecuting(false);
    setCommitDraftMessage('');
    setCommitFlowError(null);
    setPushExecuting(false);
    setPushFlowError(null);
    setPullRequestExecuting(false);
    setPullRequestFlowError(null);
  }, [activeWorkspaceId]);

  const refreshStatus = React.useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setFeedback(null);

    try {
      const nextStatus = await api.getGitStatus(activeWorkspaceId);
      setWorkspaceGitStatus(activeWorkspaceId, nextStatus);
      const nextIssue = nextStatus.issues[0];

      setFeedback(nextStatus.outcome === 'success'
        ? { tone: 'success', message: `Refreshed git status for ${workspaceLabel}.` }
        : {
            tone: nextStatus.outcome === 'failure' ? 'danger' : 'warning',
            message: nextIssue?.message ?? `Git status refresh needs attention for ${workspaceLabel}.`,
          });
    } catch (error: any) {
      setFeedback({ tone: 'danger', message: error?.message ?? `Failed to refresh git status for ${workspaceLabel}.` });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, setWorkspaceGitStatus, workspaceLabel]);

  const loadCommitPreview = React.useCallback(async () => {
    if (!activeWorkspaceId) return;
    setCommitPreviewOpen(true);
    setCommitPreviewLoading(true);
    setCommitFlowError(null);
    setWorkspaceShipActionResult(activeWorkspaceId, 'commitExecute', undefined);

    try {
      const nextPreview = await api.previewCommit(
        activeWorkspaceId,
        commitDraftMessage.trim() ? { message: commitDraftMessage } : undefined,
      );
      setWorkspaceShipActionResult(activeWorkspaceId, 'commitPreview', nextPreview);
      setWorkspaceGitStatus(activeWorkspaceId, nextPreview.status);
      setCommitDraftMessage(nextPreview.draftMessage ?? '');
    } catch (error: any) {
      setCommitFlowError(error?.message ?? `Failed to load the commit preview for ${workspaceLabel}.`);
    } finally {
      setCommitPreviewLoading(false);
    }
  }, [activeWorkspaceId, commitDraftMessage, setWorkspaceGitStatus, setWorkspaceShipActionResult, workspaceLabel]);

  const executeCommit = React.useCallback(async () => {
    if (!activeWorkspaceId || !sessionId) return;
    const message = commitDraftMessage.trim();
    if (!message) {
      setCommitFlowError('Commit message is required before confirming the commit.');
      setCommitPreviewOpen(true);
      return;
    }

    setCommitExecuting(true);
    setCommitFlowError(null);

    try {
      const result = await api.executeCommit(activeWorkspaceId, {
        sessionId,
        message,
        agentId: selectedAgent ?? undefined,
      });
      setWorkspaceShipActionResult(activeWorkspaceId, 'commitExecute', result);
      setWorkspaceGitStatus(activeWorkspaceId, result.status);

      if (result.outcome === 'success' || result.outcome === 'degraded') {
        setCommitPreviewOpen(false);
        setCommitDraftMessage('');
      } else {
        setCommitPreviewOpen(true);
      }
    } catch (error: any) {
      setCommitFlowError(error?.message ?? `Failed to run the commit for ${workspaceLabel}.`);
      setCommitPreviewOpen(true);
    } finally {
      setCommitExecuting(false);
    }
  }, [activeWorkspaceId, commitDraftMessage, selectedAgent, sessionId, setWorkspaceGitStatus, setWorkspaceShipActionResult, workspaceLabel]);

  const executePush = React.useCallback(async () => {
    if (!activeWorkspaceId || !sessionId) return;

    setPushExecuting(true);
    setPushFlowError(null);
    setWorkspaceShipActionResult(activeWorkspaceId, 'push', undefined);

    try {
      const result = await api.push(activeWorkspaceId, {
        sessionId,
        agentId: selectedAgent ?? undefined,
      });
      setWorkspaceShipActionResult(activeWorkspaceId, 'push', result);
      setWorkspaceGitStatus(activeWorkspaceId, result.status);
    } catch (error: any) {
      setPushFlowError(error?.message ?? `Failed to run the push for ${workspaceLabel}.`);
    } finally {
      setPushExecuting(false);
    }
  }, [activeWorkspaceId, selectedAgent, sessionId, setWorkspaceGitStatus, setWorkspaceShipActionResult, workspaceLabel]);

  const executePullRequest = React.useCallback(async () => {
    if (!activeWorkspaceId || !sessionId) return;

    setPullRequestExecuting(true);
    setPullRequestFlowError(null);
    setWorkspaceShipActionResult(activeWorkspaceId, 'pullRequest', undefined);

    try {
      const result = await api.createPullRequest(activeWorkspaceId, {
        sessionId,
        agentId: selectedAgent ?? undefined,
      });
      setWorkspaceShipActionResult(activeWorkspaceId, 'pullRequest', result);
      setWorkspaceGitStatus(activeWorkspaceId, result.status);
    } catch (error: any) {
      setPullRequestFlowError(error?.message ?? `Failed to create the pull request for ${workspaceLabel}.`);
    } finally {
      setPullRequestExecuting(false);
    }
  }, [activeWorkspaceId, selectedAgent, sessionId, setWorkspaceGitStatus, setWorkspaceShipActionResult, workspaceLabel]);

  const launchShipFixHandoff = React.useCallback(async (handoff: SessionChatRequest['shipFixHandoff']) => {
    if (!activeWorkspaceId || !sessionId || !handoff) return;

    const prompt = buildShipFixHandoffPrompt(snapshot?.linkedPullRequest, handoff);
    const optimisticMessage = createOptimisticUserMessage(activeWorkspaceId, sessionId, prompt);
    addMessage(activeWorkspaceId, sessionId, optimisticMessage);
    setSessionStreaming(activeWorkspaceId, sessionId, true);
    setFeedback(null);

    try {
      const response = await api.sendChat(activeWorkspaceId, sessionId, {
        text: prompt,
        providerId: selectedProvider ?? undefined,
        modelId: selectedModel ?? undefined,
        agentId: selectedAgent ?? undefined,
        effort: effectiveEffort,
        shipFixHandoff: handoff,
      });

      const bootstrap = workspaceBootstraps[activeWorkspaceId];
      if (bootstrap) {
        const sourceMessageId = response.messageId ?? optimisticMessage.id;
        setWorkspaceBootstrap(activeWorkspaceId, {
          ...bootstrap,
          taskLedgerRecords: upsertTaskLedgerRecords(bootstrap.taskLedgerRecords, buildShipFixHandoffRecord(
            activeWorkspaceId,
            sessionId,
            sourceMessageId,
            handoff,
          )),
        });
      }

      setFeedback({ tone: 'success', message: `Sent a fix handoff for ${handoff.conditionLabel} into the current chat session.` });
    } catch (error: any) {
      const currentMessages = selectSessionMessages(useStore.getState(), activeWorkspaceId, sessionId);
      setMessages(activeWorkspaceId, sessionId, currentMessages.filter((message) => message.id !== optimisticMessage.id));
      setSessionStreaming(activeWorkspaceId, sessionId, false);
      setFeedback({ tone: 'danger', message: error?.message ?? `Failed to start a fix handoff for ${handoff.conditionLabel}.` });
    }
  }, [
    activeWorkspaceId,
    addMessage,
    effectiveEffort,
    selectedAgent,
    selectedModel,
    selectedProvider,
    sessionId,
    setMessages,
    setSessionStreaming,
    setWorkspaceBootstrap,
    snapshot?.linkedPullRequest,
    workspaceBootstraps,
  ]);

  if (!activeWorkspaceId) {
    return <EmptyPanelState title="No workspace selected" body="Choose a workspace to inspect branch state, change summary, and local ship readiness." />;
  }

  const statusBanner = resolveStatusBanner(status, capabilities, workspaceLabel);
  const actionCards = buildActionCards(snapshot, statusBanner, !!sessionId);
  const commitActionBusy = commitPreviewLoading || commitExecuting;
  const changeBuckets = snapshot
    ? [
        { key: 'staged', label: 'Staged', bucket: snapshot.changeSummary.staged, tone: 'success' as const, emptyLabel: 'Nothing staged yet.' },
        { key: 'unstaged', label: 'Unstaged', bucket: snapshot.changeSummary.unstaged, tone: 'warning' as const, emptyLabel: 'No unstaged tracked changes.' },
        { key: 'untracked', label: 'Untracked', bucket: snapshot.changeSummary.untracked, tone: 'neutral' as const, emptyLabel: 'No untracked files.' },
        ...(snapshot.changeSummary.conflicted.count > 0
          ? [{ key: 'conflicted', label: 'Conflicted', bucket: snapshot.changeSummary.conflicted, tone: 'danger' as const, emptyLabel: 'No conflicts.' }]
          : []),
      ]
    : [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Ship</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Branch, change summary, and ship availability stay scoped to {workspaceLabel}.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading}
          style={secondaryButtonStyle(loading)}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {feedback && (
        <div aria-live="polite" style={{ fontSize: 11, color: tonePalette(feedback.tone).text, lineHeight: 1.6 }}>
          {feedback.message}
        </div>
      )}

      {statusBanner && <StatusBannerCard banner={statusBanner} />}

      {snapshot && (
        <>
          <StatusOverviewCard snapshot={snapshot} />
          <LinkedPullRequestCard
            linkedPullRequest={snapshot.linkedPullRequest}
            sessionReady={!!sessionId}
            onLaunchFixHandoff={(handoff) => void launchShipFixHandoff(handoff)}
          />

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Change summary</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {snapshot.changeSummary.hasChanges
                    ? 'Staged, unstaged, and untracked changes for the active workspace.'
                    : 'This workspace is currently clean. Empty buckets here are a success state, not an error.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {changeBuckets.map((entry) => (
                <ChangeBucketCard
                  key={entry.key}
                  label={entry.label}
                  bucket={entry.bucket}
                  tone={entry.tone}
                  emptyLabel={entry.emptyLabel}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Action readiness</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Commit, push, and supported PR creation stay foreground-only and synchronous for {workspaceLabel}. Unsupported PR states come from the active workspace capability checks.
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {actionCards.map((card) => (
            <ActionCard
              key={card.key}
              card={card}
              onAction={card.key === 'commit' && card.state === 'ready'
                ? () => void loadCommitPreview()
                : card.key === 'push' && card.state === 'ready'
                  ? () => void executePush()
                  : card.key === 'pullRequest' && card.state === 'ready'
                    ? () => void executePullRequest()
                  : undefined}
              actionLabel={card.key === 'commit' && card.state === 'ready' && commitPreviewOpen ? 'Refresh preview' : undefined}
              busy={card.key === 'commit'
                ? commitActionBusy
                : card.key === 'push'
                  ? pushExecuting
                  : card.key === 'pullRequest'
                    ? pullRequestExecuting
                  : false}
              busyLabel={card.key === 'commit'
                ? (commitExecuting ? 'Committing…' : 'Loading preview…')
                : card.key === 'push'
                  ? 'Pushing…'
                  : card.key === 'pullRequest'
                    ? 'Creating PR…'
                  : undefined}
              active={card.key === 'commit' && commitPreviewOpen}
            />
          ))}
        </div>
      </div>

      {(pushResult || pushFlowError) && (
        <PushExecutionCard workspaceLabel={workspaceLabel} result={pushResult} flowError={pushFlowError} />
      )}

      {(pullRequestResult || pullRequestFlowError) && (
        <PullRequestExecutionCard workspaceLabel={workspaceLabel} result={pullRequestResult} flowError={pullRequestFlowError} />
      )}

      {commitPreviewOpen && (
        <CommitPreviewCard
          workspaceLabel={workspaceLabel}
          previewResult={commitPreviewResult}
          executionResult={commitExecuteResult}
          draftMessage={commitDraftMessage}
          loading={commitPreviewLoading}
          executing={commitExecuting}
          flowError={commitFlowError}
          onDraftMessageChange={setCommitDraftMessage}
          onRefresh={() => void loadCommitPreview()}
          onClose={() => {
            setCommitPreviewOpen(false);
            setCommitFlowError(null);
          }}
          onConfirm={() => void executeCommit()}
        />
      )}

      {!commitPreviewOpen && commitExecuteResult && (
        <CommitExecutionCard workspaceLabel={workspaceLabel} result={commitExecuteResult} />
      )}
    </div>
  );
}

function StatusOverviewCard({ snapshot }: { snapshot: WorkspaceGitStatusSnapshot }) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Active branch
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranchIcon size={16} />
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBranchLabel(snapshot)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{describeUpstreamStatus(snapshot.upstream)}</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <MetricPill label={`Ahead ${snapshot.upstream.ahead}`} tone={snapshot.upstream.ahead > 0 ? 'success' : 'neutral'} icon={<ArrowUpIcon size={14} />} />
          <MetricPill label={`Behind ${snapshot.upstream.behind}`} tone={snapshot.upstream.behind > 0 ? 'warning' : 'neutral'} icon={<ArrowDownIcon size={14} />} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Checked {formatCheckedAt(snapshot.checkedAt)}</div>
    </section>
  );
}

function LinkedPullRequestCard({
  linkedPullRequest,
  sessionReady,
  onLaunchFixHandoff,
}: {
  linkedPullRequest: WorkspaceLinkedPullRequestSummary;
  sessionReady: boolean;
  onLaunchFixHandoff: (handoff: SessionChatRequest['shipFixHandoff']) => void;
}) {
  const surface = resolveLinkedPullRequestSurface(linkedPullRequest);
  const palette = tonePalette(surface.tone);
  const extraIssues = linkedPullRequest.issues.slice(1);
  const prLabel = linkedPullRequest.number ? `#${linkedPullRequest.number}` : 'Linked PR';
  const checksHandoff = buildCheckFixHandoff(linkedPullRequest);
  const reviewHandoff = buildReviewFixHandoff(linkedPullRequest);

  return (
    <section
      className="oc-surface-card"
      style={{
        padding: 14,
        display: 'grid',
        gap: 12,
        border: `1px solid ${palette.border}`,
        background: palette.background,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>Linked pull request</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            GitHub checks and review context stay on this ship surface when branch linkage is available.
          </div>
        </div>
        <span style={{ ...statusPillStyle(surface.tone), fontSize: 10 }}>{surface.stateLabel}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{linkedPullRequest.summary}</div>

      {linkedPullRequest.linked && (
        <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>PR:</strong>{' '}
            {linkedPullRequest.title
              ? `${prLabel} · ${linkedPullRequest.title}`
              : prLabel}
          </div>

          {(linkedPullRequest.state || linkedPullRequest.isDraft !== undefined) && (
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>State:</strong>{' '}
              {formatLinkedPullRequestState(linkedPullRequest)}
            </div>
          )}

          {(linkedPullRequest.headBranch || linkedPullRequest.baseBranch) && (
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Branches:</strong>{' '}
              {(linkedPullRequest.headBranch ?? 'unknown')} → {(linkedPullRequest.baseBranch ?? 'unknown')}
            </div>
          )}

          {linkedPullRequest.url && (
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>URL:</strong>{' '}
              <a
                href={linkedPullRequest.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'rgb(29, 78, 216)', fontWeight: 700, wordBreak: 'break-all' }}
              >
                {linkedPullRequest.url}
              </a>
            </div>
          )}
        </div>
      )}

      {linkedPullRequest.detail && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{linkedPullRequest.detail}</div>
      )}

      {linkedPullRequest.remediation && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Next:</strong> {linkedPullRequest.remediation}
        </div>
      )}

      {linkedPullRequest.linked && (linkedPullRequest.checks || linkedPullRequest.review) && (
        <div style={{ display: 'grid', gap: 10 }}>
          {linkedPullRequest.checks && (
            <LinkedPullRequestChecksCard
              checks={linkedPullRequest.checks}
              sessionReady={sessionReady}
              handoff={checksHandoff}
              onLaunchFixHandoff={onLaunchFixHandoff}
            />
          )}
          {linkedPullRequest.review && (
            <LinkedPullRequestReviewCard
              review={linkedPullRequest.review}
              sessionReady={sessionReady}
              handoff={reviewHandoff}
              onLaunchFixHandoff={onLaunchFixHandoff}
            />
          )}
        </div>
      )}

      {extraIssues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {extraIssues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkedPullRequestChecksCard({
  checks,
  sessionReady,
  handoff,
  onLaunchFixHandoff,
}: {
  checks: WorkspaceLinkedPullRequestChecksSummary;
  sessionReady: boolean;
  handoff?: SessionChatRequest['shipFixHandoff'];
  onLaunchFixHandoff: (handoff: SessionChatRequest['shipFixHandoff']) => void;
}) {
  return (
    <section style={summarySectionStyle(resolveChecksTone(checks.status))}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Checks summary</div>
        <span style={{ ...statusPillStyle(resolveChecksTone(checks.status)), fontSize: 10 }}>
          {formatChecksStatus(checks.status)}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{checks.summary}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <SummaryCountPill label={`Total ${checks.total}`} tone="neutral" />
        <SummaryCountPill label={`Passing ${checks.passing}`} tone={checks.passing > 0 ? 'success' : 'neutral'} />
        <SummaryCountPill label={`Failing ${checks.failing}`} tone={checks.failing > 0 ? 'danger' : 'neutral'} />
        <SummaryCountPill label={`Pending ${checks.pending}`} tone={checks.pending > 0 ? 'warning' : 'neutral'} />
      </div>

      {checks.failingChecks.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Failing checks</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {checks.failingChecks.map((check) => (
              <li key={`${check.name}-${check.detailsUrl ?? 'check'}`}>
                <strong style={{ color: 'var(--text-primary)' }}>{check.name}</strong>
                {check.summary ? ` — ${check.summary}` : ''}
                {check.detailsUrl && (
                  <>
                    {' · '}
                    <a
                      href={check.detailsUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'rgb(29, 78, 216)', fontWeight: 700 }}
                    >
                      Details
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {handoff && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Continue the failing-check fix from this PR context in the existing chat loop.
          </div>
          <button type="button" onClick={() => onLaunchFixHandoff(handoff)} disabled={!sessionReady} style={secondaryButtonStyle(!sessionReady)}>
            Fix in chat
          </button>
        </div>
      )}
    </section>
  );
}

function LinkedPullRequestReviewCard({
  review,
  sessionReady,
  handoff,
  onLaunchFixHandoff,
}: {
  review: WorkspaceLinkedPullRequestReviewSummary;
  sessionReady: boolean;
  handoff?: SessionChatRequest['shipFixHandoff'];
  onLaunchFixHandoff: (handoff: SessionChatRequest['shipFixHandoff']) => void;
}) {
  return (
    <section style={summarySectionStyle(resolveReviewTone(review.status))}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Review summary</div>
        <span style={{ ...statusPillStyle(resolveReviewTone(review.status)), fontSize: 10 }}>
          {formatReviewStatus(review.status)}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{review.summary}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <SummaryCountPill
          label={`Requested ${review.requestedReviewerCount}`}
          tone={review.requestedReviewerCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {handoff && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Continue the review follow-up from this PR context in the existing chat loop.
          </div>
          <button type="button" onClick={() => onLaunchFixHandoff(handoff)} disabled={!sessionReady} style={secondaryButtonStyle(!sessionReady)}>
            Address in chat
          </button>
        </div>
      )}
    </section>
  );
}

function buildCheckFixHandoff(
  linkedPullRequest: WorkspaceLinkedPullRequestSummary,
): SessionChatRequest['shipFixHandoff'] | undefined {
  const checks = linkedPullRequest.checks;
  if (!linkedPullRequest.linked || !checks || checks.status !== 'failing') {
    return undefined;
  }

  const primaryCheck = checks.failingChecks[0];
  const conditionLabel = primaryCheck?.name ?? checks.summary;
  return {
    taskId: createShipFixTaskId(linkedPullRequest, 'failing-check', conditionLabel),
    title: primaryCheck?.name ? `Fix failing check: ${primaryCheck.name}` : 'Fix failing PR checks',
    summary: primaryCheck?.name
      ? `Fix handoff from failing check ${primaryCheck.name}.`
      : 'Fix handoff from failing pull request checks.',
    shipState: 'blocked-by-checks',
    ...(resolveProjectedReviewState(linkedPullRequest.review) ? { reviewState: resolveProjectedReviewState(linkedPullRequest.review) } : {}),
    ...(linkedPullRequest.url ? { pullRequestUrl: linkedPullRequest.url } : {}),
    ...(linkedPullRequest.number !== undefined ? { pullRequestNumber: linkedPullRequest.number } : {}),
    conditionKind: 'failing-check',
    conditionLabel,
    ...(primaryCheck?.detailsUrl ? { detailsUrl: primaryCheck.detailsUrl } : {}),
  };
}

function buildReviewFixHandoff(
  linkedPullRequest: WorkspaceLinkedPullRequestSummary,
): SessionChatRequest['shipFixHandoff'] | undefined {
  const review = linkedPullRequest.review;
  if (!linkedPullRequest.linked || !review || review.status === 'approved' || review.status === 'unknown') {
    return undefined;
  }

  const conditionKind = review.status === 'changes_requested' ? 'requested-changes' as const : 'review-feedback' as const;
  const conditionLabel = review.summary;
  return {
    taskId: createShipFixTaskId(linkedPullRequest, conditionKind, conditionLabel),
    title: review.status === 'changes_requested' ? 'Address requested changes' : 'Address review feedback',
    summary: review.status === 'changes_requested'
      ? 'Fix handoff from requested pull request changes.'
      : 'Fix handoff from pull request review feedback.',
    shipState: review.status === 'changes_requested' ? 'blocked-by-requested-changes' : 'not-ready',
    ...(resolveProjectedReviewState(review) ? { reviewState: resolveProjectedReviewState(review) } : {}),
    ...(linkedPullRequest.url ? { pullRequestUrl: linkedPullRequest.url } : {}),
    ...(linkedPullRequest.number !== undefined ? { pullRequestNumber: linkedPullRequest.number } : {}),
    conditionKind,
    conditionLabel,
  };
}

function resolveProjectedReviewState(
  review: WorkspaceLinkedPullRequestReviewSummary | undefined,
): ResultReviewState | undefined {
  if (!review) return undefined;
  if (review.status === 'approved') return 'ready';
  if (review.status === 'changes_requested') return 'needs-retry';
  if (review.status === 'review_required') return 'approval-needed';
  return undefined;
}

function createShipFixTaskId(
  linkedPullRequest: WorkspaceLinkedPullRequestSummary,
  conditionKind: NonNullable<SessionChatRequest['shipFixHandoff']>['conditionKind'],
  conditionLabel: string,
): string {
  const prToken = linkedPullRequest.number !== undefined
    ? `pr-${linkedPullRequest.number}`
    : linkedPullRequest.url
      ? linkedPullRequest.url.split('/').pop() ?? 'pr'
      : 'pr';
  return `ship-fix-${prToken}-${conditionKind}-${sanitizeTaskToken(conditionLabel)}`;
}

function sanitizeTaskToken(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 40) || 'context';
}

function buildShipFixHandoffPrompt(
  linkedPullRequest: WorkspaceLinkedPullRequestSummary | undefined,
  handoff: NonNullable<SessionChatRequest['shipFixHandoff']>,
): string {
  const prLabel = linkedPullRequest?.number !== undefined ? `PR #${linkedPullRequest.number}` : 'the linked pull request';
  const prTitle = linkedPullRequest?.title ? ` (${linkedPullRequest.title})` : '';
  const prUrl = handoff.pullRequestUrl ? `\nPR URL: ${handoff.pullRequestUrl}` : '';
  const detailsUrl = handoff.detailsUrl ? `\nCondition details: ${handoff.detailsUrl}` : '';
  const reviewLine = handoff.reviewState ? `\nProjected review state: ${handoff.reviewState}.` : '';
  const conditionLead = handoff.conditionKind === 'failing-check'
    ? `Failing check: ${handoff.conditionLabel}.`
    : handoff.conditionKind === 'requested-changes'
      ? `Requested changes: ${handoff.conditionLabel}.`
      : `Review feedback: ${handoff.conditionLabel}.`;

  return [
    `Continue the fix handoff for ${prLabel}${prTitle} in this session.`,
    '',
    conditionLead,
    `Projected ship state: ${handoff.shipState}.${reviewLine}`.trim(),
    handoff.summary,
    `${prUrl}${detailsUrl}`.trim(),
    '',
    'Stay in the current workspace/session chat loop, address the blocking ship condition, and explain the next concrete fix steps.',
  ].filter(Boolean).join('\n');
}

function createOptimisticUserMessage(workspaceId: string, sessionId: string, text: string): NormalizedMessage {
  const id = `local-user-${crypto.randomUUID()}`;
  return {
    id,
    role: 'user',
    createdAt: new Date().toISOString(),
    parts: [{ type: 'text', text }],
    trace: {
      sourceMessageId: id,
      workspaceId,
      sessionId,
    },
  };
}

function buildShipFixHandoffRecord(
  workspaceId: string,
  sessionId: string,
  sourceMessageId: string,
  handoff: NonNullable<SessionChatRequest['shipFixHandoff']>,
): TaskLedgerRecord {
  const timestamp = new Date().toISOString();
  return {
    taskId: handoff.taskId,
    workspaceId,
    sessionId,
    sourceMessageId,
    title: handoff.title,
    summary: handoff.summary,
    state: 'blocked',
    createdAt: timestamp,
    updatedAt: timestamp,
    resultAnnotation: {
      sourceMessageId,
      workspaceId,
      sessionId,
      taskId: handoff.taskId,
      summary: handoff.summary,
      verification: 'unverified',
      ...(handoff.reviewState ? { reviewState: handoff.reviewState } : {}),
      shipState: handoff.shipState,
    },
    recentShipRef: {
      action: 'pullRequest',
      outcome: 'blocked',
      sessionId,
      messageId: sourceMessageId,
      taskId: handoff.taskId,
      ...(handoff.pullRequestUrl ? { pullRequestUrl: handoff.pullRequestUrl } : {}),
      ...(handoff.pullRequestNumber !== undefined ? { pullRequestNumber: handoff.pullRequestNumber } : {}),
      conditionKind: handoff.conditionKind,
      conditionLabel: handoff.conditionLabel,
      ...(handoff.detailsUrl ? { detailsUrl: handoff.detailsUrl } : {}),
    },
  };
}

function upsertTaskLedgerRecords(
  records: TaskLedgerRecord[] | undefined,
  nextRecord: TaskLedgerRecord,
): TaskLedgerRecord[] {
  const nextRecords = [...(records ?? [])];
  const existingIndex = nextRecords.findIndex((record) => record.taskId === nextRecord.taskId);
  if (existingIndex >= 0) {
    nextRecords[existingIndex] = nextRecord;
  } else {
    nextRecords.unshift(nextRecord);
  }
  return nextRecords;
}

function SummaryCountPill({ label, tone }: { label: string; tone: SurfaceTone }) {
  return <span style={{ ...statusPillStyle(tone), fontSize: 10 }}>{label}</span>;
}

function StatusBannerCard({ banner }: { banner: StatusBannerModel }) {
  const palette = tonePalette(banner.tone);
  const extraIssues = banner.issues.slice(1);

  return (
    <section
      className="oc-surface-card"
      style={{
        padding: 14,
        display: 'grid',
        gap: 10,
        border: `1px solid ${palette.border}`,
        background: palette.background,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>{banner.title}</div>
        <span style={{ ...statusPillStyle(banner.tone), fontSize: 10 }}>{formatBannerKind(banner.kind)}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{banner.summary}</div>

      {banner.detail && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{banner.detail}</div>
      )}

      {banner.remediation && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Next:</strong> {banner.remediation}
        </div>
      )}

      {extraIssues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {extraIssues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeBucketCard({
  label,
  bucket,
  tone,
  emptyLabel,
}: {
  label: string;
  bucket: GitStatusPathBucket;
  tone: SurfaceTone;
  emptyLabel: string;
}) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <span style={{ ...statusPillStyle(bucket.count > 0 ? tone : 'neutral'), fontSize: 10 }}>
          {formatFileCount(bucket.count)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {bucket.count > 0 ? summarizeBucketPaths(bucket) : emptyLabel}
      </div>

      {bucket.paths.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {bucket.paths.map((path) => (
            <span
              key={path}
              style={{
                padding: '4px 8px',
                borderRadius: 999,
                border: '1px solid rgba(15, 23, 42, 0.08)',
                background: 'rgba(15, 23, 42, 0.04)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
              }}
            >
              {path}
            </span>
          ))}
          {bucket.truncated && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>+ more</span>
          )}
        </div>
      )}
    </section>
  );
}

function ActionCard({
  card,
  onAction,
  actionLabel,
  busy = false,
  busyLabel,
  active = false,
}: {
  card: ActionCardModel;
  onAction?: () => void;
  actionLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  active?: boolean;
}) {
  const tone = card.state === 'ready' ? 'success' : card.state === 'blocked' ? 'warning' : 'danger';
  const buttonDisabled = !onAction || busy;
  const buttonLabel = busy ? busyLabel ?? card.controlLabel : actionLabel ?? card.controlLabel;
  const stateLabel = onAction ? 'Ready' : formatActionState(card.state);

  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{card.label}</div>
        <span style={{ ...statusPillStyle(tone), fontSize: 10 }}>{stateLabel}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{card.summary}</div>

      {card.detail && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>{card.detail}</div>
      )}

      {card.remediation && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Next:</strong> {card.remediation}
        </div>
      )}

      <button type="button" onClick={onAction} disabled={buttonDisabled} style={actionButtonStyle(card.state, buttonDisabled, !!onAction, active)}>
        {buttonLabel}
      </button>
    </section>
  );
}

function CommitPreviewCard({
  workspaceLabel,
  previewResult,
  executionResult,
  draftMessage,
  loading,
  executing,
  flowError,
  onDraftMessageChange,
  onRefresh,
  onClose,
  onConfirm,
}: {
  workspaceLabel: string;
  previewResult?: CommitPreviewResult;
  executionResult?: CommitExecuteResult;
  draftMessage: string;
  loading: boolean;
  executing: boolean;
  flowError: string | null;
  onDraftMessageChange: (value: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const previewBanner = resolveCommitPreviewBanner(previewResult, flowError, workspaceLabel);
  const executionBanner = executionResult && executionResult.outcome !== 'success' && executionResult.outcome !== 'degraded'
    ? resolveCommitExecutionBanner(executionResult, workspaceLabel)
    : undefined;
  const previewStatus = previewResult?.status.data;
  const canConfirm = previewResult?.outcome === 'success' && draftMessage.trim().length > 0 && !loading && !executing;

  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Commit preview</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Review the latest workspace-scoped status snapshot and drafted message for {workspaceLabel} before running the foreground commit.
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={loading || executing} style={secondaryButtonStyle(loading || executing)}>
          Close preview
        </button>
      </div>

      {executionBanner && <OutcomeBannerCard banner={executionBanner} />}
      {previewBanner && <OutcomeBannerCard banner={previewBanner} />}

      {loading && !previewStatus && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Loading the latest commit preview for this workspace.
        </div>
      )}

      {previewStatus && <CommitStatusPreview snapshot={previewStatus} />}

      {(previewResult?.draftMessage !== undefined || draftMessage.length > 0 || previewResult?.outcome === 'success' || previewResult?.outcome === 'blocked') && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Draft commit message</span>
          <textarea
            value={draftMessage}
            onChange={(event) => onDraftMessageChange(event.target.value)}
            disabled={executing}
            rows={3}
            style={textAreaStyle(executing)}
          />
        </label>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This flow stays in the foreground for the selected workspace only. No background ship task is queued.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onRefresh} disabled={loading || executing} style={secondaryButtonStyle(loading || executing)}>
            {loading ? 'Refreshing preview…' : 'Refresh preview'}
          </button>
          <button type="button" onClick={onConfirm} disabled={!canConfirm} style={primaryActionButtonStyle(!canConfirm)}>
            {executing ? 'Committing…' : 'Confirm commit'}
          </button>
        </div>
      </div>
    </section>
  );
}

function CommitExecutionCard({ workspaceLabel, result }: { workspaceLabel: string; result: CommitExecuteResult }) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Commit result</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The latest foreground commit attempt for {workspaceLabel} is shown here.
        </div>
      </div>

      <OutcomeBannerCard banner={resolveCommitExecutionBanner(result, workspaceLabel)} />
    </section>
  );
}

function PushExecutionCard({
  workspaceLabel,
  result,
  flowError,
}: {
  workspaceLabel: string;
  result?: PushResult;
  flowError: string | null;
}) {
  const banner = resolvePushExecutionBanner(result, flowError, workspaceLabel);
  const upstream = result?.status.data?.upstream ?? result?.upstream;

  if (!banner) {
    return null;
  }

  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Push result</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The latest foreground push attempt for {workspaceLabel} is shown here.
        </div>
      </div>

      <OutcomeBannerCard banner={banner} />

      {upstream && (
        <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>Upstream:</strong> {describeUpstreamStatus(upstream)}</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>Ahead / behind:</strong> {upstream.ahead} ahead · {upstream.behind} behind</div>
        </div>
      )}
    </section>
  );
}

function PullRequestExecutionCard({
  workspaceLabel,
  result,
  flowError,
}: {
  workspaceLabel: string;
  result?: PullRequestCreateResult;
  flowError: string | null;
}) {
  const banner = resolvePullRequestExecutionBanner(result, flowError, workspaceLabel);
  const pullRequestUrl = result?.pullRequest?.url;

  if (!banner && !pullRequestUrl) {
    return null;
  }

  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Pull request result</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The latest foreground pull request attempt for {workspaceLabel} is shown here.
        </div>
      </div>

      {banner && <OutcomeBannerCard banner={banner} />}

      {pullRequestUrl && (
        <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>PR URL:</strong></div>
          <a
            href={pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'rgb(29, 78, 216)', fontWeight: 700, wordBreak: 'break-all' }}
          >
            {pullRequestUrl}
          </a>
        </div>
      )}
    </section>
  );
}

function CommitStatusPreview({ snapshot }: { snapshot: WorkspaceGitStatusSnapshot }) {
  const staged = snapshot.changeSummary.staged;
  const unstaged = snapshot.changeSummary.unstaged;
  const untracked = snapshot.changeSummary.untracked;

  return (
    <section style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px solid rgba(15, 23, 42, 0.08)', background: 'rgba(15, 23, 42, 0.03)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Workspace status preview</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Checked {formatCheckedAt(snapshot.checkedAt)}</div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Branch <strong style={{ color: 'var(--text-primary)' }}>{formatBranchLabel(snapshot)}</strong> · {describeUpstreamStatus(snapshot.upstream)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...statusPillStyle(staged.count > 0 ? 'success' : 'neutral'), fontSize: 10 }}>Staged {staged.count}</span>
        <span style={{ ...statusPillStyle(unstaged.count > 0 ? 'warning' : 'neutral'), fontSize: 10 }}>Unstaged {unstaged.count}</span>
        <span style={{ ...statusPillStyle(untracked.count > 0 ? 'neutral' : 'neutral'), fontSize: 10 }}>Untracked {untracked.count}</span>
      </div>

      <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <div><strong style={{ color: 'var(--text-primary)' }}>Ready to commit:</strong> {staged.count > 0 ? summarizeBucketPaths(staged) : 'No staged files are ready right now.'}</div>
        {unstaged.count > 0 && <div><strong style={{ color: 'var(--text-primary)' }}>Also unstaged:</strong> {summarizeBucketPaths(unstaged)}</div>}
        {untracked.count > 0 && <div><strong style={{ color: 'var(--text-primary)' }}>Also untracked:</strong> {summarizeBucketPaths(untracked)}</div>}
      </div>
    </section>
  );
}

function OutcomeBannerCard({ banner }: { banner: OutcomeBannerModel }) {
  const palette = tonePalette(banner.tone);

  return (
    <section
      style={{
        padding: 12,
        display: 'grid',
        gap: 8,
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.background,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>{banner.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{banner.summary}</div>
      {banner.detail && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{banner.detail}</div>
      )}
      {banner.remediation && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Next:</strong> {banner.remediation}
        </div>
      )}
    </section>
  );
}

function MetricPill({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: SurfaceTone;
  icon: React.ReactNode;
}) {
  return (
    <span style={{ ...statusPillStyle(tone), minHeight: 30 }}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function EmptyPanelState({ title, body }: { title: string; body: string }) {
  return (
    <div className="oc-surface-card" style={{ padding: 16, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function resolveStatusBanner(
  status: WorkspaceGitStatusResult | undefined,
  capabilities: WorkspaceCapabilityProbe | undefined,
  workspaceLabel: string,
): StatusBannerModel | undefined {
  if (status?.data) {
    return status.outcome === 'success'
      ? undefined
      : buildStatusIssueBanner(status, workspaceLabel, false);
  }

  if (status) {
    return buildStatusIssueBanner(status, workspaceLabel, true);
  }

  const localGit = capabilities?.localGit;
  if (localGit && localGit.status !== 'available') {
    return {
      tone: localGit.status === 'error' ? 'danger' : 'warning',
      title: `Git status unavailable for ${workspaceLabel}`,
      summary: localGit.summary,
      detail: localGit.detail,
      kind: 'status-unavailable',
      issues: [],
    };
  }

  return {
    tone: 'neutral',
    title: `Git status not loaded for ${workspaceLabel}`,
    summary: 'Refresh this workspace surface to load branch, upstream, and change summary data.',
    detail: 'This is a neutral loading gap, not the same as a clean no-changes state.',
    kind: 'status-idle',
    issues: [],
  };
}

function buildStatusIssueBanner(
  status: WorkspaceGitStatusResult,
  workspaceLabel: string,
  missingSnapshot: boolean,
): StatusBannerModel {
  const issue = status.issues[0];
  const tone = status.outcome === 'failure' ? 'danger' : 'warning';
  const fallbackTitle = status.outcome === 'failure'
    ? `Git status failed for ${workspaceLabel}`
    : `Git status unavailable for ${workspaceLabel}`;

  if (!issue && missingSnapshot) {
    return {
      tone,
      title: `Git status is incomplete for ${workspaceLabel}`,
      summary: 'A workspace-scoped git status snapshot was not returned.',
      detail: 'Refresh this surface to retry the status request before using ship actions.',
      kind: 'status-incomplete',
      issues: [],
    };
  }

  return {
    tone,
    title: fallbackTitle,
    summary: issue?.message ?? 'Workspace git status could not be resolved.',
    detail: issue?.detail,
    remediation: issue?.remediation,
    kind: missingSnapshot ? 'status-unavailable' : 'status-incomplete',
    issues: status.issues,
  };
}

function buildActionCards(
  snapshot: WorkspaceGitStatusSnapshot | undefined,
  statusBanner: StatusBannerModel | undefined,
  hasSession: boolean,
): ActionCardModel[] {
  const unresolvedStatusDetail = statusBanner?.kind === 'status-idle'
    ? 'Refresh the ship surface to load a workspace-scoped status snapshot first.'
    : statusBanner?.remediation ?? statusBanner?.detail ?? statusBanner?.summary;

  const cards = !snapshot
    ? [
        createUnavailableAction('commit', 'Commit', 'Commit is unavailable until workspace git status resolves.', unresolvedStatusDetail),
        createUnavailableAction('push', 'Push', 'Push is unavailable until workspace git status resolves.', unresolvedStatusDetail),
        createUnavailableAction('pullRequest', 'Pull request', 'Pull request availability depends on workspace git status and capability checks.', unresolvedStatusDetail),
      ]
    : [
        createCommitCard(snapshot),
        createPushCard(snapshot),
        createPullRequestCard(snapshot.pullRequest),
      ];

  return cards.map((card) => {
    if (!hasSession && card.state === 'ready') {
      return {
        ...card,
        state: 'blocked',
        detail: joinDetails(card.detail, 'Select an active chat session to use this foreground ship flow.'),
        controlLabel: 'Select chat to continue',
      };
    }

    return card;
  });
}

function createCommitCard(snapshot: WorkspaceGitStatusSnapshot): ActionCardModel {
  if (!snapshot.changeSummary.hasStagedChanges) {
    return {
      key: 'commit',
      label: 'Commit',
      state: 'blocked',
      summary: 'No staged changes are ready to commit in this workspace.',
      detail: 'Stage files with your preferred git workflow, then refresh the ship surface.',
      controlLabel: 'Commit blocked',
    };
  }

  return {
    key: 'commit',
    label: 'Commit',
    state: 'ready',
    summary: `${formatFileCount(snapshot.changeSummary.staged.count)} ready to commit.`,
    detail: 'Preview the latest workspace status and drafted message before running the foreground commit.',
    controlLabel: 'Preview commit',
  };
}

function createPushCard(snapshot: WorkspaceGitStatusSnapshot): ActionCardModel {
  const upstream = snapshot.upstream;
  if (upstream.status !== 'tracked') {
    return {
      key: 'push',
      label: 'Push',
      state: 'blocked',
      summary: 'Push is blocked because no tracked upstream is available for this workspace.',
      detail: 'Configure an upstream branch before using the push flow from the ship surface.',
      controlLabel: 'Push blocked',
    };
  }

  if (upstream.ahead <= 0) {
    return {
      key: 'push',
      label: 'Push',
      state: 'blocked',
      summary: `No local commits are ahead of ${formatUpstreamRef(upstream)}.`,
      detail: 'Push becomes available after the workspace has local commits ready to publish.',
      controlLabel: 'Push blocked',
    };
  }

  return {
    key: 'push',
    label: 'Push',
    state: 'ready',
    summary: `Ready to push ${formatCommitCount(upstream.ahead)} to ${formatUpstreamRef(upstream)}.`,
    detail: 'Run a foreground push for the tracked upstream shown above. Phase C does not create or change upstream tracking automatically.',
    controlLabel: 'Push now',
  };
}

function createPullRequestCard(capability: WorkspacePullRequestCapability): ActionCardModel {
  if (capability.supported && capability.outcome === 'success') {
    return {
      key: 'pullRequest',
      label: 'Pull request',
      state: 'ready',
      summary: capability.summary || 'Pull request creation is ready for this workspace.',
      detail: 'Create a foreground pull request through the existing OpenCode shell seam. Phase C does not set auth, remotes, or upstream tracking automatically.',
      controlLabel: 'Create pull request',
    };
  }

  return {
    key: 'pullRequest',
    label: 'Pull request',
    state: capability.outcome === 'blocked' ? 'blocked' : 'unavailable',
    summary: capability.summary || 'Pull request creation is currently unavailable.',
    detail: joinDetails(capability.detail, capability.issues[0]?.detail),
    remediation: capability.remediation,
    controlLabel: capability.outcome === 'blocked' ? 'PR blocked' : 'PR unavailable',
  };
}

function createUnavailableAction(
  key: ActionCardModel['key'],
  label: string,
  summary: string,
  detail?: string,
): ActionCardModel {
  return {
    key,
    label,
    state: 'unavailable',
    summary,
    detail,
    controlLabel: `${label} unavailable`,
  };
}

function resolveCommitPreviewBanner(
  previewResult: CommitPreviewResult | undefined,
  flowError: string | null,
  workspaceLabel: string,
): OutcomeBannerModel | undefined {
  if (flowError) {
    return {
      tone: 'danger',
      title: `Commit preview failed for ${workspaceLabel}`,
      summary: flowError,
    };
  }

  if (!previewResult) {
    return undefined;
  }

  const issue = previewResult.issues[0];
  if (previewResult.outcome === 'success') {
    return {
      tone: 'neutral',
      title: `Commit preview ready for ${workspaceLabel}`,
      summary: 'Review the staged snapshot and drafted message, then confirm the foreground commit when ready.',
    };
  }

  return {
    tone: previewResult.outcome === 'failure' ? 'danger' : 'warning',
    title: previewResult.outcome === 'failure'
      ? `Commit preview failed for ${workspaceLabel}`
      : `Commit preview needs attention for ${workspaceLabel}`,
    summary: issue?.message ?? 'The commit preview could not complete cleanly.',
    detail: issue?.detail,
    remediation: issue?.remediation,
  };
}

function resolveCommitExecutionBanner(
  result: CommitExecuteResult,
  workspaceLabel: string,
): OutcomeBannerModel {
  const issue = result.issues[0];
  const commitMessage = result.commit?.message?.trim();
  const commitRef = result.commit?.sha ? `commit ${result.commit.sha.slice(0, 7)}` : 'the commit';

  if (result.outcome === 'success') {
    return {
      tone: 'success',
      title: `Commit completed for ${workspaceLabel}`,
      summary: commitMessage
        ? `Created ${commitRef} with message “${commitMessage}”.`
        : `Created ${commitRef} for ${workspaceLabel}.`,
      detail: 'Workspace ship state refreshed after the foreground commit.',
    };
  }

  if (result.outcome === 'degraded') {
    return {
      tone: 'warning',
      title: `Commit completed with refresh warning for ${workspaceLabel}`,
      summary: commitMessage
        ? `Created ${commitRef} with message “${commitMessage}”, but the refreshed ship state needs attention.`
        : 'The commit finished, but the refreshed ship state needs attention.',
      detail: issue?.detail ?? issue?.message,
      remediation: issue?.remediation,
    };
  }

  if (result.outcome === 'blocked') {
    return {
      tone: 'warning',
      title: `Commit is blocked for ${workspaceLabel}`,
      summary: issue?.message ?? 'The commit action is currently blocked.',
      detail: issue?.detail,
      remediation: issue?.remediation,
    };
  }

  if (issue?.code === 'COMMIT_HOOK_REJECTED') {
    return {
      tone: 'danger',
      title: `Commit rejected by hook for ${workspaceLabel}`,
      summary: 'A git hook stopped the foreground commit. No success state was recorded.',
      detail: issue.detail,
      remediation: issue.remediation,
    };
  }

  return {
    tone: 'danger',
    title: `Commit failed for ${workspaceLabel}`,
    summary: issue?.message ?? 'The foreground commit did not complete successfully.',
    detail: issue?.detail,
    remediation: issue?.remediation,
  };
}

function resolvePushExecutionBanner(
  result: PushResult | undefined,
  flowError: string | null,
  workspaceLabel: string,
): OutcomeBannerModel | undefined {
  if (flowError) {
    return {
      tone: 'danger',
      title: `Push failed for ${workspaceLabel}`,
      summary: flowError,
    };
  }

  if (!result) {
    return undefined;
  }

  const issue = result.issues[0];
  const upstream = result.status.data?.upstream ?? result.upstream;
  const upstreamRef = upstream?.status === 'tracked' ? formatUpstreamRef(upstream) : undefined;

  if (result.outcome === 'success') {
    return {
      tone: 'success',
      title: `Push completed for ${workspaceLabel}`,
      summary: upstreamRef
        ? `Foreground push completed for ${upstreamRef}.`
        : 'Foreground push completed for this workspace.',
      detail: 'Workspace ahead/behind refreshed after the foreground push.',
    };
  }

  if (result.outcome === 'degraded') {
    return {
      tone: 'warning',
      title: `Push completed with refresh warning for ${workspaceLabel}`,
      summary: upstreamRef
        ? `Foreground push completed for ${upstreamRef}, but the refreshed ship state needs attention.`
        : 'The push finished, but the refreshed ship state needs attention.',
      detail: issue?.detail ?? issue?.message,
      remediation: issue?.remediation,
    };
  }

  if (result.outcome === 'blocked') {
    return {
      tone: 'warning',
      title: `Push is blocked for ${workspaceLabel}`,
      summary: issue?.message ?? 'The push action is currently blocked.',
      detail: issue?.detail,
      remediation: issue?.remediation,
    };
  }

  return {
    tone: 'danger',
    title: `Push failed for ${workspaceLabel}`,
    summary: issue?.message ?? 'The foreground push did not complete successfully.',
    detail: issue?.detail,
    remediation: issue?.remediation,
  };
}

function resolvePullRequestExecutionBanner(
  result: PullRequestCreateResult | undefined,
  flowError: string | null,
  workspaceLabel: string,
): OutcomeBannerModel | undefined {
  if (flowError) {
    return {
      tone: 'danger',
      title: `Pull request failed for ${workspaceLabel}`,
      summary: flowError,
    };
  }

  if (!result) {
    return undefined;
  }

  const issue = result.issues[0];

  if (result.outcome === 'success') {
    return {
      tone: 'success',
      title: `Pull request created for ${workspaceLabel}`,
      summary: 'Foreground pull request creation completed successfully.',
      detail: 'The created PR URL is shown below.',
    };
  }

  if (result.outcome === 'degraded') {
    return {
      tone: 'warning',
      title: `Pull request created with refresh warning for ${workspaceLabel}`,
      summary: 'The pull request was created, but the refreshed ship state needs attention.',
      detail: issue?.detail ?? issue?.message,
      remediation: issue?.remediation,
    };
  }

  if (result.outcome === 'blocked') {
    return {
      tone: 'warning',
      title: `Pull request is blocked for ${workspaceLabel}`,
      summary: issue?.message ?? 'The pull request action is currently blocked.',
      detail: issue?.detail,
      remediation: issue?.remediation,
    };
  }

  return {
    tone: 'danger',
    title: `Pull request failed for ${workspaceLabel}`,
    summary: issue?.message ?? 'The foreground pull request did not complete successfully.',
    detail: issue?.detail,
    remediation: issue?.remediation,
  };
}

function resolveLinkedPullRequestSurface(
  linkedPullRequest: WorkspaceLinkedPullRequestSummary,
): LinkedPullRequestSurfaceModel {
  if (!linkedPullRequest.linked) {
    return {
      tone: linkedPullRequest.outcome === 'failure' ? 'danger' : 'warning',
      stateLabel: linkedPullRequest.outcome === 'failure' ? 'Unavailable' : 'Degraded',
    };
  }

  if (linkedPullRequest.review?.status === 'changes_requested' || linkedPullRequest.checks?.status === 'failing') {
    return { tone: 'warning', stateLabel: 'Blocked' };
  }

  if (linkedPullRequest.review?.status === 'review_required' || linkedPullRequest.checks?.status === 'pending') {
    return { tone: 'neutral', stateLabel: 'In review' };
  }

  return { tone: 'success', stateLabel: 'Ready' };
}

function resolveChecksTone(status: WorkspaceLinkedPullRequestChecksSummary['status']): SurfaceTone {
  if (status === 'passing') return 'success';
  if (status === 'failing') return 'danger';
  if (status === 'pending') return 'warning';
  return 'neutral';
}

function resolveReviewTone(status: WorkspaceLinkedPullRequestReviewSummary['status']): SurfaceTone {
  if (status === 'approved') return 'success';
  if (status === 'changes_requested') return 'danger';
  if (status === 'review_required') return 'warning';
  return 'neutral';
}

function formatChecksStatus(status: WorkspaceLinkedPullRequestChecksSummary['status']): string {
  if (status === 'passing') return 'Passing';
  if (status === 'failing') return 'Failing';
  if (status === 'pending') return 'Pending';
  return 'No checks';
}

function formatReviewStatus(status: WorkspaceLinkedPullRequestReviewSummary['status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'changes_requested') return 'Changes requested';
  if (status === 'review_required') return 'Review required';
  return 'Unknown';
}

function formatLinkedPullRequestState(linkedPullRequest: WorkspaceLinkedPullRequestSummary): string {
  const state = linkedPullRequest.state
    ? linkedPullRequest.state.charAt(0).toUpperCase() + linkedPullRequest.state.slice(1).toLowerCase()
    : 'Unknown';
  return linkedPullRequest.isDraft ? `${state} · Draft` : state;
}

function formatBranchLabel(snapshot: WorkspaceGitStatusSnapshot): string {
  if (!snapshot.branch.detached) {
    return snapshot.branch.name ?? 'Unknown branch';
  }

  const sha = snapshot.branch.headSha?.slice(0, 7);
  return sha ? `Detached @ ${sha}` : 'Detached HEAD';
}

function describeUpstreamStatus(upstream: WorkspaceGitUpstreamState): string {
  if (upstream.status === 'tracked') {
    const provider = upstream.remoteProvider && upstream.remoteProvider !== 'unknown'
      ? ` · ${upstream.remoteProvider}`
      : upstream.remoteHost
        ? ` · ${upstream.remoteHost}`
        : '';
    return `Tracking ${formatUpstreamRef(upstream)}${provider}`;
  }

  if (upstream.status === 'missing') {
    return 'No tracked upstream is configured for the current branch.';
  }

  if (upstream.status === 'detached') {
    return 'Detached HEAD has no push target until a branch is checked out.';
  }

  return 'Upstream tracking information is unavailable for this workspace.';
}

function formatUpstreamRef(upstream: WorkspaceGitUpstreamState): string {
  return upstream.ref ?? ([upstream.remote, upstream.branch].filter(Boolean).join('/') || 'the upstream branch');
}

function summarizeBucketPaths(bucket: GitStatusPathBucket): string {
  if (bucket.count === 1) {
    return `1 file: ${bucket.paths[0] ?? 'changed path'}`;
  }

  const visible = bucket.paths.slice(0, 2);
  const extra = bucket.count - visible.length;
  return extra > 0
    ? `${formatFileCount(bucket.count)} including ${visible.join(', ')} and ${extra} more.`
    : `${formatFileCount(bucket.count)}: ${visible.join(', ')}`;
}

function formatCheckedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatBannerKind(kind: StatusBannerModel['kind']): string {
  if (kind === 'status-idle') return 'Not loaded';
  if (kind === 'status-incomplete') return 'Needs refresh';
  return 'Unavailable';
}

function formatActionState(state: ActionState): string {
  if (state === 'ready') return 'Ready next';
  return state === 'blocked' ? 'Blocked' : 'Unavailable';
}

function formatFileCount(count: number): string {
  return `${count} file${count === 1 ? '' : 's'}`;
}

function formatCommitCount(count: number): string {
  return `${count} commit${count === 1 ? '' : 's'}`;
}

function joinDetails(...parts: Array<string | undefined>): string | undefined {
  const normalized = parts.reduce<string[]>((acc, part) => {
    const value = part?.trim();
    if (!value || acc.includes(value)) {
      return acc;
    }
    acc.push(value);
    return acc;
  }, []);
  return normalized.length > 0 ? normalized.join(' ') : undefined;
}

function tonePalette(tone: SurfaceTone): { text: string; border: string; background: string } {
  if (tone === 'success') {
    return { text: 'var(--success)', border: 'rgba(16, 163, 127, 0.18)', background: 'var(--success-soft)' };
  }
  if (tone === 'warning') {
    return { text: 'var(--warning)', border: 'rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)' };
  }
  if (tone === 'danger') {
    return { text: 'var(--error)', border: 'rgba(220, 38, 38, 0.18)', background: 'var(--error-soft)' };
  }
  return { text: 'var(--text-secondary)', border: 'rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)' };
}

function summarySectionStyle(tone: SurfaceTone): React.CSSProperties {
  const palette = tonePalette(tone);
  return {
    display: 'grid',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${palette.border}`,
    background: palette.background,
  };
}

function statusPillStyle(tone: SurfaceTone): React.CSSProperties {
  const palette = tonePalette(tone);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    padding: '2px 10px',
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.text,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontSize: 10,
  };
}

function actionButtonStyle(
  state: ActionState,
  disabled: boolean,
  interactive: boolean,
  active = false,
): React.CSSProperties {
  const palette = state === 'ready'
    ? { background: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.18)', text: 'rgb(29, 78, 216)' }
    : state === 'blocked'
      ? { background: 'var(--warning-soft)', border: 'rgba(183, 121, 31, 0.2)', text: 'var(--warning)' }
      : { background: 'var(--error-soft)', border: 'rgba(220, 38, 38, 0.18)', text: 'var(--error)' };

  return {
    minHeight: 32,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: disabled
      ? 'rgba(148, 163, 184, 0.14)'
      : active && interactive
        ? 'rgba(37, 99, 235, 0.14)'
        : palette.background,
    color: disabled ? 'var(--text-muted)' : palette.text,
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: 1,
  };
}

function primaryActionButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 32,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid rgba(37, 99, 235, 0.18)',
    background: disabled ? 'rgba(148, 163, 184, 0.14)' : 'rgba(37, 99, 235, 0.1)',
    color: disabled ? 'var(--text-muted)' : 'rgb(29, 78, 216)',
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid rgba(15, 23, 42, 0.12)',
    background: disabled ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.04)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function textAreaStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 84,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(15, 23, 42, 0.12)',
    background: disabled ? 'rgba(148, 163, 184, 0.08)' : 'var(--surface-elevated, white)',
    color: 'var(--text-primary)',
    fontSize: 12,
    lineHeight: 1.6,
    resize: 'vertical',
    fontFamily: 'inherit',
  };
}
