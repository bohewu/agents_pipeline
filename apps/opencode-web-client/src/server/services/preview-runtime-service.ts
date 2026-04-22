import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type {
  CapabilityProbeCheck,
  PreviewRuntimeCaptureResult,
  PreviewRuntimeConsoleCaptureMetadata,
  PreviewRuntimeIssue,
  PreviewRuntimeScreenshotMetadata,
} from '../../shared/types.js'
import type { AppPaths } from './app-paths.js'
import type { WorkspaceCapabilityProbeService } from './workspace-capability-probe.js'

const execFileAsync = promisify(execFile)

const BROWSER_COMMANDS = ['google-chrome', 'chromium-browser', 'chromium', 'chrome', 'microsoft-edge', 'msedge']
const BROWSER_PROBE_TIMEOUT_MS = 4000
const BROWSER_START_TIMEOUT_MS = 8000
const PAGE_LOAD_TIMEOUT_MS = 8000
const PAGE_SETTLE_DELAY_MS = 1000
const PROCESS_SHUTDOWN_TIMEOUT_MS = 1500
const SCREENSHOT_WIDTH = 1280
const SCREENSHOT_HEIGHT = 800
const MAX_CAPTURE_OUTPUT_CHARS = 4096

interface BrowserEvidenceCaptureArgs {
  workspaceId: string
  previewUrl: string
  stateDir: string
  captureId: string
  capturedAt: string
}

interface BrowserEvidenceCaptureResult {
  consoleCapture: PreviewRuntimeConsoleCaptureMetadata
  screenshot: PreviewRuntimeScreenshotMetadata
}

type BrowserEvidenceCaptureFn = (args: BrowserEvidenceCaptureArgs) => Promise<BrowserEvidenceCaptureResult>

export interface PreviewRuntimeServiceOptions {
  now?: () => Date
  randomId?: () => string
  captureBrowserEvidence?: BrowserEvidenceCaptureFn
}

export class PreviewRuntimeInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PreviewRuntimeInputError'
  }
}

export class PreviewRuntimeService {
  private stateDir: string
  private capabilityProbeService: Pick<WorkspaceCapabilityProbeService, 'probeWorkspace'>
  private now: () => Date
  private randomId: () => string
  private captureBrowserEvidence: BrowserEvidenceCaptureFn

  constructor(
    appPaths: Pick<AppPaths, 'stateDir'>,
    capabilityProbeService: Pick<WorkspaceCapabilityProbeService, 'probeWorkspace'>,
    options: PreviewRuntimeServiceOptions = {},
  ) {
    this.stateDir = appPaths.stateDir
    this.capabilityProbeService = capabilityProbeService
    this.now = options.now ?? (() => new Date())
    this.randomId = options.randomId ?? (() => randomUUID())
    this.captureBrowserEvidence = options.captureBrowserEvidence ?? defaultCaptureBrowserEvidence
  }

  async captureWorkspacePreview(args: {
    workspaceId: string
    workspaceRoot: string
    previewUrl: string
  }): Promise<PreviewRuntimeCaptureResult> {
    const previewUrl = normalizePreviewUrl(args.previewUrl)
    const capabilities = await this.capabilityProbeService.probeWorkspace(args.workspaceId, args.workspaceRoot)
    const issues = resolveCapabilityIssues(capabilities.previewTarget, capabilities.browserEvidence)

    if (issues.length > 0) {
      return {
        workspaceId: args.workspaceId,
        outcome: issues.some((issue) => issue.code.endsWith('_FAILED')) ? 'degraded' : 'unavailable',
        issues,
      }
    }

    const capturedAt = this.now().toISOString()

    try {
      const evidence = await this.captureBrowserEvidence({
        workspaceId: args.workspaceId,
        previewUrl,
        stateDir: this.stateDir,
        captureId: `preview-${this.randomId()}`,
        capturedAt,
      })

      return {
        workspaceId: args.workspaceId,
        outcome: 'captured',
        previewUrl,
        consoleCapture: evidence.consoleCapture,
        screenshot: evidence.screenshot,
        issues: [],
      }
    } catch (error) {
      return {
        workspaceId: args.workspaceId,
        outcome: 'degraded',
        issues: [
          {
            code: 'PREVIEW_RUNTIME_CAPTURE_FAILED',
            message: 'Preview runtime capture failed.',
            detail: toErrorMessage(error),
          },
        ],
      }
    }
  }
}

