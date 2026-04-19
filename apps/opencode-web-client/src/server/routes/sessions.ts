import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { SessionService } from '../services/session-service.js'

export interface SessionsRouteDeps {
  sessionService: SessionService
}

export function SessionsRoute(deps: SessionsRouteDeps): Hono {
  const { sessionService } = deps
  const route = new Hono<any>()

  // GET / — list sessions
  route.get('/', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    try {
      const sessions = await sessionService.listSessions(workspaceId)
      return c.json(ok(sessions))
    } catch (err: any) {
      return c.json(fail('LIST_SESSIONS_FAILED', err.message), 500)
    }
  })

  // POST / — create session
  route.post('/', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const body = await c.req.json<{
      title?: string
      providerId?: string
      modelId?: string
      agentId?: string
    }>().catch(() => ({}))
    try {
      const session = await sessionService.createSession(workspaceId, body)
      return c.json(ok(session), 201)
    } catch (err: any) {
      return c.json(fail('CREATE_SESSION_FAILED', err.message), 500)
    }
  })

  // PATCH /:sessionId — update session
  route.patch('/:sessionId', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')
    const body = await c.req.json<{ title?: string }>().catch(() => ({}))
    try {
      const session = await sessionService.updateSession(workspaceId, sessionId, body)
      return c.json(ok(session))
    } catch (err: any) {
      return c.json(fail('UPDATE_SESSION_FAILED', err.message), 500)
    }
  })

  // DELETE /:sessionId — delete/archive session
  route.delete('/:sessionId', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')
    try {
      await sessionService.deleteSession(workspaceId, sessionId)
      return c.json(ok({ deleted: true }))
    } catch (err: any) {
      return c.json(fail('DELETE_SESSION_FAILED', err.message), 500)
    }
  })

  // POST /:sessionId/fork — fork session
  route.post('/:sessionId/fork', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')
    const body = await c.req.json<{ messageId?: string }>().catch(() => ({} as { messageId?: string }))
    try {
      const session = await sessionService.forkSession(workspaceId, sessionId, body.messageId)
      return c.json(ok(session), 201)
    } catch (err: any) {
      return c.json(fail('FORK_SESSION_FAILED', err.message), 500)
    }
  })

  return route
}
