import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { WorkspacesRoute } from '../server/routes/workspaces.js'
import { ConfigService } from '../server/services/config-service.js'
import { EffortService } from '../server/services/effort-service.js'
import { resolveLaneId } from '../server/services/lane-attribution.js'
import { ManagedServerManager } from '../server/services/managed-server-manager.js'
import { discoverOpenCodeBinary } from '../server/services/opencode-binary.js'
import { OpenCodeClientFactory } from '../server/services/opencode-client-factory.js'
import { resolveAppPaths } from '../server/services/app-paths.js'
import { SessionService } from '../server/services/session-service.js'
import { TaskLedgerService } from '../server/services/task-ledger-service.js'
import { VerificationService } from '../server/services/verification-service.js'
import { WorkspaceCapabilityProbeService } from '../server/services/workspace-capability-probe.js'
import { WorkspaceRegistry } from '../server/services/workspace-registry.js'
import { WorkspaceShipService } from '../server/services/workspace-ship-service.js'
import type {
  LaneAttribution,
  SessionSummary,
  TaskLedgerRecord,
  WorkspaceBootstrap,
  WorkspaceProfile,
} from '../shared/types.js'

interface CliOptions {
  dev: boolean
  json: boolean
  sandboxRoot?: string
  workspaceRoot?: string
}

interface SandboxEnv {
  XDG_CONFIG_HOME: string
  XDG_DATA_HOME: string
  XDG_STATE_HOME: string
  XDG_CACHE_HOME: string
}

interface BrowserSmokeLaneSeed {
  key: string
  title: string
  taskId: string
  sourceMessageId: string
  lane: LaneAttribution
  summary: string
  verificationSummary: string
  verificationStatus: NonNullable<TaskLedgerRecord['recentVerificationRef']>['status']
  verificationState: NonNullable<NonNullable<TaskLedgerRecord['resultAnnotation']>['verification']>
  shipState: NonNullable<NonNullable<TaskLedgerRecord['resultAnnotation']>['shipState']>
  reviewState?: NonNullable<NonNullable<TaskLedgerRecord['resultAnnotation']>['reviewState']>
  taskState: TaskLedgerRecord['state']
}

