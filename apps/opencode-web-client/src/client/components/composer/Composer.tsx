/**
 * Composer.tsx
 *
 * Uses @assistant-ui/react ComposerPrimitive for the input area.
 * The runtime's onNew handler (in RuntimeProvider) dispatches to the correct
 * BFF endpoint based on composerMode from Zustand.
 */

import React from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { useStore } from '../../runtime/store.js';
import { ComposerModeSelector } from './ComposerModeSelector.js';
import { ArrowUpIcon, SquareIcon } from '../common/Icons.js';

export function Composer() {
  const composerMode = useStore((s) => s.composerMode);
  const streaming = useStore((s) => s.streaming);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const disabled = !sessionId;

  let placeholder = 'Open a workspace to start chatting';
  if (activeWorkspaceId && !sessionId) {
    placeholder = 'Preparing a chat session...';
  } else if (sessionId) {
    placeholder =
      composerMode === 'ask' ? 'Send a message...' :
      composerMode === 'command' ? 'Type a slash command...' :
      'Run a shell command...';
  }

  return (
    <div className="oc-composer-shell">
      <ComposerPrimitive.Root className="oc-composer-root">
        <div className="oc-composer-toolbar">
          <ComposerModeSelector />
        </div>

        <div className="oc-composer-main">
          <ComposerPrimitive.Input
            autoFocus
            disabled={disabled}
            name="message"
            placeholder={placeholder}
            rows={3}
            className={`aui-composer-input ${composerMode === 'shell' ? 'aui-composer-input--mono' : ''}`}
          />

          {streaming ? (
            <ComposerPrimitive.Cancel asChild>
              <button type="button" className="oc-composer-send oc-composer-send--cancel" aria-label="Stop generating">
                <SquareIcon size={12} />
              </button>
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send
              disabled={disabled}
              className="oc-composer-send"
              aria-label="Send message"
            >
              <ArrowUpIcon size={16} />
            </ComposerPrimitive.Send>
          )}
        </div>
      </ComposerPrimitive.Root>

      <p className="oc-composer-note">
        {disabled
          ? 'Open a workspace to start a repo-aware chat.'
          : 'OpenCode can make mistakes. Check important changes.'}
      </p>
    </div>
  );
}
