"use strict";

const { POLICY_FILE, LIMITS, fail, git, gitText, repository, head, isOid, resolveCommit, tree, blob, parsePolicy, policyAckRecord, writePolicyAck, consumePolicyAck, policy } = require("./common");
const { detectorContext, detect } = require("./detectors");
const { Gitleaks } = require("./gitleaks");

function parseRange(cwd, value) {
  const parts = value.split("..");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts.some(p => p.startsWith("."))) fail(3, "Use an explicit BASE..HEAD range, or EMPTY..HEAD for all ancestry.");
  return { base: parts[0] === "EMPTY" ? null : resolveCommit(cwd, parts[0]), tip: resolveCommit(cwd, parts[1]) };
}
function pushRanges(cwd, input) {
  if (Buffer.byteLength(input) > 65536) fail(3, "Pre-push input exceeds its limit.");
  const ranges = [];
  const updatedBranches = [];
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !isOid(fields[1]) || !isOid(fields[3])) fail(3, "Malformed pre-push ref input.");
    if (/^0+$/.test(fields[1])) continue; // Ref deletion introduces no objects.
    const range = {
      tip: resolveCommit(cwd, fields[1]),
      base: /^0+$/.test(fields[3]) ? null : resolveCommit(cwd, fields[3])
    };
    ranges.push(range);
    if (fields[2].startsWith("refs/heads/") && range.base) updatedBranches.push(range);
    if (fields[2].startsWith("refs/tags/") && !range.base) range.newTag = true;
  }
  // A new tag at the same commit as an updated remote branch introduces no
  // commits beyond that branch's audited outgoing range.
  for (const range of ranges) {
    if (range.newTag) {
      const branch = updatedBranches.find(candidate => candidate.tip === range.tip);
      if (branch) range.base = branch.base;
      delete range.newTag;
    }
  }
  return ranges;
}
function commitRange(cwd, range) {
  if (gitText(cwd, ["rev-parse", "--is-shallow-repository"]) !== "false") fail(2, "Commit-range scanning requires complete local history; shallow input was not approved.");
  const args = ["rev-list", "--reverse", "--topo-order", range.tip];
  if (range.base) args.push(`^${range.base}`);
  const commits = gitText(cwd, args).split("\n").filter(Boolean);
  if (commits.length > LIMITS.commits || commits.some(c => !isOid(c))) fail(2, "Commit-range limit exceeded or history could not be resolved.");
  return commits;
}
function safeReportFile(file, redactions) {
  let safe = file;
  for (const value of [...redactions].sort((a, b) => b.length - a.length)) safe = safe.split(value).join("[REDACTED]");
  return safe.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[A]KIA[0-9A-Z]{16}|[A]SIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[A-Za-z0-9_-]{35})\b/g, "[REDACTED]");
}
function check(cwd, opts, input = "") {
  cwd = repository(cwd);
  const initialHead = head(cwd);
  const initialTree = opts.staged ? gitText(cwd, ["write-tree"]) : null;
  const report = {
    status: "pass", scope: opts.staged ? "staged" : opts.prePush ? "pre-push" : "range",
    profiles: [], engines: [], policy_sources: [], tree_oid: initialTree,
    checked_files: 0, checked_commits: 0, coverage: "first-screen", findings: []
  };
  const reportRedactions = new Set();
  const treeCache = new Map();
  const scanCache = new Map();
  const contexts = new Map();
  const externals = [];
  const seenCommits = new Set();
  const completed = new Set();
  let pendingPolicyAck = null;
  const getTree = rev => {
    const key = rev || "EMPTY";
    if (!treeCache.has(key)) treeCache.set(key, tree(cwd, rev));
    return treeCache.get(key);
  };
  function getContext(p) {
    const key = `${p.engine}\0${p.gitleaksPath}`;
    if (!contexts.has(key)) {
      const external = p.engine === "gitleaks-required" ? new Gitleaks(p.gitleaksPath) : null;
      if (external) externals.push(external);
      contexts.set(key, detectorContext(cwd, external));
    }
    return { context: contexts.get(key), key };
  }
  function append(file, finding, p, commit, existing = false) {
    const severity = existing && p.profile === "legacy-ratchet" && finding.severity === "error" ? "info" : finding.severity;
    const action = severity === "error" && p.profile !== "audit" ? "block" : severity === "info" ? "allow-existing" : "warn";
    report.findings.push({ file, rule: finding.rule, line: finding.line, severity, action, existing, ...(commit ? { commit } : {}) });
    if (finding.coverage) report.coverage = "partial-first-screen";
    if (report.findings.length > LIMITS.findings) fail(2, "Finding limit exceeded; no partial approval was issued.");
  }
  function scanFile(file, entry, ctx) {
    if (!entry) return [];
    const key = `${ctx.key}\0${file}\0${entry.mode}\0${entry.oid}`;
    if (!scanCache.has(key)) scanCache.set(key, detect(file, entry, blob(cwd, entry), ctx.context));
    const findings = scanCache.get(key);
    for (const finding of findings) {
      if (finding.redaction === null || finding.redaction === undefined) continue;
      const value = Buffer.isBuffer(finding.redaction) ? finding.redaction.toString("utf8") : String(finding.redaction);
      if (value) reportRedactions.add(value);
    }
    return findings;
  }
  function compare(afterRev, beforeRevs, p, commit = null) {
    const ctx = getContext(p); // Required engine failure is not suppressed by audit or an empty change set.
    const after = getTree(afterRev);
    const before = beforeRevs.length ? beforeRevs.map(getTree) : [new Map()];
    const changed = [...after.keys()].filter(file => before.some(t => {
      const old = t.get(file), current = after.get(file);
      return !old || old.oid !== current.oid || old.mode !== current.mode;
    })).sort();
    for (const file of changed) {
      if (++report.checked_files > LIMITS.files) fail(2, "Changed-file limit exceeded; narrow the scan scope.");
      const findings = scanFile(file, after.get(file), ctx);
      let allowance = null;
      if (p.profile === "legacy-ratchet") {
        for (const previous of before) {
          const counts = new Map();
          for (const f of scanFile(file, previous.get(file), ctx)) counts.set(f.identity, (counts.get(f.identity) || 0) + 1);
          if (allowance === null) allowance = counts;
          else {
            for (const [identity, count] of allowance) {
              const shared = Math.min(count, counts.get(identity) || 0);
              if (shared) allowance.set(identity, shared); else allowance.delete(identity);
            }
          }
        }
      }
      allowance ||= new Map();
      for (const f of findings) {
        const existing = (allowance.get(f.identity) || 0) > 0;
        if (existing) allowance.set(f.identity, allowance.get(f.identity) - 1);
        append(file, f, p, commit, existing);
      }
    }
  }
  function notePolicy(p) {
    for (const [key, value] of [["profiles", p.profile], ["engines", p.engine], ["policy_sources", p.source]]) {
      if (!report[key].includes(value)) report[key].push(value);
    }
  }
  try {
    if (opts.staged) {
      const p = policy(cwd, opts, initialHead);
      notePolicy(p);
      compare(initialTree, initialHead ? [initialHead] : [], p);
      const oldPolicy = getTree(initialHead).get(POLICY_FILE);
      const newPolicy = getTree(initialTree).get(POLICY_FILE);
      const policyChanged = oldPolicy?.oid !== newPolicy?.oid || oldPolicy?.mode !== newPolicy?.mode;
      if (policyChanged && newPolicy) {
        if (newPolicy.mode !== "100644" && newPolicy.mode !== "100755") fail(3, "Staged policy must be a regular file.");
        parsePolicy(blob(cwd, newPolicy));
      }
      if (opts.policySource !== "cli" && policyChanged) {
        const acknowledgement = policyAckRecord(initialHead, initialTree, oldPolicy, newPolicy);
        const acknowledged = opts.ackPolicyChange || (opts.consumePolicyAck && consumePolicyAck(cwd, acknowledgement));
        if (!acknowledged) append(POLICY_FILE, { rule: "POLICY_CHANGE_REQUIRES_ACK", severity: "error", line: 1 }, p);
        if (opts.ackPolicyChange) pendingPolicyAck = acknowledgement;
      }
      if (head(cwd) !== initialHead || gitText(cwd, ["write-tree"]) !== initialTree) fail(2, "HEAD or the staged tree changed during scanning; rerun the check.");
    } else {
      const ranges = opts.prePush ? pushRanges(cwd, input) : [parseRange(cwd, opts.range)];
      if (!ranges.length) {
        const p = policy(cwd, opts, initialHead);
        notePolicy(p); getContext(p);
      }
      for (const range of ranges) {
        // A candidate's new policy cannot weaken checks of its own incoming commits.
        const p = policy(cwd, opts, range.base);
        notePolicy(p);
        getContext(p);
        for (const commit of commitRange(cwd, range)) {
          const key = `${commit}\0${p.profile}\0${p.engine}\0${p.gitleaksPath}`;
          if (completed.has(key)) continue;
          completed.add(key);
          seenCommits.add(commit);
          if (seenCommits.size > LIMITS.commits) fail(2, "Combined pre-push commit limit exceeded.");
          const rows = gitText(cwd, ["rev-list", "--parents", "-n", "1", commit]).split(" ");
          if (rows.some(oid => !isOid(oid))) fail(2, "Malformed commit-parent metadata.");
          compare(commit, rows.slice(1), p, commit);
        }
      }
      report.checked_commits = seenCommits.size;
    }
    for (const finding of report.findings) finding.file = safeReportFile(finding.file, reportRedactions);
    report.status = report.findings.some(f => f.action === "block") ? "blocked" : report.findings.some(f => f.action === "warn") || report.policy_sources.includes("default-audit") ? "warn" : "pass";
    if (pendingPolicyAck && report.status !== "blocked") writePolicyAck(cwd, pendingPolicyAck);
    return report;
  } finally { for (const external of externals) external.close(); }
}
module.exports = { check, parseRange, pushRanges, commitRange };
