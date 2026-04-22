import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NormalizedMessage, NormalizedPart, TaskLedgerShipReference, VerificationCommandKind } from '../../../shared/types.js';
import { api } from '../../lib/api-client.js';
import { getRenderableReasoningParts } from '../../lib/reasoning-parts.js';
import { selectMessageResultTrace, selectSessionMessages, type ResolvedMessageResultTrace, useStore } from '../../runtime/store.js';
import { PermissionCard } from './PermissionCard.js';
import { ErrorCard } from './ErrorCard.js';
import { ActivityIcon, CheckIcon, CopyIcon } from '../common/Icons.js';
import { BrowserEvidenceSurface } from '../common/BrowserEvidenceSurface.js';

const ROLE_LABELS: Record<string, string> = {
  user: 'You',
  assistant: 'OpenCode',
  system: 'System',
};

export function MessageCard({ message, isRunning = false }: { message: NormalizedMessage; isRunning?: boolean }) {
  const [copied, setCopied] = useState(false);
  const showReasoningSummaries = useStore((s) => s.settings.showReasoningSummaries);
  const selectedReasoningMessageId = useStore((s) => s.selectedReasoningMessageId);
  const rightPanel = useStore((s) => s.rightPanel);
  const rightDrawerOpen = useStore((s) => s.rightDrawerOpen);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const focusActivityMessage = useStore((s) => s.focusActivityMessage);
  const toggleRightDrawer = useStore((s) => s.toggleRightDrawer);
  const resultAnnotationsByWorkspace = useStore((s) => s.resultAnnotationsByWorkspace);
  const taskEntriesByWorkspace = useStore((s) => s.taskEntriesByWorkspace);
  const workspaceBootstraps = useStore((s) => s.workspaceBootstraps);
  const workspaceGitStatusByWorkspace = useStore((s) => s.workspaceGitStatusByWorkspace);
  const resultTrace = useMemo(() => selectMessageResultTrace({
    resultAnnotationsByWorkspace,
    taskEntriesByWorkspace,
    workspaceBootstraps,
    workspaceGitStatusByWorkspace,
  }, message), [message, resultAnnotationsByWorkspace, taskEntriesByWorkspace, workspaceBootstraps, workspaceGitStatusByWorkspace]);
  const textParts = useMemo(
    () => message.parts.filter((part) => part.type === 'text' && !!part.text?.trim()),
    [message.parts],
  );
  const reasoningParts = useMemo(() => getRenderableReasoningParts(message.parts), [message.parts]);
  const toolParts = useMemo(() => getRenderableToolParts(message.parts), [message.parts]);
  const copyText = useMemo(() => getCopyText(message.parts, toolParts, resultTrace), [message.parts, resultTrace, toolParts]);
  const extraParts = message.parts.filter((part) => part.type === 'error' || part.type === 'permission-request');
  const fallbackSummary = textParts.length === 0 && toolParts.length === 0
    ? resultTrace?.summary?.trim() ?? ''
    : '';
  const showAvatar = message.role !== 'user';
  const hasPrimaryContent = textParts.length > 0 || toolParts.length > 0 || extraParts.length > 0 || !!resultTrace;
  const showReasoningTrigger = showReasoningSummaries && reasoningParts.length > 0;
  const isReasoningSelected = rightDrawerOpen && rightPanel === 'activity' && selectedReasoningMessageId === message.id;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!hasPrimaryContent && !showReasoningTrigger) {
    return null;
  }

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const openReasoningActivity = () => {
    setRightPanel('activity');
    focusActivityMessage(message.id);
    if (!rightDrawerOpen) {
      toggleRightDrawer();
    }
  };

  return (
    <div className={`oc-message-card oc-message-card--${message.role}`}>
      {showAvatar && (
        <div className={`oc-message-card__avatar oc-message-card__avatar--${message.role}`}>
          {message.role === 'assistant' ? 'O' : 'S'}
        </div>
      )}

      <div className="oc-message-card__main">
        {showAvatar && (
          <div className="oc-message-card__eyebrow">
            <span className="oc-message-card__label">{ROLE_LABELS[message.role] ?? message.role}</span>
            <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
        )}

        {hasPrimaryContent && (
          <div className={`oc-message-card__bubble oc-message-card__bubble--${message.role}`} title={new Date(message.createdAt).toLocaleString()}>
            <div className="oc-message-card__content">
              {textParts.map((part, index) => (
                <ReactMarkdown key={`text-${index}`} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {part.text ?? ''}
                </ReactMarkdown>
              ))}

              {fallbackSummary && (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {fallbackSummary}
                </ReactMarkdown>
              )}

              {toolParts.map((part) => (
                <AssistantToolPart key={part.key} part={part} />
              ))}

              {message.role === 'assistant' && resultTrace && <MessageResultTrace trace={resultTrace} />}
            </div>

            {extraParts.map((part, index) =>
              part.type === 'permission-request'
                ? <PermissionCard key={`permission-${index}`} part={part} />
                : <ErrorCard key={`error-${index}`} part={part} />,
            )}
          </div>
        )}

        {message.role === 'assistant' && hasPrimaryContent && (
          <div className="oc-message-card__actions">
            <button
              type="button"
              className="oc-message-copy"
              onClick={() => void handleCopy()}
              disabled={!copyText}
              aria-label={copied ? 'Copied message' : 'Copy message'}
              title={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
            </button>
          </div>
        )}

        {showReasoningTrigger && (
          <div className="oc-message-card__supplement">
            <button
              type="button"
              className={`oc-reasoning-trigger${isReasoningSelected ? ' is-selected' : ''}`}
              onClick={openReasoningActivity}
              aria-pressed={isReasoningSelected}
              aria-label={isRunning ? 'Open live thinking activity' : 'Open thinking summary in side panel'}
              title={isRunning ? 'Open live thinking activity' : 'Open thinking summary in side panel'}
            >
              <span className="oc-reasoning-trigger__icon" aria-hidden="true">
                <ActivityIcon size={13} />
              </span>
              <span className="oc-reasoning-trigger__label">{isRunning ? 'Thinking live' : 'Thinking summary'}</span>
              <span className="oc-reasoning-trigger__meta">
                {reasoningParts.length} section{reasoningParts.length === 1 ? '' : 's'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const MARKDOWN_COMPONENTS = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => <>{props.children}</>,
  code: MarkdownCode,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="oc-markdown-heading oc-markdown-heading--h1" {...props} />,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="oc-markdown-heading oc-markdown-heading--h2" {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="oc-markdown-heading oc-markdown-heading--h3" {...props} />,
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="oc-markdown-table-wrap">
      <table {...props} />
    </div>
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => <blockquote className="oc-markdown-blockquote" {...props} />,
};

function MarkdownCode({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const codeText = String(children ?? '').replace(/\n$/, '');
  const language = className?.match(/language-([\w-]+)/)?.[1] ?? null;

  if (!language && !codeText.includes('\n')) {
    return <code className="oc-markdown-inline-code" {...props}>{children}</code>;
  }

  return <CodeBlockPreview language={language ?? 'text'} code={codeText} isPlainText={!language} />;
}

function CodeBlockPreview({ language, code, isPlainText = false }: { language: string; code: string; isPlainText?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`oc-code-block${isPlainText ? ' oc-code-block--plain' : ''}`}>
      {!isPlainText && (
        <div className="oc-code-block__header">
          <span className="oc-code-block__label">{language}</span>
          <button
            type="button"
            className="oc-code-block__copy"
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied code block' : 'Copy code block'}
            title={copied ? 'Copied' : 'Copy code block'}
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          </button>
        </div>
      )}
      <pre className={`oc-code-block__body${isPlainText ? ' oc-code-block__body--plain' : ''}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface RenderableToolPart {
  key: string;
  toolName: string;
  argsText: string;
  resultText: string;
  hasArgs: boolean;
  hasResult: boolean;
  statusLabel: string;
  isError: boolean;
}

function AssistantToolPart({ part }: { part: RenderableToolPart }) {
  const tone = part.isError
    ? { border: 'rgba(220, 38, 38, 0.16)', background: 'var(--error-soft)', color: 'var(--error)' }
    : part.hasResult
      ? { border: 'rgba(16, 163, 127, 0.16)', background: 'var(--success-soft)', color: 'var(--success)' }
      : { border: 'rgba(183, 121, 31, 0.18)', background: 'var(--warning-soft)', color: 'var(--warning)' };

  return (
    <details
      className="oc-tool-part"
      style={{
        marginTop: 12,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        borderRadius: 18,
        padding: '12px 14px',
      }}
    >
      <summary className="oc-tool-part__summary" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ color: tone.color, fontSize: 12 }}>{part.hasResult ? '✓' : '⚙'}</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{part.toolName}</span>
        <span
          style={{
            marginLeft: 'auto',
            color: tone.color,
            fontSize: 11,
            background: 'rgba(255, 255, 255, 0.72)',
            borderRadius: 999,
            padding: '2px 8px',
          }}
        >
          {part.statusLabel}
        </span>
      </summary>

      {(part.hasArgs || part.hasResult) && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {part.hasArgs && (
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.72)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 180,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {part.argsText}
            </pre>
          )}

          {part.hasResult && (
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.86)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 240,
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {part.resultText}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}

function getRenderableToolParts(parts: NormalizedPart[]): RenderableToolPart[] {
  const toolCalls: RenderableToolPart[] = [];
  const resultsById = new Map<string, NormalizedPart>();

  for (const part of parts) {
    if (part.type === 'tool-result') {
      const key = part.toolCallId ?? part.id;
      if (key) {
        resultsById.set(key, part);
      }
    }
  }

  for (const part of parts) {
    if (part.type !== 'tool-call') continue;
    const toolCallId = part.toolCallId ?? part.id ?? `tool-${toolCalls.length}`;
    const resultPart = resultsById.get(toolCallId);
    const result = resultPart?.result ?? part.result;
    const resultText = formatStructuredValue(result);
    const argsText = formatStructuredValue(part.args ?? {});
    const isError = !!part.error || !!resultPart?.error;
    const hasResult = resultText.length > 0;

    toolCalls.push({
      key: toolCallId,
      toolName: part.toolName ?? 'unknown',
      argsText,
      resultText,
      hasArgs: argsText !== '{}' && argsText.length > 0,
      hasResult,
      statusLabel: resolveToolStatusLabel(part.status, hasResult, isError),
      isError,
    });
  }

  for (const part of parts) {
    if (part.type !== 'tool-result') continue;
    const toolCallId = part.toolCallId ?? part.id;
    if (!toolCallId || toolCalls.some((entry) => entry.key === toolCallId)) continue;

    const resultText = formatStructuredValue(part.result);
    toolCalls.push({
      key: toolCallId,
      toolName: part.toolName ?? 'unknown',
      argsText: '{}',
      resultText,
      hasArgs: false,
      hasResult: resultText.length > 0,
      statusLabel: resolveToolStatusLabel(part.status, resultText.length > 0, !!part.error),
      isError: !!part.error,
    });
  }

  return toolCalls;
}

function MessageResultTrace({ trace }: { trace: ResolvedMessageResultTrace }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeSessionByWorkspace = useStore((s) => s.activeSessionByWorkspace);
  const selectedProvider = useStore((s) => s.selectedProvider);
  const selectedModel = useStore((s) => s.selectedModel);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const effortByWorkspace = useStore((s) => s.effortByWorkspace);
  const rightDrawerOpen = useStore((s) => s.rightDrawerOpen);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const toggleRightDrawer = useStore((s) => s.toggleRightDrawer);
  const addMessage = useStore((s) => s.addMessage);
  const setMessages = useStore((s) => s.setMessages);
  const setSessionStreaming = useStore((s) => s.setSessionStreaming);
  const [pendingAction, setPendingAction] = useState<'retry' | 'accept' | 'recover' | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const badges = buildTraceBadges(trace);
  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const effortState = activeWorkspaceId ? effortByWorkspace[activeWorkspaceId] : undefined;
  const effectiveEffort = sessionId
    ? effortState?.sessionOverrides[sessionId] ?? effortState?.projectDefault
    : effortState?.projectDefault;
  const verificationSummary = trace.verificationSummary;
  const latestRun = trace.latestVerificationRun;
  const canOpenVerification = activeWorkspaceId === trace.trace.workspaceId;
  const canActInContext = canOpenVerification && !!sessionId && sessionId === trace.trace.sessionId;

  if (badges.length === 0 && !verificationSummary) {
    return null;
  }

  const openVerificationPanel = () => {
    if (!canOpenVerification) return;
    setRightPanel('verification');
    if (!rightDrawerOpen) {
      toggleRightDrawer();
    }
  };

  const handleRetry = async () => {
    if (!canActInContext || !activeWorkspaceId || !sessionId || !latestRun) return;
    setPendingAction('retry');
    setActionFeedback(null);
    setSessionStreaming(activeWorkspaceId, sessionId, true);
    openVerificationPanel();

    try {
      await api.runVerification(activeWorkspaceId, {
        sessionId,
        commandKind: latestRun.commandKind,
        sourceMessageId: trace.trace.sourceMessageId,
        taskId: trace.trace.taskId,
      });
      setActionFeedback(`Ran ${latestRun.commandKind} verification again.`);
    } catch (error: any) {
      setActionFeedback(error?.message ?? `Failed to retry ${latestRun.commandKind} verification.`);
    } finally {
      setSessionStreaming(activeWorkspaceId, sessionId, false);
      setPendingAction(null);
    }
  };

  const handleContextAction = async (kind: 'accept' | 'recover') => {
    if (!canActInContext || !activeWorkspaceId || !sessionId) return;
    const prompt = buildResultActionPrompt(kind, trace);
    const optimisticMessage = createOptimisticUserMessage(activeWorkspaceId, sessionId, prompt);
    setPendingAction(kind);
    setActionFeedback(null);
    addMessage(activeWorkspaceId, sessionId, optimisticMessage);
    setSessionStreaming(activeWorkspaceId, sessionId, true);

    try {
      await api.sendChat(activeWorkspaceId, sessionId, {
        text: prompt,
        providerId: selectedProvider ?? undefined,
        modelId: selectedModel ?? undefined,
        agentId: selectedAgent ?? undefined,
        effort: effectiveEffort,
      });
      setActionFeedback(kind === 'accept'
        ? 'Sent an accept follow-up for this result.'
        : 'Sent a recover follow-up for this result.');
    } catch (error: any) {
      const currentMessages = selectSessionMessages(useStore.getState(), activeWorkspaceId, sessionId);
      setMessages(activeWorkspaceId, sessionId, currentMessages.filter((message) => message.id !== optimisticMessage.id));
      setSessionStreaming(activeWorkspaceId, sessionId, false);
      setActionFeedback(error?.message ?? `Failed to ${kind} this result.`);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(15, 23, 42, 0.08)',
      }}
    >
      {badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {badges.map((badge) => (
            <span
              key={`${badge.label}:${badge.tone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 24,
                padding: '0 10px',
                borderRadius: 999,
                border: `1px solid ${badge.border}`,
                background: badge.background,
                color: badge.color,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {trace.shipReference?.conditionLabel && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6 }}>
          Ship handoff: {formatShipCondition(trace.shipReference)}
        </div>
      )}

      {verificationSummary && (
        <div
          className="oc-surface-card"
          style={{
            padding: '12px 14px',
            display: 'grid',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.82)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Latest verification
            </span>
            {latestRun && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {formatVerificationRunLabel(latestRun.commandKind)} · {new Date(latestRun.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
            {verificationSummary}
          </div>
          {latestRun?.terminalLogRef && (
            <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
              Evidence: {latestRun.terminalLogRef}
            </div>
          )}
        </div>
      )}

      {trace.browserEvidenceRef && (
        <BrowserEvidenceSurface
          projection={{ browserEvidenceRef: trace.browserEvidenceRef }}
          compact
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {latestRun && (
          <ResultActionButton
            label={pendingAction === 'retry' ? `Retrying ${latestRun.commandKind}…` : `Retry ${latestRun.commandKind}`}
            onClick={() => void handleRetry()}
            disabled={!canActInContext || pendingAction !== null}
            tone="primary"
          />
        )}
        <ResultActionButton
          label={trace.verification === 'verified' ? 'Accept' : 'Accept anyway'}
          onClick={() => void handleContextAction('accept')}
          disabled={!canActInContext || pendingAction !== null}
          tone="success"
        />
        <ResultActionButton
          label="Recover"
          onClick={() => void handleContextAction('recover')}
          disabled={!canActInContext || pendingAction !== null}
          tone="warning"
        />
        <ResultActionButton
          label="Recent runs"
          onClick={openVerificationPanel}
          disabled={!canOpenVerification}
        />
      </div>

      {(actionFeedback || !canActInContext) && (
        <div
          aria-live="polite"
          style={{
            color: !canActInContext && !actionFeedback ? 'var(--text-muted)' : actionFeedback?.toLowerCase().includes('failed') ? 'var(--error)' : 'var(--text-muted)',
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          {actionFeedback ?? 'Open this result in its active chat session to retry, accept, or recover from the same context.'}
        </div>
      )}
    </div>
  );
}

function ResultActionButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'success' | 'warning';
}) {
  const palette = tone === 'primary'
    ? { color: 'rgb(29, 78, 216)', border: 'rgba(37, 99, 235, 0.2)', background: 'rgba(37, 99, 235, 0.08)' }
    : tone === 'success'
      ? { color: 'var(--success)', border: 'rgba(16, 163, 127, 0.2)', background: 'var(--success-soft)' }
      : tone === 'warning'
        ? { color: 'var(--warning)', border: 'rgba(183, 121, 31, 0.22)', background: 'var(--warning-soft)' }
        : { color: 'var(--text-secondary)', border: 'rgba(15, 23, 42, 0.12)', background: 'rgba(15, 23, 42, 0.04)' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 30,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: disabled ? 'rgba(148, 163, 184, 0.14)' : palette.background,
        color: disabled ? 'var(--text-muted)' : palette.color,
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function buildResultActionPrompt(kind: 'accept' | 'recover', trace: ResolvedMessageResultTrace): string {
  const taskLabel = trace.trace.taskId
    ? `task ${trace.trace.taskId}`
    : `assistant result ${trace.trace.sourceMessageId}`;
  const summary = trace.verificationSummary ?? 'No linked verification summary yet.';

  if (kind === 'accept') {
    return `Accept the current assistant result for ${taskLabel}. Latest linked verification summary: ${summary}\n\nConfirm what is ready and call out any remaining follow-up in one concise update.`;
  }

  return `Recover the current assistant result for ${taskLabel}. Latest linked verification summary: ${summary}\n\nContinue from this result context, address the failing or missing verification, and explain what changed.`;
}

function createOptimisticUserMessage(workspaceId: string, sessionId: string, text: string): NormalizedMessage {
  const id = `local-user-${crypto.randomUUID()}`;
  return {
    id,
    role: 'user',
    createdAt: new Date().toISOString(),
    parts: [{ type: 'text', text }],
    trace: {
      sourceMessageId: id,
      workspaceId,
      sessionId,
    },
  };
}

function formatVerificationRunLabel(commandKind: VerificationCommandKind): string {
  return capitalizeWords(commandKind);
}

function getCopyText(
  parts: NormalizedPart[],
  toolParts: RenderableToolPart[],
  resultTrace?: ResolvedMessageResultTrace,
): string {
  const text = parts
    .filter((part) => part.type === 'text' && !!part.text?.trim())
    .map((part) => part.text?.trim() ?? '')
    .join('\n\n')
    .trim();

  if (text) {
    return text;
  }

  const toolText = toolParts
    .map((part) => `${part.toolName}\n${part.resultText || part.argsText}`.trim())
    .filter(Boolean)
    .join('\n\n');

  if (toolText) {
    return toolText;
  }

  if (resultTrace?.summary) {
    return resultTrace.summary;
  }

  return resultTrace?.trace.taskId ?? '';
}

function formatStructuredValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveToolStatusLabel(status: string | undefined, hasResult: boolean, isError: boolean): string {
  if (status === 'running') return 'Running';
  if (status === 'requires-action') return 'Needs input';
  if (status === 'queued' || status === 'pending') return 'Queued';
  if (isError) return 'Errored';
  if (hasResult) return 'Completed';
  return 'Queued';
}

function buildTraceBadges(trace: ResolvedMessageResultTrace): Array<{
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  color: string;
  border: string;
  background: string;
}> {
  const badges: Array<{
    label: string;
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    color: string;
    border: string;
    background: string;
  }> = [];

  if (trace.trace.taskId) {
    badges.push(createTraceBadge(trace.trace.taskId, 'neutral'));
  }
  badges.push(createTraceBadge(formatVerificationLabel(trace.verification), resolveVerificationTone(trace.verification)));
  if (trace.annotation?.reviewState) {
    badges.push(createTraceBadge(formatStateLabel(trace.annotation.reviewState), trace.annotation.reviewState === 'ready' ? 'success' : 'warning'));
  }
  if (trace.annotation?.shipState) {
    badges.push(createTraceBadge(
      formatStateLabel(trace.annotation.shipState),
      trace.annotation.shipState === 'pr-ready'
        ? 'success'
        : trace.annotation.shipState === 'blocked-by-checks'
          ? 'danger'
          : trace.annotation.shipState === 'local-ready'
            ? 'neutral'
            : 'warning',
    ));
  }

  return badges;
}

function createTraceBadge(label: string, tone: 'success' | 'warning' | 'danger' | 'neutral') {
  if (tone === 'success') {
    return {
      label,
      tone,
      color: 'var(--success)',
      border: 'rgba(16, 163, 127, 0.18)',
      background: 'var(--success-soft)',
    };
  }
  if (tone === 'warning') {
    return {
      label,
      tone,
      color: 'var(--warning)',
      border: 'rgba(183, 121, 31, 0.2)',
      background: 'var(--warning-soft)',
    };
  }
  if (tone === 'danger') {
    return {
      label,
      tone,
      color: 'var(--error)',
      border: 'rgba(220, 38, 38, 0.18)',
      background: 'var(--error-soft)',
    };
  }
  return {
    label,
    tone,
    color: 'var(--text-secondary)',
    border: 'rgba(15, 23, 42, 0.12)',
    background: 'rgba(15, 23, 42, 0.04)',
  };
}

function formatVerificationLabel(value: string): string {
  return value === 'partially verified' ? 'Partially verified' : capitalizeWords(value);
}

function formatStateLabel(value: string): string {
  if (value === 'pr-ready') return 'PR ready';
  if (value === 'blocked-by-checks') return 'Blocked by checks';
  if (value === 'blocked-by-requested-changes') return 'Blocked by requested changes';
  return capitalizeWords(value.replace(/-/g, ' '));
}

function formatShipCondition(reference: TaskLedgerShipReference): string {
  const kind = reference.conditionKind === 'failing-check'
    ? 'Failing check'
    : reference.conditionKind === 'requested-changes'
      ? 'Requested changes'
      : reference.conditionKind === 'review-feedback'
        ? 'Review feedback'
        : 'Ship condition';

  return reference.conditionLabel ? `${kind} · ${reference.conditionLabel}` : kind;
}

function resolveVerificationTone(value: string): 'success' | 'warning' | 'danger' {
  if (value === 'verified') return 'success';
  if (value === 'partially verified') return 'warning';
  return 'danger';
}

function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
