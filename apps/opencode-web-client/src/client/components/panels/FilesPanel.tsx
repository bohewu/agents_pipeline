import React, { useState, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';
import type { FileStatusResponse } from '../../../shared/types.js';

const STATUS_COLORS: Record<string, string> = {
  added: 'var(--success)', modified: 'var(--warning)', deleted: 'var(--error)', unchanged: 'var(--text-muted)',
};

export function FilesPanel() {
  const { activeWorkspaceId } = useStore();
  const [files, setFiles] = useState<FileStatusResponse[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    api.getFileStatus(activeWorkspaceId).then(setFiles).catch(() => setFiles([]));
  }, [activeWorkspaceId]);

  const handleSearch = async () => {
    if (!activeWorkspaceId || !query.trim()) return;
    try {
      const results = await api.searchFiles(activeWorkspaceId, query.trim());
      setSearchResults(results);
    } catch { setSearchResults([]); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search files..."
          style={{
            flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '6px 10px', fontSize: 12, outline: 'none',
          }}
        />
        <button onClick={handleSearch} style={{
          background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999,
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        }}>Find</button>
      </div>

      {searchResults.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Search results:</div>
          {searchResults.map((f, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', padding: '2px 0' }}>
              {f}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Changed files:</div>
      {files.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No file changes</div>
      ) : (
        files.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: STATUS_COLORS[f.status] ?? 'var(--text-muted)', flexShrink: 0,
            }} />
            <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.path}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: STATUS_COLORS[f.status] ?? 'var(--text-muted)' }}>
              {f.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
