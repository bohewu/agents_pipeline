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
- Align request, brief, prompt, and suggested-output identifiers with a shared visible version marker.
- The only allowed execution-aware addition is an optional non-operative external handoff note.

## Output contract

- Request record: request identifier, shared version marker, asset type, style, and size input or size assumption.
- Asset brief: brief identifier, shared version marker, subject, size plan, viewpoint, palette, and background guidance.
- Reusable prompt: prompt identifier, shared version marker, and one reusable prompt with optional negatives.
- Suggested outputs: output identifier, shared version marker, file stem, example filenames, and output structure.
- Optional external handoff note: descriptive only; non-operative.

## Examples

```text
/artgen type=sprite style=pixel-art size=24x24 subject="top-down farmer walk cycle"
/artgen type=animation style=pixel-art frame_size=48x48 frames=6 subject="slime attack"
/artgen type=tileset style=pixel-art tile_size=32x32 subject="forest biome terrain set"
/artgen type=icon style=flat-2d size=128x128 subject="health potion inventory icon"
/artgen type=ui-element style=clean-2d size=960x240 subject="fantasy dialogue panel"
```
