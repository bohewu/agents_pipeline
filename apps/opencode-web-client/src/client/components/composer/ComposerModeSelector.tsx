import React, { useEffect, useRef, useState } from 'react';
import { useStore, type ComposerMode } from '../../runtime/store.js';
import { PlusIcon } from '../common/Icons.js';

const MODES: Array<{ key: ComposerMode; label: string; description: string }> = [
  { key: 'ask', label: 'Ask', description: 'Normal chat prompt' },
  { key: 'command', label: 'Command', description: 'Run an OpenCode slash command' },
  { key: 'shell', label: 'Shell', description: 'Run a terminal command' },
];

export function ComposerModeSelector() {
  const { composerMode, setComposerMode } = useStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeMode = MODES.find((mode) => mode.key === composerMode) ?? MODES[0];

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="oc-composer-mode-menu" ref={rootRef}>
      <button
        type="button"
        className="oc-composer-mode-menu__trigger"
        aria-label="Open composer tools"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <PlusIcon size={14} />
      </button>

      {composerMode !== 'ask' && (
        <button
          type="button"
          className="oc-composer-mode-menu__chip"
          onClick={() => setComposerMode('ask')}
          title={`Current mode: ${activeMode.label}. Click to return to Ask.`}
        >
          {activeMode.label}
        </button>
      )}

      {open && (
        <div className="oc-composer-mode-menu__popover" role="menu" aria-label="Composer tools">
          {MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              role="menuitemradio"
              aria-checked={composerMode === mode.key}
              className={`oc-composer-mode-menu__item ${composerMode === mode.key ? 'is-active' : ''}`}
              onClick={() => {
                setComposerMode(mode.key);
                setOpen(false);
              }}
            >
              <span className="oc-composer-mode-menu__item-label">{mode.label}</span>
              <span className="oc-composer-mode-menu__item-description">{mode.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
