import type {
  BffEvent,
  BffEventType,
  LaneAttribution,
  ResultReviewState,
  ResultShipState,
  ShipFixHandoffConditionKind,
} from '../../shared/types.js'
import type { ManagedServerManager } from './managed-server-manager.js'
import type { TaskLedgerService } from './task-ledger-service.js'
import { randomUUID } from 'node:crypto'
import { normalizeMessage } from './message-normalizer.js'
import { normalizeSession } from './session-normalizer.js'
import { applyLaneAttributionToMessage, attachLaneAttribution } from './lane-attribution.js'

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
const MESSAGE_DELTA_FLUSH_MS = 80

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

interface EventBrokerOptions {
  taskLedgerService?: Pick<TaskLedgerService, 'getRecord' | 'upsertRuntimeRecord'>
  now?: () => Date
  resolveSessionLane?: (workspaceId: string, sessionId: string) => LaneAttribution | undefined
}

interface PendingShipFixHandoff {
  workspaceId: string
  sessionId: string
  taskId: string
  title: string
  summary: string
  shipState: ResultShipState
  reviewState?: ResultReviewState
  pullRequestUrl?: string
  pullRequestNumber?: number
  conditionKind: ShipFixHandoffConditionKind
  conditionLabel: string
  detailsUrl?: string
}

export class EventBroker {
  private serverManager: ManagedServerManager
  private taskLedgerService?: Pick<TaskLedgerService, 'getRecord' | 'upsertRuntimeRecord'>
  private clients = new Map<string, BrowserClient>()
  private upstreamConnections = new Map<string, UpstreamConnection>()
  private liveMessages = new Map<string, LiveMessage>()
  private activeAssistantBySession = new Map<string, string>()
  private completedMessages = new Set<string>()
  private pendingMessageDeltaFlushes = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingShipFixHandoffs = new Map<string, PendingShipFixHandoff[]>()
  private keepaliveTimer?: ReturnType<typeof setInterval>
  private now: () => Date
  private resolveSessionLane?: (workspaceId: string, sessionId: string) => LaneAttribution | undefined

