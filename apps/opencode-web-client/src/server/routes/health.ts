import { Hono } from 'hono';
import { APP_VERSION } from '../../shared/constants.js';
import { ok } from '../create-server.js';

const startTime = Date.now();

export function healthRoute(): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    return c.json(
      ok({
        ok: true,
        version: APP_VERSION,
        uptimeMs: Date.now() - startTime,
      })
    );
  });

  return route;
}
