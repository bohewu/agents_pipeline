import { tool } from "@opencode-ai/plugin";
import path from "path";
import { fileURLToPath } from "url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePythonCommand() {
  const candidates = [["python3"], ["python"], ["py", "-3"], ["py"]];
  for (const candidate of candidates) {
    try {
      if (process.platform === "win32") {
        const probe = Bun.spawnSync(["cmd.exe", "/d", "/c", ...candidate, "--version"], {
          stdio: ["ignore", "ignore", "ignore"]
        });
        if (probe.exitCode === 0) {
          return ["cmd.exe", "/d", "/c", ...candidate];
        }
        continue;
      }
      const probe = Bun.spawnSync([...candidate, "--version"], { stdio: ["ignore", "ignore", "ignore"] });
      if (probe.exitCode === 0) {
        return candidate;
      }
    } catch {}
  }
  throw new Error("Missing Python interpreter: install python3, python, or the Windows py launcher.");
}

export default tool({
  description: "Inspect live Codex quota windows.",
  args: {
    provider: tool.schema.string().optional().describe("Provider to inspect: auto or codex."),
    format: tool.schema.string().optional().describe("Output format: text or json."),
    include_sensitive: tool.schema.boolean().optional().describe("Include less-redacted account metadata in output. Never use this in shared logs unless required.")
  },
  async execute(args, context) {
    const scriptPath = path.join(toolDir, "provider-usage.py");
    const worktree = context.worktree || process.cwd();
    const pythonBin = resolvePythonCommand();
    const command = [
      ...pythonBin,
      scriptPath,
      "--provider",
      args.provider || "auto",
      "--format",
      args.format || "text",
      "--project-root",
      worktree
    ];

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
