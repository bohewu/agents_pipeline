import { resolve, relative, isAbsolute } from 'node:path'
import { realpathSync } from 'node:fs'

/**
 * Ensure a relative path does not escape the workspace root.
 * Throws if the resolved path is outside the workspace.
 */
export function ensureWithinWorkspace(workspaceRoot: string, relativePath: string): string {
  const resolved = resolve(workspaceRoot, relativePath)
  const realRoot = realpathSync(workspaceRoot)
  // Check the resolved path starts with the workspace root
  if (!resolved.startsWith(realRoot + '/') && resolved !== realRoot) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }
  return resolved
}

/**
 * Resolve a relative path within a workspace and validate it doesn't escape.
 */
export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Expected relative path, got absolute: ${relativePath}`)
  }
  return ensureWithinWorkspace(workspaceRoot, relativePath)
}

/**
 * Get the .opencode directory for a workspace.
 */
export function getWorkspaceOpenCodeDir(workspaceRoot: string): string {
  return resolve(workspaceRoot, '.opencode')
}
