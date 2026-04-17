---
name: codex-imagegen
description: Use when OpenCode should generate or edit images by delegating to Codex CLI image generation through a local custom tool, using the signed-in Codex CLI account and Codex usage limits. Trigger when users ask to call Codex imagegen, use Codex quota for images, generate images from OpenCode through Codex CLI, or use `$imagegen` outside Codex.
---

# Codex Imagegen

Use this skill when the user wants OpenCode to create or edit images through Codex CLI and explicitly wants the work to use Codex quota rather than OpenCode provider usage or direct API billing.

## Hard Boundary

- Invoke the OpenCode custom tool `codex-imagegen` when it is available.
- Do not use the OpenAI Images API directly.
- Do not set or rely on `CODEX_API_KEY`.
- Do not fall back to any other image provider, API, browser tool, local renderer, or manual asset generation.
- If Codex CLI, `$imagegen`, or the image generation feature fails, return the tool warning and stop.
- Treat `fallback_used: false` as required behavior, not a recoverable error.

## Feature Flag

Codex CLI currently exposes the `image_generation` feature flag on some builds.

By default, the `codex-imagegen` tool passes:

```text
--enable image_generation
```

Do not persistently enable or disable Codex features unless the user explicitly asks. Prefer the per-run `--enable` flag so the workflow remains local to this call.

If a local Codex build uses a different image feature name, pass that known name as `image_generation_feature`. Do not guess alternate feature names.

## Codex CLI Path

The tool first honors an explicit `codex_command` argument, then the `CODEX_IMAGEGEN_CODEX_COMMAND` environment variable. If neither is set, it auto-discovers common Windows npm/fnm Codex CLI installs before falling back to `codex` on `PATH`.

If OpenCode reports `codex was not found on PATH`, find the local Codex CLI path and retry with `codex_command` set to that executable. Prefer the native npm package `codex.exe` over temporary `fnm_multishells` shims because OpenCode may not inherit shell-specific PATH entries.

Example Windows native executable shape:

```text
C:\Users\<you>\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\codex\codex.exe
```

Using an alternate Codex CLI executable path is allowed. Using an alternate image API or image provider is not allowed.

## Codex CLI Warnings

By default, the tool also passes per-run disable flags for Codex plugin sync, general analytics, and shell snapshots to reduce non-actionable warning noise. These flags are only for the delegated Codex CLI run and must not be treated as image provider fallback.

If Codex still emits analytics or service-sync warnings but exits successfully and returns generated files, report success with a brief note. Treat missing files, nonzero exit, or a tool warning as the actual failure signal.

## Workflow

1. Convert the user request into a concise image brief.
2. Use `output_path` when the user provides an exact file path, including `--output-path=...` in slash-command text.
3. Otherwise, choose an output directory inside the current project unless the user provides one.
4. Choose a lowercase kebab-case `file_stem` when the user does not provide a filename.
5. Call `codex-imagegen` with:
   - `prompt`
   - `output_path` for an exact file target, or `output_dir` plus `file_stem`
   - optional `size`, `quality`, `background`
6. Report generated files only if the tool returns `status: "ok"`.
7. If the tool returns `status: "warning"`, show the warning plainly and mention that no API/provider fallback was attempted.

## Output Path

Use `output_path` when the caller needs deterministic output for tests, scripts, or follow-up editing. Relative paths resolve from the OpenCode worktree. The path must include a supported image extension: `.png`, `.jpg`, `.jpeg`, or `.webp`.

If slash-command text uses `--output-path=path/to/file.png`, map it to the tool's `output_path` argument. `output_path` takes precedence over `output_dir` and `file_stem`.

## Prompt Shape

The tool wraps the prompt with the required `$imagegen` instruction. Keep the user-facing prompt focused on the desired visual result:

- subject and composition
- style
- dimensions or aspect ratio
- background requirements
- output naming needs
- edit/reference instructions, if applicable

Do not add fallback instructions.
