import React from 'react';
import { useStore, type ComposerMode } from '../../runtime/store.js';

const MODES: { key: ComposerMode; label: string }[] = [
  { key: 'ask', label: 'Ask' },
  { key: 'command', label: 'Command' },
  { key: 'shell', label: '$ Shell' },
];

export function ComposerModeSelector() {
  const { composerMode, setComposerMode } = useStore();

  return (
    <select
      value={composerMode}
      onChange={(event) => setComposerMode(event.target.value as ComposerMode)}
      className="oc-topbar-select oc-topbar-select--compact"
      aria-label="Composer mode"
    >
      {MODES.map((mode) => (
        <option key={mode.key} value={mode.key}>{mode.label}</option>
      ))}
    </select>
  );
}
