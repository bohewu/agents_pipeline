---
description: Generate a phase-2 2D asset brief and reusable prompt
agent: art-director
---

# Artgen

## Raw input

```text
$ARGUMENTS
```

## Notes

- Accept natural-language 2D asset requests for bounded adjacent assets such as sprites, animations, tilesets, icons, UI elements, and simple props.
- Pixel art remains the canonical example profile, but `/artgen` is not limited to pixel-art-only wording.
- If the request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.
- `/artgen` is spec/prompt generation only.
- Do not treat `/artgen` as image rendering, file creation, atlas packing, or pipeline execution.
- Do not treat `/artgen` as calling Codex, MCP servers, image tools, or any downstream execution workflow.
- Include:
  - request record
  - asset brief
  - reusable image-generation prompt
  - style, size, palette, and viewpoint constraints
  - suggested output naming and structure
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
- Prefix inferred fields consistently with `Assumption:`.
- Do not use loose variants such as `assume`, `assumed`, or unlabeled inferred values.
- For animations, keep suggested outputs at separate frame files only; do not suggest sheets, atlases, packing, or spritesheet exports in phase 2.
- For tilesets, keep suggested outputs at separate tiles or small logical groups only; do not suggest packed atlas outputs in phase 2.
- The only allowed execution-aware addition is an optional non-operative external handoff note.

## Output contract

- Request record: `request_id`, `asset_slug`, shared `v001`-style `version_marker`, asset type, style, and size input or size assumption.
- Asset brief: `brief_id`, shared `v001`-style `version_marker`, subject, size plan, viewpoint, palette, and background guidance.
- Reusable prompt: `prompt_id`, shared `v001`-style `version_marker`, and one reusable prompt with optional negatives.
- Suggested outputs: `output_id`, shared `v001`-style `version_marker`, file stem based on `asset_slug`, example filenames, and output structure.
- Optional external handoff note: descriptive only; non-operative.
- Use the exact field labels shown in the agent contract. Do not bold, rename, or restyle them.

## Examples

```text
/artgen type=sprite style=pixel-art size=24x24 subject="top-down farmer walk cycle"
/artgen type=animation style=pixel-art frame_size=48x48 frames=6 subject="slime attack"
/artgen type=tileset style=pixel-art tile_size=32x32 subject="forest biome terrain set"
/artgen type=icon style=flat-2d size=128x128 subject="health potion inventory icon"
/artgen type=ui-element style=clean-2d size=960x240 subject="fantasy dialogue panel"
```
