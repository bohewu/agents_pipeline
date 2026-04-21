import { describe, expect, it } from 'vitest';
import { parseComposerIntent, parseVerificationCommandKind } from './opencode-controls.js';

describe('verification command parsing', () => {
  it('recognizes bounded verify presets from composer command input', () => {
    expect(parseVerificationCommandKind('lint')).toBe('lint');
    expect(parseVerificationCommandKind('verify build')).toBe('build');
    expect(parseVerificationCommandKind('verify test')).toBe('test');
    expect(parseVerificationCommandKind('status')).toBeUndefined();
  });

  it('threads verify presets through composer intent parsing without changing raw command text', () => {
    expect(parseComposerIntent('/verify lint', { composerMode: 'ask' })).toEqual({
      agentId: undefined,
      mode: 'command',
      text: 'verify lint',
      verificationCommandKind: 'lint',
    });

    expect(parseComposerIntent('/status', { composerMode: 'ask' })).toEqual({
      agentId: undefined,
      mode: 'command',
      text: 'status',
      verificationCommandKind: undefined,
    });
  });
});
