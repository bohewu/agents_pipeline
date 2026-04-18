import type { OpenCodeClientFactory } from './opencode-client-factory.js'

interface CachedConfig {
  data: NormalizedConfig
  fetchedAt: number
}

export interface NormalizedConfig {
  providers: unknown[]
  models: unknown[]
  agents: unknown[]
  commands: unknown[]
}

const TTL_MS = 60_000 // 1 minute cache

export class ConfigService {
  private clientFactory: OpenCodeClientFactory
  private cache = new Map<string, CachedConfig>()

  constructor(clientFactory: OpenCodeClientFactory) {
    this.clientFactory = clientFactory
  }

  async getConfig(workspaceId: string): Promise<NormalizedConfig> {
    const cached = this.cache.get(workspaceId)
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached.data
    }

    const client = this.clientFactory.forWorkspace(workspaceId)
    const [providers, models, agents, commands] = await Promise.all([
      client.listProviders().catch(() => []),
      client.listModels().catch(() => []),
      client.listAgents().catch(() => []),
      client.listCommands().catch(() => []),
    ])

    const data: NormalizedConfig = { providers, models, agents, commands }
    this.cache.set(workspaceId, { data, fetchedAt: Date.now() })
    return data
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId)
  }
}
