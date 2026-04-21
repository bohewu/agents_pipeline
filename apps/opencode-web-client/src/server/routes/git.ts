import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type {
  CommitExecuteRequest,
  CommitPreviewRequest,
  PullRequestCreateRequest,
  PushRequest,
  WorkspaceProfile,
} from '../../shared/types.js'
import type { WorkspaceShipService } from '../services/workspace-ship-service.js'

export interface GitRouteDeps {
  workspaceShipService: WorkspaceShipService
}

export function GitRoute(deps: GitRouteDeps): Hono<any> {
  const { workspaceShipService } = deps
  const route = new Hono<any>()

  route.get('/status', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    return c.json(ok(await workspaceShipService.getStatus(workspaceId, workspace.rootPath)))
  })

  route.post('/commit/preview', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    const body = await c.req.json<CommitPreviewRequest>().catch(() => ({}))
    return c.json(ok(await workspaceShipService.previewCommit(workspaceId, workspace.rootPath, body)))
  })

  route.post('/commit', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    const body = await c.req.json<CommitExecuteRequest>().catch(() => ({ sessionId: '', message: '', agentId: undefined }))

    if (!body.sessionId) {
      return c.json(fail('INVALID_INPUT', 'sessionId is required'), 400)
    }
    if (!body.message?.trim()) {
      return c.json(fail('INVALID_INPUT', 'message is required'), 400)
    }

    return c.json(ok(await workspaceShipService.executeCommit(workspaceId, workspace.rootPath, {
      sessionId: body.sessionId,
      message: body.message.trim(),
      agentId: body.agentId,
    })))
  })

  route.post('/push', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    const body = await c.req.json<PushRequest>().catch(() => ({ sessionId: '', agentId: undefined }))

    if (!body.sessionId) {
      return c.json(fail('INVALID_INPUT', 'sessionId is required'), 400)
    }

    return c.json(ok(await workspaceShipService.push(workspaceId, workspace.rootPath, {
      sessionId: body.sessionId,
      agentId: body.agentId,
    })))
  })

  route.post('/pr', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile
    const body = await c.req.json<PullRequestCreateRequest>().catch(() => ({ sessionId: '', agentId: undefined }))

    if (!body.sessionId) {
      return c.json(fail('INVALID_INPUT', 'sessionId is required'), 400)
    }

    return c.json(ok(await workspaceShipService.createPullRequest(workspaceId, workspace.rootPath, body)))
  })

  return route
}
