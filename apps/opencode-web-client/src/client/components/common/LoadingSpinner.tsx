import React from 'react';

export function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: '#4c9eff',
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #2a2a4a',
        borderTopColor: '#4c9eff', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
