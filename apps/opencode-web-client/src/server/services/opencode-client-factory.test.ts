import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeClientFactory } from './opencode-client-factory.js'

describe('OpenCodeClientFactory shell agent forwarding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('includes agent fields when shell execution is scoped to a selected agent', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'completed', exitCode: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const factory = new OpenCodeClientFactory({
      get: (workspaceId: string) => workspaceId === 'ws-1'
        ? {
            workspaceId,
            state: 'ready',
            baseUrl: 'http://127.0.0.1:3456',
            username: 'opencode-web',
            password: 'secret',
          }
        : undefined,
    } as any)

    const result = await factory.forWorkspace('ws-1').shell('session-1', 'git push', { agentId: 'build' })

    expect(result).toEqual(expect.objectContaining({ status: 'completed', exitCode: 0 }))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/session/session-1/shell',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          command: 'git push',
          agentId: 'build',
          agent: 'build',
        }),
      }),
    )
  })
})
