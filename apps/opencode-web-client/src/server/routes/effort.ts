import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { EffortService } from '../services/effort-service.js'
import type { WorkspaceProfile } from '../../shared/types.js'

export interface EffortRouteDeps {
  effortService: EffortService
}

export function EffortRoute(deps: EffortRouteDeps): Hono {
  const { effortService } = deps
  const route = new Hono<any>()

  // GET / — get effort state
  route.get('/', async (c) => {
    const workspace = c.get('workspace') as WorkspaceProfile
    const sessionId = c.req.query('sessionId')
    try {
      const summary = effortService.getEffortSummary(workspace.rootPath, sessionId ?? undefined)
      return c.json(ok(summary))
    } catch (err: any) {
      return c.json(fail('EFFORT_READ_FAILED', err.message), 500)
    }
  })

  // POST / — set effort
  route.post('/', async (c) => {
    const workspace = c.get('workspace') as WorkspaceProfile
    const body = await c.req.json<{
      scope: 'project' | 'session'
      action: 'set' | 'clear'
      effort?: string
      sessionId?: string
    }>()

    if (!body.scope || !body.action) {
      return c.json(fail('INVALID_INPUT', 'scope and action are required'), 400)
    }

    if (body.action === 'set' && !body.effort) {
      return c.json(fail('INVALID_INPUT', 'effort is required when action is set'), 400)
    }

    if (body.scope === 'session' && !body.sessionId) {
      return c.json(fail('INVALID_INPUT', 'sessionId is required for session scope'), 400)
    }

    try {
      const state = effortService.setEffort(workspace.rootPath, body)
      return c.json(ok(state))
    } catch (err: any) {
      return c.json(fail('EFFORT_WRITE_FAILED', err.message), 500)
    }
  })

  return route
}
