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
import { parseComposerIntent } from '../lib/opencode-controls.js';
import type { NormalizedMessage } from '../../shared/types.js';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const messagesBySession = useStore((s) => s.messagesBySession);
  const composerMode = useStore((s) => s.composerMode);
  const selectedProvider = useStore((s) => s.selectedProvider);
  const selectedModel = useStore((s) => s.selectedModel);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const effortByWorkspace = useStore((s) => s.effortByWorkspace);
  const workspaceBootstraps = useStore((s) => s.workspaceBootstraps);

  const sessionId = activeWorkspaceId
    ? activeSessionByWorkspace[activeWorkspaceId]
    : undefined;
  const streaming = useStore((s) => sessionId ? !!s.streamingBySession[sessionId] : false);

  const rawMessages = sessionId ? (messagesBySession[sessionId] ?? []) : [];
  const effortState = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const workspaceBootstrap = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId] : undefined;
  const inFlightRequestRef = React.useRef<AbortController | null>(null);
  const effectiveEffort = sessionId
    ? effortState?.sessionOverrides[sessionId] ?? effortState?.projectDefault
    : effortState?.projectDefault;

  const runtime = useExternalStoreRuntime({
    messages: rawMessages,
    isRunning: streaming,
    isDisabled: !sessionId,
    convertMessage,

    onNew: async (message) => {
      if (!activeWorkspaceId || !sessionId) return;

      // Extract text from the AppendMessage content parts
      const textParts = message.content.filter(
        (p): p is { type: 'text'; text: string } => p.type === 'text',
      );
      const rawText = textParts.map((p) => p.text).join('\n').trim();
      if (!rawText) return;

      const intent = parseComposerIntent(rawText, {
        composerMode,
        boot: workspaceBootstrap,
        fallbackAgentId: selectedAgent,
      });
      if (!intent.text) return;

      const optimisticMessage = createOptimisticUserMessage(intent.text);
      useStore.getState().addMessage(sessionId, optimisticMessage);

      // Set streaming before sending
      useStore.getState().setSessionStreaming(sessionId, true);
      inFlightRequestRef.current?.abort();
      const requestController = new AbortController();
      inFlightRequestRef.current = requestController;

      const sendPromise = (() => {
        switch (intent.mode) {
          case 'ask':
            return api.sendChat(activeWorkspaceId, sessionId, {
              text: intent.text,
              providerId: selectedProvider ?? undefined,
              modelId: selectedModel ?? undefined,
              agentId: intent.agentId ?? undefined,
              effort: effectiveEffort,
            }, requestController.signal);
          case 'command':
            return api.sendCommand(activeWorkspaceId, sessionId, { command: intent.text }, requestController.signal);
          case 'shell':
            return api.sendShell(activeWorkspaceId, sessionId, { command: intent.text }, requestController.signal);
        }
      })();

      void sendPromise
        .catch(() => {
          if (inFlightRequestRef.current === requestController) {
            useStore.getState().setSessionStreaming(sessionId, false);
          }
        })
        .finally(() => {
          if (inFlightRequestRef.current === requestController) {
            inFlightRequestRef.current = null;
          }
        });
    },

    onCancel: async () => {
      if (!activeWorkspaceId || !sessionId) return;
      const inFlightRequest = inFlightRequestRef.current;
      inFlightRequestRef.current = null;
      inFlightRequest?.abort();
      useStore.getState().setSessionStreaming(sessionId, false);
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

function createOptimisticUserMessage(text: string): NormalizedMessage {
  return {
    id: `local-user-${crypto.randomUUID()}`,
    role: 'user',
    createdAt: new Date().toISOString(),
    parts: [{ type: 'text', text }],
  };
}
