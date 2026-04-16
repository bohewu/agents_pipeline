#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs/promises");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURE_DIR = path.join(__dirname, "fixtures", "local-preview-smoke");
const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 15000;
const STOP_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 200;
const PYTHON_CANDIDATES = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureChild(child, label) {
  const stdout = [];
  const stderr = [];
  const errors = [];

  if (child.stdout) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
  }
  if (child.stderr) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr.push(chunk));
  }
  child.on("error", (error) => errors.push(error));

  return {
    label,
    child,
    stdout,
    stderr,
    errors,
    render() {
      return [
        `${label} pid: ${child.pid ?? "unknown"}`,
        `${label} stdout:\n${stdout.join("").trim() || "<empty>"}`,
        `${label} stderr:\n${stderr.join("").trim() || "<empty>"}`,
        `${label} child errors:\n${errors.map((error) => error.message).join("\n") || "<empty>"}`
      ].join("\n");
    }
  };
}

function formatError(error, captures = []) {
  const parts = [error.message];
  for (const capture of captures.filter(Boolean)) {
    parts.push(capture.render());
  }
  return new Error(parts.join("\n\n"));
}

function resolvePythonCommand() {
  for (const [command, prefix] of PYTHON_CANDIDATES) {
    const probe = spawnSync(command, [...prefix, "--version"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    if (!probe.error && probe.status === 0) {
      return { command, prefix };
    }
  }
  throw new Error("Could not find python3/python runtime required for local-preview smoke validation.");
}

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function throwIfChildErrored(capture) {
  if (capture?.errors?.length) {
    throw capture.errors[0];
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    if (error.code === "EPERM") {
      return true;
    }
    throw error;
  }
}

function terminatePid(pid, label) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/F"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    if (result.status === 0) {
      return true;
    }

    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (/not found|no running instance|cannot find/i.test(combined)) {
      return false;
    }

    throw new Error(`Failed to stop ${label} pid ${pid}.\n${combined.trim()}`);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    throw new Error(`Failed to stop ${label} pid ${pid}: ${error.message}`);
  }
  return true;
}

async function forceTerminatePid(pid, label) {
  if (!terminatePid(pid, label)) {
    return;
  }

  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!processExists(pid)) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw new Error(`Failed to SIGKILL ${label} pid ${pid}: ${error.message}`);
      }
    }
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not determine a free localhost port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function probeUrl(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = http.get(url, (response) => {
      response.resume();
      finish({ reachable: true, statusCode: response.statusCode ?? 0 });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", () => {
      finish({ reachable: false, statusCode: null });
    });
  });
}

function isPortListening(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host: HOST, port });
    const finish = (result) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

