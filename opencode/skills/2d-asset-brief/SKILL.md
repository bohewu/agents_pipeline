---
name: 2d-asset-brief
description: Phase-2 docs-only guidance for turning bounded 2D asset requests into reusable briefs and prompts with explicit style, size, suggested outputs, and version markers.
license: See repository license
compatibility: Docs-only phase-2 scaffold; raw image generation and any later execution remain outside this repo.
---

# 2D Asset Brief

Use this skill when you need a structured brief and reusable prompt for bounded 2D game assets, especially:
- sprites
- animations
- tilesets
- icons
- UI elements
- simple props

Pixel art remains the canonical example profile, but the brief model also supports adjacent 2D asset styles when style and size are stated explicitly.

If a request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.

Do not use this skill to claim that this repo renders images, stores raw assets, runs provider integrations, or executes a downstream asset pipeline.

## Phase 2 Boundary

Phase 2 outputs are documentation artifacts only:
- request record
- asset brief
- reusable prompt
- suggested outputs
- manual checks
- optional external handoff note

Raw image generation happens elsewhere.
Keep candidate images, approvals, and any generated files outside this repo.
The only allowed execution-aware addition is an optional non-operative external handoff note.

## Output Contract

Return concise Markdown with these sections:

Use the exact field labels below.
When a value is inferred, write it as `Assumption: ...`.
Do not bold, rename, or restyle the field labels.

### Request Record
- request_id
- asset_slug
- version_marker (`v001` style by default)
- asset type
- asset style or visible style assumption
- size input or visible size assumption
- subject / use case

### Asset Brief
- brief_id
- version_marker (`v001` style by default)
- type
- style
- size plan
- subject
- viewpoint or screen role
- background guidance
- palette target

### Reusable Prompt
- prompt_id
- version_marker (`v001` style by default)
- one reusable image-generation prompt with optional negatives when helpful

### Suggested Outputs
- output_id
- version_marker (`v001` style by default)
- file stem (default: `<asset_slug>`)
- example filenames
- output folder structure

### Manual Checks
- what a human should confirm before reusing the brief or prompt

### External Handoff Note (Optional)
- descriptive only; non-operative

## Make Style and Size Explicit

- Always state style explicitly. If style is omitted, label the assumption.
- Always state size explicitly. Use the asset-appropriate form instead of a hidden default:
  - sprite or simple prop: canvas size
  - animation: frame size plus frame count or target loop range
  - tileset: tile size plus required tile roles
  - icon: output dimensions
  - UI element: output dimensions or state/layout size
- If the request is underspecified, surface conservative assumptions instead of implying them.
- Prefix inferred values consistently with `Assumption:`.
- Do not use loose variants such as `assume`, `assumed`, or unlabeled inferred values.
- When background is unspecified, prefer a visible transparent-background assumption for production assets.

## Prompt Construction

Build the reusable prompt from the approved brief.
Prefer prompts that explicitly state:
- asset type
- style
- exact size or size plan
- subject
- viewpoint or screen role
- palette target
- background rule
- consistent proportions across related outputs

Add negatives when helpful, for example:
- no anti-aliasing
- no painterly texture
- no photoreal lighting
- no gradients
- no motion blur
- no text unless requested
- no background scene unless requested

Keep prompts reusable.
Prefer one prompt per asset family with small controlled substitutions for variants, states, or frame roles.

## Canonical Pixel-Art Example Profile

When the request is for pixel art, keep the canonical profile explicit:
- crisp edges
- restrained low-color palette
- transparent background by default
- fixed viewpoint across related outputs
- consistent proportions across frames, tiles, or variants

## Suggested Outputs and Version Discipline

Keep request, brief, prompt, and suggested-output identifiers aligned with one visible version marker.
Default to `v001` unless the user explicitly supplies an existing version family.
Derive one shared lowercase kebab-case `asset_slug` from the asset type, subject, and key distinguishing qualifiers.
Use these default templates unless the user explicitly supplies an existing family to continue:
- `request_id = <asset_slug>-request-v001`
- `brief_id = <asset_slug>-brief-v001`
- `prompt_id = <asset_slug>-prompt-v001`
- `output_id = <asset_slug>-output-v001`
- `file stem = <asset_slug>`
- Do not shorten, restyle, or partially omit these identifier templates.
If assumptions materially change, bump the version marker instead of silently reusing it.

Use lowercase kebab-case or snake_case consistently.
Suggested patterns:
- sprite: `<asset-name>_<view>_v001.png`
- animation frame: `<asset-name>_<action>_<view>_f01_v001.png`
- tileset tile: `<tileset-name>_<tile-role>_v001.png`
- icon: `<asset-name>_<style>_v001.png`
- UI element: `<asset-name>_<state>_v001.png`

For animations, suggested outputs stay at separate frame files only in phase 2.
Do not suggest spritesheets, atlases, packing, or sheet exports.

For tilesets, suggested outputs stay at separate tiles or small logical groups only in phase 2.
Do not suggest packed atlas outputs.

Suggested outputs are documentation only.
Raw files, generated candidates, and approved exports stay in the consuming project or an external workspace, not in this repo.

## Manual Checks

Before reuse, confirm:
- style matches the brief
- size is explicit and correct
- palette and viewpoint/screen role still match intent
- naming and version markers stay aligned
- suggested outputs remain reviewable and externally generated

## Explicit Phase 3 Deferrals

The following remain deferred to phase 3:
- deterministic post-process or cleanup
- provider adapters
- integrations
- jobs, queues, or retries
- manifests or schemas
- packing, atlas or spritesheet generation, and slicing
- broader pipeline behavior beyond this phase-2 scaffold
