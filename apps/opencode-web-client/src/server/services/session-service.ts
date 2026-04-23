import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  LaneAttribution,
  SessionSummary,
  WorkspaceComparisonLaneReference,
  WorkspaceLaneComparisonState,
} from '../../shared/types.js'
import type { AppPaths } from './app-paths.js'
import type { OpenCodeClientFactory } from './opencode-client-factory.js'
import {
  attachLaneAttribution,
  mergeLaneAttribution,
  validateLaneAttributionRecord,
  validateWorkspaceComparisonLaneReferenceRecord,
} from './lane-attribution.js'

interface SessionLaneRecord extends LaneAttribution {
  sessionId: string
}

interface SessionLaneStateFile {
  version: 2
  sessions: SessionLaneRecord[]
  laneComparison?: WorkspaceLaneComparisonState
}

interface SessionServiceOptions {
  stateDir?: string
}

type UpstreamCreateSessionOptions = { title?: string; providerId?: string; modelId?: string; agentId?: string }

type SessionMutationOptions = UpstreamCreateSessionOptions & LaneAttribution

const SESSION_LANE_STATE_VERSION = 2

export class SessionService {
  private clientFactory: OpenCodeClientFactory
  private stateDir?: string

  constructor(
    clientFactory: OpenCodeClientFactory,
    options: Pick<AppPaths, 'stateDir'> | SessionServiceOptions = {},
  ) {
    this.clientFactory = clientFactory
    this.stateDir = options.stateDir
  }

  async listSessions(workspaceId: string): Promise<SessionSummary[]> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return (await client.listSessions()).map((session) => this.hydrateSession(workspaceId, session))
  }

  async createSession(
    workspaceId: string,
    options?: SessionMutationOptions,
  ): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const session = await client.createSession(toUpstreamOptions(options))
    const lane = mergeLaneAttribution(options)
    if (lane) {
      this.upsertLaneRecord(workspaceId, session.id, lane)
    }
    return this.hydrateSession(workspaceId, session, lane)
  }

  async getSession(workspaceId: string, sessionId: string): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return this.hydrateSession(workspaceId, await client.getSession(sessionId))
  }

  async updateSession(workspaceId: string, sessionId: string, updates: { title?: string }): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const session = await client.getSession(sessionId)
    if (updates.title !== undefined) {
      session.title = updates.title
    }
    return this.hydrateSession(workspaceId, session)
  }

  async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    try {
      await (client as any).deleteSession?.(sessionId)
    } catch {
      // Silently handle if upstream doesn't support delete
    }
    this.removeLaneRecord(workspaceId, sessionId)
  }

  async forkSession(
    workspaceId: string,
    _sessionId: string,
    _messageId?: string,
    options?: LaneAttribution,
  ): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const newSession = await client.createSession()
    const lane = mergeLaneAttribution(options)
    if (lane) {
      this.upsertLaneRecord(workspaceId, newSession.id, lane)
    }
    return this.hydrateSession(workspaceId, newSession, lane)
  }

  resolveLaneAttribution(workspaceId: string, sessionId: string): LaneAttribution | undefined {
    return this.readState(workspaceId).sessions.find((entry) => entry.sessionId === sessionId)
  }

  resolveLaneComparisonState(workspaceId: string): WorkspaceLaneComparisonState | undefined {
    return this.readState(workspaceId).laneComparison
  }

  setLaneComparisonState(
    workspaceId: string,
    laneComparison: WorkspaceLaneComparisonState | undefined,
  ): WorkspaceLaneComparisonState | undefined {
    const state = this.readState(workspaceId)
    const nextLaneComparison = normalizeLaneComparisonState(laneComparison)
    this.writeState(workspaceId, state.sessions, nextLaneComparison)
    return nextLaneComparison
  }

  private hydrateSession(
    workspaceId: string,
    session: SessionSummary,
    hintedLane?: LaneAttribution,
  ): SessionSummary {
    return attachLaneAttribution(
      session,
      mergeLaneAttribution(session, hintedLane, this.resolveLaneAttribution(workspaceId, session.id)),
    )
  }

  private upsertLaneRecord(workspaceId: string, sessionId: string, lane: LaneAttribution): void {
    if (!this.stateDir) return

    const normalizedLane = mergeLaneAttribution(lane)
    if (!normalizedLane) return

    const state = this.readState(workspaceId)
    const nextSessions = [...state.sessions]
    const nextRecord: SessionLaneRecord = {
      sessionId,
      ...normalizedLane,
    }
    const existingIndex = nextSessions.findIndex((entry) => entry.sessionId === sessionId)

    if (existingIndex >= 0) {
      nextSessions[existingIndex] = nextRecord
    } else {
      nextSessions.unshift(nextRecord)
    }

    this.writeState(workspaceId, nextSessions, state.laneComparison)
  }

  private removeLaneRecord(workspaceId: string, sessionId: string): void {
    if (!this.stateDir) return
    const state = this.readState(workspaceId)
    const nextSessions = state.sessions.filter((entry) => entry.sessionId !== sessionId)
    this.writeState(workspaceId, nextSessions, state.laneComparison)
  }

  private readState(workspaceId: string): SessionLaneStateFile {
    if (!this.stateDir) {
      return { version: SESSION_LANE_STATE_VERSION, sessions: [] }
    }

    const filePath = this.getStateFilePath(workspaceId)
    if (!existsSync(filePath)) {
      return { version: SESSION_LANE_STATE_VERSION, sessions: [] }
    }

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as {
        version?: number
        sessions?: unknown
        laneComparison?: unknown
      }
      if ((parsed.version !== 1 && parsed.version !== SESSION_LANE_STATE_VERSION) || !Array.isArray(parsed.sessions)) {
        return { version: SESSION_LANE_STATE_VERSION, sessions: [] }
      }

      return {
        version: SESSION_LANE_STATE_VERSION,
        sessions: parsed.sessions.flatMap((value: unknown) => {
          try {
            return [validateSessionLaneRecord(value)]
          } catch {
            return []
          }
        }),
        ...(parsed.version === SESSION_LANE_STATE_VERSION && parsed.laneComparison !== undefined
          ? { laneComparison: validateLaneComparisonState(parsed.laneComparison) }
          : {}),
      }
    } catch {
      return { version: SESSION_LANE_STATE_VERSION, sessions: [] }
    }
  }

  private writeState(
    workspaceId: string,
    sessions: SessionLaneRecord[],
    laneComparison?: WorkspaceLaneComparisonState,
  ): void {
    if (!this.stateDir) return

    const filePath = this.getStateFilePath(workspaceId)
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(
      tmpPath,
      JSON.stringify({
        version: SESSION_LANE_STATE_VERSION,
        sessions: sortSessionLaneRecords(sessions),
        ...(laneComparison ? { laneComparison } : {}),
      }, null, 2),
      'utf-8',
    )
    renameSync(tmpPath, filePath)
  }

  private getStateFilePath(workspaceId: string): string {
    return path.join(this.stateDir!, 'session-lanes', `${workspaceId}.json`)
  }
}

