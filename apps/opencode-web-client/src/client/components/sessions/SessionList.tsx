import React from 'react';
import { useStore } from '../../runtime/store.js';
import { getItem, setItem } from '../../lib/local-storage.js';
import type { SessionsDefaultView } from '../../lib/app-settings.js';
import { SessionItem } from './SessionItem.js';
import { buildSessionGroups, getSessionMetaLabel, matchesSessionQuery } from '../../lib/session-meta.js';
import { SearchIcon, ChevronDownIcon } from '../common/Icons.js';

type SessionFilter = SessionsDefaultView;

const FILTERS: Array<{ key: SessionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'roots', label: 'Chats' },
  { key: 'branches', label: 'Branches' },
];

export function SessionList() {
  const { activeWorkspaceId, sessionsByWorkspace, activeSessionByWorkspace, settings } = useStore();
  const [query, setQuery] = React.useState('');
  const [filter, setFilterState] = React.useState<SessionFilter>('all');
  const [expandedRoots, setExpandedRoots] = React.useState<Record<string, boolean>>({});
  if (!activeWorkspaceId) return null;

  React.useEffect(() => {
    setFilterState(readSessionFilter(activeWorkspaceId, settings.sessionsDefaultView));
  }, [activeWorkspaceId, settings.sessionsDefaultView]);

  const sessions = sessionsByWorkspace[activeWorkspaceId] ?? [];
  const activeSessionId = activeSessionByWorkspace[activeWorkspaceId];
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const groups = buildSessionGroups(sessions);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = groups.flatMap((group) => {
    const rootMatches = matchesSessionQuery(group.root, normalizedQuery);
    const matchingChildren = group.children.filter((child) => matchesSessionQuery(child, normalizedQuery));

    if (filter === 'roots' && normalizedQuery && !rootMatches) {
      return [];
    }

    if (filter === 'branches' && group.branchCount === 0) {
      return [];
    }

    if (normalizedQuery && !rootMatches && matchingChildren.length === 0) {
      return [];
    }

    const visibleChildren = filter === 'roots'
      ? []
      : normalizedQuery.length === 0
        ? group.children
        : rootMatches
          ? group.children
          : matchingChildren;

    if (filter === 'branches' && visibleChildren.length === 0) {
      return [];
    }

    return [{
      ...group,
      visibleChildren,
      hiddenChildren: Math.max(0, group.children.length - visibleChildren.length),
      rootMatches,
    }];
  });

  if (groups.length === 0) {
    return <div className="oc-session-list__empty">No sessions yet</div>;
  }

  const toggleRoot = (rootId: string, nextOpen?: boolean) => {
    setExpandedRoots((current) => ({
      ...current,
      [rootId]: nextOpen ?? !current[rootId],
    }));
  };

  const setFilter = (next: SessionFilter) => {
    setFilterState(next);
    saveSessionFilter(activeWorkspaceId, next);
  };

  const activeSessionVisible = !activeSessionId || visibleGroups.some((group) => {
    return group.root.id === activeSessionId || group.visibleChildren.some((child) => child.id === activeSessionId);
  });

  return (
    <div className="oc-session-list-shell">
      <div className="oc-session-tools">
        <label className="oc-session-search">
          <SearchIcon size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search sessions"
          />
        </label>

        <div className="oc-session-filters" role="tablist" aria-label="Session filters">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`oc-session-filter ${filter === entry.key ? 'is-active' : ''}`}
              onClick={() => setFilter(entry.key)}
              aria-pressed={filter === entry.key}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="oc-session-list__empty">
          {normalizedQuery || filter !== 'all' ? 'No sessions match this view' : 'No sessions yet'}
        </div>
      ) : (
        <div className="oc-session-list">
          {activeSession && !activeSessionVisible && normalizedQuery.length === 0 && (
            <div className="oc-session-list__pinned">
              <div className="oc-session-list__pinned-label">Current selection</div>
              <SessionItem
                session={activeSession}
                depth={activeSession.parentId ? 1 : 0}
                active
                metaLabel={getSessionMetaLabel(activeSession)}
              />
            </div>
          )}

          {visibleGroups.map((group) => {
            const autoExpanded = filter === 'branches'
              || normalizedQuery.length > 0
              || group.root.id === activeSessionId
              || group.visibleChildren.some((child) => child.id === activeSessionId);
            const expanded = expandedRoots[group.root.id] ?? autoExpanded;
            const rootMeta = group.branchCount > 0
              ? `${group.branchCount} branch${group.branchCount === 1 ? '' : 'es'}`
              : getSessionMetaLabel(group.root);

            return (
              <div key={group.root.id} className="oc-session-group">
                <SessionItem
                  session={group.root}
                  depth={0}
                  active={group.root.id === activeSessionId}
                  metaLabel={rootMeta}
                  updatedAt={group.latestActivityAt}
                  latestChildTitle={group.latestSession.id !== group.root.id ? (group.latestSession.title ?? null) : null}
                />

                {group.branchCount > 0 && (
                  <>
                    <button
                      type="button"
                      className={`oc-session-group__toggle ${expanded ? 'is-open' : ''}`}
                      onClick={() => toggleRoot(group.root.id, !expanded)}
                      aria-expanded={expanded}
                    >
                      <ChevronDownIcon size={14} className="oc-session-group__toggle-icon" />
                      <span>
                        {expanded ? 'Hide' : 'Show'} {normalizedQuery && !group.rootMatches ? group.visibleChildren.length : group.branchCount} {normalizedQuery && !group.rootMatches ? 'matching ' : ''}branch{((normalizedQuery && !group.rootMatches ? group.visibleChildren.length : group.branchCount) === 1) ? '' : 'es'}
                      </span>
                      {group.hiddenChildren > 0 && normalizedQuery.length > 0 && (
                        <span className="oc-session-group__toggle-count">+{group.hiddenChildren}</span>
                      )}
                    </button>

                    {expanded && group.visibleChildren.length > 0 && (
                      <div className="oc-session-group__children">
                        {group.visibleChildren.map((child) => (
                          <SessionItem
                            key={child.id}
                            session={child}
                            depth={1}
                            active={child.id === activeSessionId}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function readSessionFilter(workspaceId: string, fallback: SessionFilter): SessionFilter {
  const value = getItem<SessionFilter>(`sessions-filter:${workspaceId}`, fallback);
  return FILTERS.some((entry) => entry.key === value) ? value : 'all';
}

function saveSessionFilter(workspaceId: string, filter: SessionFilter): void {
  setItem(`sessions-filter:${workspaceId}`, filter);
}
