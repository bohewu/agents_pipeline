import React, { useEffect, useRef } from 'react';
import { useStore } from '../../runtime/store.js';
import { MessageCard } from './MessageCard.js';

export function Thread() {
  const { activeWorkspaceId, activeSessionByWorkspace, messagesBySession, streaming } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionId = activeWorkspaceId ? activeSessionByWorkspace[activeWorkspaceId] : undefined;
  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  if (!sessionId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
          <div>Select or create a session to start</div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
          <div>Start a conversation</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 800, margin: '0 auto' }}>
      {messages.map((msg) => (
        <MessageCard key={msg.id} message={msg} />
      ))}
      {streaming && (
        <div style={{ padding: 8, color: '#4c9eff', fontSize: 13 }}>
          <span style={{ animation: 'pulse 1s infinite' }}>● </span>Generating...
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
