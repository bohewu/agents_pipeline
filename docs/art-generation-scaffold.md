# Art Generation Scaffold

## What It Does

This scaffold standardizes two docs-only delivery depths for a bounded 2D asset request: one directly usable prompt when explicitly requested, or a complete reusable package for external handoff by default. The default full handoff retains these seven sections:
- request record
- asset brief
- reusable prompt
- suggested outputs
- manual checks
- External Handoff Package
- Direct Use Prompt

Pixel art remains the canonical example profile, but the scaffold also covers adjacent 2D assets such as sprites, animations, tilesets, icons, UI elements, and simple props through one shared brief model.

## Boundary

This scaffold is an asset brief, generation prompt, production specification, and external-handoff layer.
It does not render or edit images, create raster files, store raw assets, call provider tools, create a provider bridge, start another agent, or run downstream pipeline steps in this repo. An ordinary request for an image itself should not be intercepted by this scaffold merely because it mentions a supported asset type. When the scaffold is explicitly invoked for actual image delivery, it must say that the image remains undelivered without forcing a complete handoff first. A host may separately use an image-generation capability only when its capabilities, authorization, and higher-priority rules permit it.

When editing requires a source image that is not accessible, obtain that source rather than claiming it was inspected or that identity or composition was preserved.

Both delivery depths stay descriptive, provider-agnostic, copy-ready, and non-operative.

## Delivery Depth

Prompt-only is an explicit exception. Use it only when the user asks for only a prompt, one paste-ready prompt, or no brief or handoff package, without also requiring an incompatible structured package. Return exactly one fenced `text` block containing one self-contained prompt. The prompt must include asset type, style, dimensions, subject, viewpoint, palette, background, and necessary consistency constraints. Put every necessary inference, especially missing size or style, in the same block as `Assumption: ...`.

Prompt-only does not require IDs, version packaging, naming directories, atlas planning, or manual checks, though it retains identifiers, naming, and version constraints supplied by the user. It creates no files and makes no generation claim.

If prompt-only conflicts with an explicit full machine-readable or structured handoff, clarify only that delivery ambiguity. Existing exports and consumers keep the full contract.

The complete seven-section handoff remains the default. Use it for a complete asset brief, a versioned asset family, or whenever a downstream consumer requests the complete package.

## Default Full-Handoff Workflow

`request -> request record -> asset brief -> reusable prompt -> suggested outputs -> manual checks -> External Handoff Package -> Direct Use Prompt`

Any later image generation stays outside this scaffold and its External Handoff Package.

## Full-Handoff Shared Brief Model

All full-handoff outputs must make these fields visible:
- asset slug
- asset type
- style
- size plan
- subject or use case
- viewpoint or screen role
- palette target
- background guidance
- suggested output naming and structure
- shared version marker

## Style and Size Parameterization

In a full handoff, style and size must always be explicit fields or assumptions. In prompt-only output, both must be explicit within the prompt, using visible `Assumption: ...` text when inferred.
If either is omitted in the request, surface a visible assumption instead of implying a hidden default.
If a request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.

| Asset type | Canonical example | Size form |
| --- | --- | --- |
| Sprite | Pixel-art character or prop | Canvas size |
| Animation | Pixel-art frame sequence | Frame size plus frame count or loop range |
| Tileset | Pixel-art environment set | Tile size plus required tile roles |
| Icon | Flat or pixel-art inventory item | Output dimensions |
| UI element / simple prop | HUD panel, button, pickup, or small world prop | Output dimensions or state/layout size |

## Full-Handoff Version-Marker Discipline

Keep request, brief, prompt, and suggested-output identifiers aligned on one visible version marker.
Default to `v001` unless the request or project explicitly supplies an existing version family.
Use one shared lowercase kebab-case `asset_slug` across the record set.
Default templates:
- `request_id = <asset_slug>-request-v001`
- `brief_id = <asset_slug>-brief-v001`
- `prompt_id = <asset_slug>-prompt-v001`
- `output_id = <asset_slug>-output-v001`
- `file stem = <asset_slug>`
Prefix inferred values consistently with `Assumption:`.
Do not shorten, restyle, or partially omit these identifier templates.
Render `output folder structure` as a relative folder path or short directory tree rooted at the consuming project. Do not prefix it with `/` and do not collapse folder structure and filenames into one opaque line.
If style, size, subject scope, palette target, or other material assumptions change, bump the version marker instead of silently reusing it.

## Full-Handoff Suggested Outputs

Suggested outputs stay documentation-only.
They should capture:
- file stem
- example filenames
- output folder structure
- any version-marker usage needed for traceability

For animations, suggested outputs should stay at separate frame files only.
Do not introduce sheet, atlas, packing, or spritesheet output suggestions here.

For tilesets, suggested outputs should stay at separate tiles or small logical groups only.
Do not introduce packed atlas outputs here.

Raw candidates and approved exports stay outside this repo.

## Full-Handoff Manual Checks

Before reusing the scaffold output, a human should confirm:
- style matches the request or clearly labeled assumption
- size is explicit and fit for the asset type
- palette, background, and viewpoint/screen role are still correct
- naming and version markers remain aligned

## Full-Handoff External Handoff Package

This package is the standardized handoff surface.
It should bundle the request record, asset brief, reusable prompt, suggested outputs, and manual checks into normal `artgen-scaffold` output.

The default package must be:
- generic
- human-readable
- copy-ready
- aligned to the exact field labels and shared identifiers already established in the scaffold
- suitable for future external generation or review reference without adding execution behavior

## Full-Handoff Direct Use Prompt

The default full `artgen-scaffold` output must end with a final `Direct Use Prompt` section.
That section should contain the same reusable prompt in a paste-ready fenced text block so the user does not need to extract it manually from the handoff package.

The Direct Use Prompt must be:
- provider-agnostic
- copy-ready
- consistent with the reusable prompt and shared identifiers above
- directly usable in external image-generation tools without extra wrapper text
- free of helper-command wrappers or execution claims

## Risks and Tradeoffs

- A broader 2D brief model avoids pixel-art-only wording, but it requires more explicit style and size fields.
- Keeping prompt packaging separate from runtime-native image generation preserves a thin, portable scaffold boundary.
- Shared version markers improve traceability, but they require deliberate bumps when assumptions materially change.

## Remaining Deferrals

The following remain outside this scaffold after the current packaging addition:
- deterministic post-process and cleanup
- provider adapters and runtime-native image-generation behavior
- integrations
- jobs, queues, and retries
- manifests and schemas
- packing, atlas or spritesheet generation, and slicing
- broader pipeline behavior beyond this scaffold

## Summary

This scaffold keeps the repo focused on thin, reviewable art-generation documentation. It returns one directly usable prompt when explicitly requested and otherwise turns a raw 2D asset request into the unchanged seven-section brief and handoff package ending in a Direct Use Prompt.
