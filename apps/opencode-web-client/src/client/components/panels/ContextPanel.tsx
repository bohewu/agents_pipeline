import React from 'react';
import type {
  WorkspaceCapabilityCategory,
  WorkspaceCapabilityEntry,
  WorkspaceContextEntryStatus,
  WorkspaceContextSourceLayer,
  WorkspaceInstructionSourceCategory,
  WorkspaceInstructionSourceEntry,
} from '../../../shared/types.js';
import {
  selectActiveWorkspaceContextCatalog,
  selectActiveWorkspaceContextCatalogError,
  selectActiveWorkspaceContextCatalogLoading,
  selectActiveWorkspaceContextCapabilityEntries,
  selectActiveWorkspaceContextInstructionSources,
  useStore,
} from '../../runtime/store.js';

const SOURCE_LAYER_LABELS: Record<WorkspaceContextSourceLayer, string> = {
  'project-local': 'Project-local',
  'user-global': 'User-global',
  'app-bundled': 'App-bundled',
};

const INSTRUCTION_CATEGORY_LABELS: Record<WorkspaceInstructionSourceCategory, string> = {
  'agents-file': 'AGENTS.md',
  'opencode-dir': '.opencode',
  'claude-file': 'CLAUDE.md',
  'claude-agent': 'Claude agents',
  'copilot-instructions': 'Copilot instructions',
  'cursor-rule': 'Cursor rules',
};

const CAPABILITY_CATEGORY_LABELS: Record<WorkspaceCapabilityCategory, string> = {
  plugin: 'Plugin',
  command: 'Command',
  tool: 'Tool',
  'usage-asset': 'Usage asset',
  'effort-asset': 'Effort asset',
  skill: 'Skill',
  'mcp-asset': 'MCP asset',
};

