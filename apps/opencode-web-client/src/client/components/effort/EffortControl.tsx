import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { EFFORT_LEVELS } from '../../../shared/constants.js';
import { EffortPopover } from './EffortPopover.js';

const DISPLAY_LEVELS = ['medium', 'high', 'max'] as const;

export function EffortControl() {
  const { activeWorkspaceId, effortByWorkspace } = useStore();
  const [showPopover, setShowPopover] = useState(false);

  const effort = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const currentLevel = effort?.projectDefault ?? 'medium';
  // Map xhigh back to "max" for display
  const displayLevel = currentLevel === 'xhigh' ? 'max' : currentLevel;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowPopover(!showPopover)}
        style={{
          background: '#1a1a2e', color: '#ccc', border: '1px solid #2a2a4a',
          borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ color: '#ff9800' }}>⚡</span>
        {displayLevel}
      </button>
      {showPopover && <EffortPopover onClose={() => setShowPopover(false)} />}
    </div>
  );
}
