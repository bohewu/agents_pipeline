import type { OpenCodeClientFactory } from './opencode-client-factory.js'
import type {
  AgentSummary,
  CommandSummary,
  ModelSummary,
  ProviderSummary,
} from '../../shared/types.js'

interface CachedConfig {
  data: NormalizedConfig
  fetchedAt: number
}

export interface NormalizedConfig {
  providers: ProviderSummary[]
  models: ModelSummary[]
  agents: AgentSummary[]
  commands: CommandSummary[]
  connectedProviderIds: string[]
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
    const [providerPayload, modelPayload, agentPayload, commandPayload] = await Promise.all([
      client.listProviders().catch(() => ({})),
      client.listModels().catch(() => []),
      client.listAgents().catch(() => []),
      client.listCommands().catch(() => []),
    ])

    const { providers, models, connectedProviderIds } = normalizeProviders(providerPayload, modelPayload)
    const agents = normalizeAgents(agentPayload)
    const commands = normalizeCommands(commandPayload)

    const data: NormalizedConfig = { providers, models, agents, commands, connectedProviderIds }
    this.cache.set(workspaceId, { data, fetchedAt: Date.now() })
    return data
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId)
  }
}

function normalizeProviders(providerPayload: any, modelPayload: any): Pick<NormalizedConfig, 'providers' | 'models' | 'connectedProviderIds'> {
  const connectedProviderIds = Array.isArray(providerPayload?.connected)
    ? providerPayload.connected.filter((value: unknown): value is string => typeof value === 'string')
    : []
  const defaultModels = providerPayload?.default && typeof providerPayload.default === 'object'
    ? providerPayload.default as Record<string, string>
    : {}
  const connectedSet = new Set(connectedProviderIds)
  const providerOrder = new Map<string, number>(connectedProviderIds.map((id: string, index: number) => [id, index]))
  const allProviders = Array.isArray(providerPayload?.all)
    ? providerPayload.all as Array<Record<string, any>>
    : []

  const providers: ProviderSummary[] = []
  const models: ModelSummary[] = []

  for (const rawProvider of allProviders) {
    if (typeof rawProvider.id !== 'string') continue

    const providerId = rawProvider.id
    const providerModels = rawProvider.models && typeof rawProvider.models === 'object'
      ? Object.values(rawProvider.models as Record<string, any>)
      : []
    const defaultModelId = typeof defaultModels[providerId] === 'string' ? defaultModels[providerId] : undefined

    providers.push({
      id: providerId,
      name: typeof rawProvider.name === 'string' ? rawProvider.name : providerId,
      connected: connectedSet.has(providerId),
      defaultModelId,
      modelCount: providerModels.length,
    })

    for (const rawModel of providerModels as Array<Record<string, any>>) {
      if (typeof rawModel.id !== 'string') continue

      models.push({
        id: rawModel.id,
        providerId,
        name: typeof rawModel.name === 'string' ? rawModel.name : rawModel.id,
        connected: connectedSet.has(providerId),
        isDefault: defaultModelId === rawModel.id,
      })
    }
  }

  if (models.length === 0 && Array.isArray(modelPayload)) {
    for (const rawModel of modelPayload as Array<Record<string, any>>) {
      if (typeof rawModel.id !== 'string') continue
      const providerId = typeof rawModel.providerID === 'string'
        ? rawModel.providerID
        : typeof rawModel.providerId === 'string'
          ? rawModel.providerId
          : 'unknown'
      models.push({
        id: rawModel.id,
        providerId,
        name: typeof rawModel.name === 'string' ? rawModel.name : rawModel.id,
        connected: connectedSet.has(providerId),
        isDefault: defaultModels[providerId] === rawModel.id,
      })
    }
  }

  providers.sort((left, right) => {
    const leftOrder = providerOrder.get(left.id)
    const rightOrder = providerOrder.get(right.id)
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return leftOrder - rightOrder
    }
    return left.name.localeCompare(right.name)
  })

  models.sort((left, right) => {
    const leftOrder = providerOrder.get(left.providerId)
    const rightOrder = providerOrder.get(right.providerId)
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
    }
    if (left.providerId !== right.providerId) {
      return left.providerId.localeCompare(right.providerId)
    }
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })

  return { providers, models, connectedProviderIds }
}

function normalizeAgents(value: unknown): AgentSummary[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && typeof entry.name === 'string')
    .map((entry) => ({
      id: entry.name as string,
      name: entry.name as string,
      mode: typeof entry.mode === 'string' ? entry.mode : undefined,
      description: typeof entry.description === 'string' ? entry.description : undefined,
    }))
    .sort((left, right) => {
      const leftPrimary = left.mode === 'primary'
      const rightPrimary = right.mode === 'primary'
      if (leftPrimary !== rightPrimary) return leftPrimary ? -1 : 1
      if (left.name === 'build') return -1
      if (right.name === 'build') return 1
      return left.name.localeCompare(right.name)
    })
}

function normalizeCommands(value: unknown): CommandSummary[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return { id: entry, name: entry }
      }
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
        return {
          id: entry.name,
          name: entry.name,
          description: typeof entry.description === 'string' ? entry.description : undefined,
        }
      }
      return null
    })
    .filter((entry): entry is CommandSummary => !!entry)
    .sort((left, right) => left.name.localeCompare(right.name))
}