interface PreparedBrowserSmokeSetup {
  command: 'setup' | 'dev'
  appRoot: string
  workspaceRoot: string
  sandboxRoot: string
  sandboxEnv: SandboxEnv
  workspace: WorkspaceProfile
  opencodeBinary: string
  opencodeConfigDir: string
  laneSessions: Array<{
    key: string
    sessionId: string
    title?: string
    laneId?: string
  }>
  cleanup: {
    checkedPids: Array<{ phase: 'seed' | 'verify'; pid?: number; stopped: boolean }>
    allStopped: boolean
  }
  bootstrap: {
    sessionCount: number
    laneCount: number
    laneIds: string[]
    activeWorkspaceId?: string
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const APP_ROOT = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(APP_ROOT, '../..')

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const prepared = await prepareBrowserSmokeSetup(options)

  if (options.json) {
    process.stdout.write(`${JSON.stringify(prepared, null, 2)}\n`)
  } else {
    printHumanSummary(prepared)
  }

  if (options.dev) {
    await launchDevServer(prepared)
    return
  }

  process.exit(0)
}

function parseArgs(argv: string[]): CliOptions {
  return {
    dev: argv.includes('--dev'),
    json: argv.includes('--json'),
    sandboxRoot: readFlagValue(argv, '--sandbox-root'),
    workspaceRoot: readFlagValue(argv, '--workspace-root'),
  }
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${flag}.`)
  }
  return path.resolve(value)
}

async function prepareBrowserSmokeSetup(options: CliOptions): Promise<PreparedBrowserSmokeSetup> {
  const workspaceRoot = options.workspaceRoot ?? REPO_ROOT
  const sandboxRoot = options.sandboxRoot ?? path.join(REPO_ROOT, '.tmp', 'opencode-web-client', 'browser-smoke-two-lane')
  const sandboxEnv = buildSandboxEnv(sandboxRoot)
  applySandboxEnv(sandboxEnv)

  const appPaths = resolveAppPaths()
  ensureDirTree([
    sandboxRoot,
    sandboxEnv.XDG_CONFIG_HOME,
    sandboxEnv.XDG_DATA_HOME,
    sandboxEnv.XDG_STATE_HOME,
    sandboxEnv.XDG_CACHE_HOME,
    appPaths.configDir,
    appPaths.dataDir,
    appPaths.stateDir,
    appPaths.cacheDir,
    appPaths.logDir,
  ])

  const opencodeConfigDir = path.join(sandboxRoot, 'opencode-config')
  const alternateLanePath = path.join(sandboxRoot, 'lanes', 'alternate')
  ensureDirTree([opencodeConfigDir, alternateLanePath])

  const binaryInfo = discoverOpenCodeBinary()
  if (!binaryInfo.found || !binaryInfo.binaryPath) {
    throw new Error('OpenCode binary was not found. Install or expose `opencode` before running this smoke setup.')
  }

  const registry = new WorkspaceRegistry(appPaths.workspaceRegistryFile)
  const workspaceName = `${path.basename(workspaceRoot)} browser smoke`
  const initialWorkspace = registry.add(workspaceRoot, workspaceName, opencodeConfigDir)
  const workspace = registry.update(initialWorkspace.id, {
    name: workspaceName,
    opencodeConfigDir,
  }) ?? initialWorkspace
  registry.setActive(workspace.id)

  const laneSeeds = createLaneSeeds(workspaceRoot, alternateLanePath)
  const seededResult = await seedLaneSessionsAndTaskLedger(appPaths, workspace, binaryInfo.binaryPath, laneSeeds)
  const verification = await verifyBootstrap(appPaths, workspace.id, binaryInfo.binaryPath)

  return {
    command: options.dev ? 'dev' : 'setup',
    appRoot: APP_ROOT,
    workspaceRoot,
    sandboxRoot,
    sandboxEnv,
    workspace,
    opencodeBinary: binaryInfo.binaryPath,
    opencodeConfigDir,
    laneSessions: laneSeeds.map((seed) => {
      const session = seededResult.sessions.get(seed.key)
      return {
        key: seed.key,
        sessionId: session?.id ?? 'missing',
        title: session?.title,
        laneId: resolveLaneId(session),
      }
    }),
    cleanup: {
      checkedPids: [seededResult.cleanup, verification.cleanup],
      allStopped: seededResult.cleanup.stopped && verification.cleanup.stopped,
    },
    bootstrap: verification.bootstrap,
  }
}

function buildSandboxEnv(sandboxRoot: string): SandboxEnv {
  return {
    XDG_CONFIG_HOME: path.join(sandboxRoot, 'xdg', 'config'),
    XDG_DATA_HOME: path.join(sandboxRoot, 'xdg', 'data'),
    XDG_STATE_HOME: path.join(sandboxRoot, 'xdg', 'state'),
    XDG_CACHE_HOME: path.join(sandboxRoot, 'xdg', 'cache'),
  }
}

function applySandboxEnv(sandboxEnv: SandboxEnv): void {
  process.env.XDG_CONFIG_HOME = sandboxEnv.XDG_CONFIG_HOME
  process.env.XDG_DATA_HOME = sandboxEnv.XDG_DATA_HOME
  process.env.XDG_STATE_HOME = sandboxEnv.XDG_STATE_HOME
  process.env.XDG_CACHE_HOME = sandboxEnv.XDG_CACHE_HOME
}

function ensureDirTree(paths: string[]): void {
  for (const targetPath of paths) {
    mkdirSync(targetPath, { recursive: true })
  }
}

function createLaneSeeds(workspaceRoot: string, alternateLanePath: string): BrowserSmokeLaneSeed[] {
  const currentBranch = readCurrentBranch(workspaceRoot)

  return [
    {
      key: 'baseline',
      title: 'Browser smoke · Baseline lane',
      taskId: 'browser-smoke-baseline-task',
      sourceMessageId: 'browser-smoke-baseline-message',
      lane: {
        laneContext: {
          kind: 'branch',
          branch: currentBranch,
        },
      },
      summary: 'Baseline lane is ready for compare-and-adopt smoke coverage.',
      verificationSummary: 'Baseline lane test verification passed.',
      verificationStatus: 'passed',
      verificationState: 'verified',
      shipState: 'local-ready',
      reviewState: 'ready',
      taskState: 'completed',
    },
    {
      key: 'alternate',
      title: 'Browser smoke · Alternate lane',
      taskId: 'browser-smoke-alternate-task',
      sourceMessageId: 'browser-smoke-alternate-message',
      lane: {
        laneContext: {
          kind: 'worktree',
          worktreePath: alternateLanePath,
          branch: 'browser-smoke/alternate',
        },
      },
      summary: 'Alternate lane stays visible as a non-adopted comparison candidate.',
      verificationSummary: 'Alternate lane build verification is still blocked.',
      verificationStatus: 'failed',
      verificationState: 'unverified',
      shipState: 'blocked-by-checks',
      reviewState: 'needs-retry',
      taskState: 'blocked',
    },
  ]
}

function readCurrentBranch(workspaceRoot: string): string {
  try {
    const branch = execSync('git branch --show-current', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return branch || 'browser-smoke/main'
  } catch {
    return 'browser-smoke/main'
  }
}

async function seedLaneSessionsAndTaskLedger(
  appPaths: ReturnType<typeof resolveAppPaths>,
  workspace: WorkspaceProfile,
  binaryPath: string,
  laneSeeds: BrowserSmokeLaneSeed[],
): Promise<{
  sessions: Map<string, SessionSummary>
  cleanup: { phase: 'seed'; pid?: number; stopped: boolean }
}> {
  const manager = new ManagedServerManager(binaryPath)
  const clientFactory = new OpenCodeClientFactory(manager)
  const sessionService = new SessionService(clientFactory, appPaths)
  const taskLedgerService = new TaskLedgerService(appPaths)
  let runtimePid: number | undefined
  const ensuredSessions = new Map<string, SessionSummary>()

  try {
    const runtime = await manager.start(workspace.id, workspace.rootPath, workspace.opencodeConfigDir)
    runtimePid = runtime.pid
    await manager.waitUntilReady(workspace.id)

    let sessions = await sessionService.listSessions(workspace.id)

    for (const laneSeed of laneSeeds) {
      let session = sessions.find((candidate) => resolveLaneId(candidate) === resolveLaneId(laneSeed.lane))
      if (!session) {
        session = await sessionService.createSession(workspace.id, {
          title: laneSeed.title,
          ...laneSeed.lane,
        })
        sessions = await sessionService.listSessions(workspace.id)
      }

      ensuredSessions.set(laneSeed.key, session)
    }

    sessionService.setLaneComparisonState(workspace.id, undefined)
    taskLedgerService.replaceRecords(
      workspace.id,
      laneSeeds.map((laneSeed, index) => buildTaskLedgerRecord(workspace.id, laneSeed, ensuredSessions.get(laneSeed.key)!, index)),
    )
  } finally {
    await manager.stopAll()
  }

  return {
    sessions: ensuredSessions,
    cleanup: {
      phase: 'seed',
      pid: runtimePid,
      stopped: await waitForPidToStop(runtimePid),
    },
  }
}

function buildTaskLedgerRecord(
  workspaceId: string,
  laneSeed: BrowserSmokeLaneSeed,
  session: SessionSummary,
  index: number,
): TaskLedgerRecord {
  const baseTime = Date.now() + index * 1_000
  const createdAt = new Date(baseTime).toISOString()
  const updatedAt = new Date(baseTime + 500).toISOString()
  const lane = {
    laneId: resolveLaneId(session),
    laneContext: session.laneContext,
  } satisfies LaneAttribution

  return {
    taskId: laneSeed.taskId,
    workspaceId,
    sessionId: session.id,
    sourceMessageId: laneSeed.sourceMessageId,
    title: laneSeed.title,
    summary: laneSeed.summary,
    state: laneSeed.taskState,
    createdAt,
    updatedAt,
    ...(laneSeed.taskState === 'completed' ? { completedAt: updatedAt } : {}),
    resultAnnotation: {
      sourceMessageId: laneSeed.sourceMessageId,
      workspaceId,
      sessionId: session.id,
      taskId: laneSeed.taskId,
      summary: laneSeed.summary,
      verification: laneSeed.verificationState,
      shipState: laneSeed.shipState,
      ...(laneSeed.reviewState ? { reviewState: laneSeed.reviewState } : {}),
      ...lane,
    },
    recentVerificationRef: {
      runId: `browser-smoke-${laneSeed.key}-verify`,
      commandKind: laneSeed.key === 'baseline' ? 'test' : 'build',
      status: laneSeed.verificationStatus,
      summary: laneSeed.verificationSummary,
    },
    recentShipRef: {
      action: 'pullRequest',
      outcome: laneSeed.shipState === 'blocked-by-checks' ? 'blocked' : 'success',
      sessionId: session.id,
      taskId: laneSeed.taskId,
    },
    ...lane,
  }
}

async function verifyBootstrap(
  appPaths: ReturnType<typeof resolveAppPaths>,
  workspaceId: string,
  binaryPath: string,
): Promise<{
  bootstrap: PreparedBrowserSmokeSetup['bootstrap']
  cleanup: { phase: 'verify'; pid?: number; stopped: boolean }
}> {
  const registry = new WorkspaceRegistry(appPaths.workspaceRegistryFile)
  const manager = new ManagedServerManager(binaryPath)
  const clientFactory = new OpenCodeClientFactory(manager)
  const sessionService = new SessionService(clientFactory, appPaths)
  let runtimePid: number | undefined
  let bootstrap: PreparedBrowserSmokeSetup['bootstrap'] | undefined
  const route = WorkspacesRoute({
    registry,
    serverManager: manager,
    clientFactory,
    configService: new ConfigService(clientFactory),
    effortService: new EffortService(),
    capabilityProbeService: new WorkspaceCapabilityProbeService(),
    contextCatalogService: {
      getContextCatalog: async () => ({
        workspaceId,
        collectedAt: new Date().toISOString(),
        instructionSources: [],
        capabilityEntries: [],
      }),
    } as never,
    workspaceShipService: new WorkspaceShipService(clientFactory),
    taskLedgerService: new TaskLedgerService(appPaths),
    verificationService: new VerificationService(appPaths, clientFactory),
    sessionService,
  })

  try {
    const response = await route.request(`http://browser-smoke/${workspaceId}/bootstrap`)
    const payload = await response.json() as {
      ok: boolean
      data?: WorkspaceBootstrap
      error?: { message?: string }
    }

    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? `Bootstrap request failed with ${response.status}.`)
    }

    const laneIds = (payload.data.laneRecords ?? []).map((laneRecord) => laneRecord.laneId)
    if (laneIds.length < 2) {
      throw new Error(`Expected at least two lane records after restart, received ${laneIds.length}.`)
    }

    runtimePid = manager.get(workspaceId)?.pid
    bootstrap = {
      sessionCount: payload.data.sessions.length,
      laneCount: laneIds.length,
      laneIds,
      activeWorkspaceId: registry.getActive()?.id,
    }
  } finally {
    await manager.stopAll()
  }

  if (!bootstrap) {
    throw new Error('Bootstrap verification did not produce a payload.')
  }

  return {
    bootstrap,
    cleanup: {
      phase: 'verify',
      pid: runtimePid,
      stopped: await waitForPidToStop(runtimePid),
    },
  }
}

