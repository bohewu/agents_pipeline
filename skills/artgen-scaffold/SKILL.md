---
name: artgen-scaffold
description: Docs-only guidance for an explicit request to write one paste-ready, provider-neutral 2D asset prompt, or to prepare a complete versioned asset brief and copy-ready handoff. Use when the requested deliverable is a prompt, brief, or handoff for sprites, animation frames, tiles, icons, UI elements, or simple props; do not use it as an image renderer or editor.
license: See repository license
---

# Artgen Scaffold

Write a directly usable prompt or create a reviewable asset brief and prompt package for one bounded 2D asset or asset family. Pixel art is the canonical example, but the contract works for adjacent 2D styles when style and dimensions are explicit.

If the request says `sprite` without mentioning animation, frames, a loop, a cycle, or a sequence, treat it as one static sprite.

## Boundary

This skill produces documentation only. Use it for an asset brief, generation prompt, production specification, or external handoff. Do not implicitly use it as the task workflow when the user asks to generate, edit, or redraw an image itself, even when the request mentions sprites, tiles, or icons.

It does not generate images, call a provider, run post-processing, pack atlases, create files, or promise emitted assets. If the user explicitly invokes this scaffold while requesting an image, explain that the scaffold cannot deliver the image and do not force a full handoff first. The host may handle image generation separately when its available capabilities, authorization, and higher-priority rules permit it; this skill does not create a bridge, start another agent, or grant that permission. If an image edit lacks an accessible source image, request the necessary source rather than claiming to have inspected or preserved it.

## Choose the Delivery Depth

Use prompt-only output only when the user explicitly asks for only a prompt, one paste-ready prompt, or no brief or handoff package, and does not also require an incompatible structured package.

For prompt-only output:

- return exactly one fenced `text` block containing one self-contained, directly usable prompt; do not add a Request Record, External Handoff Package, second copy of the prompt, or surrounding delivery prose
- include the asset type, style, dimensions, subject, viewpoint, palette, background, and any necessary consistency constraints in that prompt
- include each necessary inference visibly as `Assumption: ...` inside the same fenced block, especially a missing size or style
- preserve identifiers, naming, or version constraints supplied by the user, but do not require IDs, version packaging, a directory plan, atlas planning, or manual checks
- do not create files or claim that an asset was generated

If prompt-only output conflicts with an explicit full machine-readable or structured handoff, clarify only that delivery ambiguity. Do not silently replace an existing export or consumer's full-output contract with prompt-only output.

Otherwise, use the default full handoff below. A complete asset brief, versioned asset family, or downstream request for the complete package always uses this full handoff.

## Default Full Handoff

Return:

- a request record
- an asset brief
- one reusable prompt
- a suggested output plan
- manual checks
- an external handoff package
- a final direct-use prompt

Keep the handoff provider-neutral, human-readable, copy-ready, and non-operative. Do not add wrapper commands, job metadata, queues, retries, or provider-specific promises.

## Resolve Only Material Gaps in a Full Handoff

Infer conservative details when doing so is low risk and label every inferred value `Assumption: ...`. Ask only when a missing choice would materially change the asset family, dimensions, viewpoint, or style.

Always make these explicit:

- asset type and subject
- style
- size plan
- viewpoint or screen role
- palette direction
- background rule
- variant, state, tile-role, or frame requirements

Use the appropriate size form:

- static sprite or prop: canvas dimensions
- animation: frame dimensions and frame count or loop range
- tileset: tile dimensions and required tile roles
- icon: output dimensions
- UI element: dimensions plus states or layout role

When background is unspecified for a production asset, prefer a visibly labeled transparent-background assumption.

## Full Handoff Output Contract

Use these headings and exact field labels. Keep one shared lowercase kebab-case `asset_slug` and one visible version marker across the package. Default to `v001` unless the user provides an existing version family.

### Request Record

- `request_id`
- `asset_slug`
- `version_marker`
- `asset type`
- `asset style or visible style assumption`
- `size input or visible size assumption`
- `subject / use case`

### Asset Brief

- `brief_id`
- `version_marker`
- `type`
- `style`
- `size plan`
- `subject`
- `viewpoint or screen role`
- `background guidance`
- `palette target`

### Reusable Prompt

- `prompt_id`
- `version_marker`
- one reusable prompt; add negative constraints only when useful

### Suggested Outputs

- `output_id`
- `version_marker`
- `file stem`
- `example filenames`
- `output folder structure`

Render the folder structure as a relative path or small tree rooted in the consuming project. Do not use an absolute path.

### Manual Checks

List what a human must confirm before generation or reuse.

### External Handoff Package

Bundle the same records without inventing alternate IDs or execution metadata.

### Direct Use Prompt

Make this the final response section. Include only a fenced `text` block containing the reusable provider-neutral prompt in paste-ready form.

## Prompt Rules

State the asset type, style, exact size plan, subject, viewpoint or screen role, palette target, background rule, and consistency requirements. For related outputs, use one reusable family prompt with controlled substitutions.

For pixel art, explicitly request crisp edges, a restrained palette, fixed viewpoint and proportions, and transparent background when appropriate. Useful negatives may include no anti-aliasing, gradients, painterly texture, photoreal lighting, motion blur, text, or background scene unless requested.

## Naming and Versioning

Use these defaults:

- `request_id = <asset_slug>-request-v001`
- `brief_id = <asset_slug>-brief-v001`
- `prompt_id = <asset_slug>-prompt-v001`
- `output_id = <asset_slug>-output-v001`
- `file stem = <asset_slug>`

Suggested filenames:

- sprite: `<asset-name>_<view>_v001.png`
- animation frame: `<asset-name>_<action>_<view>_f01_v001.png`
- tile: `<tileset-name>_<tile-role>_v001.png`
- icon: `<asset-name>_<style>_v001.png`
- UI element: `<asset-name>_<state>_v001.png`

For animations, suggest separate frame files. For tilesets, suggest separate tiles or small logical groups. Packing, spritesheets, atlases, slicing, provider adapters, and deterministic cleanup remain outside this scaffold.

If a material assumption changes, bump the version instead of silently reusing the old identifiers.

## Full Handoff Final Check

Confirm that style and dimensions are explicit, assumptions are labeled, IDs and version markers align, the prompt matches the brief, suggested outputs remain independently reviewable, and no generation claim was made.
