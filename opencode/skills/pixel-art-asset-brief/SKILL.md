---
name: pixel-art-asset-brief
description: Phase-1 docs-only guidance for turning pixel-art asset requests into reusable briefs and prompts with consistent palette, viewpoint, and output conventions.
license: See repository license
compatibility: Docs-only phase-1 workflow; raw image generation and later packing happen outside this repo.
---

# Pixel-Art Asset Brief

Use this skill when you need a structured asset brief and reusable prompt for 2D pixel-art game assets, especially:
- character sprites
- animation frame sets
- environment tilesets
- small UI/icon assets

Do not use this skill to claim that this repo already generates images, packs atlases, or runs deterministic post-processing.

## Phase 1 Boundary

Phase 1 outputs are documentation artifacts only:
- asset brief
- reusable prompt
- naming/output guidance
- manual approval notes

Raw image generation happens elsewhere.
Packing, atlas generation, slicing, and deterministic post-process are future work outside phase 1.

## Brief First

Start every request with a compact asset brief before writing the reusable prompt.

Include:
1. asset type: `sprite`, `animation`, or `tileset`
2. target size: canvas or tile dimensions
3. subject: character, creature, object, terrain, or prop
4. viewpoint: top-down, side-view, front, isometric, or equivalent
5. palette target: low-color count and any locked colors
6. background: transparent by default
7. output mode: separate PNGs first
8. naming plan: file stem, frame/tile suffixes, and version marker
9. approval notes: what a human must confirm before reuse

## Prompt Construction

Build the reusable prompt from the approved brief.
Prefer prompts that explicitly state:
- pixel art
- exact asset type
- exact dimensions
- fixed viewpoint
- clean silhouette
- low-color palette
- crisp edges
- transparent background
- consistent proportions across related outputs

Also include negatives when helpful, for example:
- no anti-aliasing
- no painterly texture
- no photoreal lighting
- no gradients
- no motion blur
- no text
- no background scene unless explicitly requested

Keep prompts reusable. Prefer one prompt per asset family with small controlled substitutions for direction, pose, frame index, or tile role.

## Low-Color Palette Discipline

- Keep palettes intentionally small.
- Prefer a single shared palette across all frames or related assets.
- Limit color ramps and reuse highlight/shadow colors where possible.
- Avoid subtle gradients, noisy shading, and near-duplicate colors.
- If the user does not specify a palette, choose a restrained palette rather than a broad one.

As a starting guideline:
- tiny sprites: usually `3-8` colors
- medium sprites or tiles: usually `6-12` colors
- exceed that only when the user explicitly wants it

## Transparent Background by Default

- Use transparent background by default.
- Do not request a scenic background for production assets.
- If a temporary flat backdrop is needed during external generation, treat it as preview-only and remove it before approval.

## Consistent Viewpoint and Proportions

- Lock the viewpoint for the entire asset family.
- Keep head/body ratio, limb length, weapon/tool scale, and tile horizon consistent.
- For animations, change only the motion-relevant pixels from frame to frame.
- For tilesets, keep edge thickness, perspective, and object scale aligned across all tiles.

## Separate PNG Outputs First

- Prefer one approved asset output per PNG.
- For animations, prefer separate frame PNGs before any sheet or atlas layout.
- For tilesets, prefer separate tiles or small logically grouped exports before packing.
- Keep raw outputs reviewable and easy to reject or retry.
- Store raw/generated images in the consuming project or external workspace, not in this repo.

## Asset-Type Guidance

### Sprite

Use sprite guidance when the request is a single pose, idle, prop, icon, or standalone character view.
Always specify:
- canvas size
- viewpoint
- silhouette priority
- palette target
- transparent background

### Animation

Use animation guidance when the request is a loop or frame sequence.
Always specify:
- frame count or target range
- loop type such as idle, walk, attack, or impact
- fixed viewpoint and consistent proportions
- same palette across all frames
- separate PNG frame outputs first

### Tileset

Use tileset guidance when the request is terrain, walls, floors, autotile parts, or modular environment pieces.
Always specify:
- tile size
- tile family or biome
- required roles such as center, edge, corner, transition, or obstacle
- fixed viewpoint or perspective
- palette consistency across the whole set
- separate tile PNGs first, with packing deferred

## Naming and Output Conventions

Use lowercase kebab-case or snake_case consistently and keep names parseable.

Recommended patterns:
- sprite: `<asset-name>_<view>_v001.png`
- animation frame: `<asset-name>_<action>_<view>_f01_v001.png`
- tileset tile: `<tileset-name>_<tile-role>_v001.png`

Also keep brief and prompt labels aligned with the asset name, for example:
- brief id: `farmer-walk-front-16x16`
- prompt id: `farmer-walk-front-16x16-prompt-v1`

## Approval Discipline

Before treating an output as reusable, confirm:
- palette stayed within target range
- background is transparent
- viewpoint is correct
- proportions match the rest of the set
- file naming is consistent
- outputs remain separate PNGs ready for later deterministic packing

## Explicit Phase 1 Deferrals

The following are future work outside phase 1:
- packing
- atlas or spritesheet generation
- slicing
- deterministic post-process or cleanup
- manifest generation
- automated asset ingestion into downstream projects

This skill should stop at the brief, prompt, and output conventions needed to prepare those later steps.