async function defaultCaptureBrowserEvidence(args: BrowserEvidenceCaptureArgs): Promise<BrowserEvidenceCaptureResult> {
  const browserCommand = await resolveBrowserCommand()
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'opencode-preview-runtime-'))
  let browserProcess: ReturnType<typeof spawn> | undefined
  let connection: CdpConnection | undefined

  try {
    browserProcess = spawn(
      browserCommand,
      [
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-insecure-localhost',
        '--ignore-certificate-errors',
        `--user-data-dir=${profileDir}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const devtoolsUrl = await waitForDevToolsUrl(browserProcess)
    connection = await CdpConnection.connect(devtoolsUrl)

    const { targetId } = await connection.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await connection.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    })

    await connection.send('Page.enable', {}, sessionId)
    await connection.send('Runtime.enable', {}, sessionId)
    await connection.send('Emulation.setDeviceMetricsOverride', {
      width: SCREENSHOT_WIDTH,
      height: SCREENSHOT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)

    const consoleState = {
      consoleEntries: 0,
      errorCount: 0,
      warningCount: 0,
      exceptionCount: 0,
      levels: new Set<string>(),
    }

    const unsubscribe = connection.onEvent((message) => {
      if (message.sessionId !== sessionId || !message.method) {
        return
      }

      if (message.method === 'Runtime.consoleAPICalled') {
        consoleState.consoleEntries += 1
        const level = readString(toRecord(message.params), 'type') ?? 'log'
        consoleState.levels.add(level)

        if (level === 'error' || level === 'assert') {
          consoleState.errorCount += 1
        }
        if (level === 'warning') {
          consoleState.warningCount += 1
        }
      }

      if (message.method === 'Runtime.exceptionThrown') {
        consoleState.exceptionCount += 1
        consoleState.errorCount += 1
        consoleState.levels.add('exception')
      }
    })

    try {
      const loadEvent = waitForLoadEvent(connection, sessionId)
      const navigateResult = await connection.send<Record<string, unknown>>('Page.navigate', { url: args.previewUrl }, sessionId)
      const errorText = readString(navigateResult, 'errorText')
      if (errorText) {
        throw new Error(errorText)
      }
      await loadEvent
      await delay(PAGE_SETTLE_DELAY_MS)
    } finally {
      unsubscribe()
    }

    const screenshotResult = await connection.send<{ data: string }>('Page.captureScreenshot', { format: 'png' }, sessionId)
    const screenshotData = Buffer.from(screenshotResult.data, 'base64')
    const screenshotDir = path.join(args.stateDir, 'preview-runtime-artifacts', args.workspaceId)
    await mkdir(screenshotDir, { recursive: true })
    const screenshotPath = path.join(screenshotDir, `${args.captureId}.png`)
    await writeFile(screenshotPath, screenshotData)

    return {
      consoleCapture: {
        capturedAt: args.capturedAt,
        entryCount: consoleState.consoleEntries + consoleState.exceptionCount,
        errorCount: consoleState.errorCount,
        warningCount: consoleState.warningCount,
        exceptionCount: consoleState.exceptionCount,
        levels: Array.from(consoleState.levels).sort(),
      },
      screenshot: {
        artifactRef: path.relative(args.stateDir, screenshotPath),
        mimeType: 'image/png',
        bytes: screenshotData.byteLength,
        width: SCREENSHOT_WIDTH,
        height: SCREENSHOT_HEIGHT,
        capturedAt: args.capturedAt,
      },
    }
  } finally {
    await shutdownBrowser(connection, browserProcess)
    await rm(profileDir, { recursive: true, force: true })
  }
}

async function resolveBrowserCommand(): Promise<string> {
  let firstError: unknown

  for (const command of BROWSER_COMMANDS) {
    try {
      await execFileAsync(command, ['--version'], {
        timeout: BROWSER_PROBE_TIMEOUT_MS,
        encoding: 'utf-8',
      })
      return command
    } catch (error) {
      if (isMissingCommandError(error)) {
        continue
      }
      firstError ??= error
    }
  }

  if (firstError) {
    throw firstError
  }

  throw new Error('No supported browser runtime was detected for preview capture.')
}

async function waitForDevToolsUrl(browserProcess: ReturnType<typeof spawn>): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let settled = false
    let output = ''
    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for browser DevTools endpoint. ${output.trim()}`.trim()))
    }, BROWSER_START_TIMEOUT_MS)

    const onChunk = (chunk: string | Buffer) => {
      output = appendLimitedOutput(output, chunk.toString())
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match?.[1]) {
        finish(undefined, match[1])
      }
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(`Browser exited before capture started (code=${code ?? 'null'}, signal=${signal ?? 'null'}). ${output.trim()}`.trim()))
    }

    const onError = (error: Error) => {
      finish(error)
    }

    const finish = (error?: Error, url?: string) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      browserProcess.stdout?.off('data', onChunk)
      browserProcess.stderr?.off('data', onChunk)
      browserProcess.off('exit', onExit)
      browserProcess.off('error', onError)

      if (error) {
        reject(error)
        return
      }

      resolve(url!)
    }

    browserProcess.stdout?.on('data', onChunk)
    browserProcess.stderr?.on('data', onChunk)
    browserProcess.once('exit', onExit)
    browserProcess.once('error', onError)
  })
}

