import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  renameSync, realpathSync, statSync, unlinkSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import type { WorkspaceProfile } from '../../shared/types.js'

// ── Types ──

interface RegistryData {
  version: 1
  activeWorkspaceId?: string
  workspaces: WorkspaceProfile[]
}

// ── Dangerous roots ──

const DANGEROUS_ROOTS = ['/', '/System', '/bin', '/usr', '/etc', '/sbin', '/lib', '/lib64', '/proc', '/sys', '/dev']

// ── Lock helpers ──

function acquireLock(lockPath: string, timeoutMs = 3000): void {
  const start = Date.now()
  while (existsSync(lockPath)) {
    if (Date.now() - start > timeoutMs) {
      // Stale lock — force remove
      try { unlinkSync(lockPath) } catch { /* ignore */ }
      break
    }
    // Busy wait (simple approach for file lock)
    const end = Date.now() + 50
    while (Date.now() < end) { /* spin */ }
  }
  writeFileSync(lockPath, String(process.pid), 'utf-8')
}

function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath) } catch { /* ignore */ }
}

// ── Registry class ──

export class WorkspaceRegistry {
  private filePath: string
  private lockPath: string

  constructor(registryFilePath: string) {
    this.filePath = registryFilePath
    this.lockPath = registryFilePath + '.lock'
  }

  // ── Read / Write ──

  private read(): RegistryData {
    if (!existsSync(this.filePath)) {
      return { version: 1, workspaces: [] }
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as RegistryData
      if (data.version !== 1) return { version: 1, workspaces: [] }
      return data
    } catch {
      return { version: 1, workspaces: [] }
    }
  }

  private write(data: RegistryData): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    acquireLock(this.lockPath)
    try {
      const tmpPath = this.filePath + '.tmp.' + process.pid
      writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
      renameSync(tmpPath, this.filePath)
    } finally {
      releaseLock(this.lockPath)
    }
  }

  // ── CRUD ──

  list(): WorkspaceProfile[] {
    return this.read().workspaces
  }

  get(workspaceId: string): WorkspaceProfile | undefined {
    return this.read().workspaces.find(w => w.id === workspaceId)
  }

  add(rootPath: string, name?: string, opencodeConfigDir?: string): WorkspaceProfile {
    const validated = this.validateAndResolvePath(rootPath)
    const id = makeWorkspaceId(validated)
    const data = this.read()

    const existing = data.workspaces.find(w => w.id === id)
    if (existing) return existing

    const profile: WorkspaceProfile = {
      id,
      name: name ?? dirname(validated).split('/').pop() ?? validated,
      rootPath: validated,
      opencodeConfigDir,
      addedAt: new Date().toISOString(),
    }
    // Use basename for name
    profile.name = name ?? validated.split('/').pop() ?? validated

    data.workspaces.push(profile)
    this.write(data)
    return profile
  }

  update(workspaceId: string, updates: Partial<Pick<WorkspaceProfile, 'name' | 'opencodeConfigDir'>>): WorkspaceProfile | undefined {
    const data = this.read()
    const idx = data.workspaces.findIndex(w => w.id === workspaceId)
    if (idx === -1) return undefined

    if (updates.name !== undefined) data.workspaces[idx].name = updates.name
    if (updates.opencodeConfigDir !== undefined) data.workspaces[idx].opencodeConfigDir = updates.opencodeConfigDir

    this.write(data)
    return data.workspaces[idx]
  }

  remove(workspaceId: string): boolean {
    const data = this.read()
    const before = data.workspaces.length
    data.workspaces = data.workspaces.filter(w => w.id !== workspaceId)
    if (data.activeWorkspaceId === workspaceId) {
      data.activeWorkspaceId = undefined
    }
    if (data.workspaces.length === before) return false
    this.write(data)
    return true
  }

  getActive(): WorkspaceProfile | undefined {
    const data = this.read()
    if (!data.activeWorkspaceId) return undefined
    return data.workspaces.find(w => w.id === data.activeWorkspaceId)
  }

  setActive(workspaceId: string): WorkspaceProfile | undefined {
    const data = this.read()
    const ws = data.workspaces.find(w => w.id === workspaceId)
    if (!ws) return undefined
    data.activeWorkspaceId = workspaceId
    this.write(data)
    return ws
  }

  // ── Path validation ──

  validateAndResolvePath(inputPath: string, options?: { useExactPath?: boolean, confirmed?: boolean }): string {
    let p = inputPath

    // Expand ~
    if (p.startsWith('~/') || p === '~') {
      p = join(homedir(), p.slice(1))
    }

    // Resolve to absolute
    p = resolve(p)

    // Realpath
    if (!existsSync(p)) {
      throw new Error(`Path does not exist: ${p}`)
    }

    p = realpathSync(p)

    // Ensure is directory
    const stat = statSync(p)
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${p}`)
    }

    // Reject dangerous roots
    const home = homedir()
    if (DANGEROUS_ROOTS.includes(p)) {
      throw new Error(`Dangerous root path rejected: ${p}`)
    }
    if (p === home && !options?.confirmed) {
      throw new Error(`Home directory requires confirmation: ${p}`)
    }

    // Find nearest git root unless useExactPath
    if (!options?.useExactPath) {
      const gitRoot = findGitRoot(p)
      if (gitRoot) p = gitRoot
    }

    return p
  }

  /**
   * Validate a path without adding it. Returns info about the path.
   */
  validatePath(inputPath: string, options?: { useExactPath?: boolean, confirmed?: boolean }): {
    valid: boolean
    resolvedPath?: string
    gitRoot?: string
    error?: string
  } {
    try {
      const resolved = this.validateAndResolvePath(inputPath, { ...options, useExactPath: true })
      const gitRoot = findGitRoot(resolved) ?? undefined
      return { valid: true, resolvedPath: resolved, gitRoot }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  }
}

// ── Helpers ──

export function makeWorkspaceId(rootRealPath: string): string {
  const hash = createHash('sha256').update(rootRealPath).digest('hex')
  return 'ws_' + hash.slice(0, 16)
}

function findGitRoot(startPath: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: startPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result || null
  } catch {
    return null
  }
}
