"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");

const POLICY_FILE = ".commit-guard.json";
const LOCAL_FILE = "commit-guard-local.json";
const POLICY_ACK_FILE = "commit-guard-policy-ack.json";
const PROFILES = ["audit", "legacy-ratchet", "strict"];
const ENGINES = ["builtin", "gitleaks-required"];
const LIMITS = Object.freeze({ blob: 2 * 1024 * 1024, output: 32 * 1024 * 1024, commits: 200, files: 2000, findings: 2000 });

class GuardError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fail(code, message) { throw new GuardError(code, message); }
function utf8(buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { fail(2, "Non-UTF-8 Git metadata is unsupported; nothing was approved."); }
}
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: null, timeout: 15000, maxBuffer: LIMITS.output,
    windowsHide: true, ...options
  });
  if (result.error || result.signal || !Number.isInteger(result.status)) {
    fail(2, "A required command could not complete (missing runtime, timeout, or output limit).");
  }
  return result;
}
function git(cwd, args, accepted = [0]) {
  const result = command("git", ["--no-pager", "-c", "core.fsmonitor=false", ...args], { cwd });
  if (!accepted.includes(result.status)) fail(2, "Git could not resolve the requested repository, objects, or index.");
  return result;
}
function gitText(cwd, args, accepted) { return utf8(git(cwd, args, accepted).stdout).trim(); }
function gitConfig(cwd, key) {
  const r = git(cwd, ["config", "--get", key], [0, 1]);
  return r.status === 1 ? null : utf8(r.stdout).trim();
}
function repository(cwd) {
  return gitText(cwd, ["rev-parse", "--show-toplevel"]);
}
function gitDir(cwd) { return gitText(cwd, ["rev-parse", "--absolute-git-dir"]); }
function head(cwd) {
  const r = git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"], [0, 1]);
  if (r.status === 0) return resolveCommit(cwd, utf8(r.stdout).trim());
  const ref = gitText(cwd, ["symbolic-ref", "-q", "HEAD"]);
  if (git(cwd, ["show-ref", "--verify", "--quiet", ref], [0, 1]).status !== 1) {
    fail(2, "HEAD is not a valid unborn branch.");
  }
  return null;
}
function isOid(value) { return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value); }
function resolveCommit(cwd, ref) {
  if (typeof ref !== "string" || !ref || /[\x00-\x20]/.test(ref)) fail(3, "Invalid commit reference.");
  const oid = gitText(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  if (!isOid(oid)) fail(2, "Git returned an invalid object identity.");
  return oid;
}
function tree(cwd, revision) {
  const result = new Map();
  if (!revision) return result;
  const rows = utf8(git(cwd, ["ls-tree", "-rz", "--full-tree", revision]).stdout).split("\0");
  for (const row of rows) {
    if (!row) continue;
    const tab = row.indexOf("\t");
    if (tab < 0) fail(2, "Malformed Git tree metadata.");
    const [mode, type, oid] = row.slice(0, tab).split(" ");
    const file = row.slice(tab + 1);
    if (!isOid(oid) || !file || file.startsWith("/") || file.split("/").includes("..")) fail(2, "Unsafe Git tree metadata.");
    result.set(file, { mode, type, oid });
  }
  return result;
}
function blob(cwd, entry) {
  if (!entry || entry.type !== "blob") return null;
  const size = Number(gitText(cwd, ["cat-file", "-s", entry.oid]));
  if (!Number.isSafeInteger(size) || size > LIMITS.blob) fail(2, "A blob exceeds the supported scan limit; narrow the scope or inspect it separately.");
  return git(cwd, ["cat-file", "blob", entry.oid]).stdout;
}
function parsePolicy(buffer) {
  let value;
  try { value = JSON.parse(utf8(buffer)); } catch (error) {
    if (error instanceof GuardError) throw error;
    fail(3, "Invalid Commit Guard policy JSON.");
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || value.version !== 1 ||
      Object.keys(value).some(k => !["version", "profile", "engine"].includes(k)) ||
      (value.profile !== undefined && !PROFILES.includes(value.profile)) ||
      (value.engine !== undefined && !ENGINES.includes(value.engine))) fail(3, "Unsupported Commit Guard policy fields or values.");
  return value;
}
function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(3, "Local Commit Guard metadata must be a regular file.");
    return stat;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof GuardError) throw error;
    fail(2, "Local Commit Guard metadata is not readable.");
  }
}
function readLocal(cwd) {
  const file = path.join(gitDir(cwd), LOCAL_FILE);
  const stat = regularFile(file);
  if (!stat) return null;
  if (stat.size > 32768) fail(3, "Local Commit Guard metadata exceeds its limit.");
  let v;
  try { v = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(3, "Invalid local Commit Guard metadata."); }
  if (!v || v.version !== 1 || !PROFILES.includes(v.profile) || !ENGINES.includes(v.engine) ||
      typeof v.node !== "string" || typeof v.entry !== "string" || !v.hooks ||
      ["pre-commit", "pre-push"].some(k => !/^[a-f0-9]{64}$/.test(v.hooks[k] || ""))) {
    fail(3, "Invalid local Commit Guard installation record.");
  }
  return v;
}
function policyAckRecord(headOid, treeOid, oldPolicy, newPolicy) {
  if ((headOid !== null && !isOid(headOid)) || !isOid(treeOid)) fail(2, "Invalid policy acknowledgment identity.");
  const entry = value => value ? `${value.mode}:${value.oid}` : null;
  return { version: 1, head: headOid, tree: treeOid, old_policy: entry(oldPolicy), new_policy: entry(newPolicy) };
}
function writePolicyAck(cwd, record) {
  const file = path.join(gitDir(cwd), POLICY_ACK_FILE);
  regularFile(file); // Reject a pre-existing link or non-file before replacement.
  const temporary = path.join(path.dirname(file), `.commit-guard-ack-${crypto.randomBytes(12).toString("hex")}`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(record) + "\n", { mode: 0o600, flag: "wx" });
    if (process.platform !== "win32") fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, file);
  } catch {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") fail(2, "Policy acknowledgment cleanup failed."); }
    fail(2, "Could not persist the policy acknowledgment.");
  }
}
function consumePolicyAck(cwd, expected) {
  const file = path.join(gitDir(cwd), POLICY_ACK_FILE);
  const stat = regularFile(file);
  if (!stat) return false;
  if (stat.size > 32768) fail(3, "Local policy acknowledgment exceeds its limit.");
  let actual;
  try { actual = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fail(3, "Invalid local policy acknowledgment."); }
  const keys = ["head", "new_policy", "old_policy", "tree", "version"];
  if (!actual || Array.isArray(actual) || typeof actual !== "object" ||
      Object.keys(actual).sort().join("\0") !== keys.join("\0")) fail(3, "Invalid local policy acknowledgment.");
  try { fs.unlinkSync(file); } catch { fail(2, "Could not consume the local policy acknowledgment."); }
  return keys.every(key => actual[key] === expected[key]);
}
function policy(cwd, opts, baseHead) {
  if (opts.policySource === "cli") {
    if (!opts.profile || !opts.engine) fail(3, "CLI-only policy requires both --profile and --engine.");
    return { profile: opts.profile, engine: opts.engine, source: "cli", gitleaksPath: opts.gitleaksPath || "gitleaks" };
  }
  const entry = tree(cwd, baseHead).get(POLICY_FILE);
  if (entry && (entry.mode !== "100644" && entry.mode !== "100755")) fail(3, "Committed policy must be a regular file.");
  const committed = entry ? parsePolicy(blob(cwd, entry)) : {};
  const local = readLocal(cwd) || {};
  const configProfile = gitConfig(cwd, "commitguard.profile");
  const configEngine = gitConfig(cwd, "commitguard.engine");
  const profile = opts.profile || configProfile || local.profile || committed.profile || "audit";
  const engine = opts.engine || configEngine || local.engine || committed.engine || "builtin";
  if (!PROFILES.includes(profile) || !ENGINES.includes(engine)) fail(3, "Invalid effective Commit Guard policy.");
  return {
    profile, engine,
    source: opts.profile ? "cli" : configProfile ? "git-config" : local.profile ? "local-install" : committed.profile ? "committed-policy" : "default-audit",
    gitleaksPath: opts.gitleaksPath || gitConfig(cwd, "commitguard.gitleaksPath") || "gitleaks"
  };
}
module.exports = { POLICY_FILE, LOCAL_FILE, POLICY_ACK_FILE, PROFILES, ENGINES, LIMITS, GuardError, fail, utf8, command, git, gitText, gitConfig, repository, gitDir, head, isOid, resolveCommit, tree, blob, parsePolicy, regularFile, readLocal, policyAckRecord, writePolicyAck, consumePolicyAck, policy };
