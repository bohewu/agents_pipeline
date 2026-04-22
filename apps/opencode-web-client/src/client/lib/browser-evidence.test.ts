import { describe, expect, it } from 'vitest';

import { deriveBrowserEvidenceProjection } from './browser-evidence.js';
import type {
  BrowserEvidenceRecord,
  BrowserEvidenceReference,
  WorkspaceCapabilityProbe,
} from '../../shared/types.js';

describe('browser evidence projection', () => {
  it('keeps browser evidence gated off when preview or browser capture is unavailable', () => {
    const projection = deriveBrowserEvidenceProjection({
      capabilities: makeCapabilityProbe('workspace-browser', {
        previewTarget: {
          status: 'unavailable',
          summary: 'Preview target unavailable',
          detail: 'No preview script detected.',
        },
        browserEvidence: {
          status: 'unavailable',
          summary: 'Browser evidence unavailable',
          detail: 'Preview runtime is disabled.',
        },
      }),
      annotation: { browserEvidenceRef: makeBrowserEvidenceReference('annotation-ref', '2026-04-22T14:00:00.000Z') },
      taskRecord: { recentBrowserEvidenceRef: makeBrowserEvidenceReference('task-ref', '2026-04-22T14:05:00.000Z') },
      browserEvidenceRecords: [
        makeBrowserEvidenceRecord('workspace-browser', 'record-ref', '2026-04-22T14:10:00.000Z'),
      ],
      sessionId: 'session-browser',
      sourceMessageId: 'message-browser',
      taskId: 'task-browser',
    });

    expect(projection?.capabilityState).toEqual(expect.objectContaining({
      status: 'degraded',
      tone: 'warning',
      title: 'Browser evidence degraded',
      summary: expect.stringContaining('Command-only lint, build, and test verification remains available.'),
    }));
    expect(projection?.browserEvidenceRef).toBeUndefined();
  });

  it('projects the latest matching browser evidence when preview and browser capture are available', () => {
    const projection = deriveBrowserEvidenceProjection({
      capabilities: makeCapabilityProbe('workspace-browser'),
      annotation: { browserEvidenceRef: makeBrowserEvidenceReference('annotation-ref', '2026-04-22T14:00:00.000Z') },
      taskRecord: { recentBrowserEvidenceRef: makeBrowserEvidenceReference('task-ref', '2026-04-22T14:05:00.000Z') },
      browserEvidenceRecords: [
        makeBrowserEvidenceRecord('workspace-browser', 'record-other', '2026-04-22T14:30:00.000Z', {
          sessionId: 'session-other',
          sourceMessageId: 'message-other',
          taskId: 'task-other',
        }),
        makeBrowserEvidenceRecord('workspace-browser', 'record-match', '2026-04-22T14:10:00.000Z'),
      ],
      sessionId: 'session-browser',
      sourceMessageId: 'message-browser',
      taskId: 'task-browser',
    });

    expect(projection).toEqual(expect.objectContaining({
      capabilityState: expect.objectContaining({
        status: 'ready',
        tone: 'success',
      }),
      browserEvidenceRef: expect.objectContaining({
        recordId: 'record-match',
        previewUrl: 'http://127.0.0.1:4173/',
      }),
    }));
  });
});

function makeCapabilityProbe(
  workspaceId: string,
  overrides?: Partial<WorkspaceCapabilityProbe>,
): WorkspaceCapabilityProbe {
  const available = { status: 'available', summary: 'Available' } as const;
  return {
    workspaceId,
    checkedAt: '2026-04-22T14:00:00.000Z',
    localGit: available,
    ghCli: available,
    ghAuth: available,
    previewTarget: available,
    browserEvidence: available,
    ...overrides,
  };
}

function makeBrowserEvidenceReference(recordId: string, capturedAt: string): BrowserEvidenceReference {
  return {
    recordId,
    capturedAt,
    previewUrl: 'http://127.0.0.1:4173/',
    summary: `Captured browser evidence for ${recordId}.`,
  };
}

function makeBrowserEvidenceRecord(
  workspaceId: string,
  id: string,
  capturedAt: string,
  overrides: Partial<BrowserEvidenceRecord> = {},
): BrowserEvidenceRecord {
  return {
    id,
    workspaceId,
    capturedAt,
    ...(overrides.sessionId ?? 'session-browser' ? { sessionId: overrides.sessionId ?? 'session-browser' } : {}),
    ...(overrides.sourceMessageId ?? 'message-browser' ? { sourceMessageId: overrides.sourceMessageId ?? 'message-browser' } : {}),
    ...(overrides.taskId ?? 'task-browser' ? { taskId: overrides.taskId ?? 'task-browser' } : {}),
    summary: overrides.summary ?? `Captured browser evidence for ${id}.`,
    previewUrl: overrides.previewUrl ?? 'http://127.0.0.1:4173/',
    ...(overrides.consoleCapture ? { consoleCapture: overrides.consoleCapture } : {}),
    ...(overrides.screenshot ? { screenshot: overrides.screenshot } : {}),
  };
}
