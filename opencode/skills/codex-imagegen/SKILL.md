---
name: codex-imagegen
description: Run bounded local Codex built-in image generation with `codex mcp-server` as the default route and `codex exec` as the availability fallback.
license: See repository license
compatibility: Requires local Codex CLI; built-in image generation only; no `OPENAI_API_KEY` or `scripts/image_gen.py` fallback on this skill.
---

# Codex Imagegen

Use this skill when you already have an approved prompt and need one bounded local image-generation pass through Codex built-in `image_gen`, especially after `/artgen` produced a Direct Use Prompt.

Best fit:
- `/artgen --codex-output=<path>`
- one-shot raster asset generation where the caller explicitly wants local Codex execution

Do not use this skill for:
- broad rendering pipelines or batch queues
- atlas packing, post-processing, slicing, or image review workflows
- API-key fallback or `scripts/image_gen.py`
- non-Codex providers

## Route Preference

1. Preferred route: `codex mcp-server`
2. Availability fallback route: `codex exec --enable image_generation`

Use the CLI route only when the MCP route is unavailable or does not expose built-in image generation.

## Environment Detection

Before attempting generation, detect the environment in a cross-platform way.

Required baseline:
- local `codex` binary must resolve from `PATH`
- the chosen route must start successfully
- built-in image generation must be available for the chosen route

For the MCP route:
- if this repo's `scripts/probe-codex-mcp.py` helper is present, prefer it for the availability probe because it is cross-platform and already matches `codex mcp-server`
- verify that `codex mcp-server` starts
- set `features.image_generation=true` on the Codex run instead of assuming the global feature is already enabled
- run a bounded availability probe before the real generation request

For the CLI route:
- use `codex exec --enable image_generation`
- run a bounded availability probe before the real generation request

If the MCP route is unavailable or does not expose built-in image generation:
- attempt the CLI fallback once

If both routes are unavailable:
- do not claim generation succeeded
- return a warning that states the missing prerequisite
- tell the caller the next step, such as installing Codex CLI or using the returned Direct Use Prompt manually
- preserve the reusable prompt or Direct Use Prompt so the user still has a usable output

If the MCP route started successfully and the failure is no longer an availability/capability issue:
- do not auto-fallback to CLI
- surface the warning and preserve the prompt output

## Path Handling

Treat output paths as cross-platform inputs.

- Preserve absolute paths as provided.
- Resolve relative paths from the repository root or the caller's explicitly chosen working root.
- Do not hardcode `/` or `\` assumptions.
- Quote paths with spaces when passing them to shell commands.
- Create the parent directory if it does not exist and if doing so stays inside the requested writable root.

## Execution Rules

- Use Codex built-in `image_gen` only.
- Do not use `scripts/image_gen.py`.
- Do not require `OPENAI_API_KEY`.
- Use the caller-provided Direct Use Prompt with only the smallest route-specific wrapper needed to save the output.
- If the built-in tool saves to the Codex-managed generated-images directory first, move or copy the selected image to the requested output path.
- Verify the requested file exists before reporting success.
- Prefer one final selected output, not variant dumps, unless the caller explicitly asks for variants.

## Output Contract

On success, report:
- route used
- requested output path
- final written file path
- short verification note

On failure or unavailability, report:
- route requested
- requested output path
- warning
- actionable next step

## Suggested Checks

When practical, verify at least:
- file exists at the requested path
- format matches the requested extension when one was specified
- dimensions or transparency expectations if the caller explicitly asked for them

## Example Intents

- generate one icon from `/artgen` prompt and save it to `output/art/leaf.png`
- generate one sprite concept through `codex mcp-server` and keep the normal `/artgen` package in the response
- warn cleanly when `codex` is not installed, while still returning the approved prompt
