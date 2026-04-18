import type { Context, Next } from 'hono'
import type { WorkspaceRegistry } from '../services/workspace-registry.js'

/**
 * Hono middleware that extracts workspaceId from route params,
 * validates the workspace exists in the registry, and attaches
 * workspace context to the request.
 */
export function workspaceScope(registry: WorkspaceRegistry) {
  return async (c: Context, next: Next) => {
    const workspaceId = c.req.param('workspaceId')
      ?? c.req.header('x-workspace-id')
      ?? c.req.query('workspaceId')

    if (!workspaceId) {
      return c.json({ ok: false, error: { code: 'MISSING_WORKSPACE', message: 'workspaceId is required' } }, 400)
    }

    const workspace = registry.get(workspaceId)
    if (!workspace) {
      return c.json({ ok: false, error: { code: 'WORKSPACE_NOT_FOUND', message: `Workspace ${workspaceId} not found` } }, 404)
    }

    c.set('workspaceId', workspaceId)
    c.set('workspace', workspace)
    await next()
  }
}
