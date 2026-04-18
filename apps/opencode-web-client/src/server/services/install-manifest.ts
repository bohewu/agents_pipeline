import { readFileSync, existsSync } from 'node:fs'

export interface InstallManifest {
  version: number
  installedAt: string
  dataDir: string
  toolsDir: string
  paths: Record<string, string>
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
  // Check paths map first
  if (manifest.paths?.[toolName]) return manifest.paths[toolName]
  // Fallback to toolsDir
  if (manifest.toolsDir) {
    const { join } = require('node:path')
    return join(manifest.toolsDir, toolName)
  }
  return null
}
