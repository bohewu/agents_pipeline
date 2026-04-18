import { Hono } from 'hono'
import { readdirSync, statSync, realpathSync, existsSync } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { homedir } from 'node:os'
import { ok, fail } from '../create-server.js'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  isGitRepo: boolean
}

export interface BrowseResult {
  currentPath: string
  parentPath: string | null
  entries: DirEntry[]
  homePath: string
}

/**
 * Route: POST /api/fs/browse
 * Body: { path?: string }
 * Returns directory listing for the given path (defaults to home).
 * Only returns directories (not files) to keep the listing focused.
 */
export function fsBrowseRoute(): Hono {
  const route = new Hono()

  route.post('/browse', async (c) => {
    const body: { path?: string } = await c.req.json<{ path?: string }>().catch(() => ({ path: undefined }))
    let targetPath = body.path || '~'

    // Expand ~
    const home = homedir()
    if (targetPath === '~' || targetPath.startsWith('~/')) {
      targetPath = join(home, targetPath.slice(1))
    }

    // Resolve to absolute
    targetPath = resolve(targetPath)

    // Check existence
    if (!existsSync(targetPath)) {
      return c.json(fail('NOT_FOUND', `Path does not exist: ${targetPath}`), 400)
    }

    try {
      targetPath = realpathSync(targetPath)
    } catch {
      return c.json(fail('RESOLVE_FAILED', `Cannot resolve path: ${targetPath}`), 400)
    }

    const stat = statSync(targetPath)
    if (!stat.isDirectory()) {
      return c.json(fail('NOT_DIRECTORY', `Path is not a directory: ${targetPath}`), 400)
    }

    // List directories
    const entries: DirEntry[] = []
    try {
      const items = readdirSync(targetPath, { withFileTypes: true })
      for (const item of items) {
        // Skip hidden files/dirs (except .git detection)
        if (item.name.startsWith('.')) continue
        if (!item.isDirectory()) continue

        const fullPath = join(targetPath, item.name)
        const isGitRepo = existsSync(join(fullPath, '.git'))

        entries.push({
          name: item.name,
          path: fullPath,
          isDirectory: true,
          isGitRepo,
        })
      }
    } catch (err: any) {
      return c.json(fail('READ_FAILED', `Cannot read directory: ${err.message}`), 500)
    }

    // Sort: git repos first, then alphabetical
    entries.sort((a, b) => {
      if (a.isGitRepo && !b.isGitRepo) return -1
      if (!a.isGitRepo && b.isGitRepo) return 1
      return a.name.localeCompare(b.name)
    })

    // Parent path (null if at root)
    const parentPath = targetPath === sep ? null : dirname(targetPath)

    const result: BrowseResult = {
      currentPath: targetPath,
      parentPath,
      entries,
      homePath: home,
    }

    return c.json(ok(result))
  })

  return route
}
