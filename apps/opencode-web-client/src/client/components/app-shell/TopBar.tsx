import React, { useEffect } from 'react';
import { useStore } from '../../runtime/store.js';
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector.js';
import { EffortControl } from '../effort/EffortControl.js';
import { UsageBadge } from '../usage/UsageBadge.js';
import { ConnectionStatus } from '../common/ConnectionStatus.js';
import { PanelLeftIcon, PanelRightIcon, PlusIcon } from '../common/Icons.js';

export function TopBar() {
  const {
    activeWorkspaceId,
    workspaceBootstraps,
    selectedProvider,
    selectedModel,
    selectedAgent,
    setSelectedProvider,
    setSelectedModel,
    setSelectedAgent,
    setWorkspaceDialogOpen,
    toggleSidebar,
    toggleRightDrawer,
    sidebarOpen,
    rightDrawerOpen,
  } = useStore();

  const activeBootstrap = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId] : undefined;
  const providerOptions = (activeBootstrap?.opencode?.providers ?? []).filter((provider) => provider.connected);
  const visibleProviders = providerOptions.length > 0
    ? providerOptions
    : (activeBootstrap?.opencode?.providers ?? []);
  const resolvedProviderId = visibleProviders.some((provider) => provider.id === selectedProvider)
    ? selectedProvider
    : visibleProviders[0]?.id ?? null;
  const modelOptions = (activeBootstrap?.opencode?.models ?? []).filter((model) => model.providerId === resolvedProviderId);
  const preferredModelId = visibleProviders.find((provider) => provider.id === resolvedProviderId)?.defaultModelId
    ?? modelOptions.find((model) => model.isDefault)?.id
    ?? modelOptions[0]?.id
    ?? null;
  const resolvedModelId = modelOptions.some((model) => model.id === selectedModel)
    ? selectedModel
    : preferredModelId;
  const allAgents = activeBootstrap?.opencode?.agents ?? [];
  const primaryAgents = allAgents.filter((agent) => agent.mode === 'primary');
  const visibleAgents = primaryAgents.length > 0 ? primaryAgents : allAgents;
  const preferredAgentId = visibleAgents.find((agent) => agent.id === 'build')?.id
    ?? visibleAgents[0]?.id
    ?? null;
  const resolvedAgentId = visibleAgents.some((agent) => agent.id === selectedAgent)
    ? selectedAgent
    : preferredAgentId;

  useEffect(() => {
    if (selectedProvider !== resolvedProviderId) {
      setSelectedProvider(resolvedProviderId);
    }
    if (selectedModel !== resolvedModelId) {
      setSelectedModel(resolvedModelId);
    }
    if (selectedAgent !== resolvedAgentId) {
      setSelectedAgent(resolvedAgentId);
    }
  }, [
    resolvedAgentId,
    resolvedModelId,
    resolvedProviderId,
    selectedAgent,
    selectedModel,
    selectedProvider,
    setSelectedAgent,
    setSelectedModel,
    setSelectedProvider,
  ]);

  return (
    <div className="top-bar">
      <div className="oc-topbar-group">
        <button type="button" onClick={toggleSidebar} className="oc-icon-button" title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
          <PanelLeftIcon size={16} className={!sidebarOpen ? 'oc-icon--flipped' : undefined} />
        </button>
        <WorkspaceSelector />
        <button type="button" onClick={() => setWorkspaceDialogOpen(true)} className="oc-pill-button" title="Add workspace">
          <PlusIcon size={14} />
          <span>Repo</span>
        </button>
      </div>

      <div className="oc-topbar-group oc-topbar-group--grow">
        <Select
          label="Provider"
          value={resolvedProviderId ?? ''}
          onChange={setSelectedProvider}
          disabled={!activeWorkspaceId || visibleProviders.length === 0}
          options={visibleProviders.map((provider) => ({
            value: provider.id,
            label: provider.name,
          }))}
        />
        <Select
          label="Model"
          value={resolvedModelId ?? ''}
          onChange={setSelectedModel}
          disabled={!activeWorkspaceId || modelOptions.length === 0}
          options={modelOptions.map((model) => ({
            value: model.id,
            label: model.name,
          }))}
        />
        <Select
          label="Agent"
          value={resolvedAgentId ?? ''}
          onChange={setSelectedAgent}
          disabled={!activeWorkspaceId || visibleAgents.length === 0}
          options={visibleAgents.map((agent) => ({
            value: agent.id,
            label: agent.name,
          }))}
        />
      </div>

      <div className="oc-topbar-group">
        <EffortControl />
        <UsageBadge />
        <ConnectionStatus />
        <button type="button" onClick={toggleRightDrawer} className="oc-icon-button" title={rightDrawerOpen ? 'Hide inspector' : 'Show inspector'}>
          <PanelRightIcon size={16} className={!rightDrawerOpen ? 'oc-icon--flipped' : undefined} />
        </button>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, disabled }: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value || null)}
      title={label}
      disabled={disabled}
      className="oc-topbar-select"
    >
      <option value="">{label}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