  constructor(serverManager: ManagedServerManager, options: EventBrokerOptions = {}) {
    this.serverManager = serverManager
    this.taskLedgerService = options.taskLedgerService
    this.now = options.now ?? (() => new Date())
    this.resolveSessionLane = options.resolveSessionLane
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

  registerShipFixHandoff(handoff: PendingShipFixHandoff): void {
    const key = this.sessionKey(handoff.workspaceId, handoff.sessionId)
    const queue = this.pendingShipFixHandoffs.get(key) ?? []
    queue.push(handoff)
    this.pendingShipFixHandoffs.set(key, queue)
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
    let envelope: Record<string, unknown>
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
    const normalizedPayload = normalizeEventPayload(bffType, workspaceId, properties, this.resolveSessionLane)

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
          message.info = this.attachPendingShipFixHandoff(workspaceId, sessionId, message.info)
        }
        this.persistTaskLedgerFromLiveMessage(workspaceId, sessionId, messageId)

        if (message.info.role === 'assistant') {
          this.activeAssistantBySession.set(this.sessionKey(workspaceId, sessionId), messageId)
        }

        if (message.info.role === 'user' && hasRenderableParts(message)) {
          this.emitLiveMessage(workspaceId, sessionId, messageId, 'message.created')
          return true
        }

        if (isMessageFinished(message.info)) {
          this.emitLiveMessage(workspaceId, sessionId, messageId, 'message.completed')
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
        this.persistTaskLedgerFromLiveMessage(workspaceId, sessionId, messageId)

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
        this.emitLiveMessage(workspaceId, sessionId, messageId, bffType)
        return true
      }

      case 'message.part.delta': {
        const properties = readNestedRecord(payload, 'properties')
        const sessionId = properties ? readString(properties, 'sessionID', 'sessionId') : undefined
        const messageId = properties ? readString(properties, 'messageID', 'messageId') : undefined
        const partId = properties ? readString(properties, 'partID', 'partId') : undefined
        const field = properties ? readString(properties, 'field') : undefined
        const delta = properties ? readString(properties, 'delta') : undefined
        if (!properties || !sessionId || !messageId || !partId || !isRenderableDeltaField(field) || delta === undefined) return true

        const message = this.getOrCreateLiveMessage(workspaceId, sessionId, messageId)
        appendPartDelta(message, partId, delta)
        this.persistTaskLedgerFromLiveMessage(workspaceId, sessionId, messageId)
        this.emitLiveMessage(workspaceId, sessionId, messageId, message.info.role === 'user' ? 'message.created' : 'message.delta')
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
            this.emitLiveMessage(workspaceId, sessionId, assistantId, 'message.completed')
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

    const normalized = applyLaneAttributionToMessage(normalizeMessage({
      info: message.info,
      parts: message.parts.filter(isRenderablePart),
    }, { workspaceId, sessionId }), this.resolveSessionLane?.(workspaceId, sessionId))
    if (!normalized.id) return

    this.broadcast(workspaceId, {
      type,
      timestamp: this.now().toISOString(),
      payload: {
        workspaceId,
        sessionId,
        message: normalized,
      },
    })
  }

  private emitLiveMessage(
    workspaceId: string,
    sessionId: string,
    messageId: string,
    type: Extract<BffEventType, 'message.created' | 'message.delta' | 'message.completed'>,
  ): void {
    if (type !== 'message.delta') {
      this.clearPendingMessageDeltaFlush(workspaceId, messageId)
      this.broadcastLiveMessage(workspaceId, sessionId, messageId, type)
      return
    }

    const messageKey = this.messageKey(workspaceId, messageId)
    if (this.pendingMessageDeltaFlushes.has(messageKey)) return

    const timer = setTimeout(() => {
      this.pendingMessageDeltaFlushes.delete(messageKey)
      this.broadcastLiveMessage(workspaceId, sessionId, messageId, 'message.delta')
    }, MESSAGE_DELTA_FLUSH_MS)

    this.pendingMessageDeltaFlushes.set(messageKey, timer)
  }

  private clearPendingMessageDeltaFlush(workspaceId: string, messageId: string): void {
    const messageKey = this.messageKey(workspaceId, messageId)
    const timer = this.pendingMessageDeltaFlushes.get(messageKey)
    if (!timer) return

    clearTimeout(timer)
    this.pendingMessageDeltaFlushes.delete(messageKey)
  }

  private clearPendingMessageDeltaFlushesForWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}:`

    for (const [messageKey, timer] of this.pendingMessageDeltaFlushes.entries()) {
      if (!messageKey.startsWith(prefix)) continue
      clearTimeout(timer)
      this.pendingMessageDeltaFlushes.delete(messageKey)
    }
  }

  private clearPendingShipFixHandoffsForWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}:`
    for (const key of this.pendingShipFixHandoffs.keys()) {
      if (key.startsWith(prefix)) {
        this.pendingShipFixHandoffs.delete(key)
      }
    }
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

