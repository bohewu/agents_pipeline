import React from 'react';
import type { VerificationCommandKind, VerificationRunStatus } from '../../../shared/types.js';
import { api } from '../../lib/api-client.js';
import { BrowserEvidenceSurface } from '../common/BrowserEvidenceSurface.js';
import { selectActiveWorkspaceVerificationRuns, type ProjectedVerificationRun, useStore } from '../../runtime/store.js';

const VERIFICATION_PRESETS: VerificationCommandKind[] = ['lint', 'build', 'test'];

export function VerificationPanel() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const workspaceBootstraps = useStore((s) => s.workspaceBootstraps);
  const workspaceCapabilitiesByWorkspace = useStore((s) => s.workspaceCapabilitiesByWorkspace);
  const runs = React.useMemo(() => selectActiveWorkspaceVerificationRuns({
    activeWorkspaceId,
    workspaceBootstraps,
    workspaceCapabilitiesByWorkspace,
  }), [activeWorkspaceId, workspaceBootstraps, workspaceCapabilitiesByWorkspace]);
  const setVerificationRuns = useStore((s) => s.setVerificationRuns);
  const setSessionStreaming = useStore((s) => s.setSessionStreaming);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const workspaceName = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId]?.workspace.name ?? activeWorkspaceId : null;
  const [loading, setLoading] = React.useState(false);
  const [runningKind, setRunningKind] = React.useState<VerificationCommandKind | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const loadRuns = React.useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const nextRuns = await api.listVerificationRuns(activeWorkspaceId);
      setVerificationRuns(activeWorkspaceId, nextRuns);
    } catch (error: any) {
      setFeedback(error?.message ?? 'Failed to load verification runs.');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, setVerificationRuns]);

  React.useEffect(() => {
    if (!activeWorkspaceId) return;
    void loadRuns();
  }, [activeWorkspaceId, loadRuns]);

  const handleRun = React.useCallback(async (
    commandKind: VerificationCommandKind,
    context?: { sourceMessageId?: string; taskId?: string },
  ) => {
    if (!activeWorkspaceId || !sessionId) return;
    setRunningKind(commandKind);
    setFeedback(null);
    setSessionStreaming(activeWorkspaceId, sessionId, true);
    try {
      await api.runVerification(activeWorkspaceId, {
        sessionId,
        commandKind,
        sourceMessageId: context?.sourceMessageId,
        taskId: context?.taskId,
      });
      setFeedback(`Ran ${commandKind} verification.`);
      const nextRuns = await api.listVerificationRuns(activeWorkspaceId);
      setVerificationRuns(activeWorkspaceId, nextRuns);
    } catch (error: any) {
      setFeedback(error?.message ?? `Failed to run ${commandKind} verification.`);
    } finally {
      setSessionStreaming(activeWorkspaceId, sessionId, false);
      setRunningKind(null);
    }
  }, [activeWorkspaceId, sessionId, setSessionStreaming, setVerificationRuns]);

  if (!activeWorkspaceId) {
    return <EmptyPanelState title="No workspace selected" body="Choose a workspace to review recent verification runs and evidence." />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Verification</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Recent runs stay scoped to {workspaceName ?? 'this workspace'}, including saved summaries, terminal logs, and projected browser evidence when available.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadRuns()}
            disabled={loading}
            style={secondaryButtonStyle(loading)}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {VERIFICATION_PRESETS.map((commandKind) => (
            <button
              key={commandKind}
              type="button"
              onClick={() => void handleRun(commandKind)}
              disabled={!sessionId || runningKind !== null}
              style={presetButtonStyle(commandKind, !sessionId || runningKind !== null)}
            >
              {runningKind === commandKind ? `Running ${commandKind}…` : `Run ${commandKind}`}
            </button>
          ))}
        </div>

        {!sessionId && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Select an active chat session to launch lint, build, or test from this workspace surface.
          </div>
        )}
        {feedback && (
          <div
            aria-live="polite"
            style={{ fontSize: 11, color: feedback.toLowerCase().includes('failed') ? 'var(--error)' : 'var(--text-muted)', lineHeight: 1.6 }}
          >
            {feedback}
          </div>
        )}
      </div>

      {runs.length === 0 ? (
        <EmptyPanelState
          title={loading ? 'Loading verification runs' : 'No verification runs yet'}
          body={loading
            ? 'Fetching the latest workspace-scoped verification history.'
            : 'Run lint, build, or test to capture verification summaries and saved evidence for this workspace.'}
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {runs.slice(0, 10).map((run) => (
            <VerificationRunCard
              key={run.id}
              run={run}
              disabled={!sessionId || runningKind !== null}
              busy={runningKind === run.commandKind}
              onRetry={() => void handleRun(run.commandKind, { sourceMessageId: run.sourceMessageId, taskId: run.taskId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationRunCard({
  run,
  disabled,
  busy,
  onRetry,
}: {
  run: ProjectedVerificationRun;
  disabled: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const statusTone = getStatusTone(run.status);

  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCommandKind(run.commandKind)}</span>
          <span style={{ ...statusPillStyle(statusTone), fontSize: 10 }}>{formatRunStatus(run.status)}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatRunTime(run.startedAt, run.finishedAt)}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{run.summary}</div>

      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
        <div>Task: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{run.taskId}</span></div>
        {run.sourceMessageId && (
          <div>Result: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{run.sourceMessageId}</span></div>
        )}
        {run.exitCode !== undefined && <div>Exit code: {run.exitCode}</div>}
        {run.terminalLogRef && (
          <div>Verification log: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{run.terminalLogRef}</span></div>
        )}
      </div>

      <BrowserEvidenceSurface
        projection={run.browserEvidenceRef ? { browserEvidenceRef: run.browserEvidenceRef } : undefined}
        compact
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onRetry} disabled={disabled} style={secondaryButtonStyle(disabled)}>
          {busy ? `Retrying ${run.commandKind}…` : `Retry ${run.commandKind}`}
        </button>
      </div>
    </section>
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

function presetButtonStyle(commandKind: VerificationCommandKind, disabled: boolean): React.CSSProperties {
  const palette = commandKind === 'lint'
    ? { color: 'rgb(29, 78, 216)', border: 'rgba(37, 99, 235, 0.18)', background: 'rgba(37, 99, 235, 0.08)' }
    : commandKind === 'build'
      ? { color: 'var(--warning)', border: 'rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)' }
      : { color: 'var(--success)', border: 'rgba(16, 163, 127, 0.2)', background: 'var(--success-soft)' };

  return {
    minHeight: 32,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: disabled ? 'rgba(148, 163, 184, 0.14)' : palette.background,
    color: disabled ? 'var(--text-muted)' : palette.color,
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

function getStatusTone(status: VerificationRunStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'passed') return 'success';
  if (status === 'running') return 'neutral';
  if (status === 'cancelled') return 'warning';
  return 'danger';
}

function statusPillStyle(tone: 'success' | 'warning' | 'danger' | 'neutral'): React.CSSProperties {
  if (tone === 'success') {
    return { color: 'var(--success)', border: '1px solid rgba(16, 163, 127, 0.18)', background: 'var(--success-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };
  }
  if (tone === 'warning') {
    return { color: 'var(--warning)', border: '1px solid rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };
  }
  if (tone === 'danger') {
    return { color: 'var(--error)', border: '1px solid rgba(220, 38, 38, 0.18)', background: 'var(--error-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };
}

function formatCommandKind(commandKind: VerificationCommandKind): string {
  return commandKind.charAt(0).toUpperCase() + commandKind.slice(1);
}

function formatRunStatus(status: VerificationRunStatus): string {
  return status === 'cancelled' ? 'Cancelled' : status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRunTime(startedAt: string, finishedAt?: string): string {
  const started = new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!finishedAt) return `Started ${started}`;
  const finished = new Date(finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${started} → ${finished}`;
}
