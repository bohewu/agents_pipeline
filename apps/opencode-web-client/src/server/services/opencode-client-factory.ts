import type { ManagedServerManager } from './managed-server-manager.js'
import type {
  SessionSummary, NormalizedMessage, DiffResponse,
  FileStatusResponse,
} from '../../shared/types.js'
import { normalizeMessages } from './message-normalizer.js'
import { normalizeSession, normalizeSessions } from './session-normalizer.js'

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
  command(sessionId: string, command: string, args?: Record<string, unknown>): Promise<OpenCodeExecutionResult>
  shell(
    sessionId: string,
    command: string,
    options?: { providerId?: string; modelId?: string; agentId?: string; effort?: string },
  ): Promise<OpenCodeExecutionResult>
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

export interface OpenCodeExecutionResult {
  raw: unknown
  status?: string
  summary?: string
  exitCode?: number
  terminalLogRef?: string
  messageId?: string
  taskId?: string
  sessionId?: string
  stdout?: string
  stderr?: string
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
        return normalizeMessages(data, { workspaceId, sessionId })
      },

      chat: async (sessionId: string, content: string, options) => {
        return post(`/session/${sessionId}/message`, withSelections({
          parts: [{ type: 'text', text: content }],
        }, options))
      },

      command: async (sessionId: string, command: string, args?: Record<string, unknown>) => {
        return normalizeExecutionResult(await post(`/session/${sessionId}/command`, { command, args }))
      },

      shell: async (sessionId: string, command: string, options) => {
        return normalizeExecutionResult(await post(`/session/${sessionId}/shell`, withSelections({ command }, options)))
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

function normalizeExecutionResult(raw: unknown): OpenCodeExecutionResult {
  if (typeof raw === 'string') {
    const summary = raw.trim()
    return {
      raw,
      ...(summary ? { summary } : {}),
      ...(summary ? { stdout: raw } : {}),
    }
  }

  const root = toRecord(raw)
  const nestedResult = readNestedRecord(root, 'result')
  const nestedStatus = readNestedRecord(root, 'status')
  const nestedMessage = readNestedRecord(root, 'message')

  const messageId = readString(root, 'messageId', 'messageID', 'message_id')
    ?? readString(nestedMessage ?? {}, 'id', 'messageId', 'messageID', 'message_id')
  const taskId = readString(root, 'taskId', 'taskID', 'task_id')
    ?? readString(nestedResult ?? {}, 'taskId', 'taskID', 'task_id')
    ?? readString(nestedStatus ?? {}, 'taskId', 'taskID', 'task_id')
  const sessionId = readString(root, 'sessionId', 'sessionID', 'session_id')
    ?? readString(nestedMessage ?? {}, 'sessionId', 'sessionID', 'session_id')
  const status = readString(root, 'status', 'state', 'result', 'outcome')
    ?? readString(nestedStatus ?? {}, 'type', 'status', 'state', 'result', 'outcome')
    ?? readString(nestedResult ?? {}, 'status', 'state', 'result', 'outcome')
  const summary = readString(root, 'summary', 'message', 'detail')
    ?? readString(nestedResult ?? {}, 'summary', 'message', 'detail')
    ?? readString(nestedStatus ?? {}, 'summary', 'message', 'detail')
  const exitCode = readNumber(root, 'exitCode', 'exit_code', 'code')
    ?? readNumber(nestedResult ?? {}, 'exitCode', 'exit_code', 'code')
    ?? readNumber(nestedStatus ?? {}, 'exitCode', 'exit_code', 'code')
  const terminalLogRef = readString(root, 'terminalLogRef', 'terminal_log_ref', 'logRef', 'logPath', 'log_path')
    ?? readString(nestedResult ?? {}, 'terminalLogRef', 'terminal_log_ref', 'logRef', 'logPath', 'log_path')
  const stdout = readString(root, 'stdout', 'output')
    ?? readString(nestedResult ?? {}, 'stdout', 'output')
  const stderr = readString(root, 'stderr')
    ?? readString(nestedResult ?? {}, 'stderr')

  return {
    raw,
    ...(status ? { status } : {}),
    ...(summary ? { summary } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(terminalLogRef ? { terminalLogRef } : {}),
    ...(messageId ? { messageId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(stdout ? { stdout } : {}),
    ...(stderr ? { stderr } : {}),
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function readNestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
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

function readNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}
