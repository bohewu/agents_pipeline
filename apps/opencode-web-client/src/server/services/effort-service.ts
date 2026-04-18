import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { EFFORT_LEVELS } from '../../shared/constants.js'

export interface EffortEntry {
  effort: string
  updatedAt: string
}

export interface EffortStateFile {
  version: 1
  defaults: {
    project?: EffortEntry
  }
  sessions: Record<string, EffortEntry>
}

export class EffortService {
  /**
   * Map UI effort level to internal level. UI "max" -> internal "xhigh".
   */
  static toInternal(uiLevel: string): string {
    return EFFORT_LEVELS[uiLevel] ?? uiLevel
  }

  /**
   * Map internal effort level to UI level. Internal "xhigh" -> UI "max".
   */
  static toUI(internalLevel: string): string {
    if (internalLevel === 'xhigh') return 'max'
    return internalLevel
  }

  private stateFilePath(workspaceRoot: string): string {
    return join(workspaceRoot, '.opencode', 'effort-control.sessions.json')
  }

  private traceFilePath(workspaceRoot: string): string {
    return join(workspaceRoot, '.opencode', 'effort-control.trace.jsonl')
  }

  readState(workspaceRoot: string): EffortStateFile {
    const filePath = this.stateFilePath(workspaceRoot)
    if (!existsSync(filePath)) {
      return { version: 1, defaults: {}, sessions: {} }
    }
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as EffortStateFile
      if (data.version !== 1) return { version: 1, defaults: {}, sessions: {} }
      return data
    } catch {
      return { version: 1, defaults: {}, sessions: {} }
    }
  }

  writeState(workspaceRoot: string, state: EffortStateFile): void {
    const filePath = this.stateFilePath(workspaceRoot)
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  getEffortSummary(workspaceRoot: string, sessionId?: string): {
    projectDefault?: string
    sessionOverride?: string
    effective?: string
    sessionOverrides: Record<string, string>
  } {
    const state = this.readState(workspaceRoot)
    const projectDefault = state.defaults.project
      ? EffortService.toUI(state.defaults.project.effort)
      : undefined

    const sessionOverrides: Record<string, string> = {}
    for (const [sid, entry] of Object.entries(state.sessions)) {
      sessionOverrides[sid] = EffortService.toUI(entry.effort)
    }

    let sessionOverride: string | undefined
    let effective: string | undefined

    if (sessionId && state.sessions[sessionId]) {
      sessionOverride = EffortService.toUI(state.sessions[sessionId].effort)
      effective = sessionOverride
    } else {
      effective = projectDefault
    }

    return { projectDefault, sessionOverride, effective, sessionOverrides }
  }

  setEffort(
    workspaceRoot: string,
    params: { scope: 'project' | 'session'; action: 'set' | 'clear'; effort?: string; sessionId?: string }
  ): EffortStateFile {
    const state = this.readState(workspaceRoot)
    const now = new Date().toISOString()

    if (params.scope === 'project') {
      if (params.action === 'clear') {
        delete state.defaults.project
      } else if (params.effort) {
        state.defaults.project = {
          effort: EffortService.toInternal(params.effort),
          updatedAt: now,
        }
      }
    } else if (params.scope === 'session' && params.sessionId) {
      if (params.action === 'clear') {
        delete state.sessions[params.sessionId]
      } else if (params.effort) {
        state.sessions[params.sessionId] = {
          effort: EffortService.toInternal(params.effort),
          updatedAt: now,
        }
      }
    }

    this.writeState(workspaceRoot, state)
    return state
  }

  readTrace(workspaceRoot: string): unknown[] {
    const filePath = this.traceFilePath(workspaceRoot)
    if (!existsSync(filePath)) return []
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line) } catch { return null }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  }
}
