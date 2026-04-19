import React from 'react';
import { useStore } from '../../runtime/store.js';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView.js';

export function ChatStartState() {
  const { setWorkspaceDialogOpen } = useStore();

  return (
    <div className="oc-empty-state">
      <div className="oc-empty-state__avatar">O</div>
      <h1 className="oc-empty-state__title">How can I help you today?</h1>
      <p className="oc-empty-state__subtitle">
        Start in chat first. Attach a repo once and every future launch drops straight back into a repo-aware conversation.
      </p>

      <div className="oc-empty-state__actions">
        <button onClick={() => setWorkspaceDialogOpen(true)} className="oc-primary-button">
          Open workspace
        </button>
      </div>

      <div className="oc-empty-state__diagnostics">
        <div className="oc-empty-state__diagnostics-title">Quick system check</div>
        <DiagnosticsView compact />
      </div>
    </div>
  );
}
