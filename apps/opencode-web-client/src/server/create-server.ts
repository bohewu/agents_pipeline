import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiEnvelope } from '../shared/types.js';
import { API_PREFIX } from '../shared/constants.js';
import { healthRoute } from './routes/health.js';
import { diagnosticsRoute } from './routes/diagnostics.js';
import { fsBrowseRoute } from './routes/fs-browse.js';
import { WorkspacesRoute } from './routes/workspaces.js';
import { SessionsRoute } from './routes/sessions.js';
import { FilesRoute } from './routes/files.js';
import { GitRoute } from './routes/git.js';
import { EffortRoute } from './routes/effort.js';
import { UsageRoute } from './routes/usage.js';
import { EventsRoute } from './routes/events.js';
import { errorHandler } from './middleware/error-handler.js';
import { workspaceScope } from './middleware/workspace-scope.js';
import type { AppPaths } from './services/app-paths.js';
import type { WorkspaceRegistry } from './services/workspace-registry.js';
import type { ManagedServerManager } from './services/managed-server-manager.js';
import type { OpenCodeClientFactory } from './services/opencode-client-factory.js';
import type { SessionService } from './services/session-service.js';
import type { EffortService } from './services/effort-service.js';
import type { UsageService } from './services/usage-service.js';
import type { ConfigService } from './services/config-service.js';
import type { DiffService } from './services/diff-service.js';
import type { FileService } from './services/file-service.js';
import type { PermissionRegistry } from './services/permission-registry.js';
import type { EventBroker } from './services/event-broker.js';
import type { WorkspaceCapabilityProbeService } from './services/workspace-capability-probe.js';
import type { WorkspaceShipService } from './services/workspace-ship-service.js';
import type { VerificationService } from './services/verification-service.js';

export interface ServerOptions {
  host: string;
  port: number;
  appPaths: AppPaths;
  opencodeConfigDir?: string;
  debug?: boolean;
}

export interface ServerDeps {
  registry: WorkspaceRegistry;
  serverManager: ManagedServerManager;
  clientFactory: OpenCodeClientFactory;
  sessionService: SessionService;
  effortService: EffortService;
  usageService: UsageService;
  configService: ConfigService;
  diffService: DiffService;
  fileService: FileService;
  permissionRegistry: PermissionRegistry;
  eventBroker: EventBroker;
  capabilityProbeService: WorkspaceCapabilityProbeService;
  workspaceShipService: WorkspaceShipService;
  verificationService: VerificationService;
}

interface ClientBundleResolution {
  staticDir?: string;
  indexHtml?: string;
  viteOrigin?: string;
}

function resolveClientBundle(appPaths: AppPaths): ClientBundleResolution {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const staticCandidates = [
    appPaths.clientStaticDir,
    path.resolve(moduleDir, '../client'),
    path.resolve(moduleDir, '../../dist/client'),
  ];

  for (const candidate of staticCandidates) {
    const indexPath = path.join(candidate, 'index.html');
    if (existsSync(indexPath)) {
      return {
        staticDir: candidate,
        indexHtml: readFileSync(indexPath, 'utf-8'),
      };
    }
  }

  const sourceEntry = path.resolve(moduleDir, '../../src/client/main.tsx');
  if (existsSync(sourceEntry)) {
    return {
      viteOrigin: process.env.OPENCODE_WEB_VITE_ORIGIN ?? 'http://127.0.0.1:5173',
    };
  }

  return {};
}

function renderClientFallback(bundle: ClientBundleResolution): string {
  if (bundle.indexHtml) {
    return bundle.indexHtml;
  }

  if (bundle.viteOrigin) {
    return [
      '<!doctype html>',
      '<html>',
      '<body>',
      '<div id="root"></div>',
      `<script type="module" src="${bundle.viteOrigin}/@vite/client"></script>`,
      `<script type="module" src="${bundle.viteOrigin}/src/client/main.tsx"></script>`,
      '</body>',
      '</html>',
    ].join('');
  }

  return [
    '<!doctype html>',
    '<html>',
    '<body>',
    '<div id="root">OpenCode Web client assets are missing. Rebuild or reinstall the web client.</div>',
    '</body>',
    '</html>',
  ].join('');
}

