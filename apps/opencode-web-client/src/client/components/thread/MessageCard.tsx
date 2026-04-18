import React from 'react';
import type { NormalizedMessage } from '../../../shared/types.js';
import { ToolCallCard } from './ToolCallCard.js';
import { ToolResultCard } from './ToolResultCard.js';
import { PermissionCard } from './PermissionCard.js';
import { ErrorCard } from './ErrorCard.js';

const ROLE_STYLES: Record<string, React.CSSProperties> = {
  user: { background: '#1e2a4a', borderLeft: '3px solid #4c9eff' },
  assistant: { background: '#1a2238', borderLeft: '3px solid #7c4dff' },
  system: { background: '#1a1a2e', borderLeft: '3px solid #666' },
};

const ROLE_LABELS: Record<string, string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
};

export function MessageCard({ message }: { message: NormalizedMessage }) {
  return (
    <div style={{
      ...ROLE_STYLES[message.role] ?? ROLE_STYLES.system,
      borderRadius: 6, padding: '12px 16px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>{ROLE_LABELS[message.role] ?? message.role}</span>
        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
      </div>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return (
              <div key={i} style={{ color: '#e0e0e0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {part.text}
              </div>
            );
          case 'tool-call':
            return <ToolCallCard key={i} part={part} />;
          case 'tool-result':
            return <ToolResultCard key={i} part={part} />;
          case 'permission-request':
            return <PermissionCard key={i} part={part} />;
          case 'error':
            return <ErrorCard key={i} part={part} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