function toUpstreamOptions(options: SessionMutationOptions | undefined): UpstreamCreateSessionOptions | undefined {
  if (!options) return undefined

  const next: UpstreamCreateSessionOptions = {}
  if (options.title !== undefined) next.title = options.title
  if (options.providerId !== undefined) next.providerId = options.providerId
  if (options.modelId !== undefined) next.modelId = options.modelId
  if (options.agentId !== undefined) next.agentId = options.agentId
  return Object.keys(next).length > 0 ? next : undefined
}

function validateSessionLaneRecord(value: unknown): SessionLaneRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Session lane record must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const lane = validateLaneAttributionRecord(candidate, 'sessionLane')
  if (!lane) {
    throw new Error('Session lane record must include lane metadata.')
  }

  return {
    sessionId: readString(candidate.sessionId, 'sessionLane.sessionId'),
    ...lane,
  }
}

function sortSessionLaneRecords(records: SessionLaneRecord[]): SessionLaneRecord[] {
  return [...records].sort((left, right) => left.sessionId.localeCompare(right.sessionId))
}

function validateLaneComparisonState(value: unknown): WorkspaceLaneComparisonState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lane comparison state must be an object.')
  }

  const candidate = value as Record<string, unknown>
  return normalizeLaneComparisonState({
    ...(candidate.selectedLane !== undefined ? {
      selectedLane: validateLaneComparisonReference(candidate.selectedLane, 'laneComparison.selectedLane'),
    } : {}),
    ...(candidate.adoptedLane !== undefined ? {
      adoptedLane: validateLaneComparisonReference(candidate.adoptedLane, 'laneComparison.adoptedLane'),
    } : {}),
  })
}

function validateLaneComparisonReference(
  value: unknown,
  fieldName: string,
): WorkspaceComparisonLaneReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${fieldName} to be an object.`)
  }

  return validateWorkspaceComparisonLaneReferenceRecord(value as Record<string, unknown>, fieldName)
}

function normalizeLaneComparisonState(
  state: WorkspaceLaneComparisonState | undefined,
): WorkspaceLaneComparisonState | undefined {
  if (!state) return undefined

  const selectedLane = normalizeWorkspaceComparisonLaneReference(state.selectedLane)
  const adoptedLane = normalizeWorkspaceComparisonLaneReference(state.adoptedLane)
  if (!selectedLane && !adoptedLane) {
    return undefined
  }

  return {
    ...(selectedLane ? { selectedLane } : {}),
    ...(adoptedLane ? { adoptedLane } : {}),
  }
}

function normalizeWorkspaceComparisonLaneReference(
  lane: WorkspaceComparisonLaneReference | undefined,
): WorkspaceComparisonLaneReference | undefined {
  if (!lane) return undefined

  const normalizedLane = mergeLaneAttribution(lane)
  if (!normalizedLane) {
    return undefined
  }

  return {
    sessionId: lane.sessionId,
    ...normalizedLane,
  }
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`)
  }
  return value.trim()
}
