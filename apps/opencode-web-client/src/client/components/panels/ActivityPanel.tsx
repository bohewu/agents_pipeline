import React from 'react';
import { useStore } from '../../runtime/store.js';
import { getMessageTextPreview, getReasoningTextPreview, getRenderableReasoningParts } from '../../lib/reasoning-parts.js';

export function ActivityPanel() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const messagesBySession = useStore((s) => s.messagesBySession);
  const settings = useStore((s) => s.settings);
  const streaming = useStore((s) => s.streaming);
  const activityFocusMessageId = useStore((s) => s.activityFocusMessageId);
  const activityFocusNonce = useStore((s) => s.activityFocusNonce);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : [];
  const entryRefs = React.useRef(new Map<string, HTMLElement>());
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<string | null>(null);

  const entries = React.useMemo(() => {
    return messages
      .filter((message) => message.role === 'assistant')
      .map((message) => {
        const reasoningParts = getRenderableReasoningParts(message.parts);
        return {
          message,
          preview: getMessageTextPreview(message) ?? getReasoningTextPreview(reasoningParts) ?? 'Thinking update',
          reasoningParts,
        };
      })
      .filter((entry) => entry.reasoningParts.length > 0)
      .reverse();
  }, [messages]);

  const liveMessageId = streaming ? entries[0]?.message.id ?? null : null;

  React.useEffect(() => {
    if (!activityFocusMessageId || activityFocusNonce === 0) {
      return;
    }

    const target = entryRefs.current.get(activityFocusMessageId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
    setHighlightedMessageId(activityFocusMessageId);

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => current === activityFocusMessageId ? null : current);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [activityFocusMessageId, activityFocusNonce, entries.length]);

  const setEntryRef = React.useCallback((messageId: string, node: HTMLElement | null) => {
    if (node) {
      entryRefs.current.set(messageId, node);
      return;
    }
    entryRefs.current.delete(messageId);
  }, []);

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

  if (entries.length === 0) {
    return <EmptyPanelState title="No thinking summaries yet" body="When a supported model returns provider-supplied summaries, they will appear here without interrupting the chat flow." />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Thinking activity</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Provider-supplied summaries stay here as a lightweight timeline so the conversation remains easy to scan.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {entries.map((entry) => (
          <section
            key={entry.message.id}
            ref={(node) => setEntryRef(entry.message.id, node)}
            className={`oc-surface-card oc-activity-entry${highlightedMessageId === entry.message.id ? ' is-focused' : ''}`}
            aria-live={liveMessageId === entry.message.id ? 'polite' : undefined}
            tabIndex={-1}
            style={{ padding: 14, display: 'grid', gap: 10 }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>OpenCode</span>
                  <span className="oc-activity-entry__badge">Thinking summary</span>
                  {liveMessageId === entry.message.id && <span className="oc-activity-entry__badge oc-activity-entry__badge--live">Live</span>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatActivityTime(entry.message.createdAt)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {entry.preview}
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
                    {entry.reasoningParts.length > 1 ? `Section ${index + 1}` : 'Summary'}
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

function formatActivityTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function EmptyPanelState({ title, body }: { title: string; body: string }) {
  return (
    <div className="oc-surface-card" style={{ padding: 16, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
