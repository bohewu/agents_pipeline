# Full Art Handoff Contract

Use this contract only for the default full handoff. Keep the handoff provider-neutral, human-readable, copy-ready, and non-operative. Do not add wrapper commands, job metadata, queues, retries, or provider-specific promises.

## Resolve Only Material Gaps

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

## Seven-Section Output Contract

Use these headings and exact field labels. Keep one shared lowercase kebab-case `asset_slug` and one visible version marker across the package. Default to `v001` unless the user provides an existing version family.

Preserve the entry-specific labels used by existing consumers:

- Through the `artgen-scaffold` skill entry, use `asset style or visible style assumption` and `size input or visible size assumption` in Request Record.
- Through the direct `art-director` leaf, use `asset style` and `size input or stated size assumption` in Request Record, and use `prompt` for the reusable prompt body.

All other section and field labels are shared below.

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
- one reusable prompt; label it `prompt` through the direct `art-director` leaf and add negative constraints only when useful

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

For animations, suggest separate frame files. Keep palette and proportions consistent across frames. Do not suggest sheets, atlases, packing, or spritesheet exports.

For tilesets, call out required tile roles or coverage gaps when underspecified. Suggest separate tiles or small logical groups, not packed atlas outputs.

If a material assumption changes, bump the version instead of silently reusing the old identifiers. Reuse the same identifiers and version marker inside the External Handoff Package.

## Final Check

Confirm that:

- all seven sections appear in order and `Direct Use Prompt` is last
- style and dimensions are explicit and all inferred values use `Assumption: ...`
- IDs and version markers align, including inside the External Handoff Package
- the direct-use prompt closely matches the reusable prompt and needs no Codex-specific wrapper
- suggested outputs remain independently reviewable and use relative paths
- no image, provider, file, automation, or execution claim was made
