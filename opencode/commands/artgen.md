---
description: Generate a phase-1 pixel-art asset brief and reusable prompt
agent: art-director
---

# Artgen

## Raw input

```text
$ARGUMENTS
```

## Notes

- Accept natural-language sprite, animation, and tileset requests.
- `/artgen` is spec/prompt generation only.
- Do not treat `/artgen` as image rendering, file creation, atlas packing, or pipeline execution.
- Include:
  - asset brief
  - reusable image-generation prompt
  - style, palette, and viewpoint constraints
  - suggested file naming and output structure

## Examples

```text
/artgen 16x16 top-down farmer walk cycle
/artgen 32x32 slime attack animation
/artgen 16x16 forest tileset grass dirt cliff water
```
