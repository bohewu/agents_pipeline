import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { DiffService } from '../services/diff-service.js'
import type { FileService } from '../services/file-service.js'
import type { WorkspaceProfile } from '../../shared/types.js'

export interface FilesRouteDeps {
  diffService: DiffService
  fileService: FileService
}

export function FilesRoute(deps: FilesRouteDeps): Hono<any> {
  const { diffService, fileService } = deps
  const route = new Hono<any>()

  // GET /sessions/:sessionId/diff — get diff for session (mounted at session level)
  // This will be mounted separately; see create-server

  // GET /files/status — git file status
  route.get('/status', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    try {
      // Use diff service with a default session or workspace-level status
      const files = fileService.listFiles(workspace.rootPath)
      return c.json(ok(files))
    } catch (err: any) {
      return c.json(fail('FILE_STATUS_FAILED', err.message), 500)
    }
  })

  // GET /files/content?path=<relativePath> — read file content
  route.get('/content', async (c) => {
    const workspace = c.get('workspace') as WorkspaceProfile
    const relativePath = c.req.query('path')

    if (!relativePath) {
      return c.json(fail('INVALID_INPUT', 'path query parameter is required'), 400)
    }

    try {
      const content = fileService.readFile(workspace.rootPath, relativePath)
      return c.json(ok({ path: relativePath, content }))
    } catch (err: any) {
      if (err.message?.includes('escapes workspace')) {
        return c.json(fail('PATH_ESCAPE', err.message), 403)
      }
      return c.json(fail('FILE_READ_FAILED', err.message), 500)
    }
  })

  // GET /files/find?q=<query> — search files
  route.get('/find', async (c) => {
    const workspace = c.get('workspace') as WorkspaceProfile
    const query = c.req.query('q')

    if (!query) {
      return c.json(fail('INVALID_INPUT', 'q query parameter is required'), 400)
    }

    try {
      const results = fileService.searchFiles(workspace.rootPath, query)
      return c.json(ok(results))
    } catch (err: any) {
      return c.json(fail('FILE_SEARCH_FAILED', err.message), 500)
    }
  })

  return route
}

/**
 * Separate route for session-scoped diff endpoint.
 */
export function DiffRoute(deps: { diffService: DiffService }): Hono<any> {
  const { diffService } = deps
  const route = new Hono<any>()

  // GET / — get diff for session
  route.get('/', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const sessionId = c.req.param('sessionId')
    try {
      const diffs = await diffService.getDiff(workspaceId, sessionId!)
      return c.json(ok(diffs))
    } catch (err: any) {
      return c.json(fail('DIFF_FAILED', err.message), 500)
    }
  })

  return route
}
