import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { WorkspaceRegistry } from '../services/workspace-registry.js'
import type { ManagedServerManager } from '../services/managed-server-manager.js'
import type { OpenCodeClientFactory } from '../services/opencode-client-factory.js'
import type { WorkspaceBootstrap, WorkspaceTraceabilitySummary } from '../../shared/types.js'
import type { ConfigService, NormalizedConfig } from '../services/config-service.js'
import type { EffortService } from '../services/effort-service.js'
import type { WorkspaceCapabilityProbeService } from '../services/workspace-capability-probe.js'
import type { WorkspaceContextCatalogService } from '../services/workspace-context-catalog-service.js'
import type { WorkspaceShipService } from '../services/workspace-ship-service.js'
import type { TaskLedgerService } from '../services/task-ledger-service.js'
import type { VerificationService } from '../services/verification-service.js'
import type { SessionService } from '../services/session-service.js'
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
  sessionService: Pick<SessionService, 'listSessions'>
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
    const taskLedgerRecords = taskLedgerService.listRecords(workspaceId)

    return {
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
      traceability: mergeTraceabilitySummaries(createEmptyTraceabilitySummary(), verificationSummary.traceability),
      verificationRuns: verificationSummary.runs,
      browserEvidenceRecords: verificationSummary.browserEvidenceRecords ?? [],
      taskLedgerRecords,
    }
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
