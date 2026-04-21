/**
 * Thread.tsx
 *
 * Uses @assistant-ui/react ThreadPrimitive to render the thread shell.
 * The normal message path now renders via MessagePrimitive.Content / ActionBarPrimitive,
 * while only custom permission/error parts fall back to bespoke cards.
 */

import React from 'react';
import { ThreadPrimitive, MessagePrimitive, useMessage } from '@assistant-ui/react';
import type { NormalizedMessage } from '../../../shared/types.js';
import { getRenderableReasoningParts } from '../../lib/reasoning-parts.js';
import { selectSessionMessages, useStore } from '../../runtime/store.js';
import { MessageCard } from './MessageCard.js';
import { ChatStartState } from './ChatStartState.js';
import { Composer } from '../composer/Composer.js';
import { ArrowDownIcon } from '../common/Icons.js';

function useNormalizedMessage() {
  const messageId = useMessage((s) => s.id);
  const messageRole = useMessage((s) => s.role);
  const isRunning = useMessage((s) =>
    s.role === 'assistant' &&
      (s.status?.type === 'running' || s.status?.type === 'requires-action')
  );
  const activeWorkspaceId = useStore((store) => store.activeWorkspaceId);
  const sessionId = useStore((store) => {
    return activeWorkspaceId
      ? store.activeSessionByWorkspace[activeWorkspaceId]
      : undefined;
  });
  const showReasoningSummaries = useStore((store) => store.settings.showReasoningSummaries);
  const messages = useStore((store) => {
    return selectSessionMessages(store, activeWorkspaceId, sessionId);
  });

  const { normalized, suppressInThread } = React.useMemo(() => {
    const index = messages.findIndex((message) => message.id === messageId);
    const normalized = index >= 0 ? messages[index] : undefined;

    return {
      normalized,
      suppressInThread: index >= 0 ? shouldSuppressAssistantBurstMessage(messages, index, showReasoningSummaries) : false,
    };
  }, [messages, messageId, showReasoningSummaries]);

  return { normalized, messageRole, isRunning, suppressInThread };
}

function ThreadMessage() {
  const { normalized, messageRole, isRunning, suppressInThread } = useNormalizedMessage();
  const role = normalized?.role ?? messageRole;
  const rowClassName = `oc-message-row oc-message-row--${role}`;
  const bodyClassName = `oc-message-row__body oc-message-row__body--${role}`;
  const showAvatar = role !== 'user';
  const eyebrowLabel = role === 'assistant' ? 'OpenCode' : 'System';

  if (suppressInThread) {
    return null;
  }

  if (!normalized) {
    return (
      <MessagePrimitive.Root>
        <div className={rowClassName}>
          <div className={bodyClassName}>
            <div className={`oc-message-card oc-message-card--${role}`}>
              {showAvatar && (
                <div className={`oc-message-card__avatar oc-message-card__avatar--${role}`}>
                  {role === 'assistant' ? 'O' : 'S'}
                </div>
              )}

              <div className="oc-message-card__main">
                {showAvatar && <div className="oc-message-card__eyebrow">{eyebrowLabel}</div>}
                <div className={`oc-message-card__bubble oc-message-card__bubble--${role}`}>
                  <div className="oc-message-card__content">
                    <MessagePrimitive.Content />
                  </div>
                </div>
              </div>
            </div>

            {role !== 'user' && isRunning && (
              <div className="oc-message-running">
                <span className="aui-pulse">● </span>Generating...
              </div>
            )}
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }

  return (
    <MessagePrimitive.Root>
        <div className={rowClassName}>
          <div className={bodyClassName}>
          <MessageCard message={normalized} isRunning={isRunning} />
          {role !== 'user' && isRunning && (
            <div className="oc-message-running">
              <span className="aui-pulse">● </span>Generating...
            </div>
          )}
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

export function Thread() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const connectionByWorkspace = useStore((s) => s.connectionByWorkspace);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const connectionState = activeWorkspaceId
    ? (connectionByWorkspace[activeWorkspaceId] ?? 'disconnected')
    : 'disconnected';

  if (!activeWorkspaceId) {
    return <ChatStartState />;
  }

  const emptySubtitle = sessionId
    ? 'Ask about this repo, request edits, or use the + menu for commands and shell.'
    : connectionState === 'error'
      ? 'The workspace connection needs attention. Retry from the sidebar or pick another repo.'
      : 'Connecting this workspace. The composer stays visible and unlocks as soon as the chat session is ready.';

  return (
    <ThreadPrimitive.Root
      className="oc-thread"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <ThreadPrimitive.Viewport
        className="oc-thread-viewport"
        autoScroll
        scrollToBottomOnInitialize
        scrollToBottomOnRunStart
        scrollToBottomOnThreadSwitch
        style={{ flex: 1, overflow: 'auto' }}
      >
        <ThreadPrimitive.Empty>
          <div className="oc-empty-thread-state">
            <div className="oc-empty-thread-state__avatar">O</div>
            <h1 className="oc-empty-thread-state__title">{sessionId ? "Let's start building" : 'Preparing chat shell'}</h1>
            <p className="oc-empty-thread-state__subtitle">{emptySubtitle}</p>
          </div>
        </ThreadPrimitive.Empty>

        <div className="oc-thread-messages">
          <ThreadPrimitive.Messages components={{ UserMessage: ThreadMessage, AssistantMessage: ThreadMessage }} />
        </div>

        <ThreadPrimitive.ViewportFooter className="oc-thread-footer">
          <div className="oc-thread-footer__scroll">
            <ThreadPrimitive.ScrollToBottom className="oc-scroll-to-bottom" aria-label="Jump to latest">
              <ArrowDownIcon size={16} />
            </ThreadPrimitive.ScrollToBottom>
          </div>
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function shouldSuppressAssistantBurstMessage(messages: NormalizedMessage[], index: number, showReasoningSummaries: boolean): boolean {
  const current = messages[index];
  if (!current || current.role !== 'assistant') {
    return false;
  }

  if (hasStickyAssistantParts(current, showReasoningSummaries)) {
    return false;
  }

  for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
    const next = messages[cursor];
    if (!next) {
      break;
    }
    if (next.role !== 'assistant') {
      return false;
    }
    return true;
  }

  return false;
}

function hasStickyAssistantParts(message: NormalizedMessage, showReasoningSummaries: boolean): boolean {
  if (showReasoningSummaries && getRenderableReasoningParts(message.parts).length > 0) {
    return true;
  }

  return message.parts.some((part) => {
    return part.type === 'tool-call'
      || part.type === 'tool-result'
      || part.type === 'error'
      || part.type === 'permission-request';
  }) || !!message.resultAnnotation || !!message.taskEntry || !!message.trace?.taskId;
}
