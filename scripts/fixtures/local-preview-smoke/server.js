#!/usr/bin/env node

const fs = require("fs/promises");
const http = require("http");

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const host = process.env.HOST || readArg("host") || "127.0.0.1";
const rawPort = process.env.PORT || readArg("port") || "4173";
const pidFile = process.env.PID_FILE || readArg("pid-file");
const port = Number.parseInt(rawPort, 10);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${rawPort}`);
}

let shuttingDown = false;

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end(`local-preview-smoke ${request.method} ${request.url} pid=${process.pid}\n`);
});

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`received ${signal}, shutting down pid=${process.pid}`);

  const forceExit = setTimeout(() => {
    process.exit(1);
  }, 5000);
  forceExit.unref();

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error(error.message);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
}

server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, async () => {
  try {
    if (pidFile) {
      await fs.writeFile(pidFile, `${process.pid}\n`, "utf8");
    }
    console.log(`listening http://${host}:${port}/ pid=${process.pid}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
