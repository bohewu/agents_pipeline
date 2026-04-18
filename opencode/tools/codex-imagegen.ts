import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const NUMERIC_SIZE_RE = /^\s*(\d+)\s*x\s*(\d+)\s*$/i;
const WINDOWS_CODEX_EXE_PARTS = [
  "node_modules",
  "@openai",
  "codex",
  "node_modules",
  "@openai",
  "codex-win32-x64",
  "vendor",
  "x86_64-pc-windows-msvc",
  "codex",
  "codex.exe",
];

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

function requestedOutputPath(args: any) {
  return args.output_path || args["output-path"];
}

function positiveInteger(value: any) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseNumericSize(value?: string) {
  if (!value) {
    return null;
  }
  const match = NUMERIC_SIZE_RE.exec(value);
  if (!match) {
    return null;
  }
  const width = positiveInteger(match[1]);
  const height = positiveInteger(match[2]);
  if (!width || !height) {
    return null;
  }
  return { width, height };
}

function formatNumericSize(width: number, height: number) {
  return `${width}x${height}`;
}

function normalizeRequestedSize(args: any) {
  const requestedSize = String(args.size || args.default_size || "").trim();
  if (!requestedSize) {
    return {
      requestedSize: "",
      effectiveSize: "",
      sizeCapped: false,
    };
  }

  const parsed = parseNumericSize(requestedSize);
  if (!parsed) {
    return {
      requestedSize,
      effectiveSize: requestedSize,
      sizeCapped: false,
    };
  }

  const maxSide = positiveInteger(args.max_side);
  const maxPixels = positiveInteger(args.max_pixels);
  let width = parsed.width;
  let height = parsed.height;
  let scale = 1;

  if (maxSide > 0) {
    scale = Math.min(scale, maxSide / Math.max(width, height));
  }

  if (maxPixels > 0) {
    scale = Math.min(scale, Math.sqrt(maxPixels / (width * height)));
  }

  if (scale < 1) {
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  if (maxSide > 0) {
    while (Math.max(width, height) > maxSide) {
      if (width >= height && width > 1) {
        width -= 1;
      } else if (height > 1) {
        height -= 1;
      } else {
        break;
      }
    }
  }

  if (maxPixels > 0) {
    while (width * height > maxPixels) {
      if (width >= height && width > 1) {
        width -= 1;
      } else if (height > 1) {
        height -= 1;
      } else {
        break;
      }
    }
  }

  const effectiveSize = formatNumericSize(width, height);
  return {
    requestedSize,
    effectiveSize,
    sizeCapped: effectiveSize !== requestedSize,
  };
}

function resolveOutputTarget(worktree: string, args: any) {
  const outputPath = requestedOutputPath(args);
  if (outputPath) {
    const resolvedOutputPath = resolvePath(worktree, outputPath);
    return {
      outputDir: path.dirname(resolvedOutputPath),
      outputPath: resolvedOutputPath,
    };
  }
  return {
    outputDir: resolvePath(worktree, args.output_dir),
    outputPath: "",
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function fileSignature(file: string) {
  try {
    const stats = await fs.stat(file);
    if (!stats.isFile()) {
      return null;
    }
    return {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function changedSignature(before: Awaited<ReturnType<typeof fileSignature>>, after: Awaited<ReturnType<typeof fileSignature>>) {
  if (!after) {
    return false;
  }
  if (!before) {
    return true;
  }
  return before.size !== after.size || before.mtimeMs !== after.mtimeMs;
}

function compareNodeVersionDirectories(a: string, b: string) {
  const normalize = (value: string) =>
    value
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const av = normalize(a);
  const bv = normalize(b);
  for (let index = 0; index < Math.max(av.length, bv.length); index += 1) {
    const delta = (bv[index] || 0) - (av[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return b.localeCompare(a);
}

async function fnmCodexCandidates(fnmRoot?: string) {
  if (!fnmRoot) {
    return [];
  }

  const versionsDir = path.join(fnmRoot, "node-versions");
  let entries;
  try {
    entries = await fs.readdir(versionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareNodeVersionDirectories)
    .map((version) => path.join(versionsDir, version, "installation", ...WINDOWS_CODEX_EXE_PARTS));
}

async function windowsCodexCandidates(env: Record<string, string | undefined>) {
  const candidates: string[] = [];
  const appData = env.APPDATA;
  const localAppData = env.LOCALAPPDATA;
  const fnmRoots = unique([
    env.FNM_DIR || "",
    appData ? path.join(appData, "fnm") : "",
    localAppData ? path.join(localAppData, "fnm") : "",
  ]);

  for (const fnmRoot of fnmRoots) {
    candidates.push(...(await fnmCodexCandidates(fnmRoot)));
  }

  if (appData) {
    candidates.push(path.join(appData, "npm", ...WINDOWS_CODEX_EXE_PARTS));
    candidates.push(path.join(appData, "npm", "codex.cmd"));
  }

  if (localAppData) {
    candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
  }

  const existing = [];
  for (const candidate of unique(candidates)) {
    if (await exists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function resolveCodexCommand(args: any, env: Record<string, string | undefined>) {
  const explicit = String(args.codex_command || env.CODEX_IMAGEGEN_CODEX_COMMAND || "").trim();
  if (explicit) {
    return {
      command: explicit,
      source: args.codex_command ? "argument" : "CODEX_IMAGEGEN_CODEX_COMMAND",
      candidates: [],
    };
  }

  if (process.platform === "win32") {
    const candidates = await windowsCodexCandidates(env);
    if (candidates.length > 0) {
      return {
        command: candidates[0],
        source: "auto-discovered",
        candidates,
      };
    }
  }

  return {
    command: "codex",
    source: "PATH",
    candidates: [],
  };
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

function buildPrompt(args: any, outputDir: string, outputPath: string, sizeInfo: ReturnType<typeof normalizeRequestedSize>) {
  const lines = [
    "Use $imagegen to generate or edit an image with Codex CLI's built-in image generation.",
    "Do not write API client code, do not use CODEX_API_KEY, and do not fall back to any external image API or provider.",
    "If built-in Codex image generation is unavailable or fails, return a warning and stop.",
    "",
    "Image request:",
    String(args.prompt).trim(),
    "",
  ];

  if (outputPath) {
    lines.push(`Save the generated image file exactly at this path: ${outputPath}`);
  } else {
    lines.push(`Save the generated image file inside this directory: ${outputDir}`);
  }

  if (args.file_stem) {
    lines.push(`Use this filename stem when possible: ${args.file_stem}`);
  } else if (outputPath) {
    lines.push(`Use this filename stem when possible: ${path.basename(outputPath, path.extname(outputPath))}`);
  }
  if (sizeInfo.effectiveSize) {
    lines.push(`Requested size or aspect ratio: ${sizeInfo.effectiveSize}`);
  }
  if (sizeInfo.sizeCapped) {
    lines.push(`The original requested size was larger, so keep generation at this capped size: ${sizeInfo.effectiveSize}.`);
  }
  if (args.quality) {
    lines.push(`Requested quality: ${args.quality}`);
  }
  if (args.background) {
    lines.push(`Requested background: ${args.background}`);
  }

  if (args.prefer_single_pass !== false) {
    lines.push(
      "Prefer a single generation pass. Avoid proactive retries, self-edits, or local post-processing unless the first pass fails to create the requested output file.",
    );
    if (String(args.background || "").trim().toLowerCase() === "transparent") {
      lines.push("If transparency is requested, generate true alpha directly instead of a rendered checkerboard backdrop.");
    }
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

function buildCodexCommand(args: any, prompt: string, codexCommand: string) {
  const command = [codexCommand];
  const imageFeature = args.image_generation_feature || "image_generation";

  if (args.suppress_codex_sync_warnings !== false) {
    command.push("--disable", "plugins", "--disable", "general_analytics", "--disable", "shell_snapshot");
  }

  if (args.enable_image_generation !== false) {
    command.push("--enable", imageFeature);
  }

  if (args.reasoning_effort) {
    command.push("-c", `model_reasoning_effort=${JSON.stringify(String(args.reasoning_effort))}`);
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
    output_path: tool.schema.string().optional().describe("Exact output image path. Relative paths resolve from the OpenCode worktree. Takes precedence over output_dir and file_stem."),
    "output-path": tool.schema.string().optional().describe("Alias for output_path, useful when the slash command receives --output-path style input."),
    size: tool.schema.string().optional().describe("Requested image size, aspect ratio, or dimensions, for example 1024x1024."),
    quality: tool.schema.string().optional().describe("Requested quality hint, for example low, medium, or high."),
    background: tool.schema.string().optional().describe("Requested background handling, for example transparent or white."),
    default_size: tool.schema.string().optional().describe("Fallback size to use when size is omitted, for example 1024x1024."),
    max_side: tool.schema.number().optional().describe("Optional hard cap for the generated image long side when size is numeric."),
    max_pixels: tool.schema.number().optional().describe("Optional hard cap for total generated pixels when size is numeric."),
    reasoning_effort: tool.schema.string().optional().describe("Optional Codex reasoning override, for example low, medium, high, or xhigh."),
    prefer_single_pass: tool.schema.boolean().optional().describe("Ask Codex to avoid proactive retries, self-edits, or post-processing unless the first pass fails to create output. Default: false."),
    model: tool.schema.string().optional().describe("Optional Codex model config override passed as -c model=<value>."),
    sandbox: tool.schema.string().optional().describe("Codex exec sandbox mode. Default: workspace-write."),
    suppress_codex_sync_warnings: tool.schema.boolean().optional().describe("Pass per-run Codex flags to reduce plugin, analytics, and shell snapshot warning noise. Default: true."),
    enable_image_generation: tool.schema.boolean().optional().describe("Whether to pass --enable image_generation to Codex CLI. Default: true."),
    image_generation_feature: tool.schema.string().optional().describe("Codex CLI image-generation feature flag name. Default: image_generation."),
    codex_command: tool.schema.string().optional().describe("Codex executable command or absolute path. Default: auto-discover Codex CLI, then codex on PATH."),
  },
  async execute(args, context) {
    const worktree = context.worktree || process.cwd();
    const { outputDir, outputPath } = resolveOutputTarget(worktree, args);
    if (outputPath && !IMAGE_EXTENSIONS.has(path.extname(outputPath).toLowerCase())) {
      return JSON.stringify(
        {
          status: "warning",
          warning: `output_path must end with one of: ${[...IMAGE_EXTENSIONS].join(", ")}. No API or provider fallback was attempted.`,
          output_dir: outputDir,
          output_path: outputPath,
          generated_files: [],
          fallback_used: false,
        },
        null,
        2,
      );
    }

    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error: any) {
      return JSON.stringify(
        {
          status: "warning",
          warning: `Could not create output directory (${outputDir}): ${error?.message || String(error)}`,
          output_dir: outputDir,
          output_path: outputPath,
          generated_files: [],
          fallback_used: false,
        },
        null,
        2,
      );
    }

    const before = new Set(await listImages(outputDir));
    const beforeOutputSignature = outputPath ? await fileSignature(outputPath) : null;
    const sizeInfo = normalizeRequestedSize(args);
    const prompt = buildPrompt(args, outputDir, outputPath, sizeInfo);
    const env = { ...process.env };
    delete env.CODEX_API_KEY;
    const codexCommand = await resolveCodexCommand(args, env);
    const command = buildCodexCommand(args, prompt, codexCommand.command);

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
          warning: `Failed to start Codex CLI (${command[0]}): ${error?.message || String(error)}. Set codex_command or CODEX_IMAGEGEN_CODEX_COMMAND to an executable Codex CLI path if OpenCode cannot see codex on PATH.`,
          output_dir: outputDir,
          output_path: outputPath,
          generated_files: [],
          fallback_used: false,
          codex_command_source: codexCommand.source,
          codex_command_candidates: codexCommand.candidates,
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
    const afterOutputSignature = outputPath ? await fileSignature(outputPath) : null;
    const generated =
      outputPath && changedSignature(beforeOutputSignature, afterOutputSignature)
        ? [outputPath]
        : after.filter((file) => !before.has(file));
    const result = {
      status: exitCode === 0 && generated.length > 0 ? "ok" : "warning",
      exit_code: exitCode,
      output_dir: outputDir,
      output_path: outputPath,
      requested_size: sizeInfo.requestedSize,
      effective_size: sizeInfo.effectiveSize,
      size_capped: sizeInfo.sizeCapped,
      reasoning_effort: args.reasoning_effort || "",
      generated_files: generated,
      warning:
        exitCode !== 0
          ? "Codex CLI image generation did not complete successfully. No API or provider fallback was attempted."
          : generated.length === 0
            ? outputPath
              ? "Codex CLI completed, but the requested output_path was not created or updated. No API or provider fallback was attempted."
              : "Codex CLI completed, but no new image files were detected in the output directory. No API or provider fallback was attempted."
            : "",
      fallback_used: false,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      codex_command_source: codexCommand.source,
      codex_command_candidates: codexCommand.candidates,
      command: [command[0], "exec", "--ephemeral", "--sandbox", args.sandbox || "workspace-write", "<prompt>"].join(" "),
    };

    return JSON.stringify(result, null, 2);
  },
});
