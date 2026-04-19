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
  }
}

let cached: InstallManifest | null = null

export function loadInstallManifest(manifestPath: string): InstallManifest | null {
  if (cached) return cached
  if (!existsSync(manifestPath)) return null
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    cached = JSON.parse(raw) as InstallManifest
    return cached
  } catch {
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
