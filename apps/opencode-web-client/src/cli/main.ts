import { parseArgs } from './args.js';
import { openBrowser } from './open-browser.js';
import { setupShutdown } from './shutdown.js';
import { fileURLToPath } from 'node:url';
import { createApp, startServer } from '../server/create-server.js';
import { resolveAppPaths } from '../server/services/app-paths.js';
import { discoverOpenCodeBinary } from '../server/services/opencode-binary.js';
import { WorkspaceRegistry } from '../server/services/workspace-registry.js';
import { ManagedServerManager } from '../server/services/managed-server-manager.js';
import { OpenCodeClientFactory } from '../server/services/opencode-client-factory.js';
import { SessionService } from '../server/services/session-service.js';
import { EffortService } from '../server/services/effort-service.js';
import { UsageService } from '../server/services/usage-service.js';
import { ConfigService } from '../server/services/config-service.js';
import { DiffService } from '../server/services/diff-service.js';
import { FileService } from '../server/services/file-service.js';
import { PermissionRegistry } from '../server/services/permission-registry.js';
import { EventBroker } from '../server/services/event-broker.js';
import { WorkspaceCapabilityProbeService } from '../server/services/workspace-capability-probe.js';
import { VerificationService } from '../server/services/verification-service.js';
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

  // Discover opencode binary
  const binaryInfo = discoverOpenCodeBinary();
  const binaryPath = binaryInfo.binaryPath ?? 'opencode';
  const packagedProviderUsagePath = fileURLToPath(new URL('../../assets/tools/provider-usage.py', import.meta.url));

  if (args.debug) {
    console.log(`[${APP_NAME}] opencode binary: ${binaryInfo.found ? binaryPath : 'NOT FOUND'}`);
    console.log(`[${APP_NAME}] workspace registry: ${appPaths.workspaceRegistryFile}`);
  }

  // Instantiate all services
  const registry = new WorkspaceRegistry(appPaths.workspaceRegistryFile);
  const serverManager = new ManagedServerManager(binaryPath);
  const clientFactory = new OpenCodeClientFactory(serverManager);
  const sessionService = new SessionService(clientFactory);
  const effortService = new EffortService();
  const usageService = new UsageService(appPaths.installManifestFile, packagedProviderUsagePath);
  const configService = new ConfigService(clientFactory);
  const diffService = new DiffService(clientFactory);
  const fileService = new FileService();
  const permissionRegistry = new PermissionRegistry(clientFactory);
  const eventBroker = new EventBroker(serverManager);
  const capabilityProbeService = new WorkspaceCapabilityProbeService();
  const verificationService = new VerificationService(appPaths, clientFactory, eventBroker);

  const serverOptions = {
    host: args.host,
    port,
    appPaths,
    opencodeConfigDir: args.opencodeConfigDir,
    debug: args.debug,
  };

  const app = createApp(serverOptions, {
    registry,
    serverManager,
    clientFactory,
    sessionService,
    effortService,
    usageService,
    configService,
    diffService,
    fileService,
    permissionRegistry,
    eventBroker,
    capabilityProbeService,
    verificationService,
  });

  const server = startServer(app, serverOptions);

  setupShutdown(server, APP_NAME, async () => {
    // Graceful shutdown: stop all managed servers and event broker
    eventBroker.shutdown();
    await serverManager.stopAll();
  });

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
