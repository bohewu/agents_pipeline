import type { Context } from 'hono';
import { fail } from '../create-server.js';

export function errorHandler(err: Error, c: Context) {
  console.error('[opencode-codex-web] unhandled error:', err);
  return c.json(fail('INTERNAL_ERROR', err.message || 'Internal server error'), 500);
}
