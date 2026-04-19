import React from 'react';
import { useStore } from '../../runtime/store.js';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? 'var(--success)' : 'var(--error)', marginRight: 6,
    }} />
  );
}

export function DiagnosticsView({ compact }: { compact?: boolean }) {
  const { install } = useStore();
  if (!install) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>;

  const rows: { label: string; ok: boolean; detail?: string }[] = [
    { label: 'App installed', ok: install.app.installed, detail: `v${install.app.version}` },
    { label: 'OpenCode binary', ok: install.opencode.found, detail: install.opencode.version ?? install.opencode.binaryPath },
    { label: 'Node.js', ok: install.runtimes.node.found, detail: install.runtimes.node.version },
    { label: 'Python', ok: install.runtimes.python.found, detail: install.runtimes.python.version },
    { label: 'Git', ok: install.runtimes.git.found, detail: install.runtimes.git.version },
    { label: 'Effort plugin', ok: install.assets.effortPlugin.installed },
    { label: 'Effort state helper', ok: install.assets.effortStateHelper.installed },
    { label: 'Usage command', ok: install.assets.usageCommand.installed },
    { label: 'Provider usage tool', ok: install.assets.providerUsageTool.installed },
  ];

  const visibleRows = compact ? rows.slice(0, 5) : rows;

  return (
    <div>
      {visibleRows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', padding: '3px 0', fontSize: 12,
        }}>
          <StatusDot ok={r.ok} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{r.label}</span>
          {r.detail && <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.detail}</span>}
        </div>
      ))}
      {!compact && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          <div>Data: {install.app.dataDir}</div>
          <div>Config: {install.app.configDir}</div>
          <div>OpenCode config: {install.opencode.configDir} ({install.opencode.configDirSource})</div>
        </div>
      )}
    </div>
  );
}
