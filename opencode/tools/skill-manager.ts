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
  description: "List, search, and install agent skills from local locations or curated GitHub catalogs.",
  args: {
    action: tool.schema.string().describe("Operation: list, search, or install."),
    source: tool.schema.string().optional().describe("Source: installed, anthropic, awesome-copilot, all, or local."),
    query: tool.schema.string().optional().describe("Search text for skill names."),
    skill_name: tool.schema.string().optional().describe("Skill name to install from a remote source."),
    local_path: tool.schema.string().optional().describe("Local skill folder path when source=local."),
    ref: tool.schema.string().optional().describe("Optional Git ref (tag or commit SHA) for remote GitHub catalog lookups/install."),
    scope: tool.schema.string().optional().describe("Install scope: repo or global."),
    format: tool.schema.string().optional().describe("Output format: text or json."),
    force: tool.schema.boolean().optional().describe("Replace an existing installed skill."),
    dry_run: tool.schema.boolean().optional().describe("Preview install actions without writing files."),
  },
  async execute(args, context) {
    const scriptPath = path.join(toolDir, "skill-manager.py");
    const worktree = context.worktree || process.cwd();
    const pythonBin = resolvePythonCommand();
    const command = [
      ...pythonBin,
      scriptPath,
      "--action",
      args.action,
      "--source",
      args.source || "installed",
      "--scope",
      args.scope || "repo",
      "--format",
      args.format || "text",
      "--project-root",
      worktree,
    ];

    if (args.query) {
      command.push("--query", args.query);
    }
    if (args.skill_name) {
      command.push("--skill-name", args.skill_name);
    }
    if (args.ref) {
      command.push("--ref", args.ref);
    }
    const localPath = resolveUserPath(worktree, args.local_path);
    if (localPath) {
      command.push("--local-path", localPath);
    }
    if (args.force) {
      command.push("--force");
    }
    if (args.dry_run) {
      command.push("--dry-run");
    }

    const proc = Bun.spawn(command, { cwd: worktree, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = stdout.trim();
    if (exitCode !== 0) {
      const message = stderr.trim() || output || `skill-manager failed with exit code ${exitCode}`;
      throw new Error(message);
    }
    return output;
  },
});
