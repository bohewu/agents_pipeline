import React, { useEffect, useMemo, useState } from 'react';
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusByPath = useMemo(() => {
    return new Map(files.map((file) => [file.path, file.status]));
  }, [files]);

  const loadFiles = async () => {
    if (!activeWorkspaceId) return;
    setLoadingFiles(true);
    setError(null);
    try {
      const nextFiles = await api.getFileStatus(activeWorkspaceId);
      setFiles(nextFiles);
    } catch (err: any) {
      setFiles([]);
      setError(err.message ?? 'Failed to load changed files');
    }
    setLoadingFiles(false);
  };

  const openFile = async (path: string) => {
    if (!activeWorkspaceId) return;
    setSelectedPath(path);
    setLoadingContent(true);
    try {
      const response = await api.getFileContent(activeWorkspaceId, path);
      setSelectedContent(response.content);
    } catch (err: any) {
      setSelectedContent(err.message ?? 'Failed to load file contents');
    }
    setLoadingContent(false);
  };

  useEffect(() => {
    setFiles([]);
    setSearchResults([]);
    setSelectedPath(null);
    setSelectedContent('');
    setError(null);
    if (!activeWorkspaceId) return;
    void loadFiles();
  }, [activeWorkspaceId]);

  const handleSearch = async () => {
    if (!activeWorkspaceId || !query.trim()) return;
    setSearching(true);
    try {
      const results = await api.searchFiles(activeWorkspaceId, query.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  if (!activeWorkspaceId) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Open a workspace to inspect files.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Files</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {loadingFiles ? 'Refreshing changed files...' : `${files.length} changed file${files.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadFiles()}
          disabled={loadingFiles}
          style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          }}
        >
          {loadingFiles ? '...' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
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
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={searching || !query.trim()}
          style={{
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          }}
        >
          {searching ? '...' : 'Find'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--error)', lineHeight: 1.5 }}>{error}</div>
      )}

      {query.trim().length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Search results</div>
          {searchResults.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {searching ? 'Searching...' : 'No matches yet'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {searchResults.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => void openFile(path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    border: '1px solid var(--border)', borderRadius: 12, background: selectedPath === path ? 'var(--bg-active)' : 'var(--bg-primary)',
                    padding: '8px 10px', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {path}
                  </span>
                  {statusByPath.get(path) && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: STATUS_COLORS[statusByPath.get(path) ?? 'unchanged'] ?? 'var(--text-muted)' }}>
                      {statusByPath.get(path)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Changed files</div>
        {files.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {loadingFiles ? 'Loading changes...' : 'No tracked file changes'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => void openFile(file.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  border: '1px solid var(--border)', borderRadius: 12, background: selectedPath === file.path ? 'var(--bg-active)' : 'var(--bg-primary)',
                  padding: '8px 10px', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: STATUS_COLORS[file.status] ?? 'var(--text-muted)', flexShrink: 0,
                }} />
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.path}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: STATUS_COLORS[file.status] ?? 'var(--text-muted)' }}>
                  {file.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          {selectedPath ? selectedPath : 'Preview'}
        </div>
        <div style={{
          background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 16, padding: 12,
          minHeight: 180, maxHeight: 360, overflow: 'auto',
        }}>
          {!selectedPath ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Select a changed file or search result to preview it here.</div>
          ) : loadingContent ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading file...</div>
          ) : (
            <pre style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>
              {selectedContent}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
