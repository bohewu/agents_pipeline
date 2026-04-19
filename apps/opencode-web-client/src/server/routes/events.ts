import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventBroker } from '../services/event-broker.js'
import type { BffEvent } from '../../shared/types.js'

export interface EventsRouteDeps {
  eventBroker: EventBroker
}

export function EventsRoute(deps: EventsRouteDeps): Hono {
  const { eventBroker } = deps
  const route = new Hono()

  // GET / — SSE event stream
  route.get('/', async (c) => {
    const workspaceId = c.req.query('workspaceId')
    if (!workspaceId) {
      return c.json({ ok: false, error: { code: 'MISSING_WORKSPACE', message: 'workspaceId query parameter is required' } }, 400)
    }

    const lastEventId = c.req.header('Last-Event-ID')

    return streamSSE(c, async (stream) => {
      let eventCounter = 0

      const clientId = eventBroker.addClient(
        workspaceId,
        (event: BffEvent) => {
          eventCounter++
          const id = `${workspaceId}-${eventCounter}`
          stream.writeSSE({
            id,
            event: event.type,
            data: JSON.stringify({
              id,
              type: event.type,
              workspaceId,
              timestamp: event.timestamp,
              payload: event.payload,
            }),
          })
        },
        () => {
          // close callback — stream will end
        }
      )

      // Send initial connection event
      stream.writeSSE({
        event: 'connection.ping',
        data: JSON.stringify({
          type: 'connection.ping',
          workspaceId,
          timestamp: new Date().toISOString(),
          payload: { reconnected: !!lastEventId },
        }),
      })

      // Keep stream alive until client disconnects
      stream.onAbort(() => {
        eventBroker.removeClient(clientId)
      })

      // Block until aborted
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
      })
    })
  })

  return route
}
