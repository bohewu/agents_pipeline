"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { command, fail } = require("./common");

// A fixed adapter contract, not a claim that this is the newest Gitleaks release.
const GITLEAKS_VERSION = "8.24.2";
const TEMPLATE = '[{{range $i, $f := .}}{{if $i}},{{end}}{"RuleID":{{printf "%q" .RuleID}},"StartLine":{{.StartLine}},"EndLine":{{.EndLine}},"StartColumn":{{.StartColumn}},"EndColumn":{{.EndColumn}}}{{end}}]';

class Gitleaks {
  constructor(executable) {
    this.executable = executable;
    this.env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GITLEAKS_")));
    const version = command(executable, ["version"], { env: this.env });
    if (version.status !== 0 || version.stdout.toString("utf8").trim().replace(/^v/, "") !== GITLEAKS_VERSION) {
      fail(2, "Required Gitleaks adapter version is unavailable or incompatible.");
    }
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-guard-"));
    try {
      fs.chmodSync(this.directory, 0o700);
      this.config = path.join(this.directory, "scanner.toml");
      this.template = path.join(this.directory, "metadata.tmpl");
      this.ignore = path.join(this.directory, "empty.ignore");
      this.report = path.join(this.directory, "metadata.json");
      fs.writeFileSync(this.config, '[extend]\nuseDefault = true\n', { mode: 0o600, flag: "wx" });
      fs.writeFileSync(this.template, TEMPLATE, { mode: 0o600, flag: "wx" });
      fs.writeFileSync(this.ignore, "", { mode: 0o600, flag: "wx" });
    } catch { this.close(); fail(2, "Could not create private scanner metadata files."); }
  }
  scan(text) {
    // Only rule and source coordinates reach disk. No Match/Secret/snippet fields.
    fs.writeFileSync(this.report, "", { mode: 0o600 });
    const result = command(this.executable, [
      "stdin", "--no-banner", "--no-color", "--redact=100", "--log-level", "fatal",
      "--config", this.config, "--gitleaks-ignore-path", this.ignore,
      "--ignore-gitleaks-allow", "--report-format", "template", "--report-template", this.template,
      "--report-path", this.report, "--exit-code", "10"
    ], { cwd: this.directory, env: this.env, input: Buffer.from(text, "utf8"), timeout: 10000 });
    if (![0, 10].includes(result.status)) fail(2, "Required Gitleaks scan failed; diagnostic output was suppressed.");
    let rows;
    try {
      if (fs.statSync(this.report).size > 1024 * 1024) fail(2, "Scanner metadata limit exceeded.");
      rows = JSON.parse(fs.readFileSync(this.report, "utf8"));
    } catch { fail(2, "Required scanner returned invalid metadata."); }
    if (!Array.isArray(rows) || (result.status === 10 && rows.length === 0) || (result.status === 0 && rows.length !== 0)) fail(2, "Required scanner returned inconsistent metadata.");
    const lines = text.split("\n");
    return rows.map(row => {
      const keys = ["RuleID", "StartLine", "EndLine", "StartColumn", "EndColumn"];
      if (!row || Object.keys(row).some(k => !keys.includes(k)) || !/^[A-Za-z0-9_-]{1,100}$/.test(row.RuleID || "") ||
          keys.slice(1).some(k => !Number.isInteger(row[k])) || row.StartLine < 0 || row.EndLine < row.StartLine || row.EndLine >= lines.length ||
          row.StartColumn < 1 || row.EndColumn < 1) fail(2, "Required scanner returned invalid source coordinates.");
      // Pinned 8.24.2 stdin reports zero-based lines. Its byte columns count the
      // preceding newline on noninitial lines (origin 2 instead of origin 1).
      // Normalize this version-specific contract; public reports remain 1-based.
      const selected = lines.slice(row.StartLine, row.EndLine + 1).map(v => Buffer.from(v));
      const start = row.StartColumn - (row.StartLine === 0 ? 1 : 2);
      const end = row.EndColumn - (row.EndLine === 0 ? 0 : 1);
      if (start < 0 || end < 0 || start > selected[0].length || end > selected[selected.length - 1].length) fail(2, "Scanner coordinates exceed the source span.");
      let span;
      if (selected.length === 1) {
        if (end <= start) fail(2, "Invalid scanner source span.");
        span = selected[0].subarray(start, end);
      } else {
        selected[0] = selected[0].subarray(start);
        selected[selected.length - 1] = selected[selected.length - 1].subarray(0, end);
        span = Buffer.concat(selected.flatMap((v, i) => i ? [Buffer.from("\n"), v] : [v]));
      }
      return { rule: row.RuleID, line: row.StartLine + 1, match: span };
    });
  }
  close() {
    if (this.directory) fs.rmSync(this.directory, { recursive: true, force: true });
    this.directory = null;
  }
}
module.exports = { Gitleaks, GITLEAKS_VERSION };
