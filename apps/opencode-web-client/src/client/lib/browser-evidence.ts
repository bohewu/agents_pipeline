import type {
  BrowserEvidenceRecord,
  BrowserEvidenceReference,
  CapabilityProbeStatus,
  TaskLedgerRecord,
  WorkspaceCapabilityProbe,
} from '../../shared/types.js';

export interface BrowserEvidenceCapabilityIssue {
  key: 'previewTarget' | 'browserEvidence';
  label: string;
  status: CapabilityProbeStatus;
  summary: string;
  detail?: string;
}

export interface BrowserEvidenceCapabilityState {
  status: 'ready' | 'degraded';
  tone: 'success' | 'warning' | 'danger';
  title: string;
  summary: string;
  issues: BrowserEvidenceCapabilityIssue[];
}

export interface BrowserEvidenceProjection {
  capabilityState?: BrowserEvidenceCapabilityState;
  browserEvidenceRef?: BrowserEvidenceReference;
}

export interface BrowserEvidenceProjectionInput {
  capabilities?: WorkspaceCapabilityProbe;
  annotation?: { browserEvidenceRef?: BrowserEvidenceReference };
  taskRecord?: Pick<TaskLedgerRecord, 'recentBrowserEvidenceRef'>;
  browserEvidenceRecords?: BrowserEvidenceRecord[];
  sessionId?: string;
  sourceMessageId?: string;
  taskId?: string;
}

const BROWSER_EVIDENCE_CAPABILITY_LABELS = {
  previewTarget: 'Preview target',
  browserEvidence: 'Browser evidence',
} satisfies Record<BrowserEvidenceCapabilityIssue['key'], string>;

export function deriveBrowserEvidenceCapabilityState(
  capabilities?: WorkspaceCapabilityProbe,
): BrowserEvidenceCapabilityState | undefined {
  if (!capabilities) return undefined;

  const issues = (['previewTarget', 'browserEvidence'] as const)
    .flatMap((key) => {
      const probe = capabilities[key];
      if (!probe || probe.status === 'available') {
        return [];
      }

      return [{
        key,
        label: BROWSER_EVIDENCE_CAPABILITY_LABELS[key],
        status: probe.status,
        summary: probe.summary,
        detail: probe.detail,
      } satisfies BrowserEvidenceCapabilityIssue];
    });

  if (issues.length === 0) {
    return {
      status: 'ready',
      tone: 'success',
      title: 'Browser evidence available',
      summary: 'Preview target and browser evidence capture are available for this workspace.',
      issues: [],
    };
  }

  const hasError = issues.some((issue) => issue.status === 'error');
  return {
    status: 'degraded',
    tone: hasError ? 'danger' : 'warning',
    title: hasError ? 'Browser evidence unavailable' : 'Browser evidence degraded',
    summary: `${issues.map((issue) => issue.summary).join(' ')} Command-only lint, build, and test verification remains available.`,
    issues,
  };
}

export function hasAvailableBrowserEvidenceCapability(
  capabilities?: WorkspaceCapabilityProbe,
): boolean {
  return capabilities?.previewTarget?.status === 'available'
    && capabilities?.browserEvidence?.status === 'available';
}

export function deriveBrowserEvidenceProjection(
  args: BrowserEvidenceProjectionInput,
): BrowserEvidenceProjection | undefined {
  const { capabilities, ...context } = args;
  const capabilityState = deriveBrowserEvidenceCapabilityState(capabilities);
  const browserEvidenceRef = hasAvailableBrowserEvidenceCapability(capabilities)
    ? resolveLinkedBrowserEvidenceReference(context)
    : undefined;

  if (!capabilityState && !browserEvidenceRef) {
    return undefined;
  }

  return {
    ...(capabilityState ? { capabilityState } : {}),
    ...(browserEvidenceRef ? { browserEvidenceRef } : {}),
  };
}

export function pickLatestBrowserEvidenceReference(
  references: Array<BrowserEvidenceReference | undefined>,
): BrowserEvidenceReference | undefined {
  return references
    .filter((reference): reference is BrowserEvidenceReference => !!reference)
    .sort(compareBrowserEvidenceReferences)[0];
}

export function resolveLinkedBrowserEvidenceReference(args: {
  annotation?: { browserEvidenceRef?: BrowserEvidenceReference };
  taskRecord?: Pick<TaskLedgerRecord, 'recentBrowserEvidenceRef'>;
  browserEvidenceRecords?: BrowserEvidenceRecord[];
  sessionId?: string;
  sourceMessageId?: string;
  taskId?: string;
}): BrowserEvidenceReference | undefined {
  const record = selectLatestMatchingBrowserEvidenceRecord(args.browserEvidenceRecords ?? [], {
    sessionId: args.sessionId,
    sourceMessageId: args.sourceMessageId,
    taskId: args.taskId,
  });

  return pickLatestBrowserEvidenceReference([
    args.annotation?.browserEvidenceRef,
    args.taskRecord?.recentBrowserEvidenceRef,
    record ? toBrowserEvidenceReference(record) : undefined,
  ]);
}

function selectLatestMatchingBrowserEvidenceRecord(
  records: BrowserEvidenceRecord[],
  context: { sessionId?: string; sourceMessageId?: string; taskId?: string },
): BrowserEvidenceRecord | undefined {
  const sortedRecords = [...records].sort(compareBrowserEvidenceRecords);

  const matchers = [
    (record: BrowserEvidenceRecord) => !!context.sessionId
      && !!context.sourceMessageId
      && record.sessionId === context.sessionId
      && record.sourceMessageId === context.sourceMessageId,
    (record: BrowserEvidenceRecord) => !!context.sessionId
      && !!context.taskId
      && record.sessionId === context.sessionId
      && record.taskId === context.taskId,
    (record: BrowserEvidenceRecord) => !!context.sourceMessageId && record.sourceMessageId === context.sourceMessageId,
    (record: BrowserEvidenceRecord) => !!context.taskId && record.taskId === context.taskId,
  ];

  for (const matcher of matchers) {
    const match = sortedRecords.find(matcher);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function toBrowserEvidenceReference(record: BrowserEvidenceRecord): BrowserEvidenceReference {
  return {
    recordId: record.id,
    capturedAt: record.capturedAt,
    previewUrl: record.previewUrl,
    ...(record.summary ? { summary: record.summary } : {}),
    ...(record.consoleCapture ? { consoleCapture: record.consoleCapture } : {}),
    ...(record.screenshot ? { screenshot: record.screenshot } : {}),
  };
}

function compareBrowserEvidenceRecords(left: BrowserEvidenceRecord, right: BrowserEvidenceRecord): number {
  const delta = new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime();
  if (delta !== 0) return delta;
  return right.id.localeCompare(left.id);
}

function compareBrowserEvidenceReferences(left: BrowserEvidenceReference, right: BrowserEvidenceReference): number {
  const delta = new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime();
  if (delta !== 0) return delta;
  return right.recordId.localeCompare(left.recordId);
}
