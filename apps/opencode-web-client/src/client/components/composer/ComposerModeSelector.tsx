import React from 'react';
import { useStore, type ComposerMode } from '../../runtime/store.js';

const MODES: { key: ComposerMode; label: string; prefix?: string }[] = [
  { key: 'ask', label: 'Ask' },
  { key: 'command', label: 'Command', prefix: '/' },
  { key: 'shell', label: 'Shell', prefix: '$' },
];

export function ComposerModeSelector() {
  const { composerMode, setComposerMode } = useStore();

  return (
    <div className="oc-mode-selector" role="tablist" aria-label="Composer mode">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          role="tab"
          aria-selected={composerMode === mode.key}
          onClick={() => setComposerMode(mode.key)}
          className={`oc-mode-button ${composerMode === mode.key ? 'is-active' : ''}`}
        >
          {mode.prefix && <span className="oc-mode-button__prefix">{mode.prefix}</span>}
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
