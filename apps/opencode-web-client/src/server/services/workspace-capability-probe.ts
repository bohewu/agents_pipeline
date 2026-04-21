import { execFile } from 'node:child_process'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CapabilityProbeCheck, WorkspaceCapabilityProbe } from '../../shared/types.js'

const execFileAsync = promisify(execFile)

const PROBE_TIMEOUT_MS = 4000
const PREVIEW_SCRIPT_KEYS = ['dev', 'preview', 'start', 'serve']
const PREVIEW_PACKAGE_HINTS = [
  'vite',
  'next',
  'nuxt',
  'astro',
  'react-scripts',
  '@angular/cli',
  '@sveltejs/kit',
  '@remix-run/dev',
  '@storybook/react-vite',
  '@storybook/vue3-vite',
]
const PREVIEW_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'astro.config.ts',
  'astro.config.mjs',
  'astro.config.js',
  'nuxt.config.ts',
  'nuxt.config.js',
  'svelte.config.ts',
  'svelte.config.js',
  'angular.json',
]
const PREVIEW_SEARCH_DIRS = ['apps', 'packages', 'services', 'web', 'frontend', 'sites']
const MAX_PREVIEW_CANDIDATES = 16
const BROWSER_COMMANDS = ['google-chrome', 'chromium-browser', 'chromium', 'chrome', 'microsoft-edge', 'msedge']

