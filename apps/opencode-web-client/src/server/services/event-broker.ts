import type { BffEvent, BffEventType } from '../../shared/types.js'
import type { ManagedServerManager } from './managed-server-manager.js'
import { randomUUID } from 'node:crypto'

// Upstream event types we care about (NO run/stage/task/status-runtime events)
const UPSTREAM_EVENT_MAP: Record<string, BffEventType> = {
  'session.created': 'session.created',
  'session.updated': 'session.updated',
  'message.created': 'message.created',
  'message.updated': 'message.delta',
  'message.delta': 'message.delta',
  'message.completed': 'message.completed',
  'permission.requested': 'permission.requested',
  'permission.resolved': 'permission.resolved',
  'effort.updated': 'effort.changed',
  'effort.changed': 'effort.changed',
  'workspace.updated': 'workspace.changed',
  'workspace.changed': 'workspace.changed',
}

// Events to explicitly EXCLUDE
const EXCLUDED_PREFIXES = ['run.', 'stage.', 'task.', 'status-runtime.', 'status_runtime.']

type BrowserClient = {
  id: string
  workspaceId: string
  send: (event: BffEvent) => void
  close: () => void
}

type UpstreamConnection = {
  workspaceId: string
  controller: AbortController
  reconnectTimer?: ReturnType<typeof setTimeout>
}

export class EventBroker {
  private serverManager: ManagedServerManager
  private clients = new Map<string, BrowserClient>()
  private upstreamConnections = new Map<string, UpstreamConnection>()
  private keepaliveTimer?: ReturnType<typeof setInterval>

  constructor(serverManager: ManagedServerManager) {
    this.serverManager = serverManager
    this.startKeepalive()
  }

  /**
   * Register a browser SSE client.
   */
  addClient(
    workspaceId: string,
    send: (event: BffEvent) => void,
    close: () => void
  ): string {
    const id = randomUUID()
    this.clients.set(id, { id, workspaceId, send, close })

    // Ensure upstream connection exists for this workspace
    this.ensureUpstreamConnection(workspaceId)

    return id
  }

  /**
   * Remove a browser client.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId)
    this.clients.delete(clientId)

    if (client) {
      // Check if any clients remain for this workspace
      const remaining = Array.from(this.clients.values()).some(
        (c) => c.workspaceId === client.workspaceId
      )
      if (!remaining) {
        this.disconnectUpstream(client.workspaceId)
      }
    }
  }

  /**
   * Broadcast a BFF event to all clients subscribed to a workspace.
   */
  broadcast(workspaceId: string, event: BffEvent): void {
    for (const client of this.clients.values()) {
      if (client.workspaceId === workspaceId) {
        try {
          client.send(event)
        } catch {
          // Client may have disconnected
          this.removeClient(client.id)
        }
      }
    }
  }

  /**
   * Connect to upstream OpenCode SSE for a workspace.
   */
  private ensureUpstreamConnection(workspaceId: string): void {
    if (this.upstreamConnections.has(workspaceId)) return

    const runtime = this.serverManager.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') return

    const controller = new AbortController()
    const conn: UpstreamConnection = { workspaceId, controller }
    this.upstreamConnections.set(workspaceId, conn)

    this.connectUpstream(workspaceId, controller)
  }

  private async connectUpstream(workspaceId: string, controller: AbortController): Promise<void> {
    const runtime = this.serverManager.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') return

    const auth = Buffer.from(`${runtime.username}:${runtime.password}`).toString('base64')
    const url = `${runtime.baseUrl}/global/event`

    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })

      if (!resp.ok || !resp.body) {
        this.scheduleReconnect(workspaceId)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            eventData += line.slice(5).trim()
          } else if (line === '') {
            // End of event
            if (eventType && eventData) {
              this.handleUpstreamEvent(workspaceId, eventType, eventData)
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return // intentional disconnect
    }

    // Connection ended, try to reconnect
    this.scheduleReconnect(workspaceId)
  }

  private handleUpstreamEvent(workspaceId: string, eventType: string, eventData: string): void {
    // Exclude forbidden event types
    if (EXCLUDED_PREFIXES.some((p) => eventType.startsWith(p))) return

    const bffType = UPSTREAM_EVENT_MAP[eventType]
    if (!bffType) return // Unknown event type, skip

    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(eventData)
    } catch {
      payload = { raw: eventData }
    }

    const event: BffEvent = {
      type: bffType,
      timestamp: new Date().toISOString(),
      payload,
    }

    this.broadcast(workspaceId, event)
  }

  private scheduleReconnect(workspaceId: string): void {
    const conn = this.upstreamConnections.get(workspaceId)
    if (!conn) return

    // Only reconnect if there are still clients
    const hasClients = Array.from(this.clients.values()).some(
      (c) => c.workspaceId === workspaceId
    )
    if (!hasClients) {
      this.upstreamConnections.delete(workspaceId)
      return
    }

    conn.reconnectTimer = setTimeout(() => {
      const newController = new AbortController()
      conn.controller = newController
      this.connectUpstream(workspaceId, newController)
    }, 3000)
  }

  private disconnectUpstream(workspaceId: string): void {
    const conn = this.upstreamConnections.get(workspaceId)
    if (!conn) return

    conn.controller.abort()
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer)
    this.upstreamConnections.delete(workspaceId)
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      const ping: BffEvent = {
        type: 'connection.ping',
        timestamp: new Date().toISOString(),
        payload: {},
      }
      for (const client of this.clients.values()) {
        try {
          client.send(ping)
        } catch {
          this.removeClient(client.id)
        }
      }
    }, 20_000)
  }

  /**
   * Shut down all connections.
   */
  shutdown(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
    for (const conn of this.upstreamConnections.values()) {
      conn.controller.abort()
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer)
    }
    this.upstreamConnections.clear()
    this.clients.clear()
  }
}
