import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function resolvePath(worktree: string, value?: string) {
  if (!value || value.trim() === "") {
    return path.join(worktree, "generated", "codex-imagegen");
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  if (value.startsWith("~")) {
    return value;
  }
  return path.join(worktree, value);
}

async function listImages(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function buildPrompt(args: any, outputDir: string) {
  const lines = [
    "Use $imagegen to generate or edit an image with Codex CLI's built-in image generation.",
    "Do not write API client code, do not use CODEX_API_KEY, and do not fall back to any external image API or provider.",
    "If built-in Codex image generation is unavailable or fails, return a warning and stop.",
    "",
    "Image request:",
    String(args.prompt).trim(),
    "",
    `Save the generated image file inside this directory: ${outputDir}`,
  ];

  if (args.file_stem) {
    lines.push(`Use this filename stem when possible: ${args.file_stem}`);
  }
  if (args.size) {
    lines.push(`Requested size or aspect ratio: ${args.size}`);
  }
  if (args.quality) {
    lines.push(`Requested quality: ${args.quality}`);
  }
  if (args.background) {
    lines.push(`Requested background: ${args.background}`);
  }

  lines.push(
    "",
    "When finished, return a concise JSON-like summary with:",
    "- status",
    "- files",
    "- notes",
  );

  return lines.join("\n");
}

function buildCodexCommand(args: any, prompt: string) {
  const codexCommand = args.codex_command || "codex";
  const command = [codexCommand];
  const imageFeature = args.image_generation_feature || "image_generation";

  if (args.suppress_codex_sync_warnings !== false) {
    command.push("--disable", "plugins", "--disable", "general_analytics", "--disable", "shell_snapshot");
  }

  if (args.enable_image_generation !== false) {
    command.push("--enable", imageFeature);
  }

  if (args.model) {
    command.push("-c", `model=${args.model}`);
  }

  command.push("exec", "--ephemeral", "--sandbox", args.sandbox || "workspace-write", prompt);
  return command;
}

export default tool({
  description:
    "Generate or edit an image by delegating to Codex CLI with $imagegen, using the locally signed-in Codex account and Codex usage limits.",
  args: {
    prompt: tool.schema.string().describe("Image generation or edit request to send to Codex CLI."),
    output_dir: tool.schema.string().optional().describe("Directory where Codex should save generated images. Relative paths resolve from the OpenCode worktree."),
    file_stem: tool.schema.string().optional().describe("Preferred lowercase filename stem without extension."),
    size: tool.schema.string().optional().describe("Requested image size, aspect ratio, or dimensions, for example 1024x1024."),
    quality: tool.schema.string().optional().describe("Requested quality hint, for example low, medium, or high."),
    background: tool.schema.string().optional().describe("Requested background handling, for example transparent or white."),
    model: tool.schema.string().optional().describe("Optional Codex model config override passed as -c model=<value>."),
    sandbox: tool.schema.string().optional().describe("Codex exec sandbox mode. Default: workspace-write."),
    suppress_codex_sync_warnings: tool.schema.boolean().optional().describe("Pass per-run Codex flags to reduce plugin, analytics, and shell snapshot warning noise. Default: true."),
    enable_image_generation: tool.schema.boolean().optional().describe("Whether to pass --enable image_generation to Codex CLI. Default: true."),
    image_generation_feature: tool.schema.string().optional().describe("Codex CLI image-generation feature flag name. Default: image_generation."),
    codex_command: tool.schema.string().optional().describe("Codex executable command. Default: codex."),
  },
  async execute(args, context) {
    const worktree = context.worktree || process.cwd();
    const outputDir = resolvePath(worktree, args.output_dir);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error: any) {
      return JSON.stringify(
        {
          status: "warning",
          warning: `Could not create output directory (${outputDir}): ${error?.message || String(error)}`,
          output_dir: outputDir,
          generated_files: [],
          fallback_used: false,
        },
        null,
        2,
      );
    }

    const before = new Set(await listImages(outputDir));
    const prompt = buildPrompt(args, outputDir);
    const command = buildCodexCommand(args, prompt);
    const env = { ...process.env };
    delete env.CODEX_API_KEY;

    let proc;
    try {
      proc = Bun.spawn(command, {
        cwd: worktree,
        stdout: "pipe",
        stderr: "pipe",
        env,
      });
    } catch (error: any) {
      return JSON.stringify(
        {
          status: "warning",
          warning: `Failed to start Codex CLI (${command[0]}): ${error?.message || String(error)}`,
          output_dir: outputDir,
          generated_files: [],
          fallback_used: false,
        },
        null,
        2,
      );
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    const after = await listImages(outputDir);
    const generated = after.filter((file) => !before.has(file));
    const result = {
      status: exitCode === 0 && generated.length > 0 ? "ok" : "warning",
      exit_code: exitCode,
      output_dir: outputDir,
      generated_files: generated,
      warning:
        exitCode !== 0
          ? "Codex CLI image generation did not complete successfully. No API or provider fallback was attempted."
          : generated.length === 0
            ? "Codex CLI completed, but no new image files were detected in the output directory. No API or provider fallback was attempted."
            : "",
      fallback_used: false,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command: [command[0], "exec", "--ephemeral", "--sandbox", args.sandbox || "workspace-write", "<prompt>"].join(" "),
    };

    return JSON.stringify(result, null, 2);
  },
});
