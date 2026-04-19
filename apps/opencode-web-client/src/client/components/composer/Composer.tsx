/**
 * Composer.tsx
 *
 * Uses @assistant-ui/react ComposerPrimitive for the input area.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { useStore } from '../../runtime/store.js';
import { ComposerModeSelector } from './ComposerModeSelector.js';
import { ArrowUpIcon, SquareIcon } from '../common/Icons.js';
import { EffortControl } from '../effort/EffortControl.js';
import { getModelOptions, getVisibleAgents, resolveModelId, resolveProviderId } from '../../lib/opencode-controls.js';

type SuggestionKind = 'agent' | 'command';

interface ComposerSuggestion {
  kind: SuggestionKind;
  id: string;
  name: string;
  description?: string;
}

interface ActiveToken {
  trigger: '@' | '/';
  query: string;
  start: number;
  end: number;
}

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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  let placeholder = 'Choose a folder from the left to start chatting';
  if (activeWorkspaceId && !sessionId) {
    placeholder = 'Preparing chat...';
  } else if (sessionId) {
    placeholder =
      composerMode === 'ask'
        ? 'Ask anything. @ for agents, / for commands or skills, $ for shell.'
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

  const activeToken = useMemo(() => getActiveToken(draftValue, cursor), [draftValue, cursor]);

  const suggestions = useMemo(() => {
    if (!activeToken || !boot?.opencode) return [];
    const query = activeToken.query.toLowerCase();

    if (activeToken.trigger === '@') {
      return getVisibleAgents(boot)
        .filter((agent) => query.length === 0 || agent.id.toLowerCase().includes(query) || agent.name.toLowerCase().includes(query))
        .slice(0, 8)
        .map<ComposerSuggestion>((agent) => ({
          kind: 'agent',
          id: agent.id,
          name: agent.name,
          description: agent.description,
        }));
    }

    return (boot.opencode.commands ?? [])
      .filter((command) => query.length === 0 || command.name.toLowerCase().includes(query) || command.id.toLowerCase().includes(query))
      .slice(0, 8)
      .map<ComposerSuggestion>((command) => ({
        kind: 'command',
        id: command.id,
        name: command.name,
        description: command.description,
      }));
  }, [activeToken, boot]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken?.trigger, activeToken?.query]);

  const syncDraft = (target: HTMLTextAreaElement) => {
    setDraftValue(target.value);
    setCursor(target.selectionStart ?? target.value.length);
  };

  const applySuggestion = (suggestion: ComposerSuggestion) => {
    if (!activeToken) return;
    const tokenText = suggestion.kind === 'agent'
      ? `@${suggestion.id} `
      : `/${suggestion.name} `;
    const nextValue = `${draftValue.slice(0, activeToken.start)}${tokenText}${draftValue.slice(activeToken.end)}`;
    const nextCursor = activeToken.start + tokenText.length;
    updateComposerInput(inputRef.current, nextValue, nextCursor);
    setDraftValue(nextValue);
    setCursor(nextCursor);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applySuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setCursor(-1);
    }
  };

  return (
    <div className="oc-composer-shell">
      <ComposerPrimitive.Root className="oc-composer-root">
        {suggestions.length > 0 && activeToken && (
          <div className="oc-composer-suggestions" role="listbox" aria-label={activeToken.trigger === '@' ? 'Agent suggestions' : 'Command and skill suggestions'}>
            <div className="oc-composer-suggestions__title">
              {activeToken.trigger === '@' ? 'Agents' : 'Commands & skills'}
            </div>
            <div className="oc-composer-suggestions__list">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.kind}:${suggestion.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  className={`oc-composer-suggestion ${index === activeSuggestionIndex ? 'is-active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  <span className="oc-composer-suggestion__token">
                    {suggestion.kind === 'agent' ? '@' : '/'}{suggestion.name}
                  </span>
                  {suggestion.description && (
                    <span className="oc-composer-suggestion__description">{suggestion.description}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="oc-composer-main">
          <ComposerPrimitive.Input
            ref={inputRef}
            autoFocus
            disabled={disabled}
            name="message"
            placeholder={placeholder}
            rows={3}
            className={`aui-composer-input ${composerMode === 'shell' ? 'aui-composer-input--mono' : ''}`}
            onInput={(event) => syncDraft(event.currentTarget)}
            onClick={(event) => syncDraft(event.currentTarget)}
            onKeyUp={(event) => syncDraft(event.currentTarget)}
            onKeyDown={handleInputKeyDown}
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
            {activeWorkspaceId && boot?.opencode?.project?.name && (
              <div className="oc-composer-meta">{boot.opencode.project.name}</div>
            )}
          </div>
        </div>
      </ComposerPrimitive.Root>

      <p className="oc-composer-note">
        {disabled
          ? 'Not sure? Choose a folder from the left, then describe your goal in plain language.'
          : 'Review important changes before applying them.'}
      </p>
    </div>
  );
}

function getActiveToken(value: string, cursor: number): ActiveToken | null {
  if (cursor < 0) return null;
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)([@/])([A-Za-z0-9._-]*)$/);
  if (!match) return null;

  const trigger = match[1] as '@' | '/';
  const query = match[2] ?? '';
  const start = cursor - (`${trigger}${query}`).length;
  return { trigger, query, start, end: cursor };
}

function updateComposerInput(input: HTMLTextAreaElement | null, nextValue: string, nextCursor: number) {
  if (!input) return;
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
}