async function waitFor(condition, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastState = "no observation";

  while (Date.now() < deadline) {
    const { ok, state, value } = await condition();
    lastState = state;
    if (ok) {
      return value;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms. Last observation: ${lastState}`);
}

async function waitForReachable(url) {
  return waitFor(async () => {
    const probe = await probeUrl(url);
    return {
      ok: probe.reachable && probe.statusCode >= 200 && probe.statusCode < 400,
      state: probe.reachable ? `HTTP ${probe.statusCode}` : "unreachable",
      value: probe
    };
  }, START_TIMEOUT_MS, `URL reachability check for ${url}`);
}

async function waitForUnreachable(url) {
  return waitFor(async () => {
    const probe = await probeUrl(url);
    return {
      ok: !probe.reachable,
      state: probe.reachable ? `HTTP ${probe.statusCode}` : "unreachable",
      value: probe
    };
  }, STOP_TIMEOUT_MS, `URL teardown check for ${url}`);
}

async function waitForPortOpen(port) {
  return waitFor(async () => {
    const listening = await isPortListening(port);
    return {
      ok: listening,
      state: listening ? `port ${port} listening` : `port ${port} closed`,
      value: listening
    };
  }, START_TIMEOUT_MS, `Port-open check for ${port}`);
}

async function waitForPortClosed(port) {
  return waitFor(async () => {
    const listening = await isPortListening(port);
    return {
      ok: !listening,
      state: listening ? `port ${port} listening` : `port ${port} closed`,
      value: listening
    };
  }, STOP_TIMEOUT_MS, `Port-close check for ${port}`);
}

async function waitForPidFile(pidFile) {
  return waitFor(async () => {
    try {
      const raw = (await fs.readFile(pidFile, "utf8")).trim();
      const pid = Number.parseInt(raw, 10);
      return {
        ok: Number.isInteger(pid) && pid > 0,
        state: raw ? `pid file contains ${raw}` : "pid file empty",
        value: pid
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, state: "pid file missing", value: null };
      }
      throw error;
    }
  }, START_TIMEOUT_MS, `Listener pid-file check for ${pidFile}`);
}

async function runDirectPreviewScenario(python) {
  const port = await getFreePort();
  const url = `http://${HOST}:${port}/`;
  let child = null;
  let capture = null;
  let scenarioError = null;

  try {
    child = spawn(
      python.command,
      [...python.prefix, "-m", "http.server", String(port), "--bind", HOST],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    capture = captureChild(child, "direct-preview");
    await sleep(POLL_INTERVAL_MS);
    throwIfChildErrored(capture);

    assert(child.pid, "Direct preview server did not report a child pid.");
    await waitForReachable(url);
    await waitForPortOpen(port);
    console.log(`OK direct preview reachable before browser step: ${url}`);
  } catch (error) {
    scenarioError = formatError(error, [capture]);
  } finally {
    try {
      if (child?.pid && processExists(child.pid)) {
        await forceTerminatePid(child.pid, "direct preview server");
      }
      await waitForUnreachable(url);
      await waitForPortClosed(port);
      console.log(`OK direct preview teardown verified: ${url} is unreachable and port ${port} is closed`);
    } catch (cleanupError) {
      const formatted = formatError(cleanupError, [capture]);
      if (scenarioError) {
        throw new Error(`${scenarioError.message}\n\nCleanup failure:\n${formatted.message}`);
      }
      throw formatted;
    }
  }

  if (scenarioError) {
    throw scenarioError;
  }

  console.log("OK scenario: direct-executable local preview lifecycle");
}

async function runNpmWrapperScenario() {
  const port = await getFreePort();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-preview-smoke-"));
  const pidFile = path.join(tempDir, "listener.pid");
  const url = `http://${HOST}:${port}/`;
  const npmCommand = resolveNpmCommand();
  const npmArgs = ["run", "start", "--", `--port=${port}`];
  let child = null;
  let capture = null;
  let listenerPid = null;
  let scenarioError = null;

  try {
    child = spawn(process.platform === "win32" ? `${npmCommand} ${npmArgs.join(" ")}` : npmCommand, process.platform === "win32" ? [] : npmArgs, {
      cwd: FIXTURE_DIR,
      env: {
        ...process.env,
        HOST,
        PORT: String(port),
        PID_FILE: pidFile
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    capture = captureChild(child, "npm-wrapper-preview");
    await sleep(POLL_INTERVAL_MS);
    throwIfChildErrored(capture);

    assert(child.pid, "npm wrapper preview did not report a child pid.");
    await waitForReachable(url);
    await waitForPortOpen(port);
    listenerPid = await waitForPidFile(pidFile);
    assert(processExists(listenerPid), `Listener pid ${listenerPid} was not alive when the pid file was read.`);

    console.log(`OK npm wrapper reachable before browser step: ${url}`);
    console.log(`INFO wrapper pid=${child.pid} listener pid=${listenerPid}`);

    await forceTerminatePid(child.pid, "npm wrapper process");
    const stillReachable = (await probeUrl(url)).reachable;
    const stillListening = await isPortListening(port);

    if (stillReachable || stillListening) {
      console.log("OK wrapper-only teardown was insufficient; listener-pid fallback was required");
      await forceTerminatePid(listenerPid, "listener fallback process");
    } else {
      console.log("OK wrapper-only teardown fully stopped the preview on this machine");
    }

    if (process.platform === "win32") {
      if (child.pid !== listenerPid) {
        console.log("OK Windows wrapper-PID caveat reproduced: npm.cmd pid differed from the real listener pid");
      } else {
        console.log("INFO Windows wrapper-PID caveat did not reproduce on this machine; fallback verification still ran");
      }
    }
  } catch (error) {
    scenarioError = formatError(error, [capture]);
  } finally {
    try {
      if (listenerPid && processExists(listenerPid)) {
        await forceTerminatePid(listenerPid, "listener fallback process");
      }
      if (child?.pid && processExists(child.pid)) {
        await forceTerminatePid(child.pid, "npm wrapper process");
      }
      await waitForUnreachable(url);
      await waitForPortClosed(port);
      console.log(`OK npm wrapper teardown verified: ${url} is unreachable and port ${port} is closed`);
    } catch (cleanupError) {
      const formatted = formatError(cleanupError, [capture]);
      if (scenarioError) {
        throw new Error(`${scenarioError.message}\n\nCleanup failure:\n${formatted.message}`);
      }
      throw formatted;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  if (scenarioError) {
    throw scenarioError;
  }

  console.log("OK scenario: npm-wrapper local preview lifecycle");
}

async function main() {
  const python = resolvePythonCommand();
  console.log(`INFO using python command: ${python.command} ${python.prefix.join(" ")}`.trim());
  console.log(`INFO using npm command: ${resolveNpmCommand()}`);
  await runDirectPreviewScenario(python);
  await runNpmWrapperScenario();
  console.log("OK local-preview lifecycle smoke validation completed");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
