import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { getInstalledToolPath } from './install-manifest.js'

const execFileAsync = promisify(execFile)

const SENSITIVE_KEYS = ['token', 'key', 'secret', 'password', 'credential', 'auth']

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]'
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

export interface UsageResult {
  provider: string
  status: 'ok' | 'error' | 'unavailable'
  data: Record<string, unknown>
  error?: string
}

export class UsageService {
  private installManifestPath: string
  private fallbackToolPath?: string

  constructor(installManifestPath: string, fallbackToolPath?: string) {
    this.installManifestPath = installManifestPath
    this.fallbackToolPath = fallbackToolPath
  }

  async getUsage(params: {
    provider: string
    workspaceRoot: string
    copilotReportPath?: string
    refresh?: boolean
  }): Promise<UsageResult> {
    const provider = normalizeUsageProvider(params.provider)
    const toolPath = this.resolveToolPath()
    if (!toolPath) {
      return {
        provider,
        status: 'unavailable',
        data: {},
        error: 'provider-usage.py not found in install manifest or packaged assets',
      }
    }

    const args = [
      toolPath,
      '--provider', provider,
      '--format', 'json',
      '--project-root', params.workspaceRoot,
    ]

    if (params.copilotReportPath) {
      args.push('--copilot-report', params.copilotReportPath)
    }

    try {
      const { stdout, stderr } = await execFileAsync('python3', args, {
        timeout: 30000,
        env: { ...process.env },
      })

      if (stderr) {
        console.warn('[usage-service] stderr:', stderr.trim())
      }

      try {
        const parsed = JSON.parse(stdout)
        const data = redactSensitive(typeof parsed === 'object' ? parsed : { raw: parsed })
        return { provider, status: 'ok', data }
      } catch {
        return {
          provider,
          status: 'error',
          data: {},
          error: 'Failed to parse usage output as JSON',
        }
      }
    } catch (err: any) {
      // Handle missing python3
      if (err.code === 'ENOENT') {
        return {
          provider,
          status: 'unavailable',
          data: {},
          error: 'python3 not found',
        }
      }
      return {
        provider,
        status: 'error',
        data: {},
        error: err.message ?? 'Unknown error executing provider-usage.py',
      }
    }
  }

  private resolveToolPath(): string | null {
    const installedPath = getInstalledToolPath(this.installManifestPath, 'provider-usage.py')
    if (installedPath && existsSync(installedPath)) {
      return installedPath
    }

    if (this.fallbackToolPath && existsSync(this.fallbackToolPath)) {
      return this.fallbackToolPath
    }

    return null
  }
}

function normalizeUsageProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase()
  if (normalized === 'codex' || normalized.includes('codex')) return 'codex'
  if (normalized === 'copilot' || normalized.includes('copilot')) return 'copilot'
  return 'auto'
}