async function waitForLoadEvent(connection: CdpConnection, sessionId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup(new Error('Timed out waiting for preview page to load.'))
    }, PAGE_LOAD_TIMEOUT_MS)

    const unsubscribe = connection.onEvent((message) => {
      if (message.sessionId !== sessionId) {
        return
      }
      if (message.method === 'Page.loadEventFired') {
        cleanup()
      }
    })

    const cleanup = (error?: Error) => {
      clearTimeout(timeout)
      unsubscribe()

      if (error) {
        reject(error)
        return
      }

      resolve()
    }
  })
}

async function shutdownBrowser(connection?: CdpConnection, browserProcess?: ReturnType<typeof spawn>): Promise<void> {
  try {
    if (connection) {
      await connection.send('Browser.close')
    }
  } catch {
    // Best effort shutdown.
  }

  try {
    await connection?.close()
  } catch {
    // Best effort shutdown.
  }

  if (!browserProcess) {
    return
  }

  if (browserProcess.exitCode === null) {
    browserProcess.kill('SIGTERM')
    const exited = await waitForProcessExit(browserProcess, PROCESS_SHUTDOWN_TIMEOUT_MS)
    if (!exited && browserProcess.exitCode === null) {
      browserProcess.kill('SIGKILL')
      await waitForProcessExit(browserProcess, PROCESS_SHUTDOWN_TIMEOUT_MS)
    }
  }
}

async function waitForProcessExit(browserProcess: ReturnType<typeof spawn>, timeoutMs: number): Promise<boolean> {
  if (browserProcess.exitCode !== null) {
    return true
  }

  const exitPromise = once(browserProcess, 'exit').then(() => true).catch(() => true)
  const timeoutPromise = delay(timeoutMs).then(() => false)
  return await Promise.race([exitPromise, timeoutPromise])
}

function normalizePreviewUrl(value: string): string {
  const previewUrl = value.trim()
  if (!previewUrl) {
    throw new PreviewRuntimeInputError('previewUrl is required')
  }

  let parsed: URL
  try {
    parsed = new URL(previewUrl)
  } catch {
    throw new PreviewRuntimeInputError('previewUrl must be an absolute http(s) URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PreviewRuntimeInputError('previewUrl must use http or https')
  }

  if (parsed.username || parsed.password) {
    throw new PreviewRuntimeInputError('previewUrl must not include embedded credentials')
  }

  const hostname = normalizePreviewHostname(parsed.hostname)
  if (!hostname) {
    throw new PreviewRuntimeInputError(
      'previewUrl must target a loopback preview host (localhost, 127.0.0.1, 0.0.0.0, or [::1])',
    )
  }

  parsed.hostname = hostname
  return parsed.toString()
}

function normalizePreviewHostname(hostname: string): string | undefined {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized === '127.0.0.1') {
    return normalized
  }
  if (normalized === '0.0.0.0') {
    return '127.0.0.1'
  }
  if (normalized === '::1' || normalized === '[::1]') {
    return '::1'
  }
  return undefined
}

