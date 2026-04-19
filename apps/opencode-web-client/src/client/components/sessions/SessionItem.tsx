import React, { useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import type { SessionSummary } from '../../../shared/types.js';
import { getSessionMetaLabel, mergeSessionMessages, sortSessionsForSidebar } from '../../lib/session-meta.js';

export function SessionItem({ session, active, depth }: { session: SessionSummary; active: boolean; depth: number }) {
  const { activeWorkspaceId, setActiveSession, setSessions, setMessages } = useStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleSelect = async () => {
    if (!activeWorkspaceId) return;
    setActiveSession(activeWorkspaceId, session.id);
    try {
      const messages = await api.listMessages(activeWorkspaceId, session.id);
      setMessages(session.id, messages);
      const currentSessions = useStore.getState().sessionsByWorkspace[activeWorkspaceId] ?? [];
      setSessions(activeWorkspaceId, sortSessionsForSidebar(mergeSessionMessages(currentSessions, session.id, messages)));
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!activeWorkspaceId) return;
    try {
      await api.deleteSession(activeWorkspaceId, session.id);
      const sessions = useStore.getState().sessionsByWorkspace[activeWorkspaceId] ?? [];
      const remaining = sessions.filter((entry) => entry.id !== session.id);
      setSessions(activeWorkspaceId, remaining);
      if (active) {
        setActiveSession(activeWorkspaceId, remaining[0]?.id);
      }
    } catch {
      /* ignore */
    }
    setShowMenu(false);
  };

  const metaLabel = getSessionMetaLabel(session);

  return (
    <div
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void handleSelect();
        }
      }}
      onContextMenu={(event) => { event.preventDefault(); setShowMenu(!showMenu); }}
      title={session.title || session.id}
      className={`oc-session-item ${active ? 'is-active' : ''} ${depth > 0 ? 'oc-session-item--child' : ''}`}
      style={{ paddingInlineStart: `${12 + depth * 18}px` }}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
    >
      <div className="oc-session-item__title-row">
        {depth > 0 && <span className="oc-session-item__branch">Branch</span>}
        <div className="oc-session-item__title">{session.title || `Session ${session.id.slice(0, 8)}`}</div>
      </div>
      <div className="oc-session-item__meta">
        <span>{metaLabel ?? 'Session'}</span>
        <span>{formatTimeAgo(session.updatedAt)}</span>
      </div>
      {showMenu && (
        <div className="oc-session-item__menu">
          <button type="button" onClick={handleDelete} className="oc-inline-delete">Delete</button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
