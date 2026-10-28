"use strict";

// One deliberately narrow, opt-in acceptance of existing remote history.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fail, command, utf8, git, gitText, gitConfig, gitDir, repository, policy, LIMITS } = require("./common");
const { detectorContext } = require("./detectors");
const { layout } = require("./hooks");
const DIRECTORY = "commit-guard-remote-tag";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const error = () => fail(3, "Remote-tag acceptance is missing, invalid, changed, or already used; nothing was approved.");

function endpoint(value) {
  // Intentionally exclude scp shorthand, aliases, encoded paths, userinfo credentials,
  // helpers and URL forms whose repository identity would require guessing.
  if (typeof value !== "string" || value.length > 2048 || /[\s\\%?#\x00-\x1f\x7f]/.test(value)) fail(3, "Unsupported or unsafe remote endpoint.");
  const match = /^(https|ssh):\/\/(?:(?<user>[A-Za-z0-9_][A-Za-z0-9_.-]*)@)?(?<host>[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::(?<port>[0-9]{1,5}))?(?<repo>\/[A-Za-z0-9._~/-]+)$/.exec(value);
  if (!match || (match[1] === "https" && match.groups.user) || (match[1] === "ssh" && !match.groups.user)) fail(3, "Unsupported or unsafe remote endpoint.");
  const { user, host, repo } = match.groups;
  const port = Number(match.groups.port || (match[1] === "ssh" ? 22 : 443));
  if (!port || port > 65535 || host.includes("..") || repo.split("/").slice(1).some(p => !p || p === "." || p === "..")) fail(3, "Ambiguous remote endpoint identity.");
  return `${match[1]}://${user ? user + "@" : ""}${host.toLowerCase()}${port === (match[1] === "ssh" ? 22 : 443) ? "" : ":" + port}${repo}`;
}
function validRef(cwd, ref, prefix) {
  if (typeof ref !== "string" || !ref.startsWith(prefix) || ref.length > 1024 || /[^A-Za-z0-9._/-]/.test(ref) || git(cwd, ["check-ref-format", ref], [0, 1]).status !== 0) fail(3, "Remote-tag acceptance requires exact supported full refs.");
}
function local(cwd, commit, tag, mustExist) {
  const format = gitText(cwd, ["rev-parse", "--show-object-format"]);
  const length = format === "sha1" ? 40 : format === "sha256" ? 64 : 0;
  if (!length || typeof commit !== "string" || !new RegExp(`^[a-f0-9]{${length}}$`).test(commit)) fail(3, "Remote-tag acceptance requires a full raw commit OID.");
  for (const name of ["GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_REPLACE_REF_BASE", "GIT_SHALLOW_FILE", "GIT_NAMESPACE", "GIT_GRAFT_FILE"]) {
    if (process.env[name] !== undefined) fail(3, "Local history substitutions are unsupported.");
  }
  const dir = gitDir(cwd);
  if (gitText(cwd, ["rev-parse", "--is-shallow-repository"]) !== "false" ||
      gitText(cwd, ["for-each-ref", "--format=%(refname)", "refs/replace/"]) ||
      ["info/grafts", "objects/info/alternates", "objects/info/http-alternates"].some(p => fs.existsSync(path.join(dir, p))) ||
      gitConfig(cwd, "extensions.partialClone") !== null ||
      git(cwd, ["config", "--get-regexp", "^remote\\..*\\.promisor$"], [0, 1]).status === 0) fail(3, "Complete, unsubstituted local history is required.");
  if (gitText(cwd, ["cat-file", "-t", commit]) !== "commit") fail(3, "Only a raw commit and a lightweight tag are supported.");
  const commits = gitText(cwd, ["rev-list", commit]).split("\n").filter(Boolean);
  if (commits.length > LIMITS.commits) fail(2, "Remote-tag local history exceeds the commit limit.");
  // Walk objects as well as parents: a missing tree/blob must not become an empty-scope PASS.
  git(cwd, ["rev-list", "--objects", "--missing=error", commit]);
  const refs = git(cwd, ["for-each-ref", "--format=%(objectname)%09%(refname)%09%(symref)", tag]);
  if (refs.stderr.length) fail(2, "Local tag state could not be read completely.");
  const ref = utf8(refs.stdout).trim();
  if (mustExist ? ref !== `${commit}\t${tag}` : ref !== "") fail(3, "The exact local lightweight tag state does not match the plan.");
  return length;
}
function location(cwd) {
  if (process.platform === "win32") fail(3, "Private remote-tag acceptance currently requires POSIX metadata permissions.");
  const loc = layout(cwd);
  // This slice supports ordinary standalone .git directories only.
  if (path.resolve(loc.dir) !== path.join(loc.cwd, ".git") || fs.realpathSync(loc.cwd) !== loc.cwd || !fs.lstatSync(loc.dir).isDirectory()) fail(3, "Remote-tag acceptance requires a normal standalone repository.");
  const stat = fs.statSync(loc.dir);
  return { ...loc, selected: path.join(loc.dir, DIRECTORY), identity: hash(`${loc.dir}\0${stat.dev}\0${stat.ino}`) };
}
function selected(cwd) {
  // lstat, not existsSync: broken links must select an error rather than fallback.
  try { fs.lstatSync(path.join(gitDir(cwd), DIRECTORY)); return true; }
  catch (e) { if (e.code === "ENOENT") return false; throw e; }
}
function privateStat(file, directory = false) {
  const s = fs.lstatSync(file);
  if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1) ||
      (process.platform !== "win32" && ((s.mode & 0o077) || (typeof process.getuid === "function" && s.uid !== process.getuid())))) error();
  return s;
}
const KEYS = ["version", "repository", "remote", "endpoint", "accepted_ref", "commit", "tag", "profile", "engine", "state"];
function readRecord(loc) {
  const directoryStat = privateStat(loc.selected, true);
  const file = path.join(loc.selected, "acceptance.json");
  const before = privateStat(file);
  if (before.size > 8192) error();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let raw;
  try {
    const actual = fs.fstatSync(fd);
    if (actual.ino !== before.ino || actual.dev !== before.dev) error();
    raw = fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
  let record;
  try { record = JSON.parse(raw); } catch { error(); }
  if (!record || Array.isArray(record) || Object.keys(record).sort().join() !== [...KEYS].sort().join() ||
      record.version !== 1 || record.repository !== loc.identity || record.profile !== "strict" || record.engine !== "builtin" ||
      !["pending", "used"].includes(record.state) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.remote) || endpoint(record.endpoint) !== record.endpoint) error();
  validRef(loc.cwd, record.accepted_ref, "refs/heads/"); validRef(loc.cwd, record.tag, "refs/tags/");
  return { record, raw, identity: `${directoryStat.dev}:${directoryStat.ino}:${before.dev}:${before.ino}` };
}
function configState(cwd) {
  // Only a digest leaves process memory; authentication/configuration values never do.
  return hash(git(cwd, ["config", "--null", "--list"]).stdout);
}
function destination(cwd, remote, accepted, hookLocation) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(remote || "")) fail(3, "An explicit supported remote name is required.");
  if (["vcs", "uploadpack", "receivepack"].some(key => gitConfig(cwd, `remote.${remote}.${key}`) !== null)) fail(3, "Custom remote helper or service commands are unsupported.");
  const urls = utf8(git(cwd, ["remote", "get-url", "--push", "--all", remote]).stdout).trim().split("\n");
  if (urls.length !== 1 || endpoint(urls[0]) !== accepted || (hookLocation !== undefined && endpoint(hookLocation) !== accepted)) fail(3, "The single effective push destination does not match acceptance.");
  // ls-remote applies insteadOf to its argument. Reject a second rewrite rather
  // than probing a different endpoint from the effective push URL.
  if (endpoint(gitText(cwd, ["ls-remote", "--get-url", "--", urls[0]])) !== accepted) fail(3, "Ambiguous remote URL rewrite.");
  if (process.env.GIT_SSL_NO_VERIFY || process.env.GIT_SSH || process.env.GIT_SSH_COMMAND || gitConfig(cwd, "core.sshCommand") !== null) fail(3, "Remote transport overrides are unsupported for this acceptance.");
  const u = new URL(accepted);
  if (u.protocol === "https:") {
    const verify = git(cwd, ["config", "--bool", "--get-urlmatch", "http.sslVerify", accepted], [0, 1]);
    if (verify.status === 0 && utf8(verify.stdout).trim() !== "true") fail(3, "Verified TLS identity is required.");
  } else {
    // Inspect normal OpenSSH routing without connecting; do not adopt aliases or
    // proxies whose endpoint identity cannot be bound by this small record.
    const ssh = command("ssh", ["-G", "-p", u.port || "22", "-l", u.username, u.hostname], { cwd });
    if (ssh.status !== 0) fail(2, "SSH endpoint configuration could not be verified.");
    const fields = new Map();
    for (const line of utf8(ssh.stdout).trim().split("\n")) {
      const i = line.indexOf(" ");
      if (i > 0 && !fields.has(line.slice(0, i))) fields.set(line.slice(0, i), line.slice(i + 1));
    }
    if (fields.get("hostname")?.toLowerCase() !== u.hostname || fields.get("port") !== (u.port || "22") || fields.get("user") !== u.username ||
        !["true", "yes", "ask"].includes(fields.get("stricthostkeychecking")) ||
        ["proxycommand", "proxyjump", "hostkeyalias"].some(k => fields.has(k) && fields.get(k) !== "none") ||
        ![undefined, "no", "false"].includes(fields.get("canonicalizehostname"))) fail(3, "Ambiguous or unverified SSH endpoint routing.");
  }
  return urls[0];
}
function observe(cwd, url, record, length) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
  // Fixed arguments preserve Git's authentication while requiring peer checking.
  const result = command("git", ["--no-pager", "-c", "core.fsmonitor=false", "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "protocol.ssh.allow=always", "-c", "http.sslVerify=true", "-c", "http.followRedirects=false", "-c", "core.sshCommand=ssh -oBatchMode=yes -oStrictHostKeyChecking=yes", "ls-remote", "--refs", "--", url, record.accepted_ref, record.tag], { cwd, env, maxBuffer: 65536 });
  if (result.status !== 0) fail(2, "Remote ref assessment failed; authentication and subprocess diagnostics were suppressed.");
  const output = utf8(result.stdout);
  const rows = output.endsWith("\n") ? output.slice(0, -1).split("\n") : [];
  if (rows.length !== 1 || rows[0] !== `${record.commit}\t${record.accepted_ref}` || !new RegExp(`^[a-f0-9]{${length}}$`).test(record.commit)) fail(3, "Remote branch/tag state is absent, changed, malformed, or ambiguous.");
}
function assess(loc, opts, record, mustExist, hookLocation) {
  const initial = configState(loc.cwd);
  const length = local(loc.cwd, record.commit, record.tag, mustExist);
  const url = destination(loc.cwd, record.remote, record.endpoint, hookLocation);
  const p = policy(loc.cwd, opts, record.commit);
  if (p.profile !== "strict" || p.engine !== "builtin") fail(3, "Remote-tag acceptance requires effective strict/builtin policy.");
  detectorContext(loc.cwd, null); // Initialize even for zero outgoing commits.
  observe(loc.cwd, url, record, length);
  const stable = () => {
    if (configState(loc.cwd) !== initial || location(loc.cwd).identity !== loc.identity) fail(2, "Repository configuration changed during remote-tag assessment.");
    local(loc.cwd, record.commit, record.tag, mustExist);
    const finalPolicy = policy(loc.cwd, opts, record.commit);
    if (JSON.stringify(finalPolicy) !== JSON.stringify(p)) fail(2, "Policy changed during remote-tag assessment.");
  };
  stable();
  return { p, stable };
}
function report(record, p, scope, state, written) {
  return { status: "pass", scope, profiles: [p.profile], engines: [p.engine], policy_sources: [p.source], tree_oid: null,
    checked_files: 0, checked_commits: 0, outgoing_commits: 0, coverage: "operator-accepted-remote-history-first-screen", findings: [],
    accepted_ref: record.accepted_ref, accepted_oid: record.commit, tag_ref: record.tag, tag_oid: record.commit,
    binding_state: state, binding_written: written };
}
function prepare(cwd, opts) {
  const loc = location(repository(cwd));
  validRef(loc.cwd, opts.acceptedRef, "refs/heads/"); validRef(loc.cwd, opts.tag, "refs/tags/");
  const record = { version: 1, repository: loc.identity, remote: opts.remote, endpoint: endpoint(opts.endpoint), accepted_ref: opts.acceptedRef,
    commit: opts.commit, tag: opts.tag, profile: "strict", engine: "builtin", state: "pending" };
  const existing = selected(loc.cwd) ? readRecord(loc) : null;
  if (existing && (opts.acceptExistingHistory || existing.record.state !== "pending" || JSON.stringify(existing.record) !== JSON.stringify(record))) error();
  const { p, stable } = assess(loc, opts, record, false);
  let written = false;
  if (opts.acceptExistingHistory) {
    // The directory is also the durable selection marker. Never silently fall
    // back after a partial publication or after acceptance.json disappears.
    stable();
    try {
      fs.mkdirSync(loc.selected, { mode: 0o700 });
      const temporary = path.join(loc.selected, "pending.tmp");
      fs.writeFileSync(temporary, JSON.stringify(record) + "\n", { mode: 0o600, flag: "wx" });
      fs.linkSync(temporary, path.join(loc.selected, "acceptance.json"));
      fs.unlinkSync(temporary);
      written = true;
    } catch { fail(2, "Could not exclusively publish remote-tag acceptance; inspect local metadata."); }
  } else if (existing) {
    const current = readRecord(loc);
    if (current.raw !== existing.raw || current.identity !== existing.identity) error();
  }
  return report(record, p, "new-tag-plan", existing || written ? "pending" : "unarmed", written);
}
function nativeCheck(cwd, opts, input) {
  const loc = location(cwd);
  const original = readRecord(loc);
  const r = original.record;
  if (r.state !== "pending" || opts.remoteName !== r.remote || Buffer.byteLength(input) > 65536) error();
  const row = `${r.tag} ${r.commit} ${r.tag} ${"0".repeat(r.commit.length)}`;
  if (input !== row + "\n") fail(3, "Remote-tag acceptance supports exactly one unchanged lightweight tag creation row.");
  const { p, stable } = assess(loc, opts, r, true, opts.remoteLocation);
  let fd;
  const lock = path.join(loc.selected, "consume.lock");
  try { fd = fs.openSync(lock, "wx", 0o600); }
  catch { fail(2, "Remote-tag acceptance is already being consumed; nothing was approved."); }
  try {
    stable();
    const current = readRecord(loc);
    if (current.raw !== original.raw || current.identity !== original.identity) error();
    const temporary = path.join(loc.selected, "used.tmp");
    fs.writeFileSync(temporary, JSON.stringify({ ...r, state: "used" }) + "\n", { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, path.join(loc.selected, "acceptance.json"));
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  return report(r, p, "pre-push", "used", false);
}
module.exports = { prepare, nativeCheck, selected };
