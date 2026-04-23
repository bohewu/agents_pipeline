import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { WorkspaceRegistry } from '../services/workspace-registry.js'
import type { ManagedServerManager } from '../services/managed-server-manager.js'
import type { OpenCodeClientFactory } from '../services/opencode-client-factory.js'
import type {
  BrowserEvidenceRecord,
  LaneAttribution,
  LaneContext,
  SessionSummary,
  TaskLedgerRecord,
  VerificationRun,
  WorkspaceComparisonLaneReference,
  WorkspaceBootstrap,
  WorkspaceLaneRecord,
  WorkspaceLaneAdoptionRequest,
  WorkspaceLaneComparisonState,
  WorkspaceLaneSelectionRequest,
  WorkspaceTraceabilitySummary,
} from '../../shared/types.js'
import type { ConfigService, NormalizedConfig } from '../services/config-service.js'
import type { EffortService } from '../services/effort-service.js'
import type { WorkspaceCapabilityProbeService } from '../services/workspace-capability-probe.js'
import type { WorkspaceContextCatalogService } from '../services/workspace-context-catalog-service.js'
import type { WorkspaceShipService } from '../services/workspace-ship-service.js'
import type { TaskLedgerService } from '../services/task-ledger-service.js'
import type { VerificationService } from '../services/verification-service.js'
import type { SessionService } from '../services/session-service.js'
import {
  mergeLaneAttribution,
  resolveLaneId,
  validateWorkspaceComparisonLaneReferenceRecord,
} from '../services/lane-attribution.js'
import { execSync } from 'node:child_process'
import path from 'node:path'

export interface WorkspacesRouteDeps {
  registry: WorkspaceRegistry
  serverManager: ManagedServerManager
  clientFactory: OpenCodeClientFactory
  configService: ConfigService
  effortService: EffortService
  capabilityProbeService: WorkspaceCapabilityProbeService
  contextCatalogService: WorkspaceContextCatalogService
  workspaceShipService: WorkspaceShipService
  verificationService: VerificationService
  taskLedgerService: TaskLedgerService
  sessionService: Pick<SessionService, 'listSessions' | 'resolveLaneComparisonState' | 'setLaneComparisonState'>
}

