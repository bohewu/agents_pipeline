import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import { EFFORT_LEVELS } from '../../../shared/constants.js';

const LEVELS = [
  { display: 'medium', value: 'medium' },
  { display: 'high', value: 'high' },
  { display: 'max', value: 'xhigh' },
];

export function EffortPopover({ onClose }: { onClose: () => void }) {
  const { activeWorkspaceId, activeSessionByWorkspace, setEffort } = useStore();
  const [scope, setScope] = useState<'project' | 'session'>('project');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;

  const handleSet = async (level: string) => {
    if (!activeWorkspaceId) return;
    try {
      await api.setEffort(activeWorkspaceId, {
        level,
        scope,
        sessionId: scope === 'session' ? sessionId : undefined,
      });
      const effort = await api.getEffort(activeWorkspaceId);
      setEffort(activeWorkspaceId, effort);
    } catch { /* ignore */ }
    onClose();
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 18,
      padding: 12, minWidth: 180, zIndex: 100, boxShadow: 'var(--shadow-soft)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Effort Level</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['project', 'session'] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} style={{
            flex: 1, padding: '3px 0', fontSize: 11, cursor: 'pointer', border: 'none',
            background: scope === s ? 'var(--bg-active)' : 'transparent',
            color: scope === s ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 999,
          }}>{s}</button>
        ))}
      </div>

      {LEVELS.map((l) => (
        <button key={l.value} onClick={() => handleSet(l.value)} style={{
          display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
          background: 'transparent', color: 'var(--text-primary)', border: 'none', cursor: 'pointer',
          fontSize: 13, borderRadius: 12,
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {l.display}
        </button>
      ))}
    </div>
  );
}