  private persistTaskLedgerFromLiveMessage(workspaceId: string, sessionId: string, messageId: string): void {
    if (!this.taskLedgerService) return

    const message = this.liveMessages.get(this.messageKey(workspaceId, messageId))
    if (!message) return

    const normalized = applyLaneAttributionToMessage(normalizeMessage({
      info: message.info,
      parts: message.parts,
    }, { workspaceId, sessionId }), this.resolveSessionLane?.(workspaceId, sessionId))
    const taskId = normalized.taskEntry?.taskId
      ?? normalized.resultAnnotation?.taskId
      ?? normalized.trace?.taskId
    if (!taskId) return

    const recordSelector = {
      sessionId: normalized.taskEntry?.sessionId
        ?? normalized.resultAnnotation?.sessionId
        ?? normalized.trace?.sessionId
        ?? sessionId,
      sourceMessageId: normalized.taskEntry?.sourceMessageId
        ?? normalized.resultAnnotation?.sourceMessageId
        ?? normalized.trace?.sourceMessageId
        ?? normalized.id,
      laneId: normalized.trace?.laneId,
      laneContext: normalized.trace?.laneContext,
    }
    const existingRecord = this.taskLedgerService.getRecord?.(workspaceId, taskId, recordSelector)
      ?? this.taskLedgerService.getRecord?.(workspaceId, taskId, {
        sessionId: recordSelector.sessionId,
        laneId: recordSelector.laneId,
        laneContext: recordSelector.laneContext,
      })
    const existingShipRef = existingRecord?.recentShipRef
    const recentShipRef = existingShipRef
      ? {
          ...existingShipRef,
          ...(normalized.id ? { messageId: normalized.id } : {}),
        }
      : undefined

    this.taskLedgerService.upsertRuntimeRecord({
      workspaceId,
      taskId,
      sessionId: normalized.taskEntry?.sessionId
        ?? normalized.resultAnnotation?.sessionId
        ?? normalized.trace?.sessionId
        ?? sessionId,
      sourceMessageId: normalized.taskEntry?.sourceMessageId
        ?? normalized.resultAnnotation?.sourceMessageId
        ?? normalized.trace?.sourceMessageId
        ?? normalized.id,
      title: normalized.taskEntry?.title,
      summary: normalized.resultAnnotation?.summary ?? normalized.taskEntry?.latestSummary,
      state: normalized.taskEntry?.state,
      createdAt: normalized.createdAt,
      updatedAt: this.now().toISOString(),
      ...(normalized.trace?.laneId ? { laneId: normalized.trace.laneId } : {}),
      ...(normalized.trace?.laneContext ? { laneContext: normalized.trace.laneContext } : {}),
      resultAnnotation: normalized.resultAnnotation,
      ...(recentShipRef ? { recentShipRef } : {}),
    })
  }

  private attachPendingShipFixHandoff(
    workspaceId: string,
    sessionId: string,
    info: Record<string, unknown>,
  ): Record<string, unknown> {
    const messageId = readString(info, 'id')
    if (!messageId) return info

    const pending = this.consumePendingShipFixHandoff(workspaceId, sessionId)
    if (!pending) return info

    const existingTask = readNestedRecord(info, 'task') ?? {}
    const existingAnnotation = readNestedRecord(info, 'resultAnnotation')
      ?? readNestedRecord(info, 'result_annotation')
      ?? {}

    return {
      ...info,
      task: {
        ...existingTask,
        id: readString(existingTask, 'id', 'taskId', 'taskID', 'task_id') ?? pending.taskId,
        state: readString(existingTask, 'state', 'status') ?? 'blocked',
        title: readString(existingTask, 'title', 'label') ?? pending.title,
        summary: readString(existingTask, 'summary', 'latestSummary', 'latest_summary') ?? pending.summary,
      },
      resultAnnotation: {
        ...existingAnnotation,
        sourceMessageId: readString(existingAnnotation, 'sourceMessageId', 'sourceMessageID', 'source_message_id') ?? messageId,
        workspaceId: readString(existingAnnotation, 'workspaceId', 'workspaceID', 'workspace_id') ?? workspaceId,
        sessionId: readString(existingAnnotation, 'sessionId', 'sessionID', 'session_id') ?? sessionId,
        taskId: readString(existingAnnotation, 'taskId', 'taskID', 'task_id') ?? pending.taskId,
        verification: readString(existingAnnotation, 'verification', 'verificationStatus', 'verification_status') ?? 'unverified',
        summary: readString(existingAnnotation, 'summary', 'latestSummary', 'latest_summary') ?? pending.summary,
        shipState: readString(existingAnnotation, 'shipState', 'ship_state') ?? pending.shipState,
        ...(readString(existingAnnotation, 'reviewState', 'review_state') ?? pending.reviewState
          ? { reviewState: readString(existingAnnotation, 'reviewState', 'review_state') ?? pending.reviewState }
          : {}),
      },
    }
  }