export function WorkspacesRoute(deps: WorkspacesRouteDeps): Hono {
  const { registry, serverManager, clientFactory, configService, effortService, capabilityProbeService, contextCatalogService, workspaceShipService, verificationService, taskLedgerService, sessionService } = deps
  const route = new Hono()

  // GET /api/workspaces — list all workspaces
  route.get('/', (c) => {
    const workspaces = registry.list()
    const active = registry.getActive()
    const serverStatuses = Object.fromEntries(
      serverManager.getAll().map((runtime) => [runtime.workspaceId, serverManager.toJSON(runtime)])
    )
    return c.json(ok({ workspaces, activeWorkspaceId: active?.id, serverStatuses }))
  })

  // POST /api/workspaces/validate — validate a path
  route.post('/validate', async (c) => {
    const body = await c.req.json<{ path: string; useExactPath?: boolean; confirmed?: boolean }>()
    if (!body.path) {
      return c.json(fail('INVALID_INPUT', 'path is required'), 400)
    }
    const result = registry.validatePath(body.path, {
      useExactPath: body.useExactPath,
      confirmed: body.confirmed,
    })
    return c.json(ok(result))
  })

  // POST /api/workspaces/discover — discover git repos under a path
  route.post('/discover', async (c) => {
    const body = await c.req.json<{ path: string; maxDepth?: number }>()
    if (!body.path) {
      return c.json(fail('INVALID_INPUT', 'path is required'), 400)
    }

    try {
      const validation = registry.validatePath(body.path, { useExactPath: true, confirmed: true })
      if (!validation.valid || !validation.resolvedPath) {
        return c.json(fail('INVALID_PATH', validation.error ?? 'Invalid path'), 400)
      }

      const depth = body.maxDepth ?? 3
      const repos: string[] = []
      try {
        const result = execSync(
          `find ${validation.resolvedPath} -maxdepth ${depth} -name .git -type d 2>/dev/null`,
          { encoding: 'utf-8', timeout: 10000 }
        ).trim()
        if (result) {
          for (const gitDir of result.split('\n')) {
            const repoRoot = gitDir.replace(/\/\.git$/, '')
            if (repoRoot) repos.push(repoRoot)
          }
        }
      } catch { /* no results */ }

      return c.json(ok({ repos }))
    } catch (err: any) {
      return c.json(fail('DISCOVER_ERROR', err.message), 500)
    }
  })

  // POST /api/workspaces — add a workspace
  route.post('/', async (c) => {
    const body = await c.req.json<{ path: string; name?: string; opencodeConfigDir?: string }>()
    if (!body.path) {
      return c.json(fail('INVALID_INPUT', 'path is required'), 400)
    }

    try {
      const workspace = registry.add(body.path, body.name, body.opencodeConfigDir)
      return c.json(ok(workspace), 201)
    } catch (err: any) {
      return c.json(fail('ADD_FAILED', err.message), 400)
    }
  })

  // PATCH /api/workspaces/:workspaceId — update a workspace
  route.patch('/:workspaceId', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const body = await c.req.json<{ name?: string; opencodeConfigDir?: string }>()

    const updated = registry.update(workspaceId, body)
    if (!updated) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }
    return c.json(ok(updated))
  })

  // DELETE /api/workspaces/:workspaceId — remove a workspace
  route.delete('/:workspaceId', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const removed = registry.remove(workspaceId)
    if (!removed) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    // Also stop the managed server if running
    await serverManager.stop(workspaceId)
    return c.json(ok({ removed: true }))
  })

  // POST /api/workspaces/:workspaceId/select — select workspace + bootstrap
  route.post('/:workspaceId/select', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.setActive(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    // Bootstrap: ensure server is running and get sessions
    const bootstrap = await getBootstrap(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
    return c.json(ok(bootstrap))
  })

  // GET /api/workspaces/:workspaceId/bootstrap — get workspace bootstrap
  route.get('/:workspaceId/bootstrap', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    const bootstrap = await getBootstrap(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
    return c.json(ok(bootstrap))
  })

  route.post('/:workspaceId/compare/select-lane', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    try {
      const request = readWorkspaceLaneRequest(await c.req.json<WorkspaceLaneSelectionRequest>(), 'selectedLane')
      const bootstrap = await getBootstrap(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
      const selectedLane = resolveAvailableComparisonLaneReference(bootstrap, request)
      if (!selectedLane) {
        return c.json(fail('INVALID_LANE_SELECTION', 'Select exactly one lane from the current workspace comparison context.'), 400)
      }

      const laneComparison = sessionService.setLaneComparisonState(workspaceId, {
        ...(bootstrap.laneComparison ?? {}),
        selectedLane,
      })
      return c.json(ok(applyLaneComparisonStateToBootstrap(bootstrap, laneComparison)))
    } catch (err: any) {
      return c.json(fail('INVALID_INPUT', err.message), 400)
    }
  })

  route.post('/:workspaceId/compare/adopt-lane', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    try {
      const request = readWorkspaceLaneRequest(await c.req.json<WorkspaceLaneAdoptionRequest>(), 'adoptedLane')
      const bootstrap = await getBootstrap(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
      const adoptedLane = resolveAvailableComparisonLaneReference(bootstrap, request)
      if (!adoptedLane) {
        return c.json(fail('INVALID_LANE_ADOPTION', 'Adoption requires one explicit lane from the current workspace comparison context.'), 400)
      }

      const laneComparison = sessionService.setLaneComparisonState(workspaceId, {
        ...(bootstrap.laneComparison ?? {}),
        selectedLane: adoptedLane,
        adoptedLane,
      })
      return c.json(ok(applyLaneComparisonStateToBootstrap(bootstrap, laneComparison)))
    } catch (err: any) {
      return c.json(fail('INVALID_INPUT', err.message), 400)
    }
  })

  // GET /api/workspaces/:workspaceId/capabilities — get workspace capability probe
  route.get('/:workspaceId/capabilities', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    const capabilities = await capabilityProbeService.probeWorkspace(workspaceId, workspace.rootPath)
    return c.json(ok(capabilities))
  })

  // GET /api/workspaces/:workspaceId/context/catalog — get workspace context catalog
  route.get('/:workspaceId/context/catalog', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    try {
      const catalog = await contextCatalogService.getContextCatalog(
        workspaceId,
        workspace.rootPath,
        workspace.opencodeConfigDir,
      )
      return c.json(ok(catalog))
    } catch (err: any) {
      return c.json(fail('CONTEXT_CATALOG_FAILED', err.message), 500)
    }
  })

  // POST /api/workspaces/:workspaceId/server/start
  route.post('/:workspaceId/server/start', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    try {
      const runtime = await serverManager.start(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
      return c.json(ok(serverManager.toJSON(runtime)))
    } catch (err: any) {
      return c.json(fail('START_FAILED', err.message), 500)
    }
  })

  // POST /api/workspaces/:workspaceId/server/stop
  route.post('/:workspaceId/server/stop', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    await serverManager.stop(workspaceId)
    return c.json(ok({ stopped: true }))
  })

  // POST /api/workspaces/:workspaceId/server/restart
  route.post('/:workspaceId/server/restart', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json(fail('NOT_FOUND', `Workspace ${workspaceId} not found`), 404)
    }

    try {
      const runtime = await serverManager.restart(workspaceId, workspace.rootPath, workspace.opencodeConfigDir)
      return c.json(ok(serverManager.toJSON(runtime)))
    } catch (err: any) {
      return c.json(fail('RESTART_FAILED', err.message), 500)
    }
  })

  // ── Helper ──

  async function getBootstrap(workspaceId: string, rootPath: string, opencodeConfigDir?: string): Promise<WorkspaceBootstrap> {
    const workspace = registry.get(workspaceId)!
    const capabilitiesPromise = capabilityProbeService.probeWorkspace(workspaceId, rootPath)
    const gitStatusPromise = workspaceShipService.getStatus(workspaceId, rootPath)

    // Ensure server is running
    let runtime = serverManager.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') {
      runtime = await serverManager.start(workspaceId, rootPath, opencodeConfigDir)
    }

    try {
      runtime = await serverManager.waitUntilReady(workspaceId)
    } catch {
      // Keep the latest runtime state; the UI can surface startup problems.
    }

    // Try to get sessions
    let sessions: WorkspaceBootstrap['sessions'] = []
    let healthy = runtime.state === 'ready'
    let version: string | undefined
    let config: NormalizedConfig = {
      providers: [],
      models: [],
      agents: [],
      commands: [],
      connectedProviderIds: [],
    }
    try {
      if (runtime.state === 'ready') {
        const client = clientFactory.forWorkspace(workspaceId)
        const health = await client.health().catch(() => ({ ok: false }))
        healthy = !!health.ok
        version = typeof (health as { version?: unknown }).version === 'string'
          ? (health as { version?: string }).version
          : undefined
        sessions = await sessionService.listSessions(workspaceId)
        config = await configService.getConfig(workspaceId)
      }
    } catch {
      // Server may still be starting
    }

    const capabilities = await capabilitiesPromise
    const git = await gitStatusPromise
    const verificationSummary = verificationService.getWorkspaceSummary(workspaceId)
    const browserEvidenceRecords = verificationSummary.browserEvidenceRecords ?? []
    const taskLedgerRecords = taskLedgerService.listRecords(workspaceId)
    const laneRecords = buildWorkspaceLaneRecords(
      workspaceId,
      sessions,
      verificationSummary.traceability,
      verificationSummary.runs,
      browserEvidenceRecords,
      taskLedgerRecords,
    )
    const persistedLaneComparison = sessionService.resolveLaneComparisonState(workspaceId)
    const laneComparison = sanitizeLaneComparisonState(persistedLaneComparison, sessions, laneRecords)
    if (!areLaneComparisonStatesEqual(persistedLaneComparison, laneComparison)) {
      sessionService.setLaneComparisonState(workspaceId, laneComparison)
    }

    return applyLaneComparisonStateToBootstrap({
      workspace,
      server: serverManager.toJSON(runtime),
      opencode: {
        health: { healthy, version },
        project: {
          id: workspace.id,
          path: rootPath,
          name: workspace.name || path.basename(rootPath),
          branch: git.data?.branch.detached ? undefined : git.data?.branch.name,
        },
        providers: config.providers,
        models: config.models,
        agents: config.agents,
        commands: config.commands,
        connectedProviderIds: config.connectedProviderIds,
      },
      git,
      sessions,
      effort: effortService.getEffortSummary(rootPath),
      capabilities,
      laneRecords,
      traceability: mergeTraceabilitySummaries(createEmptyTraceabilitySummary(), verificationSummary.traceability),
      verificationRuns: verificationSummary.runs,
      browserEvidenceRecords,
      taskLedgerRecords,
    }, laneComparison)
  }

  return route
}

