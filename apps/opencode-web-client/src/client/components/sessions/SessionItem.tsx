import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import type { SessionSummary } from '../../../shared/types.js';
import { getSessionBadgeLabel, getSessionMetaLabel } from '../../lib/session-meta.js';
import { reopenWorkspaceSessionContext } from '../../lib/session-context.js';

export function SessionItem({
  session,
  active,
  depth,
  metaLabel,
  updatedAt,
  latestChildTitle,
}: {
  session: SessionSummary;
  active: boolean;
  depth: number;
  metaLabel?: string | null;
  updatedAt?: string;
  latestChildTitle?: string | null;
}) {
  const { activeWorkspaceId, setActiveSession, setSessions } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const [showTitlePreview, setShowTitlePreview] = useState(false);
  const [titleOverflowing, setTitleOverflowing] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);

  const handleSelect = async () => {
    if (!activeWorkspaceId) return;
    try {
      await reopenWorkspaceSessionContext(activeWorkspaceId, session.id);
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

  const title = session.title || `Session ${session.id.slice(0, 8)}`;
  const displayMetaLabel = metaLabel ?? getSessionMetaLabel(session);
  const badgeLabel = getSessionBadgeLabel(session);
  const showExpandedTitle = titleOverflowing && showTitlePreview;
  const displayUpdatedAt = updatedAt ?? session.updatedAt;

  useEffect(() => {
    const node = titleRef.current;
    if (!node) return;

    const updateOverflow = () => {
      setTitleOverflowing(node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
    };

    updateOverflow();
    window.addEventListener('resize', updateOverflow);
    return () => window.removeEventListener('resize', updateOverflow);
  }, [title]);

  return (
    <div
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void handleSelect();
        }
      }}
      onMouseEnter={() => setShowTitlePreview(true)}
      onMouseLeave={() => setShowTitlePreview(false)}
      onFocus={() => setShowTitlePreview(true)}
      onBlur={() => setShowTitlePreview(false)}
      onContextMenu={(event) => { event.preventDefault(); setShowMenu(!showMenu); }}
      title={title}
      className={`oc-session-item ${active ? 'is-active' : ''} ${depth > 0 ? 'oc-session-item--child' : ''}`}
      style={{ paddingInlineStart: `${12 + depth * 18}px` }}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
    >
      <div className="oc-session-item__title-row">
        {badgeLabel && <span className="oc-session-item__branch">{badgeLabel}</span>}
        <div ref={titleRef} className="oc-session-item__title">{title}</div>
      </div>
      {latestChildTitle && depth === 0 && (
        <div className="oc-session-item__latest">Latest branch: {latestChildTitle}</div>
      )}
      <div className="oc-session-item__meta">
        <span>{displayMetaLabel ?? 'Session'}</span>
        <span>{formatTimeAgo(displayUpdatedAt)}</span>
      </div>
      {showExpandedTitle && (
        <div className="oc-session-item__title-preview">{title}</div>
      )}
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