  private consumePendingShipFixHandoff(workspaceId: string, sessionId: string): PendingShipFixHandoff | undefined {
    const key = this.sessionKey(workspaceId, sessionId)
    const queue = this.pendingShipFixHandoffs.get(key)
    if (!queue || queue.length === 0) return undefined

    const next = queue.shift()
    if (!queue.length) {
      this.pendingShipFixHandoffs.delete(key)
    } else {
      this.pendingShipFixHandoffs.set(key, queue)
    }
    return next
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
    this.clearPendingMessageDeltaFlushesForWorkspace(workspaceId)
    this.clearPendingShipFixHandoffsForWorkspace(workspaceId)
    this.upstreamConnections.delete(workspaceId)
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      const ping: BffEvent = {
        type: 'connection.ping',
        timestamp: this.now().toISOString(),
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
    for (const timer of this.pendingMessageDeltaFlushes.values()) {
      clearTimeout(timer)
    }
    this.pendingMessageDeltaFlushes.clear()
    for (const conn of this.upstreamConnections.values()) {
      conn.controller.abort()
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer)
    }
    this.upstreamConnections.clear()
    this.pendingShipFixHandoffs.clear()
    this.clients.clear()
  }
}

function normalizeEventPayload(
  type: BffEventType,
  workspaceId: string,
  payload: Record<string, unknown>,
  resolveSessionLane?: (workspaceId: string, sessionId: string) => LaneAttribution | undefined,
): Record<string, unknown> {
  if (type === 'message.created' || type === 'message.delta' || type === 'message.completed') {
    const messageSource = readNestedRecord(payload, 'message') ?? payload
    const sessionId = readString(payload, 'sessionId', 'sessionID')
      ?? readString(messageSource, 'sessionId', 'sessionID')
      return {
        ...payload,
        workspaceId,
        ...(sessionId ? { sessionId } : {}),
        message: applyLaneAttributionToMessage(
          normalizeMessage(messageSource, { workspaceId, sessionId }),
          sessionId ? resolveSessionLane?.(workspaceId, sessionId) : undefined,
        ),
      }
  }

  if (type === 'session.created' || type === 'session.updated') {
    const sessionSource = readNestedRecord(payload, 'session') ?? payload
    const normalizedSession = normalizeSession(sessionSource)
    return {
      ...payload,
      workspaceId,
      session: normalizedSession.id
        ? attachLaneAttribution(normalizedSession, resolveSessionLane?.(workspaceId, normalizedSession.id))
        : normalizedSession,
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

function isRenderableDeltaField(field: string | undefined): boolean {
  return field === 'text' || field === 'summary' || field === 'content'
}

function isRenderablePart(part: Record<string, unknown>): boolean {
  const type = readString(part, 'type')
  return type === 'text'
    || type === 'reasoning'
    || type === 'thinking'
    || type === 'reasoning_summary'
    || type === 'summary_text'
    || type === 'tool-call'
    || type === 'tool_use'
    || type === 'tool-result'
    || type === 'tool_result'
    || type === 'error'
    || type === 'permission-request'
}

function extractRenderablePartText(part: Record<string, unknown>): string | undefined {
  const directText = readString(part, 'text', 'content')
  if (directText) return directText

  const summaryText = collectTextSegments(part.summary)
  if (summaryText) return summaryText

  const contentText = collectTextSegments(part.content)
  if (contentText) return contentText

  return undefined
}

function hasRenderableParts(message: LiveMessage): boolean {
  return message.parts.some((part) => isRenderablePart(part) && (extractRenderablePartText(part) || readString(part, 'toolName') || part.result !== undefined))
}

function collectTextSegments(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined

  const text = value
    .flatMap((entry) => {
      if (typeof entry === 'string') return [entry]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []

      const directText = readString(entry as Record<string, unknown>, 'text', 'content')
      if (directText) return [directText]

      const nestedSummary = collectTextSegments((entry as Record<string, unknown>).summary)
      return nestedSummary ? [nestedSummary] : []
    })
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join('\n\n')

  return text || undefined
}

function isMessageFinished(info: Record<string, unknown>): boolean {
  const time = readNestedRecord(info, 'time')
  return !!time?.['completed'] || typeof info['finish'] === 'string'
}
