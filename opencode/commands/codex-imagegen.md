---
description: Generate or edit images through Codex CLI image generation using Codex quota
agent: generalist
---

# Codex Imagegen

## Raw input

```text
$ARGUMENTS
```

## Notes

- Use the repo-managed `codex-imagegen` skill.
- Always invoke the `codex-imagegen` custom tool when it is available.
- The tool must use Codex CLI and `$imagegen`.
- The tool must pass the Codex CLI image-generation feature flag per run.
- If the input includes `--output-path=<path>`, map it to the tool's `output_path` argument.
- Do not use direct OpenAI Images API calls.
- Do not set or rely on `CODEX_API_KEY`.
- Do not use any provider fallback.
- If the tool returns `status: "warning"`, show the warning and stop.

## Examples

```text
/codex-imagegen pixel-art 32x32 transparent slime idle sprite, save under assets/sprites
/codex-imagegen square app icon, clean 2D style, file_stem=task-orbit-icon
/codex-imagegen simple blue apple icon --output-path=generated/smoke/blue-apple.png
/codex-imagegen edit this reference into a watercolor sticker, output_dir=art/generated
```
