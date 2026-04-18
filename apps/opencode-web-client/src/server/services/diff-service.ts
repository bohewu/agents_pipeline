import type { OpenCodeClientFactory } from './opencode-client-factory.js'
import type { DiffResponse, FileStatusResponse } from '../../shared/types.js'

export class DiffService {
  private clientFactory: OpenCodeClientFactory

  constructor(clientFactory: OpenCodeClientFactory) {
    this.clientFactory = clientFactory
  }

  async getDiff(workspaceId: string, sessionId: string): Promise<DiffResponse[]> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const data = await client.diff(sessionId)
    if (Array.isArray(data)) return data
    return []
  }

  async getFileStatus(workspaceId: string, sessionId: string): Promise<FileStatusResponse[]> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const data = await client.fileStatus(sessionId)
    if (Array.isArray(data)) return data
    return []
  }

  async getFileContent(workspaceId: string, relativePath: string): Promise<string> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    return client.fileContent(relativePath)
  }

  async searchFiles(workspaceId: string, query: string): Promise<string[]> {
    const client = this.clientFactory.forWorkspace(workspaceId)
    const data = await client.fileFind(query)
    if (Array.isArray(data)) return data
    return []
  }
}
