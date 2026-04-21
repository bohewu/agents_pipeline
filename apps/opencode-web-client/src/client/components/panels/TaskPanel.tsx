import React from 'react';
import type { TaskLedgerRecord, TaskLedgerShipReference, VerificationRunStatus } from '../../../shared/types.js';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { reopenWorkspaceSessionContext } from '../../lib/session-context.js';

const ACTIVE_TASK_STATES = new Set<TaskLedgerRecord['state']>(['queued', 'running']);
const RECENT_COMPLETED_TASK_STATES = new Set<TaskLedgerRecord['state']>(['completed', 'failed', 'cancelled']);
const CANCELLABLE_TASK_STATES = new Set<TaskLedgerRecord['state']>(['queued', 'running']);
const RETRYABLE_TASK_STATES = new Set<TaskLedgerRecord['state']>(['blocked', 'completed', 'failed', 'cancelled']);
const REOPENABLE_TASK_STATES = new Set<TaskLedgerRecord['state']>(['completed', 'failed', 'cancelled']);
const EMPTY_TASK_RECORDS: TaskLedgerRecord[] = [];

export function TaskPanel() {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaceBootstraps = useStore((state) => state.workspaceBootstraps);

  const activeBootstrap = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId] : undefined;
  const records = activeBootstrap?.taskLedgerRecords ?? EMPTY_TASK_RECORDS;
  const workspaceName = activeBootstrap?.workspace.name ?? activeWorkspaceId;
  const activeTasks = React.useMemo(
    () => records.filter((record) => ACTIVE_TASK_STATES.has(record.state)),
    [records],
  );
  const recentCompletedTasks = React.useMemo(
    () => records.filter((record) => RECENT_COMPLETED_TASK_STATES.has(record.state)),
    [records],
  );
  const blockedTasks = React.useMemo(
    () => records.filter((record) => record.state === 'blocked'),
    [records],
  );

  if (!activeWorkspaceId) {
    return <EmptyPanelState title="No workspace selected" body="Choose a workspace to inspect active, recent completed, and blocked tasks." />;
  }

  if (!activeBootstrap) {
    return <EmptyPanelState title="Loading task surfaces" body="Hydrating the workspace-scoped task ledger for the selected workspace." />;
  }

  if (records.length === 0) {
    return (
      <EmptyPanelState
        title="No persisted tasks yet"
        body={`Hydrated Phase D task continuity will appear here for ${workspaceName ?? 'this workspace'} once the workspace ledger has task records.`}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Tasks</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Hydrated task continuity stays scoped to {workspaceName ?? 'this workspace'} so active, recent completed, and blocked work stays visible across refresh and reconnect.
        </div>
      </div>

      <TaskSurfaceSection
        title="Active tasks"
        subtitle="Queued and running work stays visible here for the selected workspace."
        emptyMessage="No queued or running tasks are visible for this workspace right now."
        records={activeTasks}
      />
      <TaskSurfaceSection
        title="Recent completed"
        subtitle="Finished work stays visible here, including failed or cancelled attempts with their latest saved refs."
        emptyMessage="No recently finished tasks are currently visible for this workspace."
        records={recentCompletedTasks}
      />
      <TaskSurfaceSection
        title="Blocked tasks"
        subtitle="Blocked work remains separate so the workspace can surface follow-up context without falling back to a generic shell state."
        emptyMessage="No blocked tasks are currently visible for this workspace."
        records={blockedTasks}
      />
    </div>
  );
}

function TaskSurfaceSection({
  title,
  subtitle,
  emptyMessage,
  records,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  records: TaskLedgerRecord[];
}) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</div>
        </div>
        <span style={{ ...countPillStyle(), fontSize: 10 }}>{formatRecordCount(records.length)}</span>
      </div>

      {records.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{emptyMessage}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {records.map((record) => <TaskRecordCard key={record.taskId} record={record} />)}
        </div>
      )}
    </section>
  );
}

