import { parseArgs } from './args.js';
import { openBrowser } from './open-browser.js';
import { setupShutdown } from './shutdown.js';
import { createApp, startServer } from '../server/create-server.js';
import { resolveAppPaths } from '../server/services/app-paths.js';
import { APP_NAME } from '../shared/constants.js';

async function main() {
  const args = parseArgs(process.argv);
  const appPaths = resolveAppPaths();

  // Resolve port
  let port: number;
  if (args.port === 'auto') {
    const { default: getPort } = await import('get-port');
    port = await getPort({ port: 3456 });
  } else {
    port = parseInt(args.port, 10);
    if (isNaN(port)) {
      console.error(`Invalid port: ${args.port}`);
      process.exit(1);
    }
  }

  const app = createApp({
    host: args.host,
    port,
    appPaths,
    opencodeConfigDir: args.opencodeConfigDir,
    debug: args.debug,
  });

  const server = startServer(app, {
    host: args.host,
    port,
    appPaths,
    opencodeConfigDir: args.opencodeConfigDir,
    debug: args.debug,
  });

  setupShutdown(server, APP_NAME);

  const url = `http://${args.host}:${port}`;
  console.log(`[${APP_NAME}] listening on ${url}`);

  if (args.open) {
    await openBrowser(url).catch((err) => {
      if (args.debug) console.warn(`[${APP_NAME}] failed to open browser:`, err);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
