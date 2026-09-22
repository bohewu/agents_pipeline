"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { LOCAL_FILE, fail, gitText, gitDir, gitConfig, readLocal, regularFile, repository } = require("./common");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function quote(value) {
  if (/[\x00-\x1f\x7f]/.test(value)) fail(3, "Runtime and tool paths cannot contain control characters.");
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function hooksFor(node, entry) {
  const executable = quote(process.platform === "win32" ? node.replace(/\\/g, "/") : node);
  const script = quote(process.platform === "win32" ? entry.replace(/\\/g, "/") : entry);
  const make = scope => `#!/bin/sh\n# agents_pipeline commit-guard v1 (managed; do not edit)\nexec ${executable} ${script} check ${scope}${scope === "--staged" ? " --consume-policy-ack" : ""}\n`;
  return { "pre-commit": make("--staged"), "pre-push": make("--pre-push") };
}
function noLinks(file) {
  let current = path.resolve(file);
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) fail(3, "Hook installation refuses path redirections."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function layout(cwd) {
  cwd = repository(cwd);
  if (gitConfig(cwd, "core.hooksPath") !== null) fail(3, "An existing core.hooksPath is configured; compose hooks manually instead of overwriting it.");
  const dir = gitDir(cwd);
  const common = gitText(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const worktrees = gitText(cwd, ["worktree", "list", "--porcelain"]).split("\n").filter(v => v.startsWith("worktree "));
  if (path.resolve(dir) !== path.resolve(common) || worktrees.length !== 1) fail(3, "Automatic hook installation does not support shared linked worktrees; use explicit checks.");
  const hooks = path.join(dir, "hooks");
  noLinks(hooks);
  noLinks(path.join(dir, LOCAL_FILE));
  return { cwd, dir, hooks };
}
function install(cwd, opts, entry) {
  if (!opts.localOnly || !opts.profile) fail(3, "Install requires --local-only and an explicit --profile.");
  const loc = layout(cwd);
  const previous = readLocal(loc.cwd);
  const scripts = hooksFor(process.execPath, path.resolve(entry));
  const record = { version: 1, profile: opts.profile, engine: opts.engine || "builtin", node: process.execPath, entry: path.resolve(entry), hooks: Object.fromEntries(Object.entries(scripts).map(([name, value]) => [name, hash(value)])) };
  const changes = [];
  for (const [name, content] of Object.entries(scripts)) {
    const file = path.join(loc.hooks, name);
    const stat = regularFile(file);
    const old = stat ? fs.readFileSync(file) : null;
    if (old && (!previous || hash(old) !== previous.hooks[name])) fail(3, "An existing hook is not an unchanged Commit Guard hook; no installation changes were made.");
    changes.push({ file, content: Buffer.from(content), old, oldMode: stat?.mode, mode: 0o755 });
  }
  const metadata = path.join(loc.dir, LOCAL_FILE);
  const metadataStat = regularFile(metadata);
  changes.push({ file: metadata, content: Buffer.from(JSON.stringify(record, null, 2) + "\n"), old: metadataStat ? fs.readFileSync(metadata) : null, oldMode: metadataStat?.mode, mode: 0o600 });
  const pending = changes.filter(c => !c.old || !c.old.equals(c.content) || (process.platform !== "win32" && (c.oldMode & 0o777) !== c.mode));
  if (!pending.length) return { status: "pass", installed: true, changed: false, profile: record.profile, engine: record.engine };
  const createdDirectory = !fs.existsSync(loc.hooks);
  const published = [];
  const temporary = [];
  try {
    if (createdDirectory) fs.mkdirSync(loc.hooks, { mode: 0o700 });
    for (const change of pending) {
      change.temp = path.join(path.dirname(change.file), `.commit-guard-write-${crypto.randomBytes(12).toString("hex")}`);
      fs.writeFileSync(change.temp, change.content, { mode: change.mode, flag: "wx" });
      temporary.push(change.temp);
      if (process.platform !== "win32") fs.chmodSync(change.temp, change.mode);
    }
    for (const change of changes) {
      noLinks(change.file);
      const current = regularFile(change.file) ? fs.readFileSync(change.file) : null;
      if ((current === null) !== (change.old === null) || (current && !current.equals(change.old))) fail(2, "Hook files changed during installation; no concurrent changes were overwritten.");
    }
    for (const change of pending) { fs.renameSync(change.temp, change.file); published.push(change); }
  } catch {
    let rollbackFailed = false;
    for (const change of published.reverse()) {
      try {
        if (change.old === null) fs.unlinkSync(change.file);
        else { fs.writeFileSync(change.file, change.old); if (process.platform !== "win32") fs.chmodSync(change.file, change.oldMode & 0o777); }
      } catch { rollbackFailed = true; }
    }
    fail(2, rollbackFailed ? "Hook installation failed and rollback was incomplete; inspect local hooks before use." : "Hook installation failed; completed writes were rolled back.");
  } finally {
    for (const file of temporary) { try { fs.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; } }
    if (createdDirectory && !published.length) { try { fs.rmdirSync(loc.hooks); } catch {} }
  }
  return { status: "pass", installed: true, changed: true, profile: record.profile, engine: record.engine };
}
function doctor(cwd) {
  const loc = layout(cwd);
  const record = readLocal(loc.cwd);
  const result = { status: "warn", installed: Boolean(record), hooks: {}, runtime_available: false, tool_available: false };
  if (!record) return result;
  const runtime = regularFile(record.node);
  if (runtime) {
    if (process.platform === "win32") result.runtime_available = true;
    else {
      try { fs.accessSync(record.node, fs.constants.X_OK); result.runtime_available = true; }
      catch { result.runtime_available = false; }
    }
  }
  result.tool_available = Boolean(regularFile(record.entry));
  const expected = hooksFor(record.node, record.entry);
  for (const name of ["pre-commit", "pre-push"]) {
    const file = path.join(loc.hooks, name);
    const stat = regularFile(file);
    result.hooks[name] = Boolean(stat && hash(fs.readFileSync(file)) === record.hooks[name] && hash(expected[name]) === record.hooks[name] && (process.platform === "win32" || (stat.mode & 0o111)));
  }
  result.status = result.runtime_available && result.tool_available && Object.values(result.hooks).every(Boolean) ? "pass" : "warn";
  return result;
}
module.exports = { install, doctor, hooksFor, layout };
