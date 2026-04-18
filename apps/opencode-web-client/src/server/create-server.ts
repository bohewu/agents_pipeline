import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ApiEnvelope } from '../shared/types.js';
import { API_PREFIX } from '../shared/constants.js';
import { healthRoute } from './routes/health.js';
import { diagnosticsRoute } from './routes/diagnostics.js';
import { WorkspacesRoute } from './routes/workspaces.js';
import { SessionsRoute } from './routes/sessions.js';
import { MessagesRoute } from './routes/messages.js';
import { PermissionsRoute } from './routes/permissions.js';
import { FilesRoute, DiffRoute } from './routes/files.js';
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
import type { DiffService } from './services/diff-service.js';
import type { FileService } from './services/file-service.js';
import type { PermissionRegistry } from './services/permission-registry.js';
import type { EventBroker } from './services/event-broker.js';

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
  diffService: DiffService;
  fileService: FileService;
  permissionRegistry: PermissionRegistry;
  eventBroker: EventBroker;
}

export function createApp(options: ServerOptions, deps?: ServerDeps): Hono {
  const app = new Hono();

  // Global error handler
  app.onError(errorHandler);

  // API routes
  const api = new Hono();
  api.route('/health', healthRoute());
  api.route('/diagnostics', diagnosticsRoute(options));

  // Mount workspace routes (if deps provided)
  if (deps) {
    const { registry, serverManager, clientFactory, sessionService, effortService, usageService, diffService, fileService, permissionRegistry, eventBroker } = deps;

    // Workspace CRUD (no workspace scope middleware needed)
    api.route('/workspaces', WorkspacesRoute({ registry, serverManager, clientFactory }));

    // SSE events (workspace via query param, no middleware)
    api.route('/events', EventsRoute({ eventBroker }));

    // Workspace-scoped routes
    const wsScoped = new Hono<any>();
    wsScoped.use('/*', workspaceScope(registry));

    // Sessions
    wsScoped.route('/sessions', SessionsRoute({ sessionService }));

    // Session-scoped routes (messages, permissions, diff)
    const sessionScoped = new Hono<any>();

    // Messages
    sessionScoped.get('/messages', async (c) => {
      const messagesRoute = MessagesRoute({ clientFactory });
      return messagesRoute.fetch(c.req.raw, c.env);
    });

    // Mount message actions under sessions/:sessionId/
    const msgRoute = MessagesRoute({ clientFactory });
    wsScoped.get('/sessions/:sessionId/messages', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        const messages = await client.listMessages(sessionId);
        return c.json(ok(messages));
      } catch (err: any) {
        return c.json(fail('LIST_MESSAGES_FAILED', err.message), 500);
      }
    });

    wsScoped.post('/sessions/:sessionId/chat', async (c) => {
      const workspaceId = c.get('workspaceId') as string;
      const sessionId = c.req.param('sessionId');
      const body = await c.req.json<{ text: string }>().catch(() => ({ text: '' }));
      if (!body.text) {
        return c.json(fail('INVALID_INPUT', 'text is required'), 400);
      }
      try {
        const client = clientFactory.forWorkspace(workspaceId);
        await client.chat(sessionId, body.text);
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
    wsScoped.route('/files', FilesRoute({ diffService, fileService }));

    // Effort
    wsScoped.route('/effort', EffortRoute({ effortService }));

    // Usage
    wsScoped.route('/usage', UsageRoute({ usageService }));

    // Mount workspace-scoped routes
    api.route('/workspaces/:workspaceId', wsScoped);
  }

  // Mount API
  app.route(API_PREFIX, api);

  // Serve static client assets (production)
  app.use(
    '/*',
    serveStatic({ root: options.appPaths.clientStaticDir })
  );

  // SPA fallback
  app.get('*', (c) => {
    return c.html('<!doctype html><html><body><div id="root"></div><script type="module" src="/src/client/main.tsx"></script></body></html>');
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
