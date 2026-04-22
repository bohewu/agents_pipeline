import React from 'react';
import type { BrowserEvidenceReference } from '../../../shared/types.js';
import type { BrowserEvidenceCapabilityState, BrowserEvidenceProjection } from '../../lib/browser-evidence.js';

export function BrowserEvidenceSurface({
  projection,
  title,
  compact = false,
  suppressUnavailable = true,
}: {
  projection?: Pick<BrowserEvidenceProjection, 'browserEvidenceRef' | 'capabilityState'> | null;
  title?: string;
  compact?: boolean;
  suppressUnavailable?: boolean;
}) {
  if (projection?.browserEvidenceRef) {
    return <BrowserEvidenceDetails evidence={projection.browserEvidenceRef} title={title} compact={compact} />;
  }

  if (!projection?.capabilityState || suppressUnavailable) {
    return null;
  }

  return <BrowserEvidenceNotice state={projection.capabilityState} compact={compact} />;
}

export function BrowserEvidenceNotice({
  state,
  compact = false,
}: {
  state: BrowserEvidenceCapabilityState;
  compact?: boolean;
}) {
  const tone = state.tone === 'danger'
    ? { border: 'rgba(220, 38, 38, 0.18)', background: 'var(--error-soft)', title: 'var(--error)' }
    : state.tone === 'warning'
      ? { border: 'rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)', title: 'var(--warning)' }
      : { border: 'rgba(16, 163, 127, 0.18)', background: 'var(--success-soft)', title: 'var(--success)' };

  return (
    <div
      style={{
        display: 'grid',
        gap: compact ? 4 : 6,
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 14,
        border: `1px solid ${tone.border}`,
        background: tone.background,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: tone.title, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {state.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{state.summary}</div>
      {state.issues.length > 0 && (
        <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {state.issues.map((issue) => (
            <div key={issue.key}>
              <strong style={{ color: 'var(--text-secondary)' }}>{issue.label}:</strong> {issue.summary}
              {issue.detail ? ` ${issue.detail}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrowserEvidenceDetails({
  evidence,
  title = 'Browser evidence',
  compact = false,
}: {
  evidence: BrowserEvidenceReference;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: compact ? 4 : 6,
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(37, 99, 235, 0.16)',
        background: 'rgba(37, 99, 235, 0.04)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgb(29, 78, 216)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {evidence.summary && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{evidence.summary}</div>
      )}
      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <div>
          Preview URL:{' '}
          <a href={evidence.previewUrl} target="_blank" rel="noreferrer">
            {evidence.previewUrl}
          </a>
        </div>
        {evidence.consoleCapture && (
          <div>
            Console capture: {formatConsoleCapture(evidence.consoleCapture)}
          </div>
        )}
        {evidence.screenshot && (
          <div>
            Screenshot ref:{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
              {evidence.screenshot.artifactRef}
            </span>
            {' · '}
            {evidence.screenshot.width}×{evidence.screenshot.height}
            {' · '}
            {formatBytes(evidence.screenshot.bytes)}
          </div>
        )}
      </div>
    </div>
  );
}

function formatConsoleCapture(evidence: NonNullable<BrowserEvidenceReference['consoleCapture']>): string {
  const parts = [
    `${evidence.entryCount} entr${evidence.entryCount === 1 ? 'y' : 'ies'}`,
    `${evidence.errorCount} error${evidence.errorCount === 1 ? '' : 's'}`,
    `${evidence.warningCount} warning${evidence.warningCount === 1 ? '' : 's'}`,
    `${evidence.exceptionCount} exception${evidence.exceptionCount === 1 ? '' : 's'}`,
  ];

  if (evidence.levels.length > 0) {
    parts.push(`levels: ${evidence.levels.join(', ')}`);
  }

  return parts.join(' · ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
