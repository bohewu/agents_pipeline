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

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const messagesBySession = useStore((s) => s.messagesBySession);
  const streaming = useStore((s) => s.streaming);
  const composerMode = useStore((s) => s.composerMode);
  const selectedProvider = useStore((s) => s.selectedProvider);
  const selectedModel = useStore((s) => s.selectedModel);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const effortByWorkspace = useStore((s) => s.effortByWorkspace);
  const workspaceBootstraps = useStore((s) => s.workspaceBootstraps);

  const sessionId = activeWorkspaceId
    ? activeSessionByWorkspace[activeWorkspaceId]
    : undefined;

  const rawMessages = sessionId ? (messagesBySession[sessionId] ?? []) : [];
  const effortState = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const workspaceBootstrap = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId] : undefined;
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

      // Set streaming before sending
      useStore.getState().setStreaming(true);

      try {
        switch (intent.mode) {
          case 'ask':
            await api.sendChat(activeWorkspaceId, sessionId, {
              text: intent.text,
              providerId: selectedProvider ?? undefined,
              modelId: selectedModel ?? undefined,
              agentId: intent.agentId ?? undefined,
              effort: effectiveEffort,
            });
            break;
          case 'command':
            await api.sendCommand(activeWorkspaceId, sessionId, { command: intent.text });
            break;
          case 'shell':
            await api.sendShell(activeWorkspaceId, sessionId, { command: intent.text });
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
