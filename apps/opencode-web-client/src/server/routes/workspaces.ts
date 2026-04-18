import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { WorkspaceRegistry } from '../services/workspace-registry.js'
import type { ManagedServerManager } from '../services/managed-server-manager.js'
import type { OpenCodeClientFactory } from '../services/opencode-client-factory.js'
import type { WorkspaceBootstrap } from '../../shared/types.js'
import { execSync } from 'node:child_process'

export interface WorkspacesRouteDeps {
  registry: WorkspaceRegistry
  serverManager: ManagedServerManager
  clientFactory: OpenCodeClientFactory
}

export function WorkspacesRoute(deps: WorkspacesRouteDeps): Hono {
  const { registry, serverManager, clientFactory } = deps
  const route = new Hono()

  // GET /api/workspaces — list all workspaces
  route.get('/', (c) => {
    const workspaces = registry.list()
    const active = registry.getActive()
    return c.json(ok({ workspaces, activeWorkspaceId: active?.id }))
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

    // Ensure server is running
    let runtime = serverManager.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') {
      runtime = await serverManager.start(workspaceId, rootPath, opencodeConfigDir)
    }

    // Try to get sessions
    let sessions: WorkspaceBootstrap['sessions'] = []
    try {
      if (runtime.state === 'ready') {
        const client = clientFactory.forWorkspace(workspaceId)
        sessions = await client.listSessions()
      }
    } catch {
      // Server may still be starting
    }

    return { workspace, sessions }
  }

  return route
}
