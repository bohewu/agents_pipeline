import type { Server } from 'node:http';

export function setupShutdown(server: { close: () => void }, label: string): void {
  const shutdown = () => {
    console.log(`\n[${label}] shutting down…`);
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
