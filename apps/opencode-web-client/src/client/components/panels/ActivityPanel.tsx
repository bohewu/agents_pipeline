import React from 'react';
import { ChevronDownIcon } from '../common/Icons.js';
import { useStore } from '../../runtime/store.js';
import { getMessageTextPreview, getReasoningTextPreview, getRenderableReasoningParts } from '../../lib/reasoning-parts.js';

export function ActivityPanel() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const messagesBySession = useStore((s) => s.messagesBySession);
  const settings = useStore((s) => s.settings);
  const selectedReasoningMessageId = useStore((s) => s.selectedReasoningMessageId);
  const setSelectedReasoningMessage = useStore((s) => s.setSelectedReasoningMessage);
  const activityFocusMessageId = useStore((s) => s.activityFocusMessageId);
  const activityFocusNonce = useStore((s) => s.activityFocusNonce);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const streaming = useStore((s) => sessionId ? !!s.streamingBySession[sessionId] : false);
  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : [];
  const entryRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [flashMessageId, setFlashMessageId] = React.useState<string | null>(null);
  const latestAssistantReasoningMessageId = React.useMemo(() => {
    if (!streaming) return null;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'assistant') continue;
      return getRenderableReasoningParts(message.parts).length > 0 ? message.id : null;
    }

    return null;
  }, [messages, streaming]);

  const entries = React.useMemo(() => {
    return messages
      .filter((message) => message.role === 'assistant')
      .map((message) => {
        const reasoningParts = getRenderableReasoningParts(message.parts);
        return {
          message,
          preview: getReasoningTextPreview(reasoningParts) ?? getMessageTextPreview(message) ?? 'Thinking update',
          reasoningParts,
        };
      })
      .filter((entry) => entry.reasoningParts.length > 0)
      .reverse();
  }, [messages]);

  const liveMessageId = latestAssistantReasoningMessageId;

  React.useEffect(() => {
    if (entries.length === 0) {
      if (selectedReasoningMessageId !== null) {
        setSelectedReasoningMessage(null);
      }
      return;
    }

    if (selectedReasoningMessageId && entries.some((entry) => entry.message.id === selectedReasoningMessageId)) {
      return;
    }

    const nextSelectedMessageId = liveMessageId ?? (streaming ? null : entries[0]?.message.id ?? null);
    if (nextSelectedMessageId !== selectedReasoningMessageId) {
      setSelectedReasoningMessage(nextSelectedMessageId);
    }
  }, [entries, liveMessageId, selectedReasoningMessageId, setSelectedReasoningMessage]);

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
    setSelectedReasoningMessage(activityFocusMessageId);
    setFlashMessageId(activityFocusMessageId);

    const timer = window.setTimeout(() => {
      setFlashMessageId((current) => current === activityFocusMessageId ? null : current);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [activityFocusMessageId, activityFocusNonce, entries.length, setSelectedReasoningMessage]);

  const setEntryRef = React.useCallback((messageId: string, node: HTMLButtonElement | null) => {
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

      <div className="oc-activity-timeline" role="list">
        {entries.map((entry) => {
          const isSelected = entry.message.id === selectedReasoningMessageId;
          const isLive = liveMessageId === entry.message.id;
          const isFlashing = flashMessageId === entry.message.id;
          const bodyId = `activity-entry-${entry.message.id}`;

          return (
          <section
            key={entry.message.id}
            className={`oc-activity-entry${isSelected ? ' is-selected' : ''}${isLive ? ' is-live' : ''}${isFlashing ? ' is-flashing' : ''}`}
            aria-live={isLive ? 'polite' : undefined}
            role="listitem"
          >
            <span className="oc-activity-entry__marker" aria-hidden="true" />

            <button
              ref={(node) => setEntryRef(entry.message.id, node)}
              type="button"
              className="oc-activity-entry__header"
              aria-expanded={isSelected}
              aria-controls={bodyId}
              onClick={() => setSelectedReasoningMessage(entry.message.id)}
            >
              <div className="oc-activity-entry__meta">
                <div className="oc-activity-entry__eyebrow">
                  <span className="oc-activity-entry__label">{isLive ? 'Live thinking' : 'Thinking summary'}</span>
                  <span className="oc-activity-entry__count">{formatSectionCount(entry.reasoningParts.length)}</span>
                </div>
                <div className="oc-activity-entry__trailing">
                  {isFlashing && <span className="oc-activity-entry__badge">Jumped here</span>}
                  {isLive && <span className="oc-activity-entry__badge oc-activity-entry__badge--live">Live</span>}
                  <span className="oc-activity-entry__time">{formatActivityTime(entry.message.createdAt)}</span>
                  <ChevronDownIcon className="oc-activity-entry__chevron" size={14} />
                </div>
              </div>
              <div className="oc-activity-entry__preview">
                {entry.preview}
              </div>
            </button>

            {isSelected && (
              <div id={bodyId} className="oc-activity-entry__body">
                {entry.reasoningParts.map((part, index) => (
                  <div key={part.key} className="oc-activity-section">
                    <div className="oc-activity-section__label">
                      {entry.reasoningParts.length > 1 ? `Section ${index + 1}` : 'Summary'}
                    </div>
                    <div className="oc-activity-section__text">
                      {part.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )})}
      </div>
    </div>
  );
}

function formatActivityTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSectionCount(count: number): string {
  return `${count} section${count === 1 ? '' : 's'}`;
}

function EmptyPanelState({ title, body }: { title: string; body: string }) {
  return (
    <div className="oc-surface-card" style={{ padding: 16, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
