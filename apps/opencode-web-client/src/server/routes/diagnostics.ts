import { Hono } from 'hono';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../../shared/constants.js';
import type { InstallDiagnostics, AssetStatus, RuntimeStatus } from '../../shared/types.js';
import { ok } from '../create-server.js';
import type { ServerOptions } from '../create-server.js';

const execFileAsync = promisify(execFile);

async function checkRuntime(cmd: string, versionFlag = '--version'): Promise<RuntimeStatus> {
  try {
    const { stdout } = await execFileAsync(cmd, [versionFlag], { timeout: 5000 });
    const version = stdout.trim().split('\n')[0];
    return { found: true, version, path: cmd };
  } catch {
    return { found: false };
  }
}

async function checkAsset(filePath: string): Promise<AssetStatus> {
  try {
    await fs.access(filePath);
    return { installed: true, path: filePath };
  } catch {
    return { installed: false };
  }
}

async function findOpencodeBinary(): Promise<{ found: boolean; binaryPath?: string; version?: string }> {
  try {
    const { stdout } = await execFileAsync('which', ['opencode'], { timeout: 5000 });
    const binaryPath = stdout.trim();
    try {
      const { stdout: ver } = await execFileAsync(binaryPath, ['version'], { timeout: 5000 });
      return { found: true, binaryPath, version: ver.trim() };
    } catch {
      return { found: true, binaryPath };
    }
  } catch {
    return { found: false };
  }
}

function resolveOpencodeConfigDir(options: ServerOptions): { dir: string; source: 'default' | 'env' | 'settings' | 'installer' } {
  if (options.opencodeConfigDir) {
    return { dir: options.opencodeConfigDir, source: 'settings' };
  }
  const envDir = process.env['OPENCODE_CONFIG_DIR'];
  if (envDir) {
    return { dir: envDir, source: 'env' };
  }
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return { dir: path.join(home, '.config', 'opencode'), source: 'default' };
}

export function diagnosticsRoute(options: ServerOptions): Hono {
  const route = new Hono();

  route.get('/install', async (c) => {
    const { appPaths } = options;
    const opencode = await findOpencodeBinary();
    const configDirInfo = resolveOpencodeConfigDir(options);

    const pluginsDir = path.join(appPaths.dataDir, 'opencode', 'plugins');
    const commandsDir = path.join(appPaths.dataDir, 'opencode', 'commands');
    const toolsDir = path.join(appPaths.dataDir, 'tools');

    const [effortPlugin, effortStateHelper, usageCommand, providerUsageTool, node, python, git] =
      await Promise.all([
        checkAsset(path.join(pluginsDir, 'effort-control.js')),
        checkAsset(path.join(pluginsDir, 'effort-control', 'state.js')),
        checkAsset(path.join(commandsDir, 'usage.md')),
        checkAsset(path.join(toolsDir, 'provider-usage.py')),
        checkRuntime('node'),
        checkRuntime('python3'),
        checkRuntime('git'),
      ]);

    let installed = false;
    try {
      await fs.access(appPaths.installManifestFile);
      installed = true;
    } catch {
      // not installed
    }

    const diagnostics: InstallDiagnostics = {
      app: {
        version: APP_VERSION,
        installed,
        sourceRepoRequired: false,
        dataDir: appPaths.dataDir,
        configDir: appPaths.configDir,
        stateDir: appPaths.stateDir,
        cacheDir: appPaths.cacheDir,
      },
      opencode: {
        found: opencode.found,
        binaryPath: opencode.binaryPath,
        version: opencode.version,
        configDir: configDirInfo.dir,
        configDirSource: configDirInfo.source,
      },
      assets: {
        effortPlugin,
        effortStateHelper,
        usageCommand,
        providerUsageTool,
      },
      runtimes: {
        node,
        python,
        git,
      },
    };

    return c.json(ok(diagnostics));
  });

  return route;
}
