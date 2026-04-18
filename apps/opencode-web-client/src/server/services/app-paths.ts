import os from 'node:os';
import path from 'node:path';
import { APP_NAME } from '../../shared/constants.js';

export interface AppPaths {
  configDir: string;
  dataDir: string;
  stateDir: string;
  cacheDir: string;
  logDir: string;
  workspaceRegistryFile: string;
  installManifestFile: string;
  clientStaticDir: string;
  serverBundleDir: string;
  toolsDir: string;
}

function xdgDir(envVar: string, fallback: string): string {
  const env = process.env[envVar];
  if (env) return path.join(env, APP_NAME);
  return path.join(os.homedir(), fallback, APP_NAME);
}

export function resolveAppPaths(): AppPaths {
  const configDir = xdgDir('XDG_CONFIG_HOME', '.config');
  const dataDir = xdgDir('XDG_DATA_HOME', path.join('.local', 'share'));
  const stateDir = xdgDir('XDG_STATE_HOME', path.join('.local', 'state'));
  const cacheDir = xdgDir('XDG_CACHE_HOME', '.cache');
  const logDir = path.join(stateDir, 'logs');

  return {
    configDir,
    dataDir,
    stateDir,
    cacheDir,
    logDir,
    workspaceRegistryFile: path.join(stateDir, 'workspaces.json'),
    installManifestFile: path.join(dataDir, 'install-manifest.json'),
    clientStaticDir: path.join(dataDir, 'client'),
    serverBundleDir: path.join(dataDir, 'server'),
    toolsDir: path.join(dataDir, 'tools'),
  };
}
