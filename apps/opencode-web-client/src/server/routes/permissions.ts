import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { PermissionRegistry } from '../services/permission-registry.js'

export interface PermissionsRouteDeps {
  permissionRegistry: PermissionRegistry
}

export function PermissionsRoute(deps: PermissionsRouteDeps): Hono {
  const { permissionRegistry } = deps
  const route = new Hono<any>()

  // GET / — list pending permissions for session
  route.get('/', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!
    try {
      const permissions = permissionRegistry.getPending(workspaceId, sessionId)
      return c.json(ok(permissions))
    } catch (err: any) {
      return c.json(fail('LIST_PERMISSIONS_FAILED', err.message), 500)
    }
  })

  // POST /:permissionId — resolve a permission
  route.post('/:permissionId', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const permissionId = c.req.param('permissionId')
    const body = await c.req.json<{ decision: 'allow' | 'allow_remember' | 'deny' }>()

    if (!body.decision || !['allow', 'allow_remember', 'deny'].includes(body.decision)) {
      return c.json(fail('INVALID_INPUT', 'decision must be allow, allow_remember, or deny'), 400)
    }

    try {
      const result = await permissionRegistry.resolve(workspaceId, permissionId, body.decision)
      return c.json(ok(result ?? { resolved: true, permissionId }))
    } catch (err: any) {
      return c.json(fail('RESOLVE_PERMISSION_FAILED', err.message), 500)
    }
  })

  return route
}
