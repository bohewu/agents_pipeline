import type { BffEvent, BffEventType } from '../../shared/types.js'
import type { ManagedServerManager } from './managed-server-manager.js'
import { randomUUID } from 'node:crypto'
import { normalizeMessage } from './message-normalizer.js'
import { normalizeSession } from './session-normalizer.js'

// Upstream event types we care about (NO run/stage/task/status-runtime events)
const UPSTREAM_EVENT_MAP: Record<string, BffEventType> = {
  'session.created': 'session.created',
  'session.updated': 'session.updated',
  'message.created': 'message.created',
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

type LiveMessage = {
  info: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}

export class EventBroker {
  private serverManager: ManagedServerManager
  private clients = new Map<string, BrowserClient>()
  private upstreamConnections = new Map<string, UpstreamConnection>()
  private liveMessages = new Map<string, LiveMessage>()
  private activeAssistantBySession = new Map<string, string>()
  private completedMessages = new Set<string>()
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
      let eventType = ''
      let eventData = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            eventData += line.slice(5).trim()
          } else if (line.trim() === '') {
            // End of event
            if (eventData) {
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
    let envelope: Record<string, unknown> = {}
    try {
      envelope = toRecord(JSON.parse(eventData))
    } catch {
      return
    }

    const payload = readNestedRecord(envelope, 'payload') ?? envelope
    const effectiveType = eventType || readString(payload, 'type') || readString(envelope, 'type')
    if (!effectiveType) return

    // Exclude forbidden event types
    if (EXCLUDED_PREFIXES.some((p) => effectiveType.startsWith(p))) return
    if (effectiveType === 'sync' || effectiveType === 'server.connected' || effectiveType === 'server.heartbeat' || effectiveType === 'session.diff') return

    if (this.handleLiveMessageEvent(workspaceId, effectiveType, payload)) {
      return
    }

    const bffType = UPSTREAM_EVENT_MAP[effectiveType]
    if (!bffType) return // Unknown event type, skip

    const properties = readNestedRecord(payload, 'properties') ?? payload
    const normalizedPayload = normalizeEventPayload(bffType, workspaceId, properties)

    const event: BffEvent = {
      type: bffType,
      timestamp: new Date().toISOString(),
      payload: normalizedPayload,
    }

    this.broadcast(workspaceId, event)
  }

  private handleLiveMessageEvent(
    workspaceId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): boolean {
    switch (eventType) {
      case 'message.updated': {
        const properties = readNestedRecord(payload, 'properties')
        const info = properties ? readNestedRecord(properties, 'info') : null
        const sessionId = properties ? readString(properties, 'sessionID', 'sessionId') : undefined
        const messageId = info ? readString(info, 'id') : undefined
        if (!properties || !info || !sessionId || !messageId) return true

        const message = this.getOrCreateLiveMessage(workspaceId, sessionId, messageId)
        message.info = mergeInfo(message.info, info)

        if (message.info.role === 'assistant') {
          this.activeAssistantBySession.set(this.sessionKey(workspaceId, sessionId), messageId)
        }

        if (message.info.role === 'user' && hasRenderableParts(message)) {
          this.broadcastLiveMessage(workspaceId, sessionId, messageId, 'message.created')
          return true
        }

        if (isMessageFinished(message.info)) {
          this.broadcastLiveMessage(workspaceId, sessionId, messageId, 'message.completed')
        }
        return true
      }

      case 'message.part.updated': {
        const properties = readNestedRecord(payload, 'properties')
        const part = properties ? readNestedRecord(properties, 'part') : null
        const sessionId = properties ? readString(properties, 'sessionID', 'sessionId') : undefined
        const messageId = part ? readString(part, 'messageID', 'messageId') : undefined
        if (!properties || !part || !sessionId || !messageId) return true

        const message = this.getOrCreateLiveMessage(workspaceId, sessionId, messageId)
        upsertPart(message, part)

        if (part.type === 'step-finish') {
          this.broadcastLiveMessage(workspaceId, sessionId, messageId, 'message.completed')
          return true
        }

        if (!isRenderablePart(part)) {
          return true
        }

        const text = extractRenderablePartText(part)
        if (!text) {
          return true
        }

        const bffType = message.info.role === 'user' ? 'message.created' : 'message.delta'
        this.broadcastLiveMessage(workspaceId, sessionId, messageId, bffType)
        return true
      }

      case 'message.part.delta': {
        const properties = readNestedRecord(payload, 'properties')
        const sessionId = properties ? readString(properties, 'sessionID', 'sessionId') : undefined
        const messageId = properties ? readString(properties, 'messageID', 'messageId') : undefined
        const partId = properties ? readString(properties, 'partID', 'partId') : undefined
        const field = properties ? readString(properties, 'field') : undefined
        const delta = properties ? readString(properties, 'delta') : undefined
        if (!properties || !sessionId || !messageId || !partId || field !== 'text' || delta === undefined) return true

        const message = this.getOrCreateLiveMessage(workspaceId, sessionId, messageId)
        appendPartDelta(message, partId, delta)
        this.broadcastLiveMessage(workspaceId, sessionId, messageId, message.info.role === 'user' ? 'message.created' : 'message.delta')
        return true
      }

      case 'session.status':
      case 'session.idle': {
        const properties = readNestedRecord(payload, 'properties') ?? payload
        const sessionId = readString(properties, 'sessionID', 'sessionId')
        const status = readNestedRecord(properties, 'status')
        const statusType = readString(status ?? {}, 'type')
        if (sessionId && (eventType === 'session.idle' || statusType === 'idle')) {
          const assistantId = this.activeAssistantBySession.get(this.sessionKey(workspaceId, sessionId))
          if (assistantId) {
            this.broadcastLiveMessage(workspaceId, sessionId, assistantId, 'message.completed')
          }
        }
        return true
      }

      default:
        return false
    }
  }

  private broadcastLiveMessage(
    workspaceId: string,
    sessionId: string,
    messageId: string,
    type: Extract<BffEventType, 'message.created' | 'message.delta' | 'message.completed'>,
  ): void {
    const messageKey = this.messageKey(workspaceId, messageId)
    if (type === 'message.completed') {
      if (this.completedMessages.has(messageKey)) return
      this.completedMessages.add(messageKey)
    }

    const message = this.liveMessages.get(messageKey)
    if (!message || !hasRenderableParts(message)) return

    const normalized = normalizeMessage({
      info: message.info,
      parts: message.parts.filter(isRenderablePart),
    })
    if (!normalized.id) return

    this.broadcast(workspaceId, {
      type,
      timestamp: new Date().toISOString(),
      payload: {
        workspaceId,
        sessionId,
        message: normalized,
      },
    })
  }

  private getOrCreateLiveMessage(workspaceId: string, sessionId: string, messageId: string): LiveMessage {
    const key = this.messageKey(workspaceId, messageId)
    const existing = this.liveMessages.get(key)
    if (existing) return existing

    const created: LiveMessage = {
      info: {
        id: messageId,
        sessionID: sessionId,
      },
      parts: [],
    }
    this.liveMessages.set(key, created)
    return created
  }

  private messageKey(workspaceId: string, messageId: string): string {
    return `${workspaceId}:${messageId}`
  }

  private sessionKey(workspaceId: string, sessionId: string): string {
    return `${workspaceId}:${sessionId}`
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

function normalizeEventPayload(
  type: BffEventType,
  workspaceId: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'message.created' || type === 'message.delta' || type === 'message.completed') {
    const messageSource = readNestedRecord(payload, 'message') ?? payload
    const sessionId = readString(payload, 'sessionId', 'sessionID')
      ?? readString(messageSource, 'sessionId', 'sessionID')
    return {
      ...payload,
      workspaceId,
      ...(sessionId ? { sessionId } : {}),
      message: normalizeMessage(messageSource),
    }
  }

  if (type === 'session.created' || type === 'session.updated') {
    const sessionSource = readNestedRecord(payload, 'session') ?? payload
    return {
      ...payload,
      workspaceId,
      session: normalizeSession(sessionSource),
    }
  }

  return { ...payload, workspaceId }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function readNestedRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = source[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

function mergeInfo(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const existingTime = readNestedRecord(existing, 'time') ?? {}
  const incomingTime = readNestedRecord(incoming, 'time') ?? {}

  return {
    ...existing,
    ...incoming,
    ...(Object.keys(existingTime).length > 0 || Object.keys(incomingTime).length > 0
      ? { time: { ...existingTime, ...incomingTime } }
      : {}),
  }
}

function upsertPart(message: LiveMessage, part: Record<string, unknown>): void {
  const partId = readString(part, 'id')
  if (!partId) return

  const existingIndex = message.parts.findIndex((entry) => readString(entry, 'id') === partId)
  const existing = existingIndex >= 0 ? message.parts[existingIndex] ?? {} : {}
  const merged = mergeInfo(existing, part)

  if (existingIndex >= 0) {
    message.parts[existingIndex] = merged
  } else {
    message.parts.push(merged)
  }
}

function appendPartDelta(message: LiveMessage, partId: string, delta: string): void {
  const index = message.parts.findIndex((entry) => readString(entry, 'id') === partId)
  if (index < 0) return

  const part = message.parts[index] ?? {}
  const currentText = typeof part.text === 'string' ? part.text : ''
  message.parts[index] = {
    ...part,
    text: `${currentText}${delta}`,
  }
}

function isRenderablePart(part: Record<string, unknown>): boolean {
  const type = readString(part, 'type')
  return type === 'text'
    || type === 'reasoning'
    || type === 'tool-call'
    || type === 'tool_use'
    || type === 'tool-result'
    || type === 'tool_result'
    || type === 'error'
    || type === 'permission-request'
}

function extractRenderablePartText(part: Record<string, unknown>): string | undefined {
  const text = part.text
  return typeof text === 'string' && text.trim().length > 0 ? text : undefined
}

function hasRenderableParts(message: LiveMessage): boolean {
  return message.parts.some((part) => isRenderablePart(part) && (readString(part, 'text') || readString(part, 'toolName') || part.result !== undefined))
}

function isMessageFinished(info: Record<string, unknown>): boolean {
  const time = readNestedRecord(info, 'time')
  return !!time?.['completed'] || typeof info['finish'] === 'string'
}