function createEmptyTraceabilitySummary(): WorkspaceTraceabilitySummary {
  return {
    taskEntries: [],
    resultAnnotations: [],
  }
}

function mergeTraceabilitySummaries(
  base: WorkspaceTraceabilitySummary,
  extra: WorkspaceTraceabilitySummary,
): WorkspaceTraceabilitySummary {
  return {
    taskEntries: [...base.taskEntries, ...extra.taskEntries],
    resultAnnotations: [...base.resultAnnotations, ...extra.resultAnnotations],
  }
}

function buildWorkspaceLaneRecords(
  workspaceId: string,
  sessions: SessionSummary[],
  traceability: WorkspaceTraceabilitySummary,
  verificationRuns: VerificationRun[],
  browserEvidenceRecords: BrowserEvidenceRecord[],
  taskLedgerRecords: TaskLedgerRecord[],
): WorkspaceLaneRecord[] {
  const laneRecords = new Map<string, WorkspaceLaneRecord>()

  const ensureLaneRecord = (
    sessionId: string | undefined,
    lane: LaneAttribution | undefined,
  ): WorkspaceLaneRecord | undefined => {
    if (!sessionId) return undefined

    const laneId = resolveLaneId(lane)
    const laneContext = lane?.laneContext ?? deriveLaneContextFromLaneId(laneId)
    if (!laneId || !laneContext) return undefined

    const key = `${workspaceId}::${sessionId}::${laneId}`
    const existing = laneRecords.get(key)
    if (existing) {
      existing.laneContext = mergeLaneContexts(existing.laneContext, laneContext)
      return existing
    }

    const nextRecord: WorkspaceLaneRecord = {
      workspaceId,
      sessionId,
      laneId,
      laneContext,
      traceability: createEmptyTraceabilitySummary(),
      verificationRuns: [],
      browserEvidenceRecords: [],
      taskLedgerRecords: [],
    }
    laneRecords.set(key, nextRecord)
    return nextRecord
  }

  for (const session of sessions) {
    const laneRecord = ensureLaneRecord(session.id, session)
    if (!laneRecord) continue
    laneRecord.session = session
  }

  for (const taskEntry of traceability.taskEntries) {
    if (taskEntry.workspaceId !== workspaceId) continue
    const laneRecord = ensureLaneRecord(taskEntry.sessionId, taskEntry)
    if (!laneRecord) continue
    laneRecord.traceability.taskEntries.push(taskEntry)
  }

  for (const resultAnnotation of traceability.resultAnnotations) {
    if (resultAnnotation.workspaceId !== workspaceId) continue
    const laneRecord = ensureLaneRecord(resultAnnotation.sessionId, resultAnnotation)
    if (!laneRecord) continue
    laneRecord.traceability.resultAnnotations.push(resultAnnotation)
  }

  for (const run of verificationRuns) {
    if (run.workspaceId !== workspaceId) continue
    const laneRecord = ensureLaneRecord(run.sessionId, run)
    if (!laneRecord) continue
    laneRecord.verificationRuns.push(run)
  }

  for (const record of browserEvidenceRecords) {
    if (record.workspaceId !== workspaceId) continue
    const laneRecord = ensureLaneRecord(record.sessionId, record)
    if (!laneRecord) continue
    laneRecord.browserEvidenceRecords.push(record)
  }

  for (const record of taskLedgerRecords) {
    if (record.workspaceId !== workspaceId) continue
    const laneRecord = ensureLaneRecord(
      resolveTaskLedgerRecordSessionId(record),
      mergeLaneAttribution(record, record.resultAnnotation),
    )
    if (!laneRecord) continue
    laneRecord.taskLedgerRecords.push(record)
  }

  return [...laneRecords.values()]
}

