/**
 * Composer.tsx
 *
 * Uses @assistant-ui/react ComposerPrimitive for the input area.
 */

import React from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { useStore } from '../../runtime/store.js';
import { ComposerModeSelector } from './ComposerModeSelector.js';
import { ArrowUpIcon, SquareIcon } from '../common/Icons.js';
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector.js';
import { EffortControl } from '../effort/EffortControl.js';
import { ConnectionStatus } from '../common/ConnectionStatus.js';
import { getModelOptions, resolveModelId, resolveProviderId } from '../../lib/opencode-controls.js';

export function Composer() {
  const composerMode = useStore((s) => s.composerMode);
  const streaming = useStore((s) => s.streaming);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const workspaceBootstraps = useStore((s) => s.workspaceBootstraps);
  const selectedProvider = useStore((s) => s.selectedProvider);
  const selectedModel = useStore((s) => s.selectedModel);
  const setSelectedProvider = useStore((s) => s.setSelectedProvider);
  const setSelectedModel = useStore((s) => s.setSelectedModel);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const disabled = !sessionId;
  const boot = activeWorkspaceId ? workspaceBootstraps[activeWorkspaceId] : undefined;
  const providerId = resolveProviderId(boot, selectedProvider);
  const modelId = resolveModelId(boot, providerId, selectedModel);
  const modelOptions = getModelOptions(boot, providerId);

  let placeholder = 'Choose a folder to start chatting';
  if (activeWorkspaceId && !sessionId) {
    placeholder = 'Preparing chat...';
  } else if (sessionId) {
    placeholder =
      composerMode === 'ask'
        ? 'Describe what you want to build. Use @agent or /command if needed.'
        : composerMode === 'command'
          ? 'Type a command, or switch back to Ask and start with /'
          : 'Run a shell command. Start with $ from Ask mode if you prefer.';
  }

  const handleModelChange = (value: string) => {
    const nextModel = modelOptions.find((model) => model.id === value);
    if (!nextModel) {
      setSelectedModel(null);
      return;
    }
    setSelectedModel(nextModel.id);
    setSelectedProvider(nextModel.providerId);
  };

  return (
    <div className="oc-composer-shell">
      <ComposerPrimitive.Root className="oc-composer-root">
        <div className="oc-composer-main">
          <ComposerPrimitive.Input
            autoFocus
            disabled={disabled}
            name="message"
            placeholder={placeholder}
            rows={3}
            className={`aui-composer-input ${composerMode === 'shell' ? 'aui-composer-input--mono' : ''}`}
          />

          {streaming ? (
            <ComposerPrimitive.Cancel asChild>
              <button type="button" className="oc-composer-send oc-composer-send--cancel" aria-label="Stop generating">
                <SquareIcon size={12} />
              </button>
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send
              disabled={disabled}
              className="oc-composer-send"
              aria-label="Send message"
            >
              <ArrowUpIcon size={16} />
            </ComposerPrimitive.Send>
          )}
        </div>

        <div className="oc-composer-footer">
          <div className="oc-composer-footer__primary">
            <WorkspaceSelector />
            {activeWorkspaceId && (
              <>
                <ComposerModeSelector />
                <select
                  value={modelId ?? ''}
                  onChange={(event) => handleModelChange(event.target.value)}
                  className="oc-topbar-select oc-topbar-select--compact"
                  aria-label="Model variant"
                  disabled={modelOptions.length === 0}
                >
                  <option value="">Model</option>
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
                <EffortControl />
              </>
            )}
          </div>

          <div className="oc-composer-footer__secondary">
            {activeWorkspaceId && <ConnectionStatus />}
          </div>
        </div>
      </ComposerPrimitive.Root>

      <p className="oc-composer-note">
        {disabled
          ? 'Not sure? Choose a folder and describe your goal in plain language.'
          : 'Review important changes before applying them.'}
      </p>
    </div>
  );
}
