import React from 'react';
import { useStore, type ComposerMode } from '../../runtime/store.js';

const MODES: { key: ComposerMode; label: string; icon: string }[] = [
  { key: 'ask', label: 'Ask', icon: '💬' },
  { key: 'command', label: 'Command', icon: '/' },
  { key: 'shell', label: 'Shell', icon: '$' },
];

export function ComposerModeSelector() {
  const { composerMode, setComposerMode } = useStore();

  return (
    <div style={{ display: 'flex', gap: 0, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
      {MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => setComposerMode(m.key)}
          style={{
            padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
            background: composerMode === m.key ? '#2a2a4a' : 'transparent',
            color: composerMode === m.key ? '#4c9eff' : '#888',
            fontWeight: composerMode === m.key ? 600 : 400,
          }}
        >
          <span style={{ marginRight: 4 }}>{m.icon}</span>{m.label}
        </button>
      ))}
    </div>
  );
}
