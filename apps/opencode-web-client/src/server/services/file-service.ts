import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveWorkspacePath } from './workspace-paths.js'
import type { FileStatusResponse } from '../../shared/types.js'

export class FileService {
  readFile(workspaceRoot: string, relativePath: string): string {
    const resolved = resolveWorkspacePath(workspaceRoot, relativePath)
    return readFileSync(resolved, 'utf-8')
  }

  listFileStatus(workspaceRoot: string): FileStatusResponse[] {
    try {
      const output = execFileSync(
        'git',
        ['-C', workspaceRoot, 'status', '--short', '--untracked-files=all'],
        { encoding: 'utf-8', timeout: 5000 },
      )
      return output
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .map(parseGitStatusLine)
        .filter((entry): entry is FileStatusResponse => !!entry)
        .sort((left, right) => left.path.localeCompare(right.path))
    } catch {
      return []
    }
  }

  listFiles(workspaceRoot: string, subPath?: string): string[] {
    const dir = subPath
      ? resolveWorkspacePath(workspaceRoot, subPath)
      : workspaceRoot
    const results: string[] = []
    this.walkDir(dir, workspaceRoot, results, 0, 3)
    return results
  }

  searchFiles(workspaceRoot: string, query: string): string[] {
    const results: string[] = []
    const lowerQuery = query.toLowerCase()
    this.walkDir(workspaceRoot, workspaceRoot, results, 0, 5, lowerQuery)
    return results.slice(0, 100) // cap results
  }

  private walkDir(
    dir: string,
    root: string,
    results: string[],
    depth: number,
    maxDepth: number,
    filter?: string
  ): void {
    if (depth > maxDepth || results.length >= 1000) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = join(dir, entry.name)
        const rel = relative(root, fullPath)

        if (entry.isDirectory()) {
          this.walkDir(fullPath, root, results, depth + 1, maxDepth, filter)
        } else if (entry.isFile()) {
          if (!filter || rel.toLowerCase().includes(filter)) {
            results.push(rel)
          }
        }
      }
    } catch {
      // Permission denied or similar
    }
  }
}

function parseGitStatusLine(line: string): FileStatusResponse | null {
  const statusToken = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  if (!rawPath) return null

  const path = rawPath.includes(' -> ')
    ? rawPath.split(' -> ').at(-1) ?? rawPath
    : rawPath
  const condensedStatus = statusToken.replace(/\s/g, '')

  let status: FileStatusResponse['status'] = 'modified'
  if (statusToken === '??' || condensedStatus.includes('A')) {
    status = 'added'
  } else if (condensedStatus.includes('D')) {
    status = 'deleted'
  }

  return { path, status }
}
