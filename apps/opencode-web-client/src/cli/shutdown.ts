import type { Server } from 'node:http';

export function setupShutdown(
  server: { close: () => void },
  label: string,
  cleanup?: () => Promise<void> | void,
): void {
  const shutdown = async () => {
    console.log(`\n[${label}] shutting down…`);
    if (cleanup) {
      try {
        await cleanup();
      } catch (err) {
        console.error(`[${label}] cleanup error:`, err);
      }
    }
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
