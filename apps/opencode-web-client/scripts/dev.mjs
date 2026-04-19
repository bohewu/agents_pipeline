import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import getPort from 'get-port';

const rootDir = process.cwd();
const backendPort = await getPort({
  port: Array.from({ length: 20 }, (_, index) => 3456 + index),
});
const backendUrl = `http://127.0.0.1:${backendPort}`;

console.log(`[dev] backend target ${backendUrl}`);

const children = [];

const backendChild = spawnWithPrefix(resolveBin('tsx'), ['watch', 'src/cli/main.ts', '--port', String(backendPort), '--no-open'], {
    env: process.env,
  }, '[1]');

children.push(backendChild);

await waitForBackendReady(backendUrl, backendChild);

children.push(spawnWithPrefix(resolveBin('vite'), [], {
  env: {
    ...process.env,
    OPENCODE_WEB_DEV_BACKEND_URL: backendUrl,
  },
}, '[0]'));

let shuttingDown = false;

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill('SIGTERM');
      }
    }
    process.exitCode = signal ? 1 : (code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  });
}

function resolveBin(name) {
  return path.resolve(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function spawnWithPrefix(command, args, options, prefix) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(prefixChunk(prefix, chunk));
  });

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(prefixChunk(prefix, chunk));
  });

  return child;
}

function prefixChunk(prefix, chunk) {
  const text = chunk.toString();
  return text
    .split(/\n/)
    .map((line, index, lines) => {
      if (index === lines.length - 1 && line === '') return '';
      return `${prefix} ${line}`;
    })
    .join('\n');
}

async function waitForBackendReady(url, child) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`[dev] backend exited before becoming ready (${child.exitCode})`);
    }

    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Backend not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`[dev] backend did not become ready within 30s (${url})`);
}
