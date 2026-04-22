import { resolve, isAbsolute, relative } from 'node:path'
import { realpathSync } from 'node:fs'

/**
 * Ensure a relative path does not escape the workspace root.
 * Throws if the resolved path is outside the workspace.
 */
export function ensureWithinWorkspace(workspaceRoot: string, relativePath: string): string {
  const realRoot = realpathSync(workspaceRoot)
  const resolved = resolve(workspaceRoot, relativePath)
  const realTarget = realpathSync(resolved)
  const workspaceRelativePath = relative(realRoot, realTarget)

  if (
    workspaceRelativePath.startsWith('..')
    || isAbsolute(workspaceRelativePath)
  ) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }

  return realTarget
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
 * Resolve a relative path within a workspace without requiring the target to exist.
 * Throws if the resolved candidate escapes the workspace root.
 */
export function resolveWorkspaceProbePath(workspaceRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Expected relative path, got absolute: ${relativePath}`)
  }

  const realRoot = realpathSync(workspaceRoot)
  const resolved = resolve(workspaceRoot, relativePath)
  const workspaceRelativePath = relative(realRoot, resolved)

  if (
    workspaceRelativePath.startsWith('..')
    || isAbsolute(workspaceRelativePath)
  ) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }

  return resolved
}

/**
 * Get the .opencode directory for a workspace.
 */
export function getWorkspaceOpenCodeDir(workspaceRoot: string): string {
  return resolve(workspaceRoot, '.opencode')
}
