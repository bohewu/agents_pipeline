import React from 'react';
import { useStore } from '../../runtime/store.js';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView.js';
import { WorkspaceSelector } from '../workspaces/WorkspaceSelector.js';

export function ChatStartState() {
  const { setWorkspaceDialogOpen, workspaces } = useStore();

  return (
    <div className="oc-empty-state">
      <div className="oc-empty-state__avatar">O</div>
      <h1 className="oc-empty-state__title">Let's start building</h1>
      <div className="oc-empty-state__workspace">
        <WorkspaceSelector />
      </div>
      <p className="oc-empty-state__subtitle">
        Start from the chat surface. Choose a folder once, then describe what you want to build.
      </p>

      <div className="oc-empty-state__actions">
        <button onClick={() => setWorkspaceDialogOpen(true)} className="oc-primary-button">
          Open workspace
        </button>
        {workspaces.length > 0 && (
          <button onClick={() => setWorkspaceDialogOpen(true)} className="oc-pill-button" type="button">
            Add repo
          </button>
        )}
      </div>

      <div className="oc-empty-state__diagnostics">
        <div className="oc-empty-state__diagnostics-title">Quick system check</div>
        <DiagnosticsView compact />
      </div>
    </div>
  );
}