export function ContextPanel() {
  const activeWorkspaceId = useStore((store) => store.activeWorkspaceId);
  const workspaceBootstraps = useStore((store) => store.workspaceBootstraps);
  const catalog = useStore(selectActiveWorkspaceContextCatalog);
  const instructionSources = useStore(selectActiveWorkspaceContextInstructionSources);
  const capabilityEntries = useStore(selectActiveWorkspaceContextCapabilityEntries);
  const loading = useStore(selectActiveWorkspaceContextCatalogLoading);
  const error = useStore(selectActiveWorkspaceContextCatalogError);

  const workspaceName = activeWorkspaceId
    ? workspaceBootstraps[activeWorkspaceId]?.workspace.name ?? activeWorkspaceId
    : null;

  if (!activeWorkspaceId) {
    return (
      <PanelState
        title="No workspace selected"
        body="Choose a workspace to review its read-only instruction sources and capability inventory."
      />
    );
  }

  if (loading && !catalog) {
    return (
      <PanelState
        title="Loading workspace context"
        body={`Collecting instruction sources and capability inventory for ${workspaceName ?? 'this workspace'}.`}
      />
    );
  }

  if (error && !catalog) {
    return (
      <PanelState
        title="Context surface unavailable"
        body={error}
        tone="error"
      />
    );
  }

  if (!catalog) {
    return (
      <PanelState
        title="Workspace context not loaded yet"
        body={`The drawer has not surfaced context data for ${workspaceName ?? 'this workspace'} yet.`}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Context &amp; extensions</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Read-only workspace context for {workspaceName ?? 'this workspace'}. Source-layer labels show whether an instruction or capability is project-local, user-global, or app-bundled.
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Collected {formatTimestamp(catalog.collectedAt)}.
        </div>

        {loading && (
          <InlineNotice tone="neutral" text={`Refreshing context data for ${workspaceName ?? 'this workspace'}.`} />
        )}
        {error && (
          <InlineNotice tone="error" text={error} />
        )}
      </section>

      <SectionCard
        title="Instruction sources"
        body="Workspace-scoped instruction sources stay read-only here, including AGENTS.md, .opencode, and supported project-local instruction files when present."
      >
        {instructionSources.length === 0 ? (
          <PanelState
            compact
            title="No instruction sources surfaced"
            body={`No supported project-local instruction sources are currently visible for ${workspaceName ?? 'this workspace'}.`}
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {instructionSources.map((entry) => <InstructionSourceCard key={entry.id} entry={entry} />)}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Capability inventory"
        body="Every capability row stays labeled by category, source layer, and availability so missing or degraded assets remain explainable inside this drawer."
      >
        {capabilityEntries.length === 0 ? (
          <PanelState
            compact
            title="No capability inventory surfaced"
            body={`No project-local, user-global, or app-bundled capability entries are currently visible for ${workspaceName ?? 'this workspace'}.`}
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {capabilityEntries.map((entry) => <CapabilityEntryCard key={entry.id} entry={entry} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
      </div>
      {children}
    </section>
  );
}

function InstructionSourceCard({ entry }: { entry: WorkspaceInstructionSourceEntry }) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <EntryHeader
        label={entry.label}
        badges={[
          { label: INSTRUCTION_CATEGORY_LABELS[entry.category], tone: 'neutral' },
          { label: SOURCE_LAYER_LABELS[entry.sourceLayer], tone: 'neutral' },
          { label: formatStatus(entry.status), tone: statusTone(entry.status) },
        ]}
      />

      <MetadataRow label="Path" value={entry.path} mono />
      {renderItemSummary(entry.itemCount, entry.items)}
      {entry.detail && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{entry.detail}</div>
      )}
      {entry.status !== 'available' && (
        <RemediationCallout text={resolveRemediation(entry.label, entry.sourceLayer, entry.status, entry.remediation)} />
      )}
    </section>
  );
}

function CapabilityEntryCard({ entry }: { entry: WorkspaceCapabilityEntry }) {
  return (
    <section className="oc-surface-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <EntryHeader
        label={entry.label}
        badges={[
          { label: CAPABILITY_CATEGORY_LABELS[entry.category], tone: 'neutral' },
          { label: SOURCE_LAYER_LABELS[entry.sourceLayer], tone: 'neutral' },
          { label: formatStatus(entry.status), tone: statusTone(entry.status) },
        ]}
      />

      <MetadataRow label="Path" value={entry.path} mono />
      {renderItemSummary(entry.itemCount, entry.items)}
      {entry.detail && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{entry.detail}</div>
      )}
      {entry.status !== 'available' && (
        <RemediationCallout text={resolveRemediation(entry.label, entry.sourceLayer, entry.status, entry.remediation)} />
      )}
    </section>
  );
}

function EntryHeader({
  label,
  badges,
}: {
  label: string;
  badges: Array<{ label: string; tone: PillTone }>;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {badges.map((badge) => (
          <span key={`${label}-${badge.label}`} style={pillStyle(badge.tone)}>
            {badge.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        wordBreak: 'break-word',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>
        {value}
      </div>
    </div>
  );
}

function InlineNotice({ tone, text }: { tone: 'neutral' | 'error'; text: string }) {
  return (
    <div style={{
      ...noticeStyle(tone),
      fontSize: 11,
      lineHeight: 1.6,
      padding: '8px 10px',
      borderRadius: 12,
    }}>
      {text}
    </div>
  );
}

function RemediationCallout({ text }: { text: string }) {
  return (
    <div style={{
      ...noticeStyle('warning'),
      padding: '10px 12px',
      borderRadius: 12,
      fontSize: 12,
      lineHeight: 1.6,
    }}>
      <span style={{ fontWeight: 700 }}>Remediation:</span> {text}
    </div>
  );
}

function PanelState({
  title,
  body,
  tone = 'neutral',
  compact = false,
}: {
  title: string;
  body: string;
  tone?: 'neutral' | 'error';
  compact?: boolean;
}) {
  return (
    <div className="oc-surface-card" style={{
      padding: compact ? 14 : 16,
      display: 'grid',
      gap: 6,
      ...(tone === 'error' ? noticeStyle('error') : {}),
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: tone === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: tone === 'error' ? 'var(--error)' : 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function renderItemSummary(itemCount?: number, items?: string[]): React.ReactNode {
  if (!itemCount && (!items || items.length === 0)) {
    return null;
  }

  const countLabel = itemCount === 1 ? '1 item' : `${itemCount ?? items?.length ?? 0} items`;
  const itemsLabel = items && items.length > 0 ? ` · ${items.join(', ')}` : '';

  return (
    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {countLabel}{itemsLabel}
    </div>
  );
}

function resolveRemediation(
  label: string,
  sourceLayer: WorkspaceContextSourceLayer,
  status: Exclude<WorkspaceContextEntryStatus, 'available'>,
  remediation?: string,
): string {
  if (remediation) {
    return remediation;
  }

  const layerLabel = SOURCE_LAYER_LABELS[sourceLayer].toLowerCase();
  if (status === 'missing') {
    return `Restore the ${label} source in the ${layerLabel} layer and refresh this drawer.`;
  }

  return `Repair the ${label} source in the ${layerLabel} layer before relying on it here.`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatStatus(status: WorkspaceContextEntryStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type PillTone = 'neutral' | 'success' | 'warning' | 'danger';

function statusTone(status: WorkspaceContextEntryStatus): PillTone {
  if (status === 'available') return 'success';
  if (status === 'missing') return 'danger';
  return 'warning';
}

function pillStyle(tone: PillTone): React.CSSProperties {
  const palette = tone === 'success'
    ? { color: 'var(--success)', border: 'rgba(16, 163, 127, 0.18)', background: 'var(--success-soft)' }
    : tone === 'warning'
      ? { color: 'var(--warning)', border: 'rgba(183, 121, 31, 0.2)', background: 'var(--warning-soft)' }
      : tone === 'danger'
        ? { color: 'var(--error)', border: 'rgba(220, 38, 38, 0.18)', background: 'var(--error-soft)' }
        : { color: 'var(--text-secondary)', border: 'rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)' };

  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
    padding: '0 8px',
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
}

function noticeStyle(tone: 'neutral' | 'warning' | 'error'): React.CSSProperties {
  if (tone === 'warning') {
    return {
      border: '1px solid rgba(183, 121, 31, 0.2)',
      background: 'var(--warning-soft)',
      color: 'var(--warning)',
    };
  }

  if (tone === 'error') {
    return {
      border: '1px solid rgba(220, 38, 38, 0.18)',
      background: 'var(--error-soft)',
      color: 'var(--error)',
    };
  }

  return {
    border: '1px solid rgba(15, 23, 42, 0.12)',
    background: 'rgba(15, 23, 42, 0.04)',
    color: 'var(--text-secondary)',
  };
}
