import { Hono } from 'hono'
import { fail, ok } from '../create-server.js'
import type { PreviewRuntimeCaptureRequest, WorkspaceProfile } from '../../shared/types.js'
import { PreviewRuntimeInputError } from '../services/preview-runtime-service.js'
import type { PreviewRuntimeService } from '../services/preview-runtime-service.js'
import type { VerificationService } from '../services/verification-service.js'

export interface PreviewRuntimeRouteDeps {
  previewRuntimeService: PreviewRuntimeService
  verificationService: VerificationService
}

export function PreviewRuntimeRoute(deps: PreviewRuntimeRouteDeps): Hono<any> {
  const { previewRuntimeService, verificationService } = deps
  const route = new Hono<any>()

  route.post('/capture', async (c) => {
    const workspaceId = c.get('workspaceId') as string
    const workspace = c.get('workspace') as WorkspaceProfile

    let body: PreviewRuntimeCaptureRequest
    try {
      body = parseCaptureRequest(await c.req.json<unknown>())
    } catch (error) {
      if (error instanceof PreviewRuntimeInputError) {
        return c.json(fail('INVALID_INPUT', error.message), 400)
      }
      return c.json(fail('INVALID_INPUT', 'A JSON previewUrl payload is required'), 400)
    }

    try {
      const result = await previewRuntimeService.captureWorkspacePreview({
        workspaceId,
        workspaceRoot: workspace.rootPath,
        previewUrl: body.previewUrl,
      })

      if (result.outcome === 'captured') {
        verificationService.recordBrowserEvidence({
          workspaceId,
          sessionId: body.sessionId,
          sourceMessageId: body.sourceMessageId,
          taskId: body.taskId,
          captureResult: result,
        })
      }

      return c.json(ok(result))
    } catch (error) {
      if (error instanceof PreviewRuntimeInputError) {
        return c.json(fail('INVALID_INPUT', error.message), 400)
      }
      return c.json(fail('PREVIEW_RUNTIME_FAILED', error instanceof Error ? error.message : 'Preview runtime failed'), 500)
    }
  })

  return route
}

function parseCaptureRequest(value: unknown): PreviewRuntimeCaptureRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PreviewRuntimeInputError('A JSON previewUrl payload is required')
  }

  const record = value as Record<string, unknown>
  const allowedKeys = new Set(['previewUrl', 'sessionId', 'sourceMessageId', 'taskId'])
  const unsupportedKeys = Object.keys(record).filter((key) => !allowedKeys.has(key))
  if (unsupportedKeys.length > 0) {
    throw new PreviewRuntimeInputError(`Unsupported preview runtime fields: ${unsupportedKeys.join(', ')}`)
  }

  if (typeof record.previewUrl !== 'string' || record.previewUrl.trim().length === 0) {
    throw new PreviewRuntimeInputError('previewUrl is required')
  }

  for (const fieldName of ['sessionId', 'sourceMessageId', 'taskId'] as const) {
    const value = record[fieldName]
    if (value !== undefined && typeof value !== 'string') {
      throw new PreviewRuntimeInputError(`${fieldName} must be a string when provided`)
    }
  }

  return {
    previewUrl: record.previewUrl,
    ...(typeof record.sessionId === 'string' && record.sessionId.trim().length > 0 ? { sessionId: record.sessionId } : {}),
    ...(typeof record.sourceMessageId === 'string' && record.sourceMessageId.trim().length > 0 ? { sourceMessageId: record.sourceMessageId } : {}),
    ...(typeof record.taskId === 'string' && record.taskId.trim().length > 0 ? { taskId: record.taskId } : {}),
  }
}