function resolveTaskLedgerRecordSessionId(record: TaskLedgerRecord): string | undefined {
  return record.sessionId ?? record.resultAnnotation?.sessionId
}

function deriveLaneContextFromLaneId(laneId: string | undefined): LaneContext | undefined {
  if (!laneId) return undefined
  if (laneId.startsWith('branch:')) {
    return {
      kind: 'branch',
      branch: laneId.slice('branch:'.length),
    }
  }
  if (laneId.startsWith('worktree:')) {
    return {
      kind: 'worktree',
      worktreePath: laneId.slice('worktree:'.length),
    }
  }
  return undefined
}

function mergeLaneContexts(base: LaneContext, extra: LaneContext): LaneContext {
  if (base.kind !== extra.kind) return base
  if (base.kind === 'branch') return base

  return {
    kind: 'worktree',
    worktreePath: base.worktreePath,
    ...(base.branch ?? extra.branch ? { branch: base.branch ?? extra.branch } : {}),
  }
}

function applyLaneComparisonStateToBootstrap(
  bootstrap: WorkspaceBootstrap,
  laneComparison: WorkspaceLaneComparisonState | undefined,
): WorkspaceBootstrap {
  if (!laneComparison) {
    return bootstrap.laneComparison === undefined
      ? bootstrap
      : { ...bootstrap, laneComparison: undefined }
  }

  return {
    ...bootstrap,
    laneComparison,
  }
}

