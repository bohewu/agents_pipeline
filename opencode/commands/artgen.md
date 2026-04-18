---
description: Generate a 2D asset brief/prompt package with optional Codex-backed image output
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

- `--gen-provider=codex`
  - Keep the normal `/artgen` brief/prompt output.
  - After preparing the reusable prompt, delegate image generation to the repo-managed `codex-imagegen` skill and custom tool.
  - This mode should use `sandbox=danger-full-access` for the Codex image-generation step.
- `--gen-effort=<low|medium|high|xhigh>`
  - Only meaningful with `--gen-provider=codex`.
  - Default to `medium` for `/artgen` Codex generation.
- `--gen-size=<width>x<height>`
  - Only meaningful with `--gen-provider=codex`.
  - Overrides the generated raster size request sent to Codex.
  - When omitted, default to a conservative size chosen by the agent, typically `1024x1024` unless the request clearly needs a wide UI/banner-style aspect ratio.
  - Never exceed a long side of `1536` or a total pixel count of `1572864`; clamp larger numeric requests to fit that ceiling.
- `--gen-quality=<low|medium|high>`
  - Only meaningful with `--gen-provider=codex`.
  - Default to `medium`.
- `--gen-iterations=<single|auto>`
  - Only meaningful with `--gen-provider=codex`.
  - Default to `single`.
  - `single` asks Codex to avoid proactive retries, self-edits, or local cleanup unless the first pass fails to create the requested output.
- `--output-dir=<path>`
  - Only meaningful with `--gen-provider=codex`.
  - Relative paths should be treated as repo-root relative.
  - When omitted in Codex mode, default to `generated/artgen`.
- `--output-path=<path>`
  - Only meaningful with `--gen-provider=codex`.
  - Map directly to the `codex-imagegen` tool's `output_path` argument.

## Notes

- Accept natural-language 2D asset requests for bounded adjacent assets such as sprites, animations, tilesets, icons, UI elements, and simple props.
- Pixel art remains the canonical example profile, but `/artgen` is not limited to pixel-art-only wording.
- If the request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.
- `/artgen` defaults to spec/prompt generation plus formatting-oriented handoff packaging only.
- Without `--gen-provider=codex`, do not treat `/artgen` as image rendering, file creation, atlas packing, or pipeline execution.
- When `--gen-provider=codex` is present:
  - still produce the normal request record, brief, reusable prompt, suggested outputs, manual checks, External Handoff Package, and final Direct Use Prompt
  - use the reusable prompt as the Codex image-generation prompt basis
  - use `danger-full-access` for the delegated Codex image-generation sandbox
  - default to `--gen-effort=medium`, `--gen-quality=medium`, and `--gen-iterations=single` when those flags are omitted
  - choose a conservative generation size when `--gen-size` is omitted, and clamp numeric generation sizes to a maximum long side of `1536` and a maximum total pixel count of `1572864`
  - use the shared `asset_slug` as the default `file_stem`
  - keep generated-file reporting in a separate `Generation Result` section instead of mixing it into the External Handoff Package
  - if Codex image generation returns a warning, show it plainly and do not claim success
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
- Generation Result: only when `--gen-provider=codex`; include provider, status, chosen output target, generated file paths, or warning text. Keep it outside the External Handoff Package.
- Generation Result: when present, include the effective generation size if Codex size capping adjusted the numeric request.
- Direct Use Prompt: final section of the response, in a fenced `text` block, containing the same reusable prompt in a directly pasteable form suitable for external image-generation tools.
- Use the exact field labels shown in the agent contract. Do not bold, rename, or restyle them.

## Examples

```text
/artgen type=sprite style=pixel-art size=24x24 subject="top-down farmer walk cycle"
/artgen type=animation style=pixel-art frame_size=48x48 frames=6 subject="slime attack"
/artgen type=tileset style=pixel-art tile_size=32x32 subject="forest biome terrain set"
/artgen type=icon style=flat-2d size=128x128 subject="health potion inventory icon"
/artgen type=ui-element style=clean-2d size=960x240 subject="fantasy dialogue panel"
/artgen type=icon style=flat-2d size=256x256 subject="blue apple app icon" --gen-provider=codex --output-dir=generated/artgen
/artgen type=ui-element style=clean-2d size=1600x900 subject="README footer illustration" --gen-provider=codex --gen-effort=medium --gen-size=1536x1024 --gen-quality=medium --gen-iterations=single --output-path=docs/repo-footer-art.png
```
