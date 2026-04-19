import React from 'react';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { ActionBarPrimitive, MessagePrimitive } from '@assistant-ui/react';
import type { NormalizedMessage } from '../../../shared/types.js';
import { PermissionCard } from './PermissionCard.js';
import { ErrorCard } from './ErrorCard.js';

const ROLE_LABELS: Record<string, string> = {
  user: 'You',
  assistant: 'OpenCode',
  system: 'System',
};

export function MessageCard({ message }: { message: NormalizedMessage }) {
  const extraParts = message.parts.filter((part) => part.type === 'error' || part.type === 'permission-request');
  const showAvatar = message.role !== 'user';

  return (
    <div className={`oc-message-card oc-message-card--${message.role}`}>
      {showAvatar && (
        <div className={`oc-message-card__avatar oc-message-card__avatar--${message.role}`}>
          {message.role === 'assistant' ? 'O' : 'S'}
        </div>
      )}

      <div className="oc-message-card__main">
        {showAvatar && (
          <div className="oc-message-card__eyebrow">
            <span className="oc-message-card__label">{ROLE_LABELS[message.role] ?? message.role}</span>
            <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
        )}

        <div className={`oc-message-card__bubble oc-message-card__bubble--${message.role}`} title={new Date(message.createdAt).toLocaleString()}>
          <div className="oc-message-card__content">
            <MessagePrimitive.Content components={MESSAGE_CONTENT_COMPONENTS} />
          </div>

          {extraParts.map((part, index) =>
            part.type === 'permission-request'
              ? <PermissionCard key={`permission-${index}`} part={part} />
              : <ErrorCard key={`error-${index}`} part={part} />,
          )}
        </div>

        {message.role === 'assistant' && (
          <ActionBarPrimitive.Root
            hideWhenRunning
            autohide="always"
            autohideFloat="single-branch"
            className="oc-message-card__actions"
          >
            <ActionBarPrimitive.Copy asChild copiedDuration={1500}>
              <button className="oc-message-copy">Copy</button>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        )}
      </div>
    </div>
  );
}

const MESSAGE_CONTENT_COMPONENTS = {
  tools: {
    Fallback: AssistantToolPart,
  },
};

function AssistantToolPart({ toolName, argsText, result, status, isError }: ToolCallMessagePartProps) {
  const resultText = result == null
    ? ''
    : typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);
  const hasArgs = !!argsText && argsText !== '{}';
  const hasResult = resultText.length > 0;
  const statusLabel = status.type === 'running'
    ? 'Running'
    : status.type === 'requires-action'
      ? 'Needs input'
      : hasResult
        ? isError ? 'Errored' : 'Completed'
        : 'Queued';
  const tone = isError
    ? { border: 'rgba(220, 38, 38, 0.16)', background: 'var(--error-soft)', color: 'var(--error)' }
    : hasResult
      ? { border: 'rgba(16, 163, 127, 0.16)', background: 'var(--success-soft)', color: 'var(--success)' }
      : { border: 'rgba(183, 121, 31, 0.18)', background: 'var(--warning-soft)', color: 'var(--warning)' };

  return (
    <details
      className="oc-tool-part"
      style={{
        marginTop: 12,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        borderRadius: 18,
        padding: '12px 14px',
      }}
    >
      <summary className="oc-tool-part__summary" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ color: tone.color, fontSize: 12 }}>{hasResult ? '✓' : '⚙'}</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{toolName}</span>
        <span
          style={{
            marginLeft: 'auto',
            color: tone.color,
            fontSize: 11,
            background: 'rgba(255, 255, 255, 0.72)',
            borderRadius: 999,
            padding: '2px 8px',
          }}
        >
          {statusLabel}
        </span>
      </summary>

      {(hasArgs || hasResult) && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {hasArgs && (
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.72)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 180,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {argsText}
            </pre>
          )}

          {hasResult && (
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.86)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 240,
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {resultText}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
