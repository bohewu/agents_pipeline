import { Command } from 'commander';
import { APP_NAME, APP_VERSION, DEFAULT_HOST } from '../shared/constants.js';

export interface CliArgs {
  host: string;
  port: string;
  open: boolean;
  workspace?: string;
  debug: boolean;
  managedAutostart: boolean;
  opencodeConfigDir?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const normalizedArgv = argv.filter((arg, index) => !(arg === '--' && index > 1));
  const program = new Command();

  program
    .name(APP_NAME)
    .version(APP_VERSION)
    .option('--host <host>', 'Host to bind to', DEFAULT_HOST)
    .option('--port <port>', 'Port number or "auto"', 'auto')
    .option('--open', 'Open browser on start', true)
    .option('--no-open', 'Do not open browser')
    .option('--workspace <path>', 'Initial workspace path')
    .option('--debug', 'Enable debug logging', false)
    .option('--no-managed-autostart', 'Disable managed server autostart')
    .option('--opencode-config-dir <path>', 'OpenCode config directory override')
    .parse(normalizedArgv);

  const opts = program.opts();

  return {
    host: opts.host ?? DEFAULT_HOST,
    port: opts.port ?? 'auto',
    open: opts.open ?? true,
    workspace: opts.workspace,
    debug: opts.debug ?? false,
    managedAutostart: opts.managedAutostart ?? true,
    opencodeConfigDir: opts.opencodeConfigDir,
  };
}
