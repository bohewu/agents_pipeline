import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionService } from './session-service.js'

const tempDirs: string[] = []

describe('SessionService lane attribution', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persists lane metadata for created and forked sessions and rehydrates it by workspace', async () => {
    const stateDir = makeTempDir('session-lanes-state-')
    const sessions = new Map<string, any>([
      ['session-root', makeSession('session-root')],
    ])
    const createSession = vi.fn(async () => {
      const nextId = `session-${sessions.size}`
      const session = makeSession(nextId)
      sessions.set(nextId, session)
      return { ...session }
    })
    const clientFactory = {
      forWorkspace: () => ({
        listSessions: async () => Array.from(sessions.values()).map((session) => ({ ...session })),
        getSession: async (sessionId: string) => ({ ...sessions.get(sessionId) }),
        createSession,
      }),
    }

    const service = new SessionService(clientFactory as any, { stateDir })

    const created = await service.createSession('ws-lane', {
      title: 'Branch lane',
      laneContext: { kind: 'branch', branch: 'feature/lane-a' },
    })
    const forked = await service.forkSession('ws-lane', 'session-root', undefined, {
      laneId: 'lane-worktree-b',
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    })
    const laneComparison = service.setLaneComparisonState('ws-lane', {
      selectedLane: {
        sessionId: created.id,
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      },
      adoptedLane: {
        sessionId: forked.id,
        laneId: 'lane-worktree-b',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      },
    })

    expect(created).toEqual(expect.objectContaining({
      laneId: 'branch:feature/lane-a',
      laneContext: { kind: 'branch', branch: 'feature/lane-a' },
    }))
    expect(forked).toEqual(expect.objectContaining({
      laneId: 'lane-worktree-b',
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    }))

    const rehydrated = new SessionService(clientFactory as any, { stateDir })
    expect(await rehydrated.listSessions('ws-lane')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        laneId: 'branch:feature/lane-a',
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      }),
      expect.objectContaining({
        id: forked.id,
        laneId: 'lane-worktree-b',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      }),
    ]))
    expect(rehydrated.resolveLaneAttribution('ws-lane', forked.id)).toEqual({
      sessionId: forked.id,
      laneId: 'lane-worktree-b',
      laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
    })
    expect(rehydrated.resolveLaneAttribution('ws-other', forked.id)).toBeUndefined()
    expect(laneComparison).toEqual({
      selectedLane: {
        sessionId: created.id,
        laneId: 'branch:feature/lane-a',
        laneContext: { kind: 'branch', branch: 'feature/lane-a' },
      },
      adoptedLane: {
        sessionId: forked.id,
        laneId: 'lane-worktree-b',
        laneContext: { kind: 'worktree', worktreePath: '/tmp/worktrees/lane-b', branch: 'feature/lane-b' },
      },
    })
    expect(rehydrated.resolveLaneComparisonState('ws-lane')).toEqual(laneComparison)
    expect(rehydrated.resolveLaneComparisonState('ws-other')).toBeUndefined()
    expect(createSession).toHaveBeenCalledTimes(2)
  })
})

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function makeSession(id: string) {
  return {
    id,
    title: `Session ${id}`,
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    messageCount: 0,
    state: 'idle' as const,
  }
}
