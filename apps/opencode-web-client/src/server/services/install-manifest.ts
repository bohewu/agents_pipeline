import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export interface InstallManifest {
  version?: number
  installedAt?: string
  dataDir?: string
  toolsDir?: string
  paths?: Record<string, string>
  assets?: {
    tools?: {
      providerUsagePy?: string
    }
    opencode?: {
      effortPlugin?: string
      effortStateHelper?: string
      usageCommand?: string
    }
  }
}

const cache = new Map<string, InstallManifest | null>()

export function loadInstallManifest(manifestPath: string): InstallManifest | null {
  if (cache.has(manifestPath)) {
    return cache.get(manifestPath) ?? null
  }
  if (!existsSync(manifestPath)) {
    cache.set(manifestPath, null)
    return null
  }
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw) as InstallManifest
    cache.set(manifestPath, parsed)
    return parsed
  } catch {
    cache.set(manifestPath, null)
    return null
  }
}

export function getInstalledToolPath(manifestPath: string, toolName: string): string | null {
  const manifest = loadInstallManifest(manifestPath)
  if (!manifest) return null

  if (toolName === 'provider-usage.py' && manifest.assets?.tools?.providerUsagePy) {
    return manifest.assets.tools.providerUsagePy
  }

  if (manifest.paths?.[toolName]) {
    return manifest.paths[toolName]
  }

  if (manifest.toolsDir) {
    return path.join(manifest.toolsDir, toolName)
  }

  if (manifest.paths?.dataDir) {
    return path.join(manifest.paths.dataDir, 'tools', toolName)
  }

  return null
}

type OpenCodeAssetName = 'usageCommand' | 'effortPlugin' | 'effortStateHelper'

export function getInstalledOpenCodeAssetPath(manifestPath: string, assetName: OpenCodeAssetName): string | null {
  const manifest = loadInstallManifest(manifestPath)
  if (!manifest) return null

  const explicitPath = manifest.assets?.opencode?.[assetName]
  if (explicitPath) {
    return explicitPath
  }

  const opencodeConfigDir = manifest.paths?.['opencodeConfigDir'] ?? manifest.paths?.['configDir']
  if (!opencodeConfigDir) {
    return null
  }

  switch (assetName) {
    case 'usageCommand':
      return path.join(opencodeConfigDir, 'commands', 'usage.md')
    case 'effortPlugin':
      return path.join(opencodeConfigDir, 'plugins', 'effort-control.js')
    case 'effortStateHelper':
      return path.join(opencodeConfigDir, 'plugins', 'effort-control', 'state.js')
  }
}
