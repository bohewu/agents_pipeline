import type { AgentSummary, ModelSummary, ProviderSummary, WorkspaceBootstrap } from '../../shared/types.js';
import type { ComposerMode } from '../runtime/store.js';

export interface GroupedModelOptions {
  provider: ProviderSummary;
  models: ModelSummary[];
}

export function getVisibleProviders(boot?: WorkspaceBootstrap): ProviderSummary[] {
  const providers = boot?.opencode?.providers ?? [];
  const connected = providers.filter((provider) => provider.connected);
  return connected.length > 0 ? connected : providers;
}

export function resolveProviderId(boot?: WorkspaceBootstrap, selectedProvider?: string | null): string | null {
  const providers = getVisibleProviders(boot);
  return providers.some((provider) => provider.id === selectedProvider)
    ? selectedProvider ?? null
    : providers[0]?.id ?? null;
}

export function getModelOptions(boot?: WorkspaceBootstrap, providerId?: string | null): ModelSummary[] {
  const models = boot?.opencode?.models ?? [];
  if (!providerId) return models.filter((model) => model.connected);
  return models.filter((model) => model.providerId === providerId);
}

export function getGroupedModelOptions(boot?: WorkspaceBootstrap): GroupedModelOptions[] {
  const providers = getVisibleProviders(boot);
  return providers
    .map((provider) => ({
      provider,
      models: getModelOptions(boot, provider.id),
    }))
    .filter((group) => group.models.length > 0);
}

export function resolveModelId(
  boot?: WorkspaceBootstrap,
  providerId?: string | null,
  selectedModel?: string | null,
): string | null {
  const models = getModelOptions(boot, providerId);
  if (models.some((model) => model.id === selectedModel)) {
    return selectedModel ?? null;
  }

  const providers = boot?.opencode?.providers ?? [];
  const provider = providers.find((entry) => entry.id === providerId);
  return provider?.defaultModelId
    ?? models.find((model) => model.isDefault)?.id
    ?? models[0]?.id
    ?? null;
}

export function getVisibleAgents(boot?: WorkspaceBootstrap): AgentSummary[] {
  const agents = boot?.opencode?.agents ?? [];
  const primary = agents.filter((agent) => agent.mode === 'primary');
  return primary.length > 0 ? primary : agents;
}

export function resolveAgentId(boot?: WorkspaceBootstrap, selectedAgent?: string | null): string | null {
  const agents = getVisibleAgents(boot);
  return agents.some((agent) => agent.id === selectedAgent)
    ? selectedAgent ?? null
    : agents.find((agent) => agent.id === 'build')?.id
      ?? agents[0]?.id
      ?? null;
}

export function parseComposerIntent(
  rawText: string,
  {
    composerMode,
    boot,
    fallbackAgentId,
  }: {
    composerMode: ComposerMode;
    boot?: WorkspaceBootstrap;
    fallbackAgentId?: string | null;
  },
): { mode: ComposerMode; text: string; agentId?: string } {
  let text = rawText.trim();
  let mode: ComposerMode = composerMode;
  let agentId = fallbackAgentId ?? undefined;

  if (text.startsWith('$')) {
    mode = 'shell';
    text = text.slice(1).trim();
  } else if (text.startsWith('/')) {
    mode = 'command';
    text = text.slice(1).trim();
  }

  if (mode !== 'shell') {
    const agentMatch = text.match(/^@([A-Za-z0-9._-]+)/);
    if (agentMatch) {
      const matchedAgent = findAgentByToken(boot, agentMatch[1]);
      if (matchedAgent) {
        agentId = matchedAgent.id;
        text = text.slice(agentMatch[0].length).trim();
      }
    }
  }

  if (mode === 'command' && text.startsWith('/')) {
    text = text.slice(1).trim();
  }

  if (mode === 'shell' && text.startsWith('$')) {
    text = text.slice(1).trim();
  }

  return { mode, text, agentId };
}

function findAgentByToken(boot: WorkspaceBootstrap | undefined, token: string): AgentSummary | undefined {
  const lowerToken = token.toLowerCase();
  return getVisibleAgents(boot).find((agent) => {
    const idMatch = agent.id.toLowerCase() === lowerToken;
    const nameMatch = agent.name.toLowerCase().replace(/\s+/g, '-') === lowerToken;
    return idMatch || nameMatch;
  });
}
