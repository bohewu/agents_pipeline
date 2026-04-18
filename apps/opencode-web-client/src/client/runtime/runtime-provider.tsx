/**
 * runtime-provider.tsx
 *
 * Bridges the Zustand UIStore to @assistant-ui/react via ExternalStoreRuntime.
 * Wraps children in AssistantRuntimeProvider so ThreadPrimitive / ComposerPrimitive
 * can access the runtime context.
 */

import React, { type ReactNode } from 'react';
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
} from '@assistant-ui/react';
import { useStore } from './store.js';
import { convertMessage } from './assistant-ui-mapper.js';
import { api } from '../lib/api-client.js';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const messagesBySession = useStore((s) => s.messagesBySession);
  const streaming = useStore((s) => s.streaming);
  const composerMode = useStore((s) => s.composerMode);

  const sessionId = activeWorkspaceId
    ? activeSessionByWorkspace[activeWorkspaceId]
    : undefined;

  const rawMessages = sessionId ? (messagesBySession[sessionId] ?? []) : [];

  const runtime = useExternalStoreRuntime({
    messages: rawMessages.map(convertMessage),
    isRunning: streaming,
    isDisabled: !sessionId,
    convertMessage: convertMessage as any,

    onNew: async (message) => {
      if (!activeWorkspaceId || !sessionId) return;

      // Extract text from the AppendMessage content parts
      const textParts = message.content.filter(
        (p): p is { type: 'text'; text: string } => p.type === 'text',
      );
      const text = textParts.map((p) => p.text).join('\n').trim();
      if (!text) return;

      // Set streaming before sending
      useStore.getState().setStreaming(true);

      try {
        switch (composerMode) {
          case 'ask':
            await api.sendChat(activeWorkspaceId, sessionId, { content: text });
            break;
          case 'command':
            await api.sendCommand(activeWorkspaceId, sessionId, { command: text });
            break;
          case 'shell':
            await api.sendShell(activeWorkspaceId, sessionId, { command: text });
            break;
        }
      } catch {
        useStore.getState().setStreaming(false);
      }
    },

    onCancel: async () => {
      if (!activeWorkspaceId || !sessionId) return;
      try {
        await api.abort(activeWorkspaceId, sessionId);
      } catch {
        /* ignore abort errors */
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
