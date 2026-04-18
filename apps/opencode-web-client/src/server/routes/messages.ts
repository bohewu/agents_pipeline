import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { OpenCodeClientFactory } from '../services/opencode-client-factory.js'
import { normalizeMessages } from '../services/message-normalizer.js'

export interface MessagesRouteDeps {
  clientFactory: OpenCodeClientFactory
}

export function MessagesRoute(deps: MessagesRouteDeps): Hono {
  const { clientFactory } = deps
  const route = new Hono<any>()

  // GET / — list messages for a session
  route.get('/', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!
    try {
      const client = clientFactory.forWorkspace(workspaceId)
      const raw = await client.listMessages(sessionId)
      return c.json(ok(raw))
    } catch (err: any) {
      return c.json(fail('LIST_MESSAGES_FAILED', err.message), 500)
    }
  })

  // POST /chat — send chat message (streaming via SSE, returns accepted)
  route.post('/chat', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!
    const body = await c.req.json<{
      text: string
      files?: string[]
      providerId?: string
      modelId?: string
      agentId?: string
      effort?: string
    }>()

    if (!body.text) {
      return c.json(fail('INVALID_INPUT', 'text is required'), 400)
    }

    try {
      const client = clientFactory.forWorkspace(workspaceId)
      await client.chat(sessionId, body.text)
      return c.json(ok({ accepted: true, sessionId }))
    } catch (err: any) {
      return c.json(fail('CHAT_FAILED', err.message), 500)
    }
  })

  // POST /command — run command
  route.post('/command', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!
    const body = await c.req.json<{ command: string; args?: Record<string, unknown> }>()

    if (!body.command) {
      return c.json(fail('INVALID_INPUT', 'command is required'), 400)
    }

    try {
      const client = clientFactory.forWorkspace(workspaceId)
      const result = await client.command(sessionId, body.command, body.args)
      return c.json(ok(result))
    } catch (err: any) {
      return c.json(fail('COMMAND_FAILED', err.message), 500)
    }
  })

  // POST /shell — run shell command
  route.post('/shell', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!
    const body = await c.req.json<{ command: string }>()

    if (!body.command) {
      return c.json(fail('INVALID_INPUT', 'command is required'), 400)
    }

    try {
      const client = clientFactory.forWorkspace(workspaceId)
      const result = await client.shell(sessionId, body.command)
      return c.json(ok(result))
    } catch (err: any) {
      return c.json(fail('SHELL_FAILED', err.message), 500)
    }
  })

  // POST /abort — abort generation
  route.post('/abort', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')!

    try {
      const client = clientFactory.forWorkspace(workspaceId)
      await client.abort(sessionId)
      return c.json(ok({ aborted: true }))
    } catch (err: any) {
      return c.json(fail('ABORT_FAILED', err.message), 500)
    }
  })

  return route
}
