"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { runCli } = require("../tools/commit-guard");
const { detect, detectorContext } = require("../tools/commit-guard/detectors");
const { LIMITS } = require("../tools/commit-guard/common");
const { hooksFor } = require("../tools/commit-guard/hooks");

const ENTRY = path.resolve(__dirname, "../tools/commit-guard.js");
const { Gitleaks } = require("../tools/commit-guard/gitleaks");
const SECRET_A = ["Synthetic", "Only", "A93!"].join("-");
const SECRET_B = ["Synthetic", "Only", "B47!"].join("-");
const credential = value => `${"pass" + "word"} = ${JSON.stringify(value)}\n`;
const ZERO = "0".repeat(40);

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-guard-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cwd = path.join(directory, "repository");
  fs.mkdirSync(cwd);
  const emptyHooks = path.join(directory, "empty-hooks");
  fs.mkdirSync(emptyHooks);
  function git(args, accepted = [0], hooks = false) {
    const options = ["-c", "user.name=Guard Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false"];
    if (!hooks) options.push("-c", `core.hooksPath=${emptyHooks}`);
    const r = spawnSync("git", [...options, ...args], { cwd, encoding: "utf8", timeout: 15000 });
    assert.equal(r.error, undefined);
    assert.ok(accepted.includes(r.status), `Git fixture operation failed: ${args[0]} (${r.status})`);
    return r.stdout.trim();
  }
  git(["-c", "init.templateDir=", "init", "-q", "--initial-branch=main"]);
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    fs.writeFileSync(path.join(cwd, name), content);
  };
  const stage = (...names) => git(["add", "--", ...names]);
  const commit = () => { git(["commit", "-qm", "fixture"]); return git(["rev-parse", "HEAD"]); };
  const clean = () => { write("readme.md", "fixture\n"); stage("readme.md"); return commit(); };
  const cli = (args, input = "") => {
    let output = "";
    const exit = runCli([...args, "--format", "json"], { cwd, stdin: input, stdout: { write(value) { output += value; } } });
    return { exit, result: JSON.parse(output), output };
  };
  const scan = (profile = "strict", extra = []) => cli(["check", "--staged", "--profile", profile, ...extra]);
  return { cwd, directory, git, write, stage, commit, clean, cli, scan };
}
function assertRedacted(report, values = [SECRET_A, SECRET_B]) {
  for (const value of values) assert.equal(report.output.includes(value), false);
  assert.equal(report.output.includes('"identity"'), false);
  assert.equal(report.output.includes('"match"'), false);
}
function rules(report) { return report.result.findings.map(f => f.rule); }

