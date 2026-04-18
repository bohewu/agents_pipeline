/**
 * Composer.tsx
 *
 * Uses @assistant-ui/react ComposerPrimitive for the input area.
 * The runtime's onNew handler (in RuntimeProvider) dispatches to the correct
 * BFF endpoint based on composerMode from Zustand.
 *
 * Layout:
 *   [ComposerModeSelector] ................... [Cancel button if streaming]
 *   [ComposerPrimitive.Input ........................ ] [Send button]
 */

import React from 'react';
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { useStore } from '../../runtime/store.js';
import { ComposerModeSelector } from './ComposerModeSelector.js';

export function Composer() {
  const composerMode = useStore((s) => s.composerMode);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const disabled = !sessionId;

  return (
    <div style={{
      borderTop: '1px solid #2a2a4a', padding: '12px 24px',
      background: '#16213e', maxWidth: 800, margin: '0 auto', width: '100%',
    }}>
      <ComposerPrimitive.Root>
        {/* Top row: mode selector + cancel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ComposerModeSelector />
          <div style={{ flex: 1 }} />
          <ComposerPrimitive.Cancel asChild>
            <button
              className="aui-cancel-btn"
              style={{
                background: '#f44336', color: '#fff', border: 'none', borderRadius: 4,
                padding: '4px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              ■ Stop
            </button>
          </ComposerPrimitive.Cancel>
        </div>

        {/* Bottom row: input + send */}
        <div style={{ display: 'flex', gap: 8 }}>
          <ComposerPrimitive.Input
            autoFocus
            disabled={disabled}
            placeholder={
              composerMode === 'ask' ? 'Ask anything... (Enter to send)' :
              composerMode === 'command' ? '/command... (Enter to send)' :
              '$ shell command... (Enter to send)'
            }
            rows={3}
            className="aui-composer-input"
            style={{
              flex: 1, background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
              borderRadius: 6, padding: '10px 12px', fontSize: 14, resize: 'vertical',
              fontFamily: composerMode === 'shell' ? 'monospace' : 'inherit',
              outline: 'none',
            }}
          />
          <ComposerPrimitive.Send
            disabled={disabled}
            style={{
              background: disabled ? '#2a2a4a' : '#4c9eff',
              color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px',
              cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, alignSelf: 'flex-end',
              height: 40,
            }}
          >
            Send
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
}