export function createApp(options: ServerOptions, deps?: ServerDeps): Hono {
  const app = new Hono();
  const clientBundle = resolveClientBundle(options.appPaths);

  // Global error handler
  app.onError(errorHandler);

  // API routes
  const api = new Hono();
  api.route('/health', healthRoute());
  api.route('/diagnostics', diagnosticsRoute(options));
  api.route('/fs', fsBrowseRoute());

  // Mount workspace routes (if deps provided)
  if (deps) {
      const { registry, serverManager, clientFactory, sessionService, effortService, usageService, configService, diffService, fileService, permissionRegistry, eventBroker, capabilityProbeService, workspaceShipService, verificationService } = deps;

      // Workspace CRUD (no workspace scope middleware needed)
      api.route('/workspaces', WorkspacesRoute({ registry, serverManager, clientFactory, configService, effortService, capabilityProbeService, workspaceShipService, verificationService }));

    // SSE events (workspace via query param, no middleware)
    api.route('/events', EventsRoute({ eventBroker }));

    // Workspace-scoped routes
    const wsScoped = new Hono<any>();
    wsScoped.use('/*', workspaceScope(registry));

    // Sessions
    wsScoped.route('/sessions', SessionsRoute({ sessionService }));

    wsScoped.get('/sessions/:sessionId/messages', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
        try {
          const client = clientFactory.forWorkspace(workspaceId);
          const messages = verificationService.decorateMessages(
            workspaceId,
            sessionId,
            await client.listMessages(sessionId),
          );
          return c.json(ok(messages));
        } catch (err: any) {
          return c.json(fail('LIST_MESSAGES_FAILED', err.message), 500);
        }
      });

      wsScoped.get('/verify/runs', async (c) => {
        const workspaceId = c.get('workspaceId') as string;
        return c.json(ok(verificationService.listRuns(workspaceId)));
      });

      wsScoped.post('/verify/run', async (c) => {
        const workspaceId = c.get('workspaceId') as string;
        const workspace = c.get('workspace') as { rootPath: string } | undefined;
        const body = await c.req.json<{
          sessionId?: string;
          commandKind?: 'lint' | 'build' | 'test';
          sourceMessageId?: string;
          taskId?: string;
        }>().catch(() => ({
          sessionId: undefined,
          commandKind: undefined,
          sourceMessageId: undefined,
          taskId: undefined,
        }));
        if (!workspace?.rootPath) {
          return c.json(fail('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`), 404);
        }
        if (!body.sessionId) {
          return c.json(fail('INVALID_INPUT', 'sessionId is required'), 400);
        }
        if (!body.commandKind || !['lint', 'build', 'test'].includes(body.commandKind)) {
          return c.json(fail('INVALID_INPUT', 'commandKind must be lint, build, or test'), 400);
        }

        try {
          const run = await verificationService.runPreset({
            workspaceId,
            workspaceRoot: workspace.rootPath,
            sessionId: body.sessionId,
            commandKind: body.commandKind,
            sourceMessageId: body.sourceMessageId,
            taskId: body.taskId,
          });
          return c.json(ok(run));
        } catch (err: any) {
          return c.json(fail('VERIFY_RUN_FAILED', err.message), 500);
        }
      });

      wsScoped.post('/sessions/:sessionId/chat', async (c) => {
        const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      const body = await c.req.json<{
        text: string;
        providerId?: string;
        modelId?: string;
        agentId?: string;
        effort?: string;
      }>().catch(() => ({ text: '', providerId: undefined, modelId: undefined, agentId: undefined, effort: undefined }));
      if (!body.text) {
        return c.json(fail('INVALID_INPUT', 'text is required'), 400);
      }
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        await client.chat(sessionId, body.text, {
          providerId: body.providerId,
          modelId: body.modelId,
          agentId: body.agentId,
          effort: body.effort,
        });
        return c.json(ok({ accepted: true, sessionId }));
      } catch (err: any) {
        return c.json(fail('CHAT_FAILED', err.message), 500);
      }
    });

    wsScoped.post('/sessions/:sessionId/command', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      const body = await c.req.json<{ command: string; args?: Record<string, unknown> }>();
      if (!body.command) {
        return c.json(fail('INVALID_INPUT', 'command is required'), 400);
      }
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        const result = await client.command(sessionId, body.command, body.args);
        return c.json(ok(result));
      } catch (err: any) {
        return c.json(fail('COMMAND_FAILED', err.message), 500);
      }
    });

    wsScoped.post('/sessions/:sessionId/shell', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      const body = await c.req.json<{ command: string }>();
      if (!body.command) {
        return c.json(fail('INVALID_INPUT', 'command is required'), 400);
      }
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        const result = await client.shell(sessionId, body.command);
        return c.json(ok(result));
      } catch (err: any) {
        return c.json(fail('SHELL_FAILED', err.message), 500);
      }
    });

    wsScoped.post('/sessions/:sessionId/abort', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        await client.abort(sessionId);
        return c.json(ok({ aborted: true }));
      } catch (err: any) {
        return c.json(fail('ABORT_FAILED', err.message), 500);
      }
    });

    // Permissions
    wsScoped.get('/sessions/:sessionId/permissions', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      const permissions = permissionRegistry.getPending(workspaceId, sessionId);
      return c.json(ok(permissions));
    });

    wsScoped.post('/sessions/:sessionId/permissions/:permissionId', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const permissionId = c.req.param('permissionId');
      const body = await c.req.json<{ decision: 'allow' | 'allow_remember' | 'deny' }>();
      if (!body.decision || !['allow', 'allow_remember', 'deny'].includes(body.decision)) {
        return c.json(fail('INVALID_INPUT', 'decision must be allow, allow_remember, or deny'), 400);
      }
      try {
        const result = await permissionRegistry.resolve(workspaceId, permissionId, body.decision);
        return c.json(ok(result ?? { resolved: true, permissionId }));
      } catch (err: any) {
        return c.json(fail('RESOLVE_PERMISSION_FAILED', err.message), 500);
      }
    });

    // Diff (session-scoped)
    wsScoped.get('/sessions/:sessionId/diff', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      try {
        const diffs = await diffService.getDiff(workspaceId, sessionId);
        return c.json(ok(diffs));
      } catch (err: any) {
        return c.json(fail('DIFF_FAILED', err.message), 500);
      }
    });

    // Files
    wsScoped.route('/files', FilesRoute({ fileService }));

    // Git / ship contracts
    wsScoped.route('/git', GitRoute({ workspaceShipService }));

    // Effort
    wsScoped.route('/effort', EffortRoute({ effortService }));

    // Usage
    wsScoped.route('/usage', UsageRoute({ usageService }));

    // Mount workspace-scoped routes
    api.route('/workspaces/:workspaceId', wsScoped);
  }

  // Mount API
  app.route(API_PREFIX, api);

  if (clientBundle.staticDir) {
    app.use(
      '/*',
      serveStatic({ root: clientBundle.staticDir })
    );
  }

  // SPA fallback
  app.get('*', (c) => {
    return c.html(renderClientFallback(clientBundle));
  });

  return app;
}

export function startServer(app: Hono, options: ServerOptions): ReturnType<typeof serve> {
  const server = serve({
    fetch: app.fetch,
    hostname: options.host,
    port: options.port,
  });

  if (options.debug) {
    console.log(`[opencode-codex-web] listening on http://${options.host}:${options.port}`);
  }

  return server;
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): ApiEnvelope<never> {
  return { ok: false, error: { code, message } };
}
