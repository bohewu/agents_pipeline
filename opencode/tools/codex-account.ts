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
  description: "List and switch local OpenCode Codex accounts.",
  args: {
    action: tool.schema.string().optional().describe("Operation: list, switch, or next."),
    format: tool.schema.string().optional().describe("Output format: text or json."),
    path: tool.schema.string().optional().describe("Optional openai-codex-accounts.json file path."),
    email: tool.schema.string().optional().describe("Email or label to activate when action=switch."),
    index: tool.schema.number().optional().describe("Stored account index to activate when action=switch.")
  },
  async execute(args, context) {
    const scriptPath = path.join(toolDir, "codex-account.py");
    const worktree = context.worktree || process.cwd();
    const pythonBin = resolvePythonCommand();
    const command = [
      ...pythonBin,
      scriptPath,
      "--action",
      args.action || "list",
      "--format",
      args.format || "text",
      "--project-root",
      worktree
    ];

    const accountPath = resolveUserPath(worktree, args.path);
    if (accountPath) {
      command.push("--path", accountPath);
    }
    if (args.email) {
      command.push("--email", args.email);
    }
    if (args.index !== undefined) {
      command.push("--index", String(Math.trunc(args.index)));
    }

    const proc = Bun.spawn(command, { cwd: worktree, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    const output = stdout.trim();
    if (exitCode !== 0) {
      const message = stderr.trim() || output || `codex-account failed with exit code ${exitCode}`;
      throw new Error(message);
    }
    return output;
  }
});
