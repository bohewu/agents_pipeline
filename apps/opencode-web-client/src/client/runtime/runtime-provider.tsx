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
import { selectSessionMessages, selectSessionStreaming, useStore } from './store.js';
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
  const streaming = useStore((s) => selectSessionStreaming(s, activeWorkspaceId, sessionId));

  const rawMessages = selectSessionMessages({ messagesBySession }, activeWorkspaceId, sessionId);
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

      const optimisticMessage = createOptimisticUserMessage(activeWorkspaceId, sessionId, intent.text);
      useStore.getState().addMessage(activeWorkspaceId, sessionId, optimisticMessage);

      // Set streaming before sending
      useStore.getState().setSessionStreaming(activeWorkspaceId, sessionId, true);
      inFlightRequestRef.current?.abort();
      const requestController = new AbortController();
      inFlightRequestRef.current = requestController;

      const sendPromise = (() => {
        const verificationLink = intent.verificationCommandKind
          ? resolveLatestAssistantLink(rawMessages)
          : undefined;
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
            if (intent.verificationCommandKind) {
              return api.runVerification(activeWorkspaceId, {
                sessionId,
                commandKind: intent.verificationCommandKind,
                sourceMessageId: verificationLink?.sourceMessageId,
                taskId: verificationLink?.taskId,
              }, requestController.signal);
            }
            return api.sendCommand(activeWorkspaceId, sessionId, { command: intent.text }, requestController.signal);
          case 'shell':
            return api.sendShell(activeWorkspaceId, sessionId, { command: intent.text }, requestController.signal);
        }
      })();
      const shouldAutoClearStreaming = !!intent.verificationCommandKind;

      void sendPromise
        .then(() => {
          if (shouldAutoClearStreaming && inFlightRequestRef.current === requestController) {
            useStore.getState().setSessionStreaming(activeWorkspaceId, sessionId, false);
          }
        })
        .catch(() => {
          if (inFlightRequestRef.current === requestController) {
            useStore.getState().setSessionStreaming(activeWorkspaceId, sessionId, false);
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
      useStore.getState().setSessionStreaming(activeWorkspaceId, sessionId, false);
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

function createOptimisticUserMessage(workspaceId: string, sessionId: string, text: string): NormalizedMessage {
  const id = `local-user-${crypto.randomUUID()}`;
  return {
    id,
    role: 'user',
    createdAt: new Date().toISOString(),
    parts: [{ type: 'text', text }],
    trace: {
      sourceMessageId: id,
      workspaceId,
      sessionId,
    },
  };
}

function resolveLatestAssistantLink(messages: NormalizedMessage[]): {
  sourceMessageId: string;
  taskId?: string;
} | undefined {
  const assistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!assistantMessage) return undefined;

  return {
    sourceMessageId: assistantMessage.resultAnnotation?.sourceMessageId
      ?? assistantMessage.taskEntry?.sourceMessageId
      ?? assistantMessage.trace?.sourceMessageId
      ?? assistantMessage.id,
    ...(assistantMessage.resultAnnotation?.taskId
      ?? assistantMessage.taskEntry?.taskId
      ?? assistantMessage.trace?.taskId
      ? {
          taskId: assistantMessage.resultAnnotation?.taskId
            ?? assistantMessage.taskEntry?.taskId
            ?? assistantMessage.trace?.taskId,
        }
      : {}),
  };
}
