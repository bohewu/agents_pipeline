#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { GuardError, fail, PROFILES, ENGINES, repository, head, policy } = require("./commit-guard/common");
const { check } = require("./commit-guard/check");
const { prepare } = require("./commit-guard/remote-tag");
const { install, doctor } = require("./commit-guard/hooks");

const HELP = `Commit Guard: local deterministic first-screen (Node.js 18+, Git).

  node tools/commit-guard.js check --staged [--profile audit|legacy-ratchet|strict]
  node tools/commit-guard.js check --range BASE..HEAD [--profile PROFILE]
  node tools/commit-guard.js check --pre-push [--profile PROFILE] < ref-input
  node tools/commit-guard.js prepare-remote-tag --remote NAME --endpoint URL --accepted-ref REF --commit OID --tag REF
      [--accept-existing-history] [--profile strict --engine builtin]
  node tools/commit-guard.js install --profile PROFILE --local-only
  node tools/commit-guard.js doctor

Common: --format text|json
Check/install: --engine builtin|gitleaks-required
Check: --policy-source auto|cli, --gitleaks-path EXECUTABLE
Staged check: --ack-policy-change (explicit operator review of changed policy)

Default is audit + builtin; missing required engines and unknown scopes fail.
EMPTY..HEAD explicitly scans all ancestry (maximum 200 commits per check).
No command commits, stages, pushes, downloads engines, or changes global settings.
`;
function parse(args) {
  if (!args.length || args.includes("--help") || args.includes("-h")) return { help: true };
  const command = args[0];
  if (!["check", "prepare-remote-tag", "install", "doctor"].includes(command)) fail(3, "Unknown Commit Guard command.");
  const opts = { command, format: "text", policySource: "auto" };
  const values = { "--format": "format", "--profile": "profile", "--engine": "engine", "--range": "range", "--policy-source": "policySource", "--gitleaks-path": "gitleaksPath", "--remote": "remote", "--endpoint": "endpoint", "--accepted-ref": "acceptedRef", "--commit": "commit", "--tag": "tag", "--remote-name": "remoteName", "--remote-location": "remoteLocation" };
  const flags = { "--staged": "staged", "--pre-push": "prePush", "--local-only": "localOnly", "--ack-policy-change": "ackPolicyChange", "--consume-policy-ack": "consumePolicyAck", "--accept-existing-history": "acceptExistingHistory", "--native-pre-push": "nativePrePush" };
  const seen = new Set();
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) fail(3, "Duplicate Commit Guard option.");
    seen.add(arg);
    if (values[arg]) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) fail(3, "Missing Commit Guard option value.");
      opts[values[arg]] = args[++i];
    } else if (flags[arg]) opts[flags[arg]] = true;
    else fail(3, "Unknown Commit Guard option.");
  }
  if (!["text", "json"].includes(opts.format) || (opts.profile && !PROFILES.includes(opts.profile)) || (opts.engine && !ENGINES.includes(opts.engine)) || !["auto", "cli"].includes(opts.policySource)) fail(3, "Invalid Commit Guard option value.");
  const prepareKeys = ["remote", "endpoint", "acceptedRef", "commit", "tag", "acceptExistingHistory"];
  if (command !== "prepare-remote-tag" && prepareKeys.some(k => opts[k] !== undefined)) fail(3, "Preparation options require prepare-remote-tag.");
  if (command === "prepare-remote-tag" && (prepareKeys.slice(0, 5).some(k => !opts[k]) || opts.staged || opts.prePush || opts.range || opts.localOnly || opts.ackPolicyChange || opts.consumePolicyAck || opts.nativePrePush || opts.remoteName || opts.remoteLocation || opts.gitleaksPath || opts.policySource !== "auto")) fail(3, "Preparation requires an explicit supported remote, endpoint, branch, commit and tag.");
  if ((opts.nativePrePush || opts.remoteName || opts.remoteLocation) && (command !== "check" || !opts.prePush || !opts.nativePrePush || !opts.remoteName || !opts.remoteLocation || opts.profile || opts.engine || opts.policySource !== "auto" || opts.gitleaksPath)) fail(3, "Native pre-push requires Git remote arguments and automatic effective policy.");
  if (command === "check" && ([opts.staged, opts.prePush, opts.range].filter(Boolean).length !== 1 || opts.localOnly || ((opts.ackPolicyChange || opts.consumePolicyAck) && !opts.staged) || (opts.ackPolicyChange && opts.consumePolicyAck))) fail(3, "Check requires exactly one supported scan scope.");
  if (command === "install" && (opts.staged || opts.prePush || opts.range || opts.gitleaksPath || opts.ackPolicyChange || opts.consumePolicyAck || opts.policySource !== "auto")) fail(3, "Unsupported install options.");
  if (command === "doctor" && [...seen].some(a => a !== "--format")) fail(3, "Doctor accepts only --format.");
  return opts;
}
function render(result, format) {
  if (format === "json") return JSON.stringify(result, null, 2) + "\n";
  if (result.error) return `Commit Guard ERROR (${result.exit_code}): ${result.error}\n`;
  if (result.scope) {
    const lines = [`Commit Guard ${result.status.toUpperCase()}: ${result.scope}; profiles=${result.profiles.join(",")}; engines=${result.engines.join(",")}; coverage=${result.coverage}`,
      `Checked files: ${result.checked_files}; commits: ${result.checked_commits}; findings: ${result.findings.length}`];
    if (result.binding_state !== undefined) {
      lines.push(`Accepted remote history: ${result.accepted_ref} ${result.accepted_oid}`,
        `Tag: ${result.tag_ref} ${result.tag_oid}`,
        `Outgoing commits: ${result.outgoing_commits}`,
        `Binding: ${result.binding_state}; written: ${result.binding_written}`);
    }
    for (const f of result.findings) lines.push(`${f.action.toUpperCase()} ${f.rule} ${JSON.stringify(f.file)}:${f.line}${f.existing ? " (existing)" : ""}`);
    if (result.policy_sources.includes("default-audit")) lines.push("No profile selected: audit reports findings but does not block them.");
    return lines.join("\n") + "\n";
  }
  return `Commit Guard ${result.status.toUpperCase()}\n${JSON.stringify(result, null, 2)}\n`;
}
function runCli(args, options = {}) {
  const output = options.stdout || process.stdout;
  let opts;
  try {
    opts = parse(args);
    if (opts.help) { output.write(HELP); return 0; }
    const cwd = options.cwd || process.cwd();
    let result;
    if (opts.command === "check") {
      const input = opts.prePush ? (options.stdin !== undefined ? options.stdin : fs.readFileSync(0, "utf8")) : "";
      result = check(cwd, opts, input);
    } else if (opts.command === "prepare-remote-tag") result = prepare(cwd, opts);
    else if (opts.command === "install") result = install(cwd, opts, __filename);
    else {
      result = doctor(cwd);
      const root = repository(cwd);
      const p = policy(root, opts, head(root));
      result.profile = p.profile; result.engine = p.engine; result.policy_source = p.source;
    }
    output.write(render(result, opts.format));
    return result.status === "blocked" ? 1 : 0;
  } catch (error) {
    const code = error instanceof GuardError ? error.code : 2;
    const message = error instanceof GuardError ? error.message : "Commit Guard could not complete; unsafe diagnostic details were suppressed.";
    const format = opts?.format || (args.includes("json") ? "json" : "text");
    output.write(render({ status: "error", exit_code: code, error: message }, format));
    return code;
  }
}
if (require.main === module) process.exitCode = runCli(process.argv.slice(2));
module.exports = { runCli, parse, render };