type ExecResult = { stdout: string; stderr: string }
type ExecFn = (file: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<ExecResult>

export interface WorkspaceCapabilityProbeServiceOptions {
  execFile?: ExecFn
  access?: typeof access
  readFile?: typeof readFile
  readdir?: typeof readdir
  now?: () => Date
}

export class WorkspaceCapabilityProbeService {
  private execFile: ExecFn
  private access: typeof access
  private readFile: typeof readFile
  private readdir: typeof readdir
  private now: () => Date

  constructor(options: WorkspaceCapabilityProbeServiceOptions = {}) {
    this.execFile = options.execFile ?? defaultExecFile
    this.access = options.access ?? access
    this.readFile = options.readFile ?? readFile
    this.readdir = options.readdir ?? readdir
    this.now = options.now ?? (() => new Date())
  }

  async probeWorkspace(workspaceId: string, rootPath: string): Promise<WorkspaceCapabilityProbe> {
    const checkedAt = this.now().toISOString()

    const [localGitResult, ghCliResult, previewTargetResult] = await Promise.allSettled([
      this.probeLocalGit(rootPath),
      this.probeGhCli(),
      this.probePreviewTarget(rootPath),
    ])

    const localGit = resolveSettledProbe(localGitResult, 'Local git probe failed')
    const ghCli = resolveSettledProbe(ghCliResult, 'GitHub CLI probe failed')
    const previewTarget = resolveSettledProbe(previewTargetResult, 'Preview target probe failed')

    const [ghAuthResult, browserEvidenceResult] = await Promise.allSettled([
      this.probeGhAuth(ghCli),
      this.probeBrowserEvidence(previewTarget),
    ])

    return {
      workspaceId,
      checkedAt,
      localGit,
      ghCli,
      ghAuth: resolveSettledProbe(ghAuthResult, 'GitHub auth probe failed'),
      previewTarget,
      browserEvidence: resolveSettledProbe(browserEvidenceResult, 'Browser evidence probe failed'),
    }
  }

  private async probeLocalGit(rootPath: string): Promise<CapabilityProbeCheck> {
    try {
      const { stdout } = await this.execFile('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: rootPath,
        timeout: PROBE_TIMEOUT_MS,
      })

      if (stdout.trim() === 'true') {
        return available('Local git available', 'This workspace is backed by a local git repository.')
      }

      return unavailable('Local git unavailable', 'This workspace is not inside a local git repository.')
    } catch (error) {
      if (isMissingCommandError(error)) {
        return unavailable('Local git unavailable', 'git is not installed or is not on PATH.')
      }
      if (hasExecOutput(error, 'not a git repository')) {
        return unavailable('Local git unavailable', 'This workspace is not inside a local git repository.')
      }
      return failed('Local git probe failed', toErrorMessage(error))
    }
  }

  private async probeGhCli(): Promise<CapabilityProbeCheck> {
    try {
      const { stdout } = await this.execFile('gh', ['--version'], { timeout: PROBE_TIMEOUT_MS })
      const version = stdout.trim().split('\n')[0] ?? ''
      return available('GitHub CLI available', version || 'The gh CLI is available for this workspace.')
    } catch (error) {
      if (isMissingCommandError(error)) {
        return unavailable('GitHub CLI unavailable', 'gh is not installed or is not on PATH.')
      }
      return failed('GitHub CLI probe failed', toErrorMessage(error))
    }
  }

  private async probeGhAuth(ghCli: CapabilityProbeCheck): Promise<CapabilityProbeCheck> {
    if (ghCli.status === 'error') {
      return failed('GitHub auth probe failed', 'The gh CLI probe failed, so authentication could not be checked.')
    }

    if (ghCli.status !== 'available') {
      return unavailable('GitHub auth unavailable', 'Install gh before checking GitHub authentication.')
    }

    try {
      const { stdout, stderr } = await this.execFile('gh', ['auth', 'status', '--hostname', 'github.com'], {
        timeout: PROBE_TIMEOUT_MS,
      })
      const output = `${stdout}\n${stderr}`.trim()
      const account = output.match(/account\s+([^\s]+)/i)?.[1]
      return available(
        'GitHub auth available',
        account ? `Authenticated as ${account}.` : 'The gh CLI is authenticated for github.com.',
      )
    } catch (error) {
      if (hasExecOutput(error, 'not logged into') || hasExecOutput(error, 'not logged in')) {
        return unavailable('GitHub auth unavailable', 'Run gh auth login for github.com to enable GitHub-backed actions.')
      }
      if (isMissingCommandError(error)) {
        return unavailable('GitHub auth unavailable', 'Install gh before checking GitHub authentication.')
      }
      return failed('GitHub auth probe failed', toErrorMessage(error))
    }
  }

  private async probePreviewTarget(rootPath: string): Promise<CapabilityProbeCheck> {
    const candidateDirs = await this.collectPreviewCandidateDirs(rootPath)

    for (const relativeDir of candidateDirs) {
      const packageDetail = await this.inspectPreviewPackage(rootPath, relativeDir)
      if (packageDetail) {
        return available('Preview target available', packageDetail)
      }

      const configDetail = await this.inspectPreviewConfigs(rootPath, relativeDir)
      if (configDetail) {
        return available('Preview target available', configDetail)
      }
    }

    return unavailable(
      'Preview target unavailable',
      'No preview scripts or supported frontend config files were detected in this workspace.',
    )
  }

  private async probeBrowserEvidence(previewTarget: CapabilityProbeCheck): Promise<CapabilityProbeCheck> {
    if (previewTarget.status === 'error') {
      return failed('Browser evidence probe failed', 'Preview target detection failed, so browser evidence could not be checked.')
    }

    if (previewTarget.status !== 'available') {
      return unavailable('Browser evidence unavailable', 'A preview target must be available before browser evidence can be collected.')
    }

    let firstError: unknown

    for (const command of BROWSER_COMMANDS) {
      try {
        const { stdout, stderr } = await this.execFile(command, ['--version'], { timeout: PROBE_TIMEOUT_MS })
        const version = `${stdout}\n${stderr}`.trim().split('\n')[0] ?? ''
        return available('Browser evidence available', version || `${command} is available for browser evidence.`)
      } catch (error) {
        if (isMissingCommandError(error)) {
          continue
        }
        firstError ??= error
      }
    }

    if (firstError) {
      return failed('Browser evidence probe failed', toErrorMessage(firstError))
    }

    return unavailable('Browser evidence unavailable', 'No supported local browser runtime was detected.')
  }

  private async collectPreviewCandidateDirs(rootPath: string): Promise<string[]> {
    const candidates = ['.']

    for (const baseDir of PREVIEW_SEARCH_DIRS) {
      if (candidates.length >= MAX_PREVIEW_CANDIDATES) {
        break
      }

      const absoluteBaseDir = path.join(rootPath, baseDir)
      let entries: Array<{ name: string; isDirectory(): boolean }>
      try {
        entries = await this.readdir(absoluteBaseDir, { withFileTypes: true, encoding: 'utf-8' }) as Array<{
          name: string
          isDirectory(): boolean
        }>
      } catch (error) {
        if (isMissingFileError(error)) {
          continue
        }
        throw error
      }

      for (const entry of entries) {
        if (candidates.length >= MAX_PREVIEW_CANDIDATES) {
          break
        }
        if (!entry.isDirectory()) {
          continue
        }
        candidates.push(path.join(baseDir, entry.name))
      }
    }

    return candidates
  }

  private async inspectPreviewPackage(rootPath: string, relativeDir: string): Promise<string | undefined> {
    const packageJsonPath = path.join(rootPath, relativeDir, 'package.json')
    let raw: string

    try {
      raw = await this.readFile(packageJsonPath, 'utf-8')
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined
      }
      throw new Error(`Failed to read ${formatWorkspacePath(relativeDir, 'package.json')}: ${toErrorMessage(error)}`, {
        cause: error,
      })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Invalid JSON in ${formatWorkspacePath(relativeDir, 'package.json')}`)
    }

    if (!isRecord(parsed)) {
      return undefined
    }

    const scripts = isRecord(parsed['scripts']) ? parsed['scripts'] : {}
    const matchingScripts = PREVIEW_SCRIPT_KEYS.filter((key) => typeof scripts[key] === 'string')
    if (matchingScripts.length > 0) {
      return `${describeWorkspaceLocation(relativeDir)} exposes preview script${matchingScripts.length === 1 ? '' : 's'}: ${matchingScripts.join(', ')}.`
    }

    const dependencies = {
      ...(isRecord(parsed['dependencies']) ? parsed['dependencies'] : {}),
      ...(isRecord(parsed['devDependencies']) ? parsed['devDependencies'] : {}),
    }
    const matchingPackages = PREVIEW_PACKAGE_HINTS.filter((name) => typeof dependencies[name] === 'string')
    if (matchingPackages.length > 0) {
      return `${describeWorkspaceLocation(relativeDir)} includes frontend package hint${matchingPackages.length === 1 ? '' : 's'}: ${matchingPackages.slice(0, 2).join(', ')}.`
    }

    return undefined
  }

  private async inspectPreviewConfigs(rootPath: string, relativeDir: string): Promise<string | undefined> {
    for (const configFile of PREVIEW_CONFIG_FILES) {
      const configPath = path.join(rootPath, relativeDir, configFile)
      try {
        await this.access(configPath)
        return `${describeWorkspaceLocation(relativeDir)} includes ${configFile}.`
      } catch (error) {
        if (isMissingFileError(error)) {
          continue
        }
        throw new Error(`Failed to inspect ${formatWorkspacePath(relativeDir, configFile)}: ${toErrorMessage(error)}`, {
          cause: error,
        })
      }
    }

    return undefined
  }
}

async function defaultExecFile(
  file: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: options?.cwd,
    timeout: options?.timeout,
    encoding: 'utf-8',
  })
  return {
    stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
    stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
  }
}

function resolveSettledProbe(
  result: PromiseSettledResult<CapabilityProbeCheck>,
  summary: string,
): CapabilityProbeCheck {
  if (result.status === 'fulfilled') {
    return result.value
  }
  return failed(summary, toErrorMessage(result.reason))
}

function available(summary: string, detail?: string): CapabilityProbeCheck {
  return { status: 'available', summary, ...(detail ? { detail } : {}) }
}

function unavailable(summary: string, detail?: string): CapabilityProbeCheck {
  return { status: 'unavailable', summary, ...(detail ? { detail } : {}) }
}

function failed(summary: string, detail?: string): CapabilityProbeCheck {
  return { status: 'error', summary, ...(detail ? { detail } : {}) }
}

function describeWorkspaceLocation(relativeDir: string): string {
  return relativeDir === '.' ? 'The workspace root' : `Workspace path ${relativeDir}`
}

function formatWorkspacePath(relativeDir: string, fileName: string): string {
  return relativeDir === '.' ? fileName : path.join(relativeDir, fileName)
}

function hasExecOutput(error: unknown, text: string): boolean {
  return getExecOutput(error).toLowerCase().includes(text.toLowerCase())
}

function getExecOutput(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }

  const candidate = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
  return [candidate.stdout, candidate.stderr, candidate.message]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

function isMissingCommandError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  return (error as { code?: unknown }).code === 'ENOENT'
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  return (error as { code?: unknown }).code === 'ENOENT'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Unknown probe failure'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
