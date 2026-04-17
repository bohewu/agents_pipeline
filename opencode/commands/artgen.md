---
description: Generate a 2D asset brief, reusable prompt, direct-use prompt, and handoff package
agent: art-director
---

# Artgen

## Raw input

```text
$ARGUMENTS
```

## Parsing contract

- Positional arguments `$1..$n` represent the asset request split by whitespace.
- Reconstruct the main request by concatenating all positional arguments until the first token starting with `--`.
- All tokens starting with `--` are treated as flags.

### Supported flags

- `--codex-output=<path>`
  - Attempt one bounded local image-generation pass and save one selected output file.
  - Relative paths should be treated as repo-root relative.
  - Default route: `codex mcp-server`.
  - Fallback route: `codex exec --enable image_generation` only if the MCP route is unavailable or does not expose built-in image generation.

## Notes

- Accept natural-language 2D asset requests for bounded adjacent assets such as sprites, animations, tilesets, icons, UI elements, and simple props.
- Pixel art remains the canonical example profile, but `/artgen` is not limited to pixel-art-only wording.
- If the request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.
- By default, `/artgen` is spec/prompt generation plus formatting-oriented handoff packaging only.
- Without a Codex output flag, do not treat `/artgen` as image rendering, file creation, atlas packing, or pipeline execution.
- When one Codex output flag is present, still generate the normal brief, handoff package, and final Direct Use Prompt first, then attempt one bounded local Codex render using that same prompt.
- In export mode, try `codex mcp-server` first.
- Only fall back to `codex exec --enable image_generation` when the MCP route is unavailable or when built-in image generation is unavailable on the MCP route.
- Do not treat every downstream generation failure as a fallback trigger. If the MCP route starts successfully and the failure is no longer an availability/capability issue, report a warning instead of automatically retrying on CLI.
- Use Codex built-in `image_gen` only for export mode.
- Do not use `scripts/image_gen.py`, `OPENAI_API_KEY` fallback, custom SDK scripts, non-Codex image providers, or other downstream execution paths on this surface.
- Use cross-platform path handling in export mode:
  - preserve absolute paths when provided
  - resolve relative paths from the repo root
  - do not hardcode path separators or shell-specific path assumptions
- Before claiming export success, verify that the requested output file exists at the target path.
- If local Codex is missing, both routes are unavailable, or built-in image generation is unavailable on both routes, do not fail the scaffold itself. Return the normal `/artgen` package plus a warning with the next step:
  - install Codex CLI
  - or manually use the returned Direct Use Prompt elsewhere
- Include:
  - request record
  - asset brief
  - reusable image-generation prompt
  - style, size, palette, and viewpoint constraints
  - suggested output naming and structure
  - manual checks
  - External Handoff Package as normal `/artgen` output
  - Direct Use Prompt as the final section of the response
- Make style explicit; if style is omitted, surface a visible assumption.
- Make size explicit; if size is omitted in the request, surface a visible assumption instead of implying a hidden default.
- Derive one shared lowercase kebab-case `asset_slug` from the asset type, subject, and key distinguishing qualifiers.
- Align request, brief, prompt, and suggested-output identifiers with a shared visible version marker.
- Use `v001`-style version markers by default unless the request explicitly supplies an existing version family.
- Default identifier templates:
  - `request_id = <asset_slug>-request-v001`
  - `brief_id = <asset_slug>-brief-v001`
  - `prompt_id = <asset_slug>-prompt-v001`
- `output_id = <asset_slug>-output-v001`
- Use the same `asset_slug` as the default file-stem base.
- Do not shorten, restyle, or partially omit these identifier templates.
- Render `output folder structure` as a relative folder path or short directory tree rooted at the consuming project. Do not prefix it with `/` and do not collapse folder structure and filenames into one opaque line.
- Prefix inferred fields consistently with `Assumption:`.
- Do not use loose variants such as `assume`, `assumed`, or unlabeled inferred values.
- For animations, keep suggested outputs at separate frame files only; do not suggest sheets, atlases, packing, or spritesheet exports in this scaffold.
- For tilesets, keep suggested outputs at separate tiles or small logical groups only; do not suggest packed atlas outputs in this scaffold.
- The External Handoff Package must stay generic, human-readable, and copy-ready by default.
- Do not add helper commands, emitted-file promises, or execution-behavior claims to the External Handoff Package.
- Always end the response with `Direct Use Prompt` in a fenced `text` block containing the ready-to-paste reusable prompt so the user does not have to extract it from the package manually.
- The Direct Use Prompt should already be suitable for direct use with external image-generation tools without extra wrapper text.

## Output contract

- Request record: `request_id`, `asset_slug`, shared `v001`-style `version_marker`, asset type, style, and size input or size assumption.
- Asset brief: `brief_id`, shared `v001`-style `version_marker`, subject, size plan, viewpoint, palette, and background guidance.
- Reusable prompt: `prompt_id`, shared `v001`-style `version_marker`, and one reusable prompt with optional negatives.
- Suggested outputs: `output_id`, shared `v001`-style `version_marker`, file stem based on `asset_slug`, example filenames, and a relative folder path or short directory tree for the output structure.
- Manual checks: what a human should confirm before reusing the brief or prompt.
- External Handoff Package: standard `/artgen` output that bundles the request record, asset brief, reusable prompt, suggested outputs, and manual checks into a generic, human-readable, copy-ready handoff.
- Direct Use Prompt: final section of the response, in a fenced `text` block, containing the same reusable prompt in a directly pasteable form suitable for external image-generation tools.
- Codex Image Export: include this optional section only when a Codex output flag is present; report the chosen route, requested output path, execution status (`generated` or `warning`), and a short detail message.
- Use the exact field labels shown in the agent contract. Do not bold, rename, or restyle them.

## Examples

```text
/artgen type=sprite style=pixel-art size=24x24 subject="top-down farmer walk cycle"
/artgen type=animation style=pixel-art frame_size=48x48 frames=6 subject="slime attack"
/artgen type=tileset style=pixel-art tile_size=32x32 subject="forest biome terrain set"
/artgen type=icon style=flat-2d size=128x128 subject="health potion inventory icon"
/artgen type=ui-element style=clean-2d size=960x240 subject="fantasy dialogue panel"
/artgen type=icon style=flat-2d size=256x256 subject="single green leaf app icon" --codex-output=output/art/leaf.png
```
