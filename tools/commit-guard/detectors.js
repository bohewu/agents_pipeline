"use strict";

const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const { LIMITS, fail } = require("./common");

const PLACEHOLDERS = new Set(["example", "dummy", "changeme", "change-me", "<secret>", "<password>", "<token>", "<client-secret>", "your-secret-here"]);
function placeholder(value) {
  return PLACEHOLDERS.has(value.toLowerCase()) || /^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value) || /^%[A-Z_][A-Z0-9_]*%$/.test(value);
}
function decode(buffer) {
  try {
    if (buffer.length >= 2 && buffer[0] === 255 && buffer[1] === 254) return new TextDecoder("utf-16le", { fatal: true }).decode(buffer);
    if (buffer.length >= 2 && buffer[0] === 254 && buffer[1] === 255) return new TextDecoder("utf-16be", { fatal: true }).decode(buffer);
    if (buffer.includes(0)) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch { return null; }
}
function normalizePath(value) { return value.replace(/\\+/g, "/"); }
function detectorContext(root, external) {
  const key = crypto.randomBytes(32);
  const roots = [...new Set([root, os.homedir(), process.env.USERPROFILE].filter(v => v && v.length > 3).map(normalizePath))];
  return {
    external, roots,
    identity(rule, value) { return crypto.createHmac("sha256", key).update(rule).update("\0").update(value).digest("hex"); }
  };
}
function redactsValue(rule) {
  return rule.startsWith("SEC_") || rule.startsWith("GITLEAKS_") || rule.startsWith("PATH_") || rule === "FILE_PRIVATE_KEY";
}
function detect(file, entry, buffer, context) {
  const found = [];
  const add = (rule, line, value, severity = "error", coverage = false, redactionValue = value) => {
    found.push({ rule, line, severity, coverage, identity: context.identity(rule, value), redaction: redactsValue(rule) ? redactionValue : null });
    if (found.length > LIMITS.findings) fail(2, "Finding limit exceeded; no partial approval was issued.");
  };
  if (entry.type !== "blob") { add("SKIP_SUBMODULE", 1, entry.oid, "warning", true); return found; }
  const basename = path.posix.basename(file).toLowerCase();
  const envFile = (basename === ".env" || basename.startsWith(".env.")) && ![".env.example", ".env.sample", ".env.template"].includes(basename);
  if (envFile || basename === "secrets.json") add("FILE_SENSITIVE_CONFIG", 1, basename);
  if (/\.(?:pfx|p12)$/.test(basename) || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(basename)) add("FILE_PRIVATE_KEY", 1, buffer);
  if (/\.(?:log|trace|trx|binlog|dmp|dump|zip|7z|tar|gz)$/.test(basename)) add("FILE_REVIEW_ARTIFACT", 1, basename, "warning");
  if (entry.mode === "120000") add("SKIP_SYMLINK_TARGET", 1, "symlink", "warning", true);
  const raw = decode(buffer);
  if (raw === null) { add("SKIP_BINARY_OR_ENCODING", 1, "binary", "warning", true); return found; }
  const text = raw.replace(/\r\n?/g, "\n");
  const lineAt = offset => text.slice(0, offset).split("\n").length;
  const matchAll = (regex, callback) => { for (const match of text.matchAll(regex)) callback(match); };
  matchAll(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)/g,
    m => add("SEC_PRIVATE_KEY", lineAt(m.index), m[0]));
  matchAll(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[A]KIA[0-9A-Z]{16}|[A]SIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[A-Za-z0-9_-]{35})\b/g,
    m => add("SEC_KNOWN_TOKEN", lineAt(m.index), m[0]));
  matchAll(/\b(?:password|passwd|pwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|secret(?:[_-]?key)?)\b["']?\s*[:=]\s*(["'])([^"'\r\n]+)\1/gi,
    m => { if (!placeholder(m[2])) add("SEC_CREDENTIAL_LITERAL", lineAt(m.index), m[2]); });
  matchAll(/\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:@]+:([^\s/@]+)@/gi,
    m => { if (!placeholder(m[1])) add("SEC_URL_PASSWORD", lineAt(m.index), m[1]); });
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/(?:server|data source|host|database|initial catalog|user id|uid)\s*=/i.test(line)) {
      for (const m of line.matchAll(/\b(?:password|pwd)\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^;\s"'<>]+))/gi)) {
        const value = m[1] ?? m[2] ?? m[3];
        if (value && !placeholder(value)) add("SEC_CONNECTION_PASSWORD", index + 1, value);
      }
    }
    const env = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|TOKEN|SECRET|API_KEY)|PASSWORD|PASSWD|TOKEN|SECRET|API_KEY)\s*=\s*([^\s"'#][^\r\n#]*)\s*$/);
    if (env && !placeholder(env[2].trim())) add("SEC_ENV_LITERAL", index + 1, env[2].trim());
    const normalized = normalizePath(line);
    for (const m of normalized.matchAll(/(?:[A-Za-z]:\/Users\/|\/(?:home|Users)\/)([^/\s"'<>`]+)(?:\/[^\s"'<>`]*)?/g)) {
      if (!["user", "username"].includes(m[1].toLowerCase())) add("PATH_PERSONAL", index + 1, m[0]);
    }
    for (const root of context.roots) {
      const windows = /^[A-Za-z]:/.test(root);
      const haystack = windows ? normalized.toLowerCase() : normalized;
      const needle = windows ? root.toLowerCase() : root;
      let at = -1;
      while ((at = haystack.indexOf(needle, at + 1)) !== -1) {
        const after = haystack[at + needle.length];
        if (!after || /[\/\s"'<>`),;\]]/.test(after)) {
          let end = at + needle.length;
          if (after === "/") while (end < haystack.length && !/[\s"'<>`),;\]]/.test(haystack[end])) end++;
          const matched = normalized.slice(at, end);
          add("PATH_CURRENT_MACHINE", index + 1, windows ? matched.toLowerCase() : matched, "error", false, matched);
        }
      }
    }
    // Preserve UNC's leading double separator; ordinary path normalization collapses it.
    const unc = line.replace(/\\/g, "/").replace(/\/{2,}/g, "//");
    for (const m of unc.matchAll(/(?:^|[\s"'(])\/\/([^/\s"']+)\/+([^\s"']+)/g)) add("PATH_UNC", index + 1, m[0].trim(), "warning");
    for (const m of normalized.matchAll(/\b[A-Za-z]:\/(?!Users\/|Windows(?:\/|\b)|Program Files(?:\/|\b))[^\s"'<>`]+/g)) add("PATH_ABSOLUTE_DRIVE", index + 1, m[0], "warning");
  });
  if (context.external) {
    for (const item of context.external.scan(text)) add(`GITLEAKS_${item.rule}`, item.line, item.match);
  }
  return found;
}
module.exports = { detectorContext, detect, decode, placeholder, normalizePath };
