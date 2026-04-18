/**
 * Thread.tsx
 *
 * Uses @assistant-ui/react ThreadPrimitive to render the message thread.
 * Custom message components look up the original NormalizedMessage from Zustand
 * store by ID to render with full fidelity (ToolCallCard, PermissionCard, etc.).
 * When a message ID is not found in the store (e.g. optimistic running message
 * injected by ExternalStoreRuntime), shows a "Generating..." indicator.
 */

import React from 'react';
import { ThreadPrimitive, MessagePrimitive, useMessage } from '@assistant-ui/react';
import { useStore } from '../../runtime/store.js';
import { MessageCard } from './MessageCard.js';

/** Look up the original NormalizedMessage from the Zustand store by message ID */
function useNormalizedMessage() {
  // In @assistant-ui/react v0.12, MessageState IS the message (id/role/status are top-level)
  const messageId = useMessage((s) => s.id);
  const messageRole = useMessage((s) => s.role);
  const isRunning = useMessage((s) =>
    s.role === 'assistant' &&
    (s.status?.type === 'running' || s.status?.type === 'requires-action')
  );

  const store = useStore();
  const sessionId = store.activeWorkspaceId
    ? store.activeSessionByWorkspace[store.activeWorkspaceId]
    : undefined;
  const messages = sessionId ? (store.messagesBySession[sessionId] ?? []) : [];
  const normalized = messages.find((m) => m.id === messageId);

  return { normalized, messageRole, isRunning };
}

/** Custom user message component */
function UserMessage() {
  const { normalized } = useNormalizedMessage();
  if (!normalized) {
    // Optimistic message — shouldn't happen for user, but handle gracefully
    return (
      <MessagePrimitive.Root>
        <div className="aui-message aui-message--user">
          <MessagePrimitive.Content />
        </div>
      </MessagePrimitive.Root>
    );
  }
  return (
    <MessagePrimitive.Root>
      <MessageCard message={normalized} />
    </MessagePrimitive.Root>
  );
}

/** Custom assistant message component */
function AssistantMessage() {
  const { normalized, isRunning } = useNormalizedMessage();

  if (!normalized) {
    // Optimistic running message from ExternalStoreRuntime
    return (
      <MessagePrimitive.Root>
        <div style={{
          background: '#1a2238', borderLeft: '3px solid #7c4dff',
          borderRadius: 6, padding: '12px 16px', marginBottom: 8,
        }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600 }}>
            Assistant
          </div>
          <div style={{ padding: 8, color: '#4c9eff', fontSize: 13 }}>
            <span className="aui-pulse">● </span>Generating...
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }

  return (
    <MessagePrimitive.Root>
      <MessageCard message={normalized} />
      {isRunning && (
        <div style={{ padding: '4px 16px', color: '#4c9eff', fontSize: 13 }}>
          <span className="aui-pulse">● </span>Generating...
        </div>
      )}
    </MessagePrimitive.Root>
  );
}

/** Thread component using ThreadPrimitive */
export function Thread() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  if (!sessionId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
          <div>Select or create a session to start</div>
        </div>
      </div>
    );
  }

  return (
    <ThreadPrimitive.Root
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <ThreadPrimitive.Viewport
        style={{ flex: 1, overflow: 'auto' }}
      >
        <ThreadPrimitive.Empty>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
              <div>Start a conversation</div>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <div style={{ padding: '16px 24px', maxWidth: 800, margin: '0 auto' }}>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