// All commits and installed hooks in this suite belong to disposable fixtures.
test("unborn repository and non-ASCII staged filename are supported", t => {
  const f = fixture(t);
  f.write("文件 with space.txt", "ordinary text\n"); f.stage("文件 with space.txt");
  const before = f.git(["write-tree"]);
  const r = f.scan();
  assert.equal(r.exit, 0); assert.equal(r.result.checked_files, 1);
  assert.equal(f.git(["write-tree"]), before);
  assert.equal(r.result.tree_oid, before);
});
test("default audit reports a credential without claiming a clean scan", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  const r = f.cli(["check", "--staged"]);
  assert.equal(r.exit, 0); assert.equal(r.result.status, "warn");
  assert.deepEqual(r.result.policy_sources, ["default-audit"]);
  assert.ok(rules(r).includes("SEC_CREDENTIAL_LITERAL")); assertRedacted(r);
});
test("strict blocks a new credential and does not expose its value", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  const r = f.scan(); assert.equal(r.exit, 1); assertRedacted(r);
});
test("scanner uses index rather than unstaged working-tree repairs", t => {
  const f = fixture(t); f.clean();
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  f.write("config.txt", "clean working copy\n");
  const before = f.git(["write-tree"]); const h = f.git(["rev-parse", "HEAD"]);
  assert.equal(f.scan().exit, 1);
  assert.equal(f.git(["write-tree"]), before); assert.equal(f.git(["rev-parse", "HEAD"]), h);
});
test("unstaged secrets do not interfere with a clean staged change", t => {
  const f = fixture(t); f.clean();
  f.write("config.txt", "clean\n"); f.stage("config.txt"); f.write("config.txt", credential(SECRET_A));
  assert.equal(f.scan().exit, 0);
});
test("legacy accepts unchanged credentials after CRLF and line shifts", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A).replace(/\n/g, "\r\n")); f.stage("config.txt"); f.commit();
  f.write("config.txt", "# unrelated\n" + credential(SECRET_A) + "setting=2\n"); f.stage("config.txt");
  const r = f.scan("legacy-ratchet");
  assert.equal(r.exit, 0); assert.ok(r.result.findings.some(v => v.action === "allow-existing"));
  assert.equal(f.scan("strict").exit, 1); assertRedacted(r);
});
test("legacy rejects replacement, duplication, and cross-file propagation", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.write("config.txt", credential(SECRET_B)); f.stage("config.txt"); assert.equal(f.scan("legacy-ratchet").exit, 1);
  f.write("config.txt", credential(SECRET_A).repeat(2)); f.stage("config.txt"); assert.equal(f.scan("legacy-ratchet").exit, 1);
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  f.write("copy.txt", credential(SECRET_A)); f.stage("copy.txt"); assert.equal(f.scan("legacy-ratchet").exit, 1);
});
test("legacy removals and file deletions pass", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.write("config.txt", "readFromEnvironment()\n"); f.stage("config.txt"); assert.equal(f.scan("legacy-ratchet").exit, 0);
  fs.unlinkSync(path.join(f.cwd, "config.txt")); f.stage("config.txt"); assert.equal(f.scan().exit, 0);
});
test("renames of secret-bearing files are conservatively treated as new occurrences", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.git(["mv", "config.txt", "renamed.txt"]); assert.equal(f.scan("legacy-ratchet").exit, 1);
});
test(".NET connection strings, URL passwords, and unquoted environment secrets are found", t => {
  const f = fixture(t);
  f.write("settings.xml", `<add connectionString="Server=localhost;Database=db;User Id=sa;Pwd=${SECRET_A};"/>\n`);
  f.write("url.txt", "postgresql://service:" + SECRET_B + "@localhost/db\n");
  f.write("env.txt", "SERVICE_TOKEN=" + SECRET_A + "\n");
  f.stage("settings.xml", "url.txt", "env.txt"); const r = f.scan();
  for (const rule of ["SEC_CONNECTION_PASSWORD", "SEC_URL_PASSWORD", "SEC_ENV_LITERAL"]) assert.ok(rules(r).includes(rule), rule);
  assertRedacted(r);
});
test("only exact placeholders are ignored, not a whole example or test file", t => {
  const f = fixture(t); f.write("tests/example.txt", credential("example")); f.stage("tests/example.txt"); assert.equal(f.scan().exit, 0);
  f.write("tests/example.txt", credential("example-" + SECRET_A)); f.stage("tests/example.txt"); assert.equal(f.scan().exit, 1);
});
test("known-format synthetic tokens and private-key blocks are blocked", t => {
  const f = fixture(t);
  const token = ["gh", "p_", "a".repeat(36)].join("");
  const pem = ["-----BEGIN ", "PRIVATE KEY-----\n", "synthetic-not-a-key\n", "-----END PRIVATE KEY-----"].join("");
  f.write("tokens.txt", token + "\n" + pem); f.stage("tokens.txt"); const r = f.scan();
  assert.ok(rules(r).includes("SEC_KNOWN_TOKEN")); assert.ok(rules(r).includes("SEC_PRIVATE_KEY"));
  assertRedacted(r, [token, pem]);
});
test("finding output redacts a recognized token embedded in the filename", t => {
  const f = fixture(t); const token = ["gh", "p_", "b".repeat(36)].join("");
  const name = `${token}.txt`; f.write(name, token + "\n"); f.stage(name);
  const r = f.scan(); assert.equal(r.exit, 1); assert.equal(r.output.includes(token), false);
  assert.ok(r.result.findings.every(finding => !finding.file.includes(token)));
  let text = ""; assert.equal(runCli(["check", "--staged", "--profile", "strict"], { cwd: f.cwd, stdout: { write(value) { text += value; } } }), 1);
  assert.equal(text.includes(token), false);
});
test("finding output redacts cross-file values discovered after a filename finding", t => {
  const f = fixture(t); const name = `A-${SECRET_A}.log`;
  f.write(name, "ordinary log\n");
  f.write("ordinary.log", "ordinary log\n");
  f.write("z-config.txt", credential(SECRET_A));
  f.stage(name, "ordinary.log", "z-config.txt");
  const r = f.scan();
  assert.equal(r.exit, 1); assertRedacted(r, [SECRET_A]);
  assert.ok(r.result.findings.some(finding => finding.file === "A-[REDACTED].log"));
  assert.ok(r.result.findings.some(finding => finding.file === "ordinary.log"));
  let text = ""; assert.equal(runCli(["check", "--staged", "--profile", "strict"], { cwd: f.cwd, stdout: { write(value) { text += value; } } }), 1);
  assert.equal(text.includes(SECRET_A), false); assert.equal(text.includes("ordinary.log"), true);
});
test("personal paths across Windows, escaped JSON, POSIX, WSL and file URIs are blocked", () => {
  const user = ["fixture", "person"].join("-");
  const paths = [
    ["C:", "Users", user, "repo"].join("\\"),
    ["C:", "Users", user, "repo"].join("\\\\"),
    ["C:", "Users", user, "repo"].join("/"), ["", "home", user, "repo"].join("/"), ["", "Users", user, "repo"].join("/"),
    ["", "mnt", "c", "Users", user, "repo"].join("/"), "file://" + ["", "C:", "Users", user, "repo"].join("/"), "file://" + ["", "home", user, "repo"].join("/")
  ];
  for (const value of paths) {
    const r = detect("doc.txt", { mode: "100644", type: "blob" }, Buffer.from(value), detectorContext("/opt/fixture-root", null));
    assert.ok(r.some(v => v.rule === "PATH_PERSONAL"), "personal-path variant must be detected");
  }
});
test("current workspace root is detected while ordinary deployment paths are not blocked", t => {
  const f = fixture(t); const root = f.git(["rev-parse", "--show-toplevel"]);
  f.write("note.md", `location=${root}/build\n`); f.stage("note.md");
  assert.ok(rules(f.scan()).includes("PATH_CURRENT_MACHINE"));
  f.write("note.md", "/etc/nginx/nginx.conf\n/var/lib/postgresql\n/app/config\nC:/Program Files/dotnet\n"); f.stage("note.md");
  assert.equal(f.scan().exit, 0);
});
test("legacy fingerprints the complete current-machine path", t => {
  const f = fixture(t); const root = f.git(["rev-parse", "--show-toplevel"]);
  const oldPath = `${root}/old-location`; const newPath = `${root}/new-location`;
  f.write("note.md", `location=${oldPath}\n`); f.stage("note.md"); f.commit();
  f.write("note.md", `# shifted\r\nlocation=${oldPath}\r\n`); f.stage("note.md");
  assert.equal(f.scan("legacy-ratchet").exit, 0);
  f.write("note.md", `location=${newPath}\n`); f.stage("note.md");
  assert.equal(f.scan("legacy-ratchet").exit, 1);
});
test("UNC paths produce a warning without disclosing the matched value", () => {
  const value = ["", "", "fixture-host", "share", "file"].join("\\");
  const result = detect("doc.txt", { mode: "100644", type: "blob" }, Buffer.from(value), detectorContext("/opt/fixture-root", null));
  assert.ok(result.some(v => v.rule === "PATH_UNC"));
});
test("sensitive filename policy blocks binary PFX and dotenv but allows empty templates", t => {
  const f = fixture(t); f.write(".env.example", "# no actual values\n"); f.stage(".env.example"); assert.equal(f.scan().exit, 0);
  f.write(".env", "# intentionally empty\n"); f.stage(".env"); assert.equal(f.scan().exit, 1);
  f.write("identity.pfx", Buffer.from([0, 1, 2, 3])); f.stage("identity.pfx");
  const r = f.scan(); assert.ok(rules(r).includes("FILE_PRIVATE_KEY")); assert.equal(r.result.coverage, "partial-first-screen");
});
test("UTF-16 BOM settings are scanned, and unknown binary data has explicit coverage", t => {
  const f = fixture(t); f.write("config.txt", Buffer.concat([Buffer.from([255, 254]), Buffer.from(credential(SECRET_A), "utf16le")])); f.stage("config.txt");
  assert.equal(f.scan().exit, 1);
  f.write("config.txt", Buffer.from([0, 1, 2])); f.stage("config.txt"); const r = f.scan();
  assert.equal(r.exit, 0); assert.equal(r.result.coverage, "partial-first-screen"); assert.equal(r.result.status, "warn");
});
test("legacy preserves coverage warnings for changed existing binary content", t => {
  const f = fixture(t); f.write("payload.dat", Buffer.from([0, 1, 2])); f.stage("payload.dat"); f.commit();
  f.write("payload.dat", Buffer.from([0, 3, 4])); f.stage("payload.dat");
  const r = f.scan("legacy-ratchet"); const finding = r.result.findings.find(v => v.rule === "SKIP_BINARY_OR_ENCODING");
  assert.equal(r.exit, 0); assert.equal(r.result.status, "warn"); assert.equal(finding.severity, "warning"); assert.equal(finding.action, "warn");
});
test("oversized blobs fail closed even under audit", t => {
  const f = fixture(t); f.write("large.txt", Buffer.alloc(LIMITS.blob + 1, 65)); f.stage("large.txt");
  assert.equal(f.scan("audit").exit, 2);
});
test("a symlink is not followed; only its stored target is examined", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.directory, "outside.txt"), credential(SECRET_A));
  fs.symlinkSync("../outside.txt", path.join(f.cwd, "link.txt")); f.stage("link.txt"); const r = f.scan();
  assert.equal(r.exit, 0); assert.ok(rules(r).includes("SKIP_SYMLINK_TARGET")); assertRedacted(r);
});
test("committed policy is used instead of unstaged or staged weakening", t => {
  const f = fixture(t); f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "strict" })); f.stage(".commit-guard.json"); f.commit();
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "audit" }));
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  assert.equal(f.cli(["check", "--staged"]).exit, 1);
  f.stage(".commit-guard.json"); const r = f.cli(["check", "--staged"]);
  assert.equal(r.exit, 1); assert.ok(rules(r).includes("POLICY_CHANGE_REQUIRES_ACK"));
});
test("an explicitly acknowledged policy-only change does not self-activate its new mode", t => {
  const f = fixture(t); f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "strict" })); f.stage(".commit-guard.json"); f.commit();
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "audit" })); f.stage(".commit-guard.json");
  assert.equal(f.cli(["check", "--staged"]).exit, 1);
  const r = f.cli(["check", "--staged", "--ack-policy-change"]); assert.equal(r.exit, 0); assert.deepEqual(r.result.profiles, ["strict"]);
});
test("an acknowledged staged policy must still be valid", t => {
  const f = fixture(t); f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "strict" })); f.stage(".commit-guard.json"); f.commit();
  f.write(".commit-guard.json", "{invalid"); f.stage(".commit-guard.json");
  assert.equal(f.cli(["check", "--staged", "--ack-policy-change"]).exit, 3);
});
test("invalid policy values and unexpected CLI arguments are rejected without echoing input", t => {
  const f = fixture(t); const r = f.cli(["check", "--staged", "--profile", SECRET_A]); assert.equal(r.exit, 3); assertRedacted(r);
  assert.equal(f.cli(["check", "--range", "HEAD...HEAD"]).exit, 3);
  assert.equal(f.cli(["check", "--staged", "--policy-source", "cli", "--profile", "strict"]).exit, 3);
});
test("required missing Gitleaks is an operational failure, including an empty audit scope", t => {
  const f = fixture(t); const r = f.scan("audit", ["--engine", "gitleaks-required", "--gitleaks-path", path.join(f.directory, "missing-scanner")]);
  assert.equal(r.exit, 2); assertRedacted(r);
});
test("range and pre-push inspect intermediate add-then-remove commits", t => {
  const f = fixture(t); const base = f.clean();
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.write("config.txt", "clean again\n"); f.stage("config.txt"); const tip = f.commit();
  const r = f.cli(["check", "--range", `${base}..${tip}`, "--profile", "legacy-ratchet"]);
  assert.equal(r.exit, 1); assert.equal(r.result.checked_commits, 2); assertRedacted(r);
  const push = f.cli(["check", "--pre-push", "--profile", "strict"], `refs/heads/main ${tip} refs/heads/main ${base}\n`);
  assert.equal(push.exit, 1); assert.equal(push.result.checked_commits, 2);
});
test("new refs scan all ancestry, deletions scan nothing, unknown remote objects fail", t => {
  const f = fixture(t); const tip = f.clean();
  const r = f.cli(["check", "--pre-push", "--profile", "strict"], `refs/heads/main ${tip} refs/heads/new ${ZERO}\n`);
  assert.equal(r.exit, 0); assert.equal(r.result.checked_commits, 1);
  const deleted = f.cli(["check", "--pre-push"], `(delete) ${ZERO} refs/heads/old ${tip}\n`);
  assert.equal(deleted.exit, 0); assert.equal(deleted.result.checked_commits, 0);
  assert.equal(f.cli(["check", "--pre-push"], `refs/heads/main ${tip} refs/heads/main ${"f".repeat(40)}\n`).exit, 2);
  assert.equal(f.cli(["check", "--pre-push"], "malformed\n").exit, 3);
});
test("new tag at an updated branch tip uses the branch's outgoing boundary", t => {
  const f = fixture(t); const base = f.clean();
  f.write("readme.md", "release\n"); f.stage("readme.md"); const tip = f.commit();
  f.git(["tag", "-a", "v1.0.0", "-m", "release", tip]);
  const tagOid = f.git(["rev-parse", "refs/tags/v1.0.0"]);
  const input = `refs/tags/v1.0.0 ${tagOid} refs/tags/v1.0.0 ${ZERO}\nrefs/heads/main ${tip} refs/heads/main ${base}\n`;
  const r = f.cli(["check", "--pre-push", "--profile", "strict"], input);
  assert.equal(r.exit, 0); assert.equal(r.result.checked_commits, 1);
  assert.equal(r.result.checked_files, 1);
  const tagOnly = f.cli(["check", "--pre-push", "--profile", "strict"], input.split("\n")[0] + "\n");
  assert.equal(tagOnly.exit, 0); assert.equal(tagOnly.result.checked_commits, 2);
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); const unsafe = f.commit();
  const unsafeInput = `refs/tags/v1.0.1 ${unsafe} refs/tags/v1.0.1 ${ZERO}\nrefs/heads/main ${unsafe} refs/heads/main ${tip}\n`;
  const blocked = f.cli(["check", "--pre-push", "--profile", "strict"], unsafeInput);
  assert.equal(blocked.exit, 1); assert.equal(blocked.result.checked_commits, 1);
  assertRedacted(blocked);
});
test("multi-ref outgoing commits are combined and duplicates do not multiply findings", t => {
  const f = fixture(t); const base = f.clean();
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); const tip = f.commit();
  const input = `refs/heads/main ${tip} refs/heads/main ${base}\nrefs/heads/other ${tip} refs/heads/other ${base}\n`;
  const r = f.cli(["check", "--pre-push", "--profile", "strict"], input);
  assert.equal(r.exit, 1); assert.equal(r.result.checked_commits, 1);
  assert.equal(r.result.findings.filter(v => v.rule === "SEC_CREDENTIAL_LITERAL").length, 1);
});
test("range policy is anchored to its accepted base, not candidate policy edits", t => {
  const f = fixture(t); f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "strict" })); f.stage(".commit-guard.json"); const base = f.commit();
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "audit" })); f.write("config.txt", credential(SECRET_A));
  f.stage(".commit-guard.json", "config.txt"); const tip = f.commit();
  assert.equal(f.cli(["check", "--range", `${base}..${tip}`]).exit, 1);
  f.git(["config", "--local", "commitguard.profile", "audit"]);
  const r = f.cli(["check", "--range", `${base}..${tip}`, "--policy-source", "cli", "--profile", "strict", "--engine", "builtin"]);
  assert.equal(r.exit, 1); assert.deepEqual(r.result.policy_sources, ["cli"]);
});
test("merge history retains side-branch credential introduction detection", t => {
  const f = fixture(t); const base = f.clean(); f.git(["checkout", "-qb", "side"]);
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.git(["checkout", "-q", "main"]); f.write("main.txt", "main change\n"); f.stage("main.txt"); f.commit();
  f.git(["merge", "--no-ff", "-qm", "fixture merge", "side"]); const tip = f.git(["rev-parse", "HEAD"]);
  assert.equal(f.cli(["check", "--range", `${base}..${tip}`, "--profile", "legacy-ratchet"]).exit, 1);
});
test("merge allowance cannot reintroduce debt removed at the accepted base", t => {
  const f = fixture(t); f.write("config.txt", credential(SECRET_A)); f.stage("config.txt"); const historical = f.commit();
  f.git(["branch", "side", historical]); f.write("config.txt", "clean\n"); f.stage("config.txt"); const base = f.commit();
  f.git(["checkout", "-q", "side"]); f.write("config.txt", "# side change\n" + credential(SECRET_A)); f.stage("config.txt"); f.commit();
  f.git(["checkout", "-q", "main"]); f.git(["merge", "--no-ff", "--no-commit", "side"], [0, 1]);
  f.write("config.txt", "# merge resolution\n" + credential(SECRET_A)); f.stage("config.txt"); const tip = f.commit();
  const r = f.cli(["check", "--range", `${base}..${tip}`, "--profile", "legacy-ratchet"]);
  assert.equal(r.exit, 1); assert.ok(r.result.findings.some(v => v.action === "block"));
});
test("local-only install is idempotent and leaves working tree, index, and Git config alone", t => {
  const f = fixture(t); f.clean(); const before = f.git(["status", "--porcelain"]);
  const config = fs.readFileSync(path.join(f.cwd, ".git/config"));
  const a = f.cli(["install", "--profile", "legacy-ratchet", "--local-only"]);
  assert.equal(a.exit, 0); assert.equal(a.result.changed, true);
  const b = f.cli(["install", "--profile", "legacy-ratchet", "--local-only"]);
  assert.equal(b.exit, 0); assert.equal(b.result.changed, false);
  const d = f.cli(["doctor"]); assert.equal(d.result.status, "pass"); assert.equal(d.result.profile, "legacy-ratchet");
  assert.deepEqual(fs.readFileSync(path.join(f.cwd, ".git/config")), config);
  assert.equal(f.git(["status", "--porcelain"]), before);
});
test("installed pre-commit really blocks Git commit of a new secret", t => {
  const f = fixture(t); f.clean();
  assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 0);
  f.write("config.txt", credential(SECRET_A)); f.stage("config.txt");
  const before = f.git(["rev-parse", "HEAD"]);
  f.git(["commit", "-qm", "must not commit"], [1], true);
  assert.equal(f.git(["rev-parse", "HEAD"]), before);
});
test("installed pre-commit consumes an exact one-time policy acknowledgment", t => {
  const f = fixture(t); f.clean(); assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 0);
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "audit" })); f.stage(".commit-guard.json");
  assert.equal(f.cli(["check", "--staged", "--ack-policy-change"]).exit, 0);
  assert.equal(fs.existsSync(path.join(f.cwd, ".git/commit-guard-policy-ack.json")), true);
  f.git(["commit", "-qm", "acknowledged policy"], [0], true);
  assert.equal(fs.existsSync(path.join(f.cwd, ".git/commit-guard-policy-ack.json")), false);
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "strict" })); f.stage(".commit-guard.json");
  f.git(["commit", "-qm", "unacknowledged policy"], [1], true);
});
test("a policy acknowledgment cannot authorize a different staged tree", t => {
  const f = fixture(t); f.clean(); assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 0);
  f.write(".commit-guard.json", JSON.stringify({ version: 1, profile: "audit" })); f.stage(".commit-guard.json");
  assert.equal(f.cli(["check", "--staged", "--ack-policy-change"]).exit, 0);
  f.write("other.txt", "different tree\n"); f.stage("other.txt");
  f.git(["commit", "-qm", "stale policy acknowledgment"], [1], true);
  assert.equal(fs.existsSync(path.join(f.cwd, ".git/commit-guard-policy-ack.json")), false);
});
test("foreign hook conflicts are detected before any writes", t => {
  const f = fixture(t); f.clean(); const hooks = path.join(f.cwd, ".git/hooks"); fs.mkdirSync(hooks, { recursive: true });
  const foreign = "#!/bin/sh\nexit 0\n"; fs.writeFileSync(path.join(hooks, "pre-push"), foreign);
  const r = f.cli(["install", "--profile", "strict", "--local-only"]);
  assert.equal(r.exit, 3); assert.equal(fs.readFileSync(path.join(hooks, "pre-push"), "utf8"), foreign);
  assert.equal(fs.existsSync(path.join(hooks, "pre-commit")), false);
  assert.equal(fs.existsSync(path.join(f.cwd, ".git/commit-guard-local.json")), false);
});
test("tampered managed hooks are reported by doctor and never silently overwritten", t => {
  const f = fixture(t); f.clean(); assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 0);
  fs.appendFileSync(path.join(f.cwd, ".git/hooks/pre-commit"), "# changed\n");
  assert.equal(f.cli(["doctor"]).result.status, "warn");
  assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 3);
});
test("doctor warns when the recorded runtime is not executable", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); f.clean(); assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 0);
  const metadata = path.join(f.cwd, ".git/commit-guard-local.json"); const record = JSON.parse(fs.readFileSync(metadata, "utf8"));
  const runtime = path.join(f.directory, "non-executable-node"); fs.writeFileSync(runtime, "not executable\n", { mode: 0o644 });
  record.node = runtime; const scripts = hooksFor(record.node, record.entry);
  for (const [name, content] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(f.cwd, ".git/hooks", name), content, { mode: 0o755 });
    record.hooks[name] = crypto.createHash("sha256").update(content).digest("hex");
  }
  fs.writeFileSync(metadata, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  const r = f.cli(["doctor"]); assert.equal(r.result.runtime_available, false); assert.equal(r.result.status, "warn");
});
test("existing hooksPath and shared worktrees are not overwritten", t => {
  const f = fixture(t); f.clean(); f.git(["config", "--local", "core.hooksPath", "existing-hooks"]);
  assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 3);
  assert.equal(f.git(["config", "--local", "--get", "core.hooksPath"]), "existing-hooks");
  f.git(["config", "--local", "--unset", "core.hooksPath"]);
  f.git(["worktree", "add", "-q", "--detach", path.join(f.directory, "linked")]);
  assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 3);
});
test("hook-directory symlinks are refused", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); f.clean(); const outside = path.join(f.directory, "outside-hooks"); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.cwd, ".git/hooks"));
  assert.equal(f.cli(["install", "--profile", "strict", "--local-only"]).exit, 3);
  assert.deepEqual(fs.readdirSync(outside), []);
});
test("required scanner contract suppresses unsafe stderr and rejects malformed report data", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); f.write("source.txt", "ordinary\n"); f.stage("source.txt");
  const scanner = path.join(f.directory, "fake-scanner");
  fs.writeFileSync(scanner, `#!${process.execPath}\nconst fs=require('node:fs');\nif(process.argv[2]==='version'){process.stdout.write('8.24.2');process.exit(0);}\nprocess.stderr.write(${JSON.stringify(SECRET_A)});\nconst p=process.argv[process.argv.indexOf('--report-path')+1];fs.writeFileSync(p,'not-json');process.exit(10);\n`, { mode: 0o755 });
  const r = f.scan("audit", ["--engine", "gitleaks-required", "--gitleaks-path", scanner]);
  assert.equal(r.exit, 2); assertRedacted(r);
});
test("pinned stdin coordinates normalize initial, shifted, Unicode and multiline spans", { skip: process.platform === "win32" }, t => {
  const f = fixture(t);
  const cases = [
    { text: "ordinary\n", row: [0, 0, 1, 8], match: "ordinary", line: 1 },
    { text: "header\nordinary\n", row: [1, 1, 2, 9], match: "ordinary", line: 2 },
    { text: "前綴 ordinary\n", row: [0, 0, 8, 15], match: "ordinary", line: 1 },
    { text: "header\n前綴 ordinary\n", row: [1, 1, 9, 16], match: "ordinary", line: 2 },
    { text: "one\ntwo\n", row: [0, 1, 1, 4], match: "one\ntwo", line: 1 }
  ];
  const records = Object.fromEntries(cases.map(c => [c.text, { RuleID: "synthetic", StartLine: c.row[0], EndLine: c.row[1], StartColumn: c.row[2], EndColumn: c.row[3] }]));
  const scanner = path.join(f.directory, "coordinate-scanner");
  fs.writeFileSync(scanner, `#!${process.execPath}\nconst fs=require('node:fs');\nif(process.argv[2]==='version'){process.stdout.write('8.24.2');process.exit(0);}\nconst records=${JSON.stringify(records)};const row=records[fs.readFileSync(0,'utf8')];\nfs.writeFileSync(process.argv[process.argv.indexOf('--report-path')+1],JSON.stringify([row]));process.exit(10);\n`, { mode: 0o755 });
  const engine = new Gitleaks(scanner);
  const temporary = engine.directory;
  try {
    for (const c of cases) {
      const result = engine.scan(c.text);
      assert.equal(result.length, 1); assert.equal(result[0].line, c.line);
      assert.equal(result[0].match.toString("utf8"), c.match);
    }
  } finally { engine.close(); }
  assert.equal(fs.existsSync(temporary), false);
});

