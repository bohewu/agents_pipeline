import { Hono } from 'hono'
import { ok, fail } from '../create-server.js'
import type { UsageService } from '../services/usage-service.js'
import type { WorkspaceProfile } from '../../shared/types.js'

export interface UsageRouteDeps {
  usageService: UsageService
}

export function UsageRoute(deps: UsageRouteDeps): Hono {
  const { usageService } = deps
  const route = new Hono<any>()

  // GET / — get usage info
  route.get('/', async (c) => {
    const workspace = c.get('workspace') as WorkspaceProfile
    const provider = c.req.query('provider') ?? 'auto'
    const copilotReportPath = c.req.query('copilotReportPath')
    const refresh = c.req.query('refresh') === 'true'

    try {
      const result = await usageService.getUsage({
        provider,
        workspaceRoot: workspace.rootPath,
        copilotReportPath: copilotReportPath ?? undefined,
        refresh,
      })
      return c.json(ok(result))
    } catch (err: any) {
      return c.json(fail('USAGE_FAILED', err.message), 500)
    }
  })

  return route
}
