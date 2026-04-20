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
      const check = await api.validateWorkspace({ path });
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
      const check = await api.validateWorkspace({ path: currentPath });
      if (!check.valid) {
        setError((check as any).error ?? 'Invalid workspace path');
        setValidating(false);
        return;
      }
      const workspace = await api.addWorkspace({ path: currentPath, name: name.trim() || undefined });
      await api.selectWorkspace(workspace.id).catch(() => {});
      const ws = await api.listWorkspaces();
      setWorkspaces(ws);
      setActiveWorkspace(workspace.id);
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
      position: 'fixed', inset: 0, background: 'rgba(34, 30, 23, 0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-tertiary)', borderRadius: 24, padding: 24, width: 560, maxHeight: '80vh',
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-soft)',
      }}>
        <h2 style={{ fontSize: 16, marginBottom: 12, color: 'var(--text-primary)' }}>Add Workspace</h2>

        {/* Path input bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            name="workspace-path"
            aria-label="Workspace path"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathInputSubmit}
            placeholder="Type path and press Enter..."
            style={{
              flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '8px 10px', fontSize: 13, outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <button onClick={() => browseTo(pathInput.trim())} style={{
            background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '6px 12px', cursor: 'pointer', fontSize: 12,
          }}>Go</button>
          <button onClick={() => browseTo('~')} title="Home" style={{
            background: 'var(--bg-primary)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '6px 10px', cursor: 'pointer', fontSize: 14,
          }}>⌂</button>
        </div>

        {/* Breadcrumb navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, flexWrap: 'wrap',
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <button onClick={() => browseTo('/')} style={breadcrumbStyle}>/</button>
          {pathSegments.map((segment, i) => {
            const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
            return (
              <React.Fragment key={segPath}>
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                <button onClick={() => browseTo(segPath)} style={{
                  ...breadcrumbStyle,
                  color: i === pathSegments.length - 1 ? 'var(--accent)' : 'var(--text-secondary)',
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
          flex: 1, overflow: 'auto', background: 'var(--bg-primary)', borderRadius: 18,
          border: '1px solid var(--border)', minHeight: 200, maxHeight: 320,
        }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>Loading...</div>
          ) : (
            <div>
              {/* Parent directory */}
              {parentPath && (
                <button
                  onClick={() => browseTo(parentPath)}
                  style={dirEntryStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 14 }}>↑</span>
                  <span style={{ color: 'var(--text-secondary)' }}>..</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>Parent directory</span>
                </button>
              )}

              {entries.length === 0 && !parentPath && (
                <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>Empty directory</div>
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ marginRight: 8, fontSize: 14 }}>
                      {entry.isGitRepo ? 'Repo' : 'Dir'}
                  </span>
                  <span style={{ color: entry.isGitRepo ? 'var(--success)' : 'var(--text-primary)' }}>
                    {entry.name}
                  </span>
                  {entry.isGitRepo && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--success)', background: 'var(--success-soft)', padding: '1px 6px', borderRadius: 999 }}>
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
          <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>
            Git root detected: {displayPath(validationInfo.gitRoot)}
          </div>
        )}

        {/* Name field */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Workspace name (optional)
          </label>
          <input
            name="workspace-name"
            aria-label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={currentPath.split('/').pop() || 'My Project'}
            style={{
              width: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '8px 10px', fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
            Selected: {displayPath(currentPath)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)',
              borderRadius: 999, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
            }}>Cancel</button>
            <button onClick={handleSelectCurrent} disabled={validating || !currentPath} style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 999, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
              opacity: validating ? 0.6 : 1,
            }}>{validating ? 'Adding...' : 'Select This Folder'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const breadcrumbStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
  padding: '2px 4px', fontSize: 12, borderRadius: 2,
};

const dirEntryStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
  cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)',
};
