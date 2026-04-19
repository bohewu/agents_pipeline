import type { ManagedServerManager } from './managed-server-manager.js'
import type {
  SessionSummary, NormalizedMessage, DiffResponse,
  FileStatusResponse,
} from '../../shared/types.js'

export interface OpenCodeClient {
  health(): Promise<{ ok: boolean }>
  listSessions(): Promise<SessionSummary[]>
  getSession(sessionId: string): Promise<SessionSummary>
  createSession(options?: { title?: string; providerId?: string; modelId?: string; agentId?: string }): Promise<SessionSummary>
  listMessages(sessionId: string): Promise<NormalizedMessage[]>
  chat(
    sessionId: string,
    content: string,
    options?: { providerId?: string; modelId?: string; agentId?: string; effort?: string },
  ): Promise<{ messageId: string }>
  command(sessionId: string, command: string, args?: Record<string, unknown>): Promise<unknown>
  shell(sessionId: string, command: string): Promise<unknown>
  abort(sessionId: string): Promise<void>
  diff(sessionId: string): Promise<DiffResponse[]>
  fileStatus(sessionId: string): Promise<FileStatusResponse[]>
  fileContent(path: string): Promise<string>
  fileFind(pattern: string): Promise<string[]>
  listProviders(): Promise<unknown[]>
  listModels(): Promise<unknown[]>
  listAgents(): Promise<unknown[]>
  listCommands(): Promise<unknown[]>
  permissions(): Promise<unknown[]>
}

export class OpenCodeClientFactory {
  private manager: ManagedServerManager

  constructor(manager: ManagedServerManager) {
    this.manager = manager
  }

  forWorkspace(workspaceId: string): OpenCodeClient {
    const runtime = this.manager.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') {
      throw new Error(`No running server for workspace ${workspaceId}`)
    }

    const baseUrl = runtime.baseUrl
    const auth = Buffer.from(`${runtime.username}:${runtime.password}`).toString('base64')

    const request = async (method: string, path: string, body?: unknown): Promise<any> => {
      const headers: Record<string, string> = {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      }

      const resp = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Upstream ${method} ${path} failed: ${resp.status} ${text}`)
      }

      const contentType = resp.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        return resp.json()
      }
      return resp.text()
    }

    const get = (path: string) => request('GET', path)
    const post = (path: string, body?: unknown) => request('POST', path, body)
    const del = (path: string) => request('DELETE', path)

    const withSelections = <T extends Record<string, unknown>>(
      body: T,
      options?: { providerId?: string; modelId?: string; agentId?: string; effort?: string },
    ) => {
      if (!options) return body

      const nextBody: Record<string, unknown> = { ...body }
      if (options.providerId) {
        nextBody.providerId = options.providerId
        nextBody.providerID = options.providerId
      }
      if (options.modelId) {
        nextBody.modelId = options.modelId
        nextBody.modelID = options.modelId
      }
      if (options.agentId) {
        nextBody.agentId = options.agentId
        nextBody.agent = options.agentId
      }
      if (options.effort) {
        nextBody.effort = options.effort
      }
      return nextBody as T
    }

    return {
      health: () => get('/global/health'),

      listSessions: async () => {
        const data = await get('/session')
        return normalizeSessions(data)
      },

      getSession: async (sessionId: string) => {
        const data = await get(`/session/${sessionId}`)
        return normalizeSession(data)
      },

      createSession: async (options) => {
        const payload: Record<string, unknown> = withSelections({}, options)
        if (options?.title) {
          payload.title = options.title
        }
        const data = await post('/session', Object.keys(payload).length > 0 ? payload : undefined)
        return normalizeSession(data)
      },

      listMessages: async (sessionId: string) => {
        const data = await get(`/session/${sessionId}/message`)
        return normalizeMessages(data)
      },

      chat: async (sessionId: string, content: string, options) => {
        return post(`/session/${sessionId}/message`, withSelections({ content }, options))
      },

      command: async (sessionId: string, command: string, args?: Record<string, unknown>) => {
        return post(`/session/${sessionId}/command`, { command, args })
      },

      shell: async (sessionId: string, command: string) => {
        return post(`/session/${sessionId}/shell`, { command })
      },

      abort: async (sessionId: string) => {
        await post(`/session/${sessionId}/abort`)
      },

      diff: async (sessionId: string) => {
        return get(`/session/${sessionId}/diff`)
      },

      fileStatus: async (sessionId: string) => {
        return get(`/session/${sessionId}/file/status`)
      },

      fileContent: async (path: string) => {
        return get(`/file/content?path=${encodeURIComponent(path)}`)
      },

      fileFind: async (pattern: string) => {
        return get(`/file/find?pattern=${encodeURIComponent(pattern)}`)
      },

      listProviders: () => get('/provider'),
      listModels: () => get('/model'),
      listAgents: () => get('/agent'),
      listCommands: () => get('/command'),
      permissions: () => get('/permission'),
    }
  }
}

// ── Normalizers ──

function normalizeSessions(data: any): SessionSummary[] {
  if (Array.isArray(data)) return data.map(normalizeSession)
  if (data && typeof data === 'object' && Array.isArray(data.sessions)) {
    return data.sessions.map(normalizeSession)
  }
  return []
}

function normalizeSession(data: any): SessionSummary {
  return {
    id: data.id ?? data.sessionId ?? '',
    title: data.title ?? data.name,
    createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? data.updated_at ?? data.createdAt ?? new Date().toISOString(),
    messageCount: data.messageCount ?? data.message_count ?? 0,
  }
}

function normalizeMessages(data: any): NormalizedMessage[] {
  if (Array.isArray(data)) return data.map(normalizeMessage)
  if (data && typeof data === 'object' && Array.isArray(data.messages)) {
    return data.messages.map(normalizeMessage)
  }
  return []
}

function normalizeMessage(data: any): NormalizedMessage {
  return {
    id: data.id ?? data.messageId ?? '',
    role: data.role ?? 'assistant',
    parts: Array.isArray(data.parts) ? data.parts : [{ type: 'text', text: data.content ?? data.text ?? '' }],
    createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
  }
}
