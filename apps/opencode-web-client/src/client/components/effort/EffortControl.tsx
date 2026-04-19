import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { EffortPopover } from './EffortPopover.js';

export function EffortControl() {
  const { activeWorkspaceId, effortByWorkspace } = useStore();
  const [showPopover, setShowPopover] = useState(false);

  const effort = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const currentLevel = effort?.projectDefault ?? 'medium';
  const displayLevel = currentLevel === 'xhigh' ? 'max' : currentLevel;

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setShowPopover(!showPopover)} className="oc-badge-button">
        <span className="oc-badge-button__label">Effort</span>
        <span>{displayLevel}</span>
      </button>
      {showPopover && <EffortPopover onClose={() => setShowPopover(false)} />}
    </div>
  );
}
