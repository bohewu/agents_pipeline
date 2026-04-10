# Art Generation Scaffold (Phase 3)

## What Phase 3 Does

Phase 3 standardizes how this repo captures a bounded 2D asset request as reusable documentation and packages it for external handoff on the normal `/artgen` surface:
- request record
- asset brief
- reusable prompt
- suggested outputs
- manual checks
- External Handoff Package

Pixel art remains the canonical example profile, but the scaffold also covers adjacent 2D assets such as sprites, animations, tilesets, icons, UI elements, and simple props through one shared brief model.

## Boundary

Phase 3 remains spec/prompt generation plus formatting-oriented handoff packaging only.
It does not render images, create files, store raw assets, call Codex, call MCP servers, or run downstream pipeline steps in this repo.
Raw generation and any external review happen elsewhere.
The phase-3 addition is a standardized External Handoff Package rendered as normal `/artgen` output.
That package stays descriptive, copy-ready, and non-operative.

## Canonical Workflow

`request -> request record -> asset brief -> reusable prompt -> suggested outputs -> manual checks -> External Handoff Package`

Anything after that package stays outside this repo and outside the scaffold surface.

## Shared Brief Model

All phase-3 scaffold outputs should make these fields visible:
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

Style and size must always be explicit.
If either is omitted in the request, surface a visible assumption instead of implying a hidden default.
If a request says `sprite` and does not explicitly mention animation, frames, loop, cycle, or sequence, treat it as a single sprite rather than an animation.

| Asset type | Canonical example | Size form |
| --- | --- | --- |
| Sprite | Pixel-art character or prop | Canvas size |
| Animation | Pixel-art frame sequence | Frame size plus frame count or loop range |
| Tileset | Pixel-art environment set | Tile size plus required tile roles |
| Icon | Flat or pixel-art inventory item | Output dimensions |
| UI element / simple prop | HUD panel, button, pickup, or small world prop | Output dimensions or state/layout size |

## Version-Marker Discipline

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

## Suggested Outputs

Suggested outputs stay documentation-only.
They should capture:
- file stem
- example filenames
- output folder structure
- any version-marker usage needed for traceability

For animations, phase 3 suggested outputs should stay at separate frame files only.
Do not introduce sheet, atlas, packing, or spritesheet output suggestions here.

For tilesets, phase 3 suggested outputs should stay at separate tiles or small logical groups only.
Do not introduce packed atlas outputs here.

Raw candidates and approved exports stay outside this repo.

## Manual Checks

Before reusing the scaffold output, a human should confirm:
- style matches the request or clearly labeled assumption
- size is explicit and fit for the asset type
- palette, background, and viewpoint/screen role are still correct
- naming and version markers remain aligned

## External Handoff Package

This package is the standardized phase-3 handoff surface.
It should bundle the request record, asset brief, reusable prompt, suggested outputs, and manual checks into normal `/artgen` output.

The default package must be:
- generic
- human-readable
- copy-ready
- aligned to the exact field labels and shared identifiers already established in the scaffold
- suitable for future external generation or review reference without adding execution behavior

If a user explicitly requests Codex-oriented formatting, `/artgen` may render the same package in a Codex-friendly copy/paste layout on the same output surface.
That formatting is optional and request-driven.
It must not add helper commands, emitted files, provider-specific execution promises, or workflow-automation claims.

## Risks and Tradeoffs

- A broader 2D brief model avoids pixel-art-only wording, but it requires more explicit style and size fields.
- Keeping generation outside the repo preserves a thin scaffold boundary, but the scaffold cannot verify rendered quality on its own.
- Shared version markers improve traceability, but they require deliberate bumps when assumptions materially change.

## Remaining Deferrals

The following remain outside this scaffold after the phase-3 packaging addition:
- deterministic post-process and cleanup
- provider adapters
- integrations
- jobs, queues, and retries
- manifests and schemas
- packing, atlas or spritesheet generation, and slicing
- broader pipeline behavior beyond this scaffold

## Phase 3 Summary

Phase 3 keeps the repo focused on a thin, reviewable art-generation scaffold.
It turns a raw 2D asset request into a bounded brief/prompt package plus a standardized External Handoff Package while leaving rendering and later pipeline behavior to external systems.