test("required scanner metadata-only contract detects findings without writing match fields", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); f.write("source.txt", "ordinary\n"); f.stage("source.txt");
  const scanner = path.join(f.directory, "fake-scanner");
  fs.writeFileSync(scanner, `#!${process.execPath}\nconst fs=require('node:fs');\nif(process.argv[2]==='version'){process.stdout.write('8.24.2');process.exit(0);}\nconst args=process.argv;\nconst template=fs.readFileSync(args[args.indexOf('--report-template')+1],'utf8');\nif(template.includes('.Secret')||template.includes('.Match')||!args.includes('--ignore-gitleaks-allow')||args.includes('--timeout')||process.env.GITLEAKS_CONFIG)process.exit(4);\nfs.readFileSync(0);\nfs.writeFileSync(args[args.indexOf('--report-path')+1],JSON.stringify([{RuleID:'synthetic',StartLine:0,EndLine:0,StartColumn:1,EndColumn:8}]));process.exit(10);\n`, { mode: 0o755 });
  const previous = process.env.GITLEAKS_CONFIG; process.env.GITLEAKS_CONFIG = "untrusted";
  try {
    const r = f.scan("strict", ["--engine", "gitleaks-required", "--gitleaks-path", scanner]);
    assert.equal(r.exit, 1); assert.ok(rules(r).includes("GITLEAKS_synthetic")); assertRedacted(r, ["ordinary"]);
  } finally { if (previous === undefined) delete process.env.GITLEAKS_CONFIG; else process.env.GITLEAKS_CONFIG = previous; }
});
