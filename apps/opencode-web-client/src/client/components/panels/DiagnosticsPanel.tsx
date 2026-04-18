import React from 'react';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView.js';

export function DiagnosticsPanel() {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600, marginBottom: 8 }}>Diagnostics</div>
      <DiagnosticsView />
    </div>
  );
}
