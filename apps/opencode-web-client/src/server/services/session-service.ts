import type { OpenCodeClientFactory } from './opencode-client-factory.js'
import type { SessionSummary } from '../../shared/types.js'

export class SessionService {
  private clientFactory: OpenCodeClientFactory

  constructor(clientFactory: OpenCodeClientFactory) {
    this.clientFactory = clientFactory
  }

  async listSessions(workspaceId: string): Promise<SessionSummary[]> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return client.listSessions()
  }

  async createSession(workspaceId: string, _options?: { title?: string }): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return client.createSession()
  }

  async getSession(workspaceId: string, sessionId: string): Promise<SessionSummary> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return client.getSession(sessionId)
  }

  async updateSession(workspaceId: string, sessionId: string, updates: { title?: string }): Promise<SessionSummary> {
    // Upstream may not support PATCH directly; get then return with local updates
    const client = this.clientFactory.forWorkspace(workspaceId)
    const session = await client.getSession(sessionId)
    if (updates.title !== undefined) {
      session.title = updates.title
    }
    return session
  }

  async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
    // Upstream OpenCode may not have a delete endpoint; this is a best-effort call
    const client = this.clientFactory.forWorkspace(workspaceId)
    try {
      await (client as any).deleteSession?.(sessionId)
    } catch {
      // Silently handle if upstream doesn't support delete
    }
  }

  async forkSession(workspaceId: string, sessionId: string, _messageId?: string): Promise<SessionSummary> {
    // Fork = create new session (upstream may not support fork natively)
    const client = this.clientFactory.forWorkspace(workspaceId)
    const newSession = await client.createSession()
    return newSession
  }
}
