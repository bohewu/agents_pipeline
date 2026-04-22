import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextCatalogService } from './workspace-context-catalog-service.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('WorkspaceContextCatalogService', () => {
  it('discovers bounded instruction sources and capability inventory with normalized source layers', async () => {
    const workspaceRoot = makeTempDir('workspace-context-catalog-');
    const configDir = makeTempDir('workspace-context-config-');
    const toolsDir = makeTempDir('workspace-context-tools-');
    const bundledRoot = makeTempDir('workspace-context-bundled-');
    const stateDir = makeTempDir('workspace-context-state-');

    writeWorkspaceFile(workspaceRoot, 'AGENTS.md', '# Agents');
    writeWorkspaceFile(workspaceRoot, 'CLAUDE.md', '# Claude');
    writeWorkspaceFile(workspaceRoot, '.claude/agents/repo-guide.md', '# Repo Guide');
    writeWorkspaceFile(workspaceRoot, '.github/copilot-instructions.md', '# Copilot');
    writeWorkspaceFile(workspaceRoot, 'opencode/commands/run-flow.md', '# /run-flow');
    writeWorkspaceFile(workspaceRoot, 'opencode/commands/usage.md', '# /usage');
    writeWorkspaceFile(workspaceRoot, 'opencode/plugins/status-runtime.js', 'export default {}');
    writeWorkspaceFile(workspaceRoot, 'opencode/plugins/effort-control.js', 'export default {}');
    writeWorkspaceFile(workspaceRoot, 'opencode/plugins/effort-control/state.js', 'export const state = {}');
    writeWorkspaceFile(workspaceRoot, 'opencode/tools/provider-usage.py', 'print("ok")');
    writeWorkspaceFile(workspaceRoot, 'opencode/tools/skill-manager.ts', 'export {}');
    writeWorkspaceFile(workspaceRoot, 'opencode/skills/repo-skill/SKILL.md', '# Skill');

    writeWorkspaceFile(configDir, 'commands/usage.md', '# Global usage');
    writeWorkspaceFile(configDir, 'commands/global-command.md', '# Global command');
    writeWorkspaceFile(configDir, 'plugins/effort-control.js', 'export default {}');
    writeWorkspaceFile(configDir, 'plugins/effort-control/state.js', 'export const state = {}');
    writeWorkspaceFile(configDir, 'plugins/global-plugin.js', 'export default {}');
    writeWorkspaceFile(configDir, 'skills/global-skill/SKILL.md', '# Global skill');
    writeWorkspaceFile(toolsDir, 'provider-usage.py', 'print("ok")');

    writeWorkspaceFile(bundledRoot, 'opencode/commands/usage.md', '# Bundled usage');
    writeWorkspaceFile(bundledRoot, 'opencode/plugins/effort-control.js', 'export default {}');
    writeWorkspaceFile(bundledRoot, 'opencode/plugins/effort-control/state.js', 'export const state = {}');
    writeWorkspaceFile(bundledRoot, 'tools/provider-usage.py', 'print("ok")');

    const service = new WorkspaceContextCatalogService({
      appPaths: {
        configDir: stateDir,
        dataDir: stateDir,
        stateDir,
        cacheDir: path.join(stateDir, 'cache'),
        logDir: path.join(stateDir, 'logs'),
        workspaceRegistryFile: path.join(stateDir, 'workspaces.json'),
        installManifestFile: path.join(stateDir, 'install-manifest.json'),
        clientStaticDir: path.join(stateDir, 'client'),
        serverBundleDir: path.join(stateDir, 'server'),
        toolsDir,
      },
      bundledOpencodeRoot: path.join(bundledRoot, 'opencode'),
      bundledToolsRoot: path.join(bundledRoot, 'tools'),
    }, {
      now: () => new Date('2026-04-22T03:00:00.000Z'),
    });

    const catalog = await service.getContextCatalog('ws-context', workspaceRoot, configDir);

    expect(catalog.workspaceId).toBe('ws-context');
    expect(catalog.collectedAt).toBe('2026-04-22T03:00:00.000Z');
    expect(catalog.instructionSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-local:agents-file',
        category: 'agents-file',
        sourceLayer: 'project-local',
        status: 'available',
      }),
      expect.objectContaining({
        id: 'project-local:opencode-dir',
        category: 'opencode-dir',
        sourceLayer: 'project-local',
        status: 'missing',
        remediation: expect.stringContaining('.opencode'),
      }),
      expect.objectContaining({
        id: 'project-local:claude-file',
        category: 'claude-file',
        status: 'available',
      }),
      expect.objectContaining({
        id: 'project-local:claude-agents',
        category: 'claude-agent',
        status: 'available',
        itemCount: 1,
      }),
      expect.objectContaining({
        id: 'project-local:copilot-instructions',
        category: 'copilot-instructions',
        status: 'available',
      }),
    ]));

    expect(catalog.capabilityEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-local:commands',
        category: 'command',
        sourceLayer: 'project-local',
        status: 'available',
        itemCount: 2,
      }),
      expect.objectContaining({
        id: 'project-local:skills',
        category: 'skill',
        sourceLayer: 'project-local',
        status: 'available',
        itemCount: 1,
      }),
      expect.objectContaining({
        id: 'user-global:commands',
        category: 'command',
        sourceLayer: 'user-global',
        status: 'available',
      }),
      expect.objectContaining({
        id: 'user-global:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'user-global',
        status: 'available',
      }),
      expect.objectContaining({
        id: 'app-bundled:tools',
        category: 'tool',
        sourceLayer: 'app-bundled',
        status: 'available',
      }),
      expect.objectContaining({
        id: 'app-bundled:effort-helper',
        category: 'effort-asset',
        sourceLayer: 'app-bundled',
        status: 'available',
      }),
    ]));
  });

  it('marks missing and degraded assets honestly with source-specific remediation', async () => {
    const workspaceRoot = makeTempDir('workspace-context-degraded-');
    const outsideRoot = makeTempDir('workspace-context-outside-');
    const configDir = makeTempDir('workspace-context-degraded-config-');
    const toolsDir = makeTempDir('workspace-context-degraded-tools-');
    const bundledRoot = makeTempDir('workspace-context-degraded-bundled-');
    const stateDir = makeTempDir('workspace-context-degraded-state-');

    writeWorkspaceFile(workspaceRoot, 'AGENTS.md', '# Agents');
    writeWorkspaceFile(outsideRoot, 'status-runtime.js', 'export default {}');

    mkdirSync(path.join(workspaceRoot, 'opencode'), { recursive: true });
    symlinkSync(path.join(outsideRoot), path.join(workspaceRoot, 'opencode', 'plugins'));

    const service = new WorkspaceContextCatalogService({
      appPaths: {
        configDir: stateDir,
        dataDir: stateDir,
        stateDir,
        cacheDir: path.join(stateDir, 'cache'),
        logDir: path.join(stateDir, 'logs'),
        workspaceRegistryFile: path.join(stateDir, 'workspaces.json'),
        installManifestFile: path.join(stateDir, 'install-manifest.json'),
        clientStaticDir: path.join(stateDir, 'client'),
        serverBundleDir: path.join(stateDir, 'server'),
        toolsDir,
      },
      bundledOpencodeRoot: path.join(bundledRoot, 'opencode'),
      bundledToolsRoot: path.join(bundledRoot, 'tools'),
    });

    const catalog = await service.getContextCatalog('ws-degraded', workspaceRoot, configDir);

    expect(catalog.capabilityEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-local:plugins',
        category: 'plugin',
        sourceLayer: 'project-local',
        status: 'degraded',
        detail: expect.stringContaining('Path escapes workspace'),
        remediation: expect.stringContaining('project-local plugin assets'),
      }),
      expect.objectContaining({
        id: 'user-global:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'user-global',
        status: 'missing',
        remediation: expect.stringContaining('user-global provider usage tool'),
      }),
      expect.objectContaining({
        id: 'app-bundled:usage-command',
        category: 'usage-asset',
        sourceLayer: 'app-bundled',
        status: 'missing',
        remediation: expect.stringContaining('bundled usage command asset'),
      }),
    ]));

    expect(catalog.capabilityEntries.some((entry) => entry.id === 'project-local:plugins' && entry.status === 'available')).toBe(false);
  });

  it('marks unreadable instruction and capability assets as degraded instead of available', async () => {
    const workspaceRoot = makeTempDir('workspace-context-unreadable-');
    const configDir = makeTempDir('workspace-context-unreadable-config-');
    const toolsDir = makeTempDir('workspace-context-unreadable-tools-');
    const bundledRoot = makeTempDir('workspace-context-unreadable-bundled-');
    const stateDir = makeTempDir('workspace-context-unreadable-state-');

    const agentsPath = path.join(workspaceRoot, 'AGENTS.md');
    const providerUsagePath = path.join(toolsDir, 'provider-usage.py');

    writeWorkspaceFile(workspaceRoot, 'AGENTS.md', '# Agents');
    writeWorkspaceFile(toolsDir, 'provider-usage.py', 'print("ok")');

    const service = new WorkspaceContextCatalogService({
      appPaths: {
        configDir: stateDir,
        dataDir: stateDir,
        stateDir,
        cacheDir: path.join(stateDir, 'cache'),
        logDir: path.join(stateDir, 'logs'),
        workspaceRegistryFile: path.join(stateDir, 'workspaces.json'),
        installManifestFile: path.join(stateDir, 'install-manifest.json'),
        clientStaticDir: path.join(stateDir, 'client'),
        serverBundleDir: path.join(stateDir, 'server'),
        toolsDir,
      },
      bundledOpencodeRoot: path.join(bundledRoot, 'opencode'),
      bundledToolsRoot: path.join(bundledRoot, 'tools'),
    }, {
      access: async (candidatePath, mode) => {
        if (candidatePath === agentsPath || candidatePath === providerUsagePath) {
          const error = Object.assign(
            new Error(`EACCES: permission denied, access '${candidatePath}'`),
            { code: 'EACCES' },
          );
          throw error;
        }

        return access(candidatePath, mode);
      },
    });

    const catalog = await service.getContextCatalog('ws-unreadable', workspaceRoot, configDir);

    expect(catalog.instructionSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-local:agents-file',
        category: 'agents-file',
        sourceLayer: 'project-local',
        status: 'degraded',
        detail: expect.stringContaining('permission denied'),
        remediation: expect.stringContaining('AGENTS.md'),
      }),
    ]));
    expect(catalog.instructionSources.some((entry) => entry.id === 'project-local:agents-file' && entry.status === 'available')).toBe(false);

    expect(catalog.capabilityEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'user-global:provider-usage-tool',
        category: 'usage-asset',
        sourceLayer: 'user-global',
        status: 'degraded',
        detail: expect.stringContaining('permission denied'),
        remediation: expect.stringContaining('provider usage tool'),
      }),
    ]));
    expect(catalog.capabilityEntries.some((entry) => entry.id === 'user-global:provider-usage-tool' && entry.status === 'available')).toBe(false);
  });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeWorkspaceFile(root: string, relativePath: string, contents: string): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf-8');
}
