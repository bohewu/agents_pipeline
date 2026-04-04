import { tool } from "@opencode-ai/plugin";
import path from "path";
import { fileURLToPath } from "url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));

function resolveUserPath(worktree: string, value?: string) {
  if (!value) {
    return value;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  if (value.startsWith("~")) {
    return value;
  }
  return path.join(worktree, value);
}

export default tool({
  description: "Inspect live Codex quota windows and summarize Copilot premium request reports.",
  args: {
    provider: tool.schema.string().optional().describe("Provider to inspect: auto, codex, or copilot."),
    format: tool.schema.string().optional().describe("Output format: text or json."),
    copilot_report: tool.schema.string().optional().describe("Optional Copilot premium-request CSV report path."),
    include_sensitive: tool.schema.boolean().optional().describe("Include less-redacted account metadata in output.")
  },
  async execute(args, context) {
    const scriptPath = path.join(toolDir, "provider-usage.py");
    const worktree = context.worktree || process.cwd();
    const command = [
      "python",
      scriptPath,
      "--provider",
      args.provider || "auto",
      "--format",
      args.format || "text",
      "--project-root",
      worktree
    ];

    const copilotReport = resolveUserPath(worktree, args.copilot_report);
    if (copilotReport) {
      command.push("--copilot-report", copilotReport);
    }
    if (args.include_sensitive) {
      command.push("--include-sensitive");
    }

    const proc = Bun.spawn(command, { cwd: worktree, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    const output = stdout.trim();
    if (exitCode !== 0) {
      const message = stderr.trim() || output || `provider-usage failed with exit code ${exitCode}`;
      throw new Error(message);
    }
    return output;
  }
});
