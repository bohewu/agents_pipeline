import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveWorkspacePath } from './workspace-paths.js'

export class FileService {
  readFile(workspaceRoot: string, relativePath: string): string {
    const resolved = resolveWorkspacePath(workspaceRoot, relativePath)
    return readFileSync(resolved, 'utf-8')
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