function sanitizeLaneComparisonState(
  laneComparison: WorkspaceLaneComparisonState | undefined,
  sessions: SessionSummary[],
  laneRecords: WorkspaceLaneRecord[],
): WorkspaceLaneComparisonState | undefined {
  if (!laneComparison) return undefined

  const selectedLane = resolveAvailableComparisonLaneReference({ sessions, laneRecords }, laneComparison.selectedLane)
  const adoptedLane = resolveAvailableComparisonLaneReference({ sessions, laneRecords }, laneComparison.adoptedLane)

  if (!selectedLane && !adoptedLane) {
    return undefined
  }

  return {
    ...(selectedLane ? { selectedLane } : {}),
    ...(adoptedLane ? { adoptedLane } : {}),
  }
}

function buildWorkspaceComparisonLaneReferences(
  sessions: SessionSummary[],
  laneRecords: WorkspaceLaneRecord[],
): WorkspaceComparisonLaneReference[] {
  const references = new Map<string, WorkspaceComparisonLaneReference>()

  const upsert = (sessionId: string | undefined, lane: LaneAttribution | undefined) => {
    if (!sessionId) return

    const laneId = resolveLaneId(lane)
    const laneContext = lane?.laneContext ?? deriveLaneContextFromLaneId(laneId)
    if (!laneId || !laneContext) return

    references.set(`${sessionId}::${laneId}`, {
      sessionId,
      laneId,
      laneContext,
    })
  }

  for (const session of sessions) {
    upsert(session.id, session)
  }

  for (const laneRecord of laneRecords) {
    upsert(laneRecord.sessionId, laneRecord)
  }

  return [...references.values()]
}

function resolveAvailableComparisonLaneReference(
  source: Pick<WorkspaceBootstrap, 'sessions' | 'laneRecords'>,
  candidate: WorkspaceComparisonLaneReference | undefined,
): WorkspaceComparisonLaneReference | undefined {
  if (!candidate) return undefined

  const laneId = resolveLaneId(candidate)
  if (!candidate.sessionId || !laneId) return undefined

  return buildWorkspaceComparisonLaneReferences(source.sessions, source.laneRecords ?? [])
    .find((reference) => reference.sessionId === candidate.sessionId && reference.laneId === laneId)
}

function areLaneComparisonStatesEqual(
  left: WorkspaceLaneComparisonState | undefined,
  right: WorkspaceLaneComparisonState | undefined,
): boolean {
  return areComparisonLaneReferencesEqual(left?.selectedLane, right?.selectedLane)
    && areComparisonLaneReferencesEqual(left?.adoptedLane, right?.adoptedLane)
}

function areComparisonLaneReferencesEqual(
  left: WorkspaceComparisonLaneReference | undefined,
  right: WorkspaceComparisonLaneReference | undefined,
): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.sessionId === right.sessionId && resolveLaneId(left) === resolveLaneId(right)
}

function readWorkspaceLaneRequest(
  value: unknown,
  fieldPrefix: string,
): WorkspaceComparisonLaneReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${fieldPrefix} to be an object.`)
  }

  const candidate = value as Record<string, unknown>
  if (Array.isArray(candidate.lanes) || Array.isArray(candidate.laneIds) || Array.isArray(candidate.sessionIds)) {
    throw new Error(`${fieldPrefix} must describe exactly one lane.`)
  }

  return validateWorkspaceComparisonLaneReferenceRecord(candidate, fieldPrefix)
}