function TaskRecordCard({ record }: { record: TaskLedgerRecord }) {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const setSessionStreaming = useStore((state) => state.setSessionStreaming);
  const setVerificationRuns = useStore((state) => state.setVerificationRuns);
  const [pendingAction, setPendingAction] = React.useState<'cancel' | 'retry' | 'reopen' | null>(null);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);
  const title = record.title?.trim() || record.summary;
  const showSummary = title !== record.summary;
  const sessionId = resolveTaskSessionId(record);
  const sourceMessageId = resolveTaskSourceMessageId(record);
  const canCancel = CANCELLABLE_TASK_STATES.has(record.state) && !!sessionId;
  const canRetry = RETRYABLE_TASK_STATES.has(record.state)
    && !!sessionId
    && !!record.recentVerificationRef
    && record.recentVerificationRef.status !== 'running';
  const canReopen = REOPENABLE_TASK_STATES.has(record.state) && !!sessionId;

  const handleCancel = async () => {
    if (!activeWorkspaceId || activeWorkspaceId !== record.workspaceId || !sessionId) return;

    setPendingAction('cancel');
    setActionFeedback(null);
    setSessionStreaming(activeWorkspaceId, sessionId, false);

    try {
      await api.abort(activeWorkspaceId, sessionId);
      setActionFeedback('Sent an abort request for this task session.');
    } catch (error: any) {
      setActionFeedback(error?.message ?? 'Failed to cancel this task.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleRetry = async () => {
    if (!activeWorkspaceId || activeWorkspaceId !== record.workspaceId || !sessionId || !record.recentVerificationRef) return;

    setPendingAction('retry');
    setActionFeedback(null);
    setSessionStreaming(activeWorkspaceId, sessionId, true);

    try {
      await api.runVerification(activeWorkspaceId, {
        sessionId,
        commandKind: record.recentVerificationRef.commandKind,
        sourceMessageId,
        taskId: record.taskId,
      });
      const nextRuns = await api.listVerificationRuns(activeWorkspaceId);
      setVerificationRuns(activeWorkspaceId, nextRuns);
      setActionFeedback(`Retried ${record.recentVerificationRef.commandKind} verification from this task.`);
    } catch (error: any) {
      setActionFeedback(error?.message ?? `Failed to retry ${record.recentVerificationRef.commandKind} verification.`);
    } finally {
      setSessionStreaming(activeWorkspaceId, sessionId, false);
      setPendingAction(null);
    }
  };

  const handleReopen = async () => {
    if (!activeWorkspaceId || activeWorkspaceId !== record.workspaceId || !sessionId) return;

    setPendingAction('reopen');
    setActionFeedback(null);

    try {
      await reopenWorkspaceSessionContext(activeWorkspaceId, sessionId);
      setActionFeedback('Reopened this task in its saved workspace session.');
    } catch (error: any) {
      setActionFeedback(error?.message ?? 'Failed to reopen this task context.');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <article
      style={{
        padding: 12,
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'var(--bg-secondary)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5 }}>{title}</div>
          {showSummary && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{record.summary}</div>
          )}
        </div>
        <span style={{ ...statusPillStyle(taskStateTone(record.state)), fontSize: 10 }}>{formatTaskState(record.state)}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {record.recentVerificationRef && (
          <span style={{ ...referenceBadgeStyle(referenceTone(record.recentVerificationRef.status)), fontSize: 10 }}>
            {formatVerificationBadge(record.recentVerificationRef.commandKind, record.recentVerificationRef.status)}
          </span>
        )}
        {record.recentShipRef && (
          <span style={{ ...referenceBadgeStyle(referenceTone(record.recentShipRef.outcome)), fontSize: 10 }}>
            {formatShipBadge(record.recentShipRef)}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <div>Task: <span style={monoStyle}>{record.taskId}</span></div>
        {sessionId && <div>Session: <span style={monoStyle}>{sessionId}</span></div>}
        {sourceMessageId && <div>Result: <span style={monoStyle}>{sourceMessageId}</span></div>}
        <div>{formatTaskTimestamp(record)}</div>
        {record.recentVerificationRef?.summary && <div>Verification: {record.recentVerificationRef.summary}</div>}
        {record.recentVerificationRef?.terminalLogRef && (
          <div>
            Verification log: <span style={{ ...monoStyle, wordBreak: 'break-word' }}>{record.recentVerificationRef.terminalLogRef}</span>
          </div>
        )}
        {record.recentShipRef?.commitSha && <div>Commit: <span style={monoStyle}>{record.recentShipRef.commitSha}</span></div>}
        {record.recentShipRef?.pullRequestUrl && (
          <div>
            Pull request: <a href={record.recentShipRef.pullRequestUrl} target="_blank" rel="noreferrer">{record.recentShipRef.pullRequestUrl}</a>
          </div>
        )}
        {record.recentShipRef?.terminalLogRef && (
          <div>
            Ship log: <span style={{ ...monoStyle, wordBreak: 'break-word' }}>{record.recentShipRef.terminalLogRef}</span>
          </div>
        )}
      </div>

      {(canCancel || canRetry || canReopen || actionFeedback) && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(canCancel || canRetry || canReopen) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {canCancel && (
                <TaskActionButton
                  label={pendingAction === 'cancel' ? 'Cancelling…' : 'Cancel'}
                  onClick={() => void handleCancel()}
                  disabled={pendingAction !== null}
                  tone="warning"
                />
              )}
              {canRetry && record.recentVerificationRef && (
                <TaskActionButton
                  label={pendingAction === 'retry' ? `Retrying ${record.recentVerificationRef.commandKind}…` : `Retry ${record.recentVerificationRef.commandKind}`}
                  onClick={() => void handleRetry()}
                  disabled={pendingAction !== null}
                  tone="primary"
                />
              )}
              {canReopen && (
                <TaskActionButton
                  label={pendingAction === 'reopen' ? 'Reopening…' : 'Reopen'}
                  onClick={() => void handleReopen()}
                  disabled={pendingAction !== null}
                />
              )}
            </div>
          )}

          {actionFeedback && (
            <div
              aria-live="polite"
              style={{
                fontSize: 11,
                lineHeight: 1.6,
                color: actionFeedback.toLowerCase().includes('failed') ? 'var(--error)' : 'var(--text-muted)',
              }}
            >
              {actionFeedback}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function TaskActionButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'warning';
}) {
  const palette = tone === 'primary'
    ? { color: 'rgb(29, 78, 216)', border: 'rgba(37, 99, 235, 0.2)', background: 'rgba(37, 99, 235, 0.08)' }
    : tone === 'warning'
      ? { color: 'var(--warning)', border: 'rgba(183, 121, 31, 0.22)', background: 'var(--warning-soft)' }
      : { color: 'var(--text-secondary)', border: 'rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 30,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: disabled ? 'rgba(148, 163, 184, 0.14)' : palette.background,
        color: disabled ? 'var(--text-muted)' : palette.color,
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
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

function formatRecordCount(count: number): string {
  return `${count} task${count === 1 ? '' : 's'}`;
}

function formatTaskState(state: TaskLedgerRecord['state']): string {
  if (state === 'queued') return 'Queued';
  if (state === 'running') return 'Running';
  if (state === 'blocked') return 'Blocked';
  if (state === 'completed') return 'Completed';
  if (state === 'failed') return 'Failed';
  return 'Cancelled';
}

function formatTaskTimestamp(record: TaskLedgerRecord): string {
  if (record.completedAt) {
    return `Completed ${formatTimestamp(record.completedAt)}`;
  }
  return `Updated ${formatTimestamp(record.updatedAt)}`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatVerificationBadge(commandKind: string, status: VerificationRunStatus): string {
  return `${commandKind.charAt(0).toUpperCase() + commandKind.slice(1)} ${formatVerificationStatus(status)}`;
}

function formatVerificationStatus(status: VerificationRunStatus): string {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'running';
  return 'cancelled';
}

function formatShipBadge(reference: TaskLedgerShipReference): string {
  return `${formatShipAction(reference.action)} ${reference.outcome}`;
}

function formatShipAction(action: TaskLedgerShipReference['action']): string {
  if (action === 'pullRequest') return 'PR';
  if (action === 'commit') return 'Commit';
  return 'Push';
}

function resolveTaskSessionId(record: TaskLedgerRecord): string | undefined {
  return record.sessionId ?? record.resultAnnotation?.sessionId ?? record.recentShipRef?.sessionId;
}

function resolveTaskSourceMessageId(record: TaskLedgerRecord): string | undefined {
  return record.sourceMessageId ?? record.resultAnnotation?.sourceMessageId ?? record.recentShipRef?.messageId;
}

function taskStateTone(state: TaskLedgerRecord['state']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (state === 'completed') return 'success';
  if (state === 'blocked') return 'warning';
  if (state === 'failed') return 'danger';
  return 'neutral';
}

function referenceTone(outcome: VerificationRunStatus | TaskLedgerShipReference['outcome']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (outcome === 'passed' || outcome === 'success') return 'success';
  if (outcome === 'blocked' || outcome === 'cancelled') return 'warning';
  if (outcome === 'failed' || outcome === 'failure') return 'danger';
  return 'neutral';
}

function statusPillStyle(tone: 'success' | 'warning' | 'danger' | 'neutral'): React.CSSProperties {
  if (tone === 'success') {
    return { color: 'var(--success)', border: '1px solid rgba(16, 163, 127, 0.18)', background: 'var(--success-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
  }
  if (tone === 'warning') {
    return { color: 'var(--warning)', border: '1px solid rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
  }
  if (tone === 'danger') {
    return { color: 'var(--error)', border: '1px solid rgba(220, 38, 38, 0.18)', background: 'var(--error-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
}

function referenceBadgeStyle(tone: 'success' | 'warning' | 'danger' | 'neutral'): React.CSSProperties {
  return {
    ...statusPillStyle(tone),
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 'normal',
  };
}

function countPillStyle(): React.CSSProperties {
  return {
    color: 'var(--text-secondary)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    background: 'rgba(15, 23, 42, 0.04)',
    padding: '2px 8px',
    borderRadius: 999,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
};
