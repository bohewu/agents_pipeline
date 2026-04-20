import React from 'react';
import { useStore } from '../../runtime/store.js';
import { getMessageTextPreview, getRenderableReasoningParts } from '../../lib/reasoning-parts.js';

export function ActivityPanel() {
  const { activeWorkspaceId, activeSessionByWorkspace, messagesBySession, settings } = useStore();
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : [];

  if (!activeWorkspaceId || !sessionId) {
    return <EmptyPanelState title="No active chat" body="Start or select a chat to inspect thinking summaries." />;
  }

  if (!settings.showReasoningSummaries) {
    return (
      <EmptyPanelState
        title="Thinking summaries are off"
        body="Turn on Show reasoning summaries in Settings when you want provider-supplied thinking summaries to appear here."
      />
    );
  }

  const entries = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => ({
      message,
      preview: getMessageTextPreview(message),
      reasoningParts: getRenderableReasoningParts(message.parts),
    }))
    .filter((entry) => entry.reasoningParts.length > 0)
    .reverse();

  if (entries.length === 0) {
    return <EmptyPanelState title="No thinking summaries yet" body="When a supported model returns provider-supplied summaries, they will appear here without interrupting the chat flow." />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Activity</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Thinking summaries stay in the side panel so the conversation remains easy to scan.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {entries.map((entry) => (
          <section
            key={entry.message.id}
            className="oc-surface-card"
            style={{ padding: 14, display: 'grid', gap: 10 }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>OpenCode</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(entry.message.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {entry.preview ?? 'Thinking update'}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {entry.reasoningParts.map((part, index) => (
                <div
                  key={part.key}
                  style={{
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    borderRadius: 14,
                    background: 'rgba(248, 250, 252, 0.92)',
                    padding: '10px 12px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Summary {entry.reasoningParts.length > 1 ? index + 1 : ''}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {part.text}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
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
