import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspacePath, resolveWorkspaceProbePath } from './workspace-paths.js';

const tempDirs: string[] = [];

describe('resolveWorkspacePath', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try {
        removeTempDir(dir);
      } catch {
        // ignore cleanup issues in tests
      }
    }
  });

  it('resolves regular files within the workspace', () => {
    const workspaceRoot = makeTempDir('workspace-paths-safe-');
    const filePath = join(workspaceRoot, 'notes.txt');
    writeFileSync(filePath, 'hello');

    expect(resolveWorkspacePath(workspaceRoot, 'notes.txt')).toBe(filePath);
  });

  it('rejects symlinks that escape the workspace root', () => {
    const workspaceRoot = makeTempDir('workspace-paths-root-');
    const outsideRoot = makeTempDir('workspace-paths-outside-');
    const outsideFile = join(outsideRoot, 'secret.txt');
    writeFileSync(outsideFile, 'secret');

    const linksDir = join(workspaceRoot, 'links');
    mkdirSync(linksDir);
    symlinkSync(outsideFile, join(linksDir, 'secret-link.txt'));

    expect(() => resolveWorkspacePath(workspaceRoot, 'links/secret-link.txt')).toThrow('Path escapes workspace');
  });

  it('resolves missing probe targets without requiring them to exist', () => {
    const workspaceRoot = makeTempDir('workspace-paths-probe-');

    expect(resolveWorkspaceProbePath(workspaceRoot, '.opencode/context.json')).toBe(
      join(workspaceRoot, '.opencode', 'context.json'),
    );
  });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
