import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { ComposerModeSelector } from './ComposerModeSelector.js';

export function Composer() {
  const { activeWorkspaceId, activeSessionByWorkspace, composerMode, streaming } = useStore();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  useEffect(() => {
    textareaRef.current?.focus();
  }, [sessionId]);

  const handleSend = async () => {
    if (!activeWorkspaceId || !sessionId || !text.trim()) return;
    const content = text.trim();
    setText('');

    try {
      switch (composerMode) {
        case 'ask':
          await api.sendChat(activeWorkspaceId, sessionId, { content });
          break;
        case 'command':
          await api.sendCommand(activeWorkspaceId, sessionId, { command: content });
          break;
        case 'shell':
          await api.sendShell(activeWorkspaceId, sessionId, { command: content });
          break;
      }
    } catch { /* ignore */ }
  };

  const handleAbort = async () => {
    if (!activeWorkspaceId || !sessionId) return;
    try { await api.abort(activeWorkspaceId, sessionId); } catch { /* ignore */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const disabled = !sessionId;

  return (
    <div style={{
      borderTop: '1px solid #2a2a4a', padding: '12px 24px',
      background: '#16213e', maxWidth: 800, margin: '0 auto', width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ComposerModeSelector />
        <div style={{ flex: 1 }} />
        {streaming && (
          <button onClick={handleAbort} style={{
            background: '#f44336', color: '#fff', border: 'none', borderRadius: 4,
            padding: '4px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            ■ Stop
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            composerMode === 'ask' ? 'Ask anything... (Ctrl+Enter to send)' :
            composerMode === 'command' ? '/command... (Ctrl+Enter to send)' :
            '$ shell command... (Ctrl+Enter to send)'
          }
          rows={3}
          style={{
            flex: 1, background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
            borderRadius: 6, padding: '10px 12px', fontSize: 14, resize: 'vertical',
            fontFamily: composerMode === 'shell' ? 'monospace' : 'inherit',
            outline: 'none', minHeight: 60,
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim() || streaming}
          style={{
            background: disabled || !text.trim() || streaming ? '#2a2a4a' : '#4c9eff',
            color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px',
            cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, alignSelf: 'flex-end',
            height: 40,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