async function waitForPidToStop(pid: number | undefined, timeoutMs = 5_000): Promise<boolean> {
  if (!pid) return true

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return !isPidRunning(pid)
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function printHumanSummary(prepared: PreparedBrowserSmokeSetup): void {
  const lines = [
    `[browser-smoke] prepared ${prepared.bootstrap.laneCount} lanes for workspace ${prepared.workspace.id}`,
    `[browser-smoke] workspace root: ${prepared.workspaceRoot}`,
    `[browser-smoke] sandbox root: ${prepared.sandboxRoot}`,
    `[browser-smoke] app state: ${prepared.sandboxEnv.XDG_STATE_HOME}`,
    `[browser-smoke] lane sessions:`,
    ...prepared.laneSessions.map((laneSession) => `  - ${laneSession.key}: ${laneSession.sessionId} (${laneSession.laneId ?? 'no-lane'})`),
    `[browser-smoke] bootstrap lane ids: ${prepared.bootstrap.laneIds.join(', ')}`,
    '[browser-smoke] run the smoke stack with: npm run dev:browser-smoke',
  ]

  process.stdout.write(`${lines.join('\n')}\n`)
}

async function launchDevServer(prepared: PreparedBrowserSmokeSetup): Promise<void> {
  const child = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: prepared.appRoot,
    env: {
      ...process.env,
      ...prepared.sandboxEnv,
    },
    stdio: 'inherit',
  })

  await new Promise<void>((resolve, reject) => {
    let handled = false
    const relaySignal = (signal: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(signal)
      }
    }
    const onSigint = () => relaySignal('SIGINT')
    const onSigterm = () => relaySignal('SIGTERM')

    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)

    child.on('error', (error) => {
      if (handled) return
      handled = true
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      reject(error)
    })

    child.on('exit', (code, signal) => {
      if (handled) return
      handled = true
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)

      if (signal) {
        reject(new Error(`dev:browser-smoke exited from ${signal}.`))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`dev:browser-smoke exited with code ${code}.`))
        return
      }
      resolve()
    })
  })
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[browser-smoke] ${message}`)
  process.exit(1)
})
