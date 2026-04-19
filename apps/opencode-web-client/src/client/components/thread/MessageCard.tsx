import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NormalizedMessage, NormalizedPart } from '../../../shared/types.js';
import { useStore } from '../../runtime/store.js';
import { PermissionCard } from './PermissionCard.js';
import { ErrorCard } from './ErrorCard.js';
import { CheckIcon, CopyIcon } from '../common/Icons.js';

const ROLE_LABELS: Record<string, string> = {
  user: 'You',
  assistant: 'OpenCode',
  system: 'System',
};

export function MessageCard({ message, isRunning = false }: { message: NormalizedMessage; isRunning?: boolean }) {
  const [copied, setCopied] = useState(false);
  const showReasoningSummaries = useStore((s) => s.settings.showReasoningSummaries);
  const textParts = useMemo(
    () => message.parts.filter((part) => part.type === 'text' && !!part.text?.trim()),
    [message.parts],
  );
  const reasoningParts = useMemo(() => getRenderableReasoningParts(message.parts), [message.parts]);
  const toolParts = useMemo(() => getRenderableToolParts(message.parts), [message.parts]);
  const copyText = useMemo(() => getCopyText(message.parts, toolParts), [message.parts, toolParts]);
  const extraParts = message.parts.filter((part) => part.type === 'error' || part.type === 'permission-request');
  const showAvatar = message.role !== 'user';
  const hasPrimaryContent = textParts.length > 0 || toolParts.length > 0 || extraParts.length > 0;
  const visibleReasoningParts = showReasoningSummaries && !isRunning && hasPrimaryContent ? reasoningParts : [];

  if (!hasPrimaryContent && visibleReasoningParts.length === 0) {
    return null;
  }

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
    } catch {
      setCopied(false);
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

        <div className={`oc-message-card__bubble oc-message-card__bubble--${message.role}`} title={new Date(message.createdAt).toLocaleString()}>
          <div className="oc-message-card__content">
            {textParts.map((part, index) => (
              <ReactMarkdown key={`text-${index}`} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {part.text ?? ''}
              </ReactMarkdown>
            ))}

            {toolParts.map((part) => (
              <AssistantToolPart key={part.key} part={part} />
            ))}
          </div>

          {extraParts.map((part, index) =>
            part.type === 'permission-request'
              ? <PermissionCard key={`permission-${index}`} part={part} />
              : <ErrorCard key={`error-${index}`} part={part} />,
          )}
        </div>

        {message.role === 'assistant' && (
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

        {visibleReasoningParts.length > 0 && (
          <div className="oc-message-card__supplement">
            {visibleReasoningParts.map((part) => (
              <AssistantReasoningPart key={part.key} part={part} />
            ))}
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

  return <CodeBlockPreview language={language ?? 'text'} code={codeText} />;
}

function CodeBlockPreview({ language, code }: { language: string; code: string }) {
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
    <div className="oc-code-block">
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
      <pre className="oc-code-block__body">
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

interface RenderableReasoningPart {
  key: string;
  text: string;
}

function AssistantReasoningPart({ part }: { part: RenderableReasoningPart }) {
  return (
    <details className="oc-reasoning-part">
      <summary className="oc-reasoning-part__summary">
        <span className="oc-reasoning-part__eyebrow">Summary</span>
        <span className="oc-reasoning-part__label">Reasoning</span>
      </summary>
      <div className="oc-reasoning-part__body">{part.text}</div>
    </details>
  );
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

function getRenderableReasoningParts(parts: NormalizedPart[]): RenderableReasoningPart[] {
  const groupedText = new Map<string, string[]>();
  const orderedKeys: string[] = [];
  let anonymousIndex = 0;

  for (const part of parts) {
    if (part.type !== 'reasoning') continue;
    const text = part.text?.trim();
    if (!text) continue;

    const key = part.parentId ?? part.id ?? `reasoning-${anonymousIndex++}`;
    if (!groupedText.has(key)) {
      groupedText.set(key, []);
      orderedKeys.push(key);
    }
    groupedText.get(key)?.push(text);
  }

  return orderedKeys
    .map((key) => ({ key, text: (groupedText.get(key) ?? []).join('\n\n').trim() }))
    .filter((part) => part.text.length > 0);
}

function getCopyText(parts: NormalizedPart[], toolParts: RenderableToolPart[]): string {
  const text = parts
    .filter((part) => part.type === 'text' && !!part.text?.trim())
    .map((part) => part.text?.trim() ?? '')
    .join('\n\n')
    .trim();

  if (text) {
    return text;
  }

  return toolParts
    .map((part) => `${part.toolName}\n${part.resultText || part.argsText}`.trim())
    .filter(Boolean)
    .join('\n\n');
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
