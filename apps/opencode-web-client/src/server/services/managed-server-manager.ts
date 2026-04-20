import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'

export type ManagedRuntime = {
  workspaceId: string
  pid: number
  port: number
  baseUrl: string
  password: string
  username: string
  startedAt: string
  lastHealthAt?: string
  state: 'starting' | 'ready' | 'unhealthy' | 'stopped'
  process?: ChildProcess
}

export class ManagedServerManager {
  private runtimes = new Map<string, ManagedRuntime>()
  private healthTimers = new Map<string, ReturnType<typeof setInterval>>()
  private binaryPath: string

  constructor(binaryPath: string) {
    this.binaryPath = binaryPath
  }

  get(workspaceId: string): ManagedRuntime | undefined {
    return this.runtimes.get(workspaceId)
  }

  getAll(): ManagedRuntime[] {
    return Array.from(this.runtimes.values())
  }

  async start(workspaceId: string, workspaceRoot: string, opencodeConfigDir?: string): Promise<ManagedRuntime> {
    // If already running, return existing
    const existing = this.runtimes.get(workspaceId)
    if (existing && existing.state !== 'stopped') {
      return existing
    }

    const getPort = await import('get-port').then(m => m.default)
    const port = await getPort()
    const password = randomBytes(24).toString('hex')
    const username = 'opencode-web'

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      OPENCODE_SERVER_USERNAME: username,
      OPENCODE_SERVER_PASSWORD: password,
    }

    // NEVER set OPENCODE_CONFIG_DIR unless user explicitly configured override
    if (opencodeConfigDir) {
      env.OPENCODE_CONFIG_DIR = opencodeConfigDir
    }

    const child = spawn(this.binaryPath, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: workspaceRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    })

    const runtime: ManagedRuntime = {
      workspaceId,
      pid: child.pid!,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      password,
      username,
      startedAt: new Date().toISOString(),
      state: 'starting',
      process: child,
    }

    this.runtimes.set(workspaceId, runtime)

    // Handle process exit
    child.on('exit', () => {
      runtime.state = 'stopped'
      runtime.process = undefined
      this.stopHealthPolling(workspaceId)
    })

    child.on('error', (err) => {
      console.error(`[managed-server] process error for ${workspaceId}:`, err.message)
      runtime.state = 'stopped'
      runtime.process = undefined
      this.stopHealthPolling(workspaceId)
    })

    // Start health polling
    this.startHealthPolling(workspaceId)

    return runtime
  }

  async stop(workspaceId: string): Promise<void> {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime) return

    this.stopHealthPolling(workspaceId)

    if (runtime.process && runtime.state !== 'stopped') {
      runtime.process.kill('SIGTERM')
      // Give it 5s then SIGKILL
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (runtime.process) {
            try { runtime.process.kill('SIGKILL') } catch { /* ignore */ }
          }
          resolve()
        }, 5000)

        if (runtime.process) {
          runtime.process.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        } else {
          clearTimeout(timeout)
          resolve()
        }
      })
    }

    runtime.state = 'stopped'
    runtime.process = undefined
  }

  async restart(workspaceId: string, workspaceRoot: string, opencodeConfigDir?: string): Promise<ManagedRuntime> {
    await this.stop(workspaceId)
    return this.start(workspaceId, workspaceRoot, opencodeConfigDir)
  }

  async waitUntilReady(workspaceId: string, timeoutMs = 15000): Promise<ManagedRuntime> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const runtime = this.runtimes.get(workspaceId)
      if (!runtime) {
        throw new Error(`No runtime found for workspace ${workspaceId}`)
      }
      if (runtime.state === 'ready') {
        return runtime
      }
      if (runtime.state === 'stopped') {
        throw new Error(`OpenCode server stopped while starting for workspace ${workspaceId}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    const runtime = this.runtimes.get(workspaceId)
    if (runtime?.state === 'ready') {
      return runtime
    }
    throw new Error(`Timed out waiting for OpenCode server for workspace ${workspaceId}`)
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.runtimes.keys())
    await Promise.all(ids.map(id => this.stop(id)))
  }

  // ── Health polling ──

  private startHealthPolling(workspaceId: string): void {
    this.stopHealthPolling(workspaceId)

    const timer = setInterval(async () => {
      await this.checkHealth(workspaceId)
    }, 5000)

    this.healthTimers.set(workspaceId, timer)

    // Also do an initial check after a short delay
    setTimeout(() => this.checkHealth(workspaceId), 1000)
  }

  private stopHealthPolling(workspaceId: string): void {
    const timer = this.healthTimers.get(workspaceId)
    if (timer) {
      clearInterval(timer)
      this.healthTimers.delete(workspaceId)
    }
  }

  private async checkHealth(workspaceId: string): Promise<void> {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime || runtime.state === 'stopped') return

    try {
      const auth = Buffer.from(`${runtime.username}:${runtime.password}`).toString('base64')
      const resp = await fetch(`${runtime.baseUrl}/global/health`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(3000),
      })

      if (resp.ok) {
        runtime.state = 'ready'
        runtime.lastHealthAt = new Date().toISOString()
      } else {
        if (runtime.state === 'ready') runtime.state = 'unhealthy'
      }
    } catch {
      if (runtime.state === 'ready') runtime.state = 'unhealthy'
    }
  }

  /**
   * Get a sanitized view of a runtime (without process handle).
   */
  toJSON(runtime: ManagedRuntime): Omit<ManagedRuntime, 'process'> {
    const rest = { ...runtime }
    delete rest.process
    return rest
  }
}
