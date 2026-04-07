import { tool } from "@opencode-ai/plugin";
import path from "path";

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

function resolvePath(worktree: string, value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(worktree, value);
}

export default tool({
  description: "Validate a JSON file against a protocol schema.",
  args: {
    schema: tool.schema.string().describe("Path to a JSON schema file."),
    input: tool.schema.string().describe("Path to a JSON input file.")
  },
  async execute(args, context) {
    const schemaPath = resolvePath(context.worktree, args.schema);
    const inputPath = resolvePath(context.worktree, args.input);
    const scriptPath = path.join(context.worktree, "opencode", "tools", "validate-schema.py");
    const pythonBin = resolvePythonCommand();
    const proc = Bun.spawn([...pythonBin, scriptPath, "--schema", schemaPath, "--input", inputPath], {
      cwd: context.worktree,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = stdout.trim();
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || output || `validate-schema failed with exit code ${exitCode}`);
    }
    return output;
  }
});
