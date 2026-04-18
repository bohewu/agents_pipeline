import React, { useState, useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { api } from '../../lib/api-client.js';

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

export function AddWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const { setWorkspaces, setActiveWorkspace } = useStore();
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [homePath, setHomePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [pathInput, setPathInput] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationInfo, setValidationInfo] = useState<{ gitRoot?: string } | null>(null);

  // Initial load: browse home directory
  useEffect(() => {
    browseTo('~');
  }, []);

  const browseTo = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.browse(path);
      setCurrentPath(result.currentPath);
      setParentPath(result.parentPath);
      setEntries(result.entries);
      setHomePath(result.homePath);
      setPathInput(result.currentPath);
      // Validate current path for git info
      validatePath(result.currentPath);
    } catch (e: any) {
      setError(e.message ?? 'Failed to browse directory');
    } finally {
      setLoading(false);
    }
  };

  const validatePath = async (path: string) => {
    try {
      const check = await api.validateWorkspace({ rootPath: path });
      setValidationInfo(check.valid ? { gitRoot: (check as any).gitRoot } : null);
    } catch {
      setValidationInfo(null);
    }
  };

  const handlePathInputSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pathInput.trim()) {
      browseTo(pathInput.trim());
    }
  };

  const handleSelectCurrent = async () => {
    if (!currentPath) return;
    setValidating(true);
    setError('');
    try {
      const check = await api.validateWorkspace({ rootPath: currentPath });
      if (!check.valid) {
        setError((check as any).error ?? 'Invalid workspace path');
        setValidating(false);
        return;
      }
      await api.addWorkspace({ rootPath: currentPath, name: name.trim() || undefined });
      const ws = await api.listWorkspaces();
      setWorkspaces(ws);
      if (ws.length > 0) setActiveWorkspace(ws[ws.length - 1].id);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add workspace');
    } finally {
      setValidating(false);
    }
  };

  const displayPath = (fullPath: string) => {
    if (homePath && fullPath.startsWith(homePath)) {
      return '~' + fullPath.slice(homePath.length);
    }
    return fullPath;
  };

  // Breadcrumb segments
  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#16213e', borderRadius: 8, padding: 24, width: 560, maxHeight: '80vh',
        border: '1px solid #2a2a4a', display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ fontSize: 16, marginBottom: 12, color: '#e0e0e0' }}>Add Workspace</h2>

        {/* Path input bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathInputSubmit}
            placeholder="Type path and press Enter..."
            style={{
              flex: 1, background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
              borderRadius: 4, padding: '8px 10px', fontSize: 13, outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <button onClick={() => browseTo(pathInput.trim())} style={{
            background: '#2a2a4a', color: '#e0e0e0', border: 'none', borderRadius: 4,
            padding: '6px 12px', cursor: 'pointer', fontSize: 12,
          }}>Go</button>
          <button onClick={() => browseTo('~')} title="Home" style={{
            background: '#2a2a4a', color: '#4c9eff', border: 'none', borderRadius: 4,
            padding: '6px 10px', cursor: 'pointer', fontSize: 14,
          }}>⌂</button>
        </div>

        {/* Breadcrumb navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, flexWrap: 'wrap',
          fontSize: 12, color: '#888',
        }}>
          <button onClick={() => browseTo('/')} style={breadcrumbStyle}>/</button>
          {pathSegments.map((segment, i) => {
            const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
            return (
              <React.Fragment key={segPath}>
                <span style={{ color: '#555' }}>/</span>
                <button onClick={() => browseTo(segPath)} style={{
                  ...breadcrumbStyle,
                  color: i === pathSegments.length - 1 ? '#4c9eff' : '#aaa',
                  fontWeight: i === pathSegments.length - 1 ? 600 : 400,
                }}>
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Directory listing */}
        <div style={{
          flex: 1, overflow: 'auto', background: '#1a1a2e', borderRadius: 6,
          border: '1px solid #2a2a4a', minHeight: 200, maxHeight: 320,
        }}>
          {loading ? (
            <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Loading...</div>
          ) : (
            <div>
              {/* Parent directory */}
              {parentPath && (
                <button
                  onClick={() => browseTo(parentPath)}
                  style={dirEntryStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a4a')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: '#888', marginRight: 8, fontSize: 14 }}>↑</span>
                  <span style={{ color: '#aaa' }}>..</span>
                  <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>Parent directory</span>
                </button>
              )}

              {entries.length === 0 && !parentPath && (
                <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Empty directory</div>
              )}

              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => browseTo(entry.path)}
                  onDoubleClick={() => {
                    setPathInput(entry.path);
                    setCurrentPath(entry.path);
                  }}
                  style={dirEntryStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a4a')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ marginRight: 8, fontSize: 14 }}>
                    {entry.isGitRepo ? '📂' : '📁'}
                  </span>
                  <span style={{ color: entry.isGitRepo ? '#4caf50' : '#e0e0e0' }}>
                    {entry.name}
                  </span>
                  {entry.isGitRepo && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#4caf50', background: '#1e3a1e', padding: '1px 6px', borderRadius: 3 }}>
                      git
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Git root info */}
        {validationInfo?.gitRoot && validationInfo.gitRoot !== currentPath && (
          <div style={{ fontSize: 11, color: '#ff9800', marginTop: 8 }}>
            ⚠ Git root detected: {displayPath(validationInfo.gitRoot)}
          </div>
        )}

        {/* Name field */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>
            Workspace name (optional)
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={currentPath.split('/').pop() || 'My Project'}
            style={{
              width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a2a4a',
              borderRadius: 4, padding: '8px 10px', fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {error && <div style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
            Selected: {displayPath(currentPath)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'transparent', color: '#aaa', border: '1px solid #2a2a4a',
              borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
            }}>Cancel</button>
            <button onClick={handleSelectCurrent} disabled={validating || !currentPath} style={{
              background: '#4c9eff', color: '#fff', border: 'none',
              borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
              opacity: validating ? 0.6 : 1,
            }}>{validating ? 'Adding...' : 'Select This Folder'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const breadcrumbStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
  padding: '2px 4px', fontSize: 12, borderRadius: 2,
};

const dirEntryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
  background: 'transparent', border: 'none', borderBottom: '1px solid #2a2a4a',
  cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#e0e0e0',
};