function resolveCapabilityIssues(
  previewTarget: CapabilityProbeCheck,
  browserEvidence: CapabilityProbeCheck,
): PreviewRuntimeIssue[] {
  const issues: PreviewRuntimeIssue[] = []

  if (previewTarget.status !== 'available') {
    issues.push(toCapabilityIssue('previewTarget', previewTarget))
  }

  if (browserEvidence.status !== 'available') {
    issues.push(toCapabilityIssue('browserEvidence', browserEvidence))
  }

  return issues
}

function toCapabilityIssue(
  capability: PreviewRuntimeIssue['capability'],
  check: CapabilityProbeCheck,
): PreviewRuntimeIssue {
  const capabilityKey = capability === 'previewTarget' ? 'PREVIEW_TARGET' : 'BROWSER_EVIDENCE'
  return {
    code: `${capabilityKey}_${check.status === 'error' ? 'PROBE_FAILED' : 'UNAVAILABLE'}`,
    message: check.summary,
    ...(check.detail ? { detail: check.detail } : {}),
    capability,
  }
}

class CdpConnection {
  private nextId = 0
  private ws: WebSocket
  private listeners = new Set<(message: CdpMessage) => void>()
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.addEventListener('message', (event) => {
      const message = parseCdpMessage(event.data)
      if (!message) {
        return
      }

      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending) {
          return
        }
        this.pending.delete(message.id)

        if (message.error) {
          pending.reject(new Error(message.error.message ?? 'CDP request failed'))
          return
        }

        pending.resolve(message.result ?? {})
        return
      }

      for (const listener of this.listeners) {
        listener(message)
      }
    })

    this.ws.addEventListener('close', () => {
      this.rejectPending(new Error('Browser DevTools connection closed before capture completed.'))
    })
    this.ws.addEventListener('error', () => {
      this.rejectPending(new Error('Browser DevTools connection failed during capture.'))
    })
  }

  static async connect(url: string): Promise<CdpConnection> {
    const WebSocketCtor = globalThis.WebSocket
    if (!WebSocketCtor) {
      throw new Error('WebSocket runtime is unavailable for preview capture.')
    }

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocketCtor(url)
      const onError = () => {
        reject(new Error('Failed to connect to the browser DevTools endpoint.'))
      }

      socket.addEventListener('open', () => resolve(socket), { once: true })
      socket.addEventListener('error', onError, { once: true })
    })

    return new CdpConnection(ws)
  }

  onEvent(listener: (message: CdpMessage) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async send<TResult extends Record<string, unknown> = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<TResult> {
    if (this.ws.readyState !== 1) {
      throw new Error('Browser DevTools connection is not open.')
    }

    const id = ++this.nextId
    const response = new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      })
    })

    this.ws.send(JSON.stringify({
      id,
      method,
      ...(params ? { params } : {}),
      ...(sessionId ? { sessionId } : {}),
    }))

    return await response
  }

  async close(): Promise<void> {
    if (this.ws.readyState >= 2) {
      return
    }

    await new Promise<void>((resolve) => {
      this.ws.addEventListener('close', () => resolve(), { once: true })
      this.ws.close()
    })
  }

  private rejectPending(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error)
    }
    this.pending.clear()
  }
}

interface CdpMessage {
  id?: number
  method?: string
  params?: unknown
  result?: Record<string, unknown>
  error?: {
    message?: string
  }
  sessionId?: string
}

function parseCdpMessage(data: unknown): CdpMessage | null {
  const text = typeof data === 'string'
    ? data
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString('utf-8')
      : Buffer.isBuffer(data)
        ? data.toString('utf-8')
        : ''

  if (!text) {
    return null
  }

  try {
    const parsed = JSON.parse(text)
    return toRecord(parsed) as CdpMessage
  } catch {
    return null
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function appendLimitedOutput(current: string, nextChunk: string): string {
  const combined = `${current}${nextChunk}`
  return combined.length > MAX_CAPTURE_OUTPUT_CHARS
    ? combined.slice(-MAX_CAPTURE_OUTPUT_CHARS)
    : combined
}

function isMissingCommandError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Unknown error'
}
