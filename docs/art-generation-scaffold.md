# Art Generation Scaffold (Phase 2)

## What Phase 2 Does

Phase 2 standardizes how this repo captures a bounded 2D asset request as reusable documentation:
- request record
- asset brief
- reusable prompt
- suggested outputs
- manual checks
- optional external handoff note

Pixel art remains the canonical example profile, but the scaffold also covers adjacent 2D assets such as sprites, animations, tilesets, icons, UI elements, and simple props through one shared brief model.

## Boundary

Phase 2 is spec/prompt generation only.
It does not render images, create files, store raw assets, or run downstream pipeline steps in this repo.
Raw generation and any external review happen elsewhere.
The only execution-aware allowance in the scaffold is an optional non-operative external handoff note.

## Canonical Workflow

`request -> request record -> asset brief -> reusable prompt -> suggested outputs -> optional external handoff note`

Anything after that handoff stays outside this repo and outside the phase-2 scaffold surface.

## Shared Brief Model

All phase-2 outputs should make these fields visible:
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

| Asset type | Canonical example | Size form |
| --- | --- | --- |
| Sprite | Pixel-art character or prop | Canvas size |
| Animation | Pixel-art frame sequence | Frame size plus frame count or loop range |
| Tileset | Pixel-art environment set | Tile size plus required tile roles |
| Icon | Flat or pixel-art inventory item | Output dimensions |
| UI element / simple prop | HUD panel, button, pickup, or small world prop | Output dimensions or state/layout size |

## Version-Marker Discipline

Keep request, brief, prompt, and suggested-output identifiers aligned on one visible version marker such as `v1` or `v001`.
If style, size, subject scope, palette target, or other material assumptions change, bump the version marker instead of silently reusing it.

## Suggested Outputs

Suggested outputs stay documentation-only.
They should capture:
- file stem
- example filenames
- output folder structure
- any version-marker usage needed for traceability

Raw candidates and approved exports stay outside this repo.

## Manual Checks

Before reusing the scaffold output, a human should confirm:
- style matches the request or clearly labeled assumption
- size is explicit and fit for the asset type
- palette, background, and viewpoint/screen role are still correct
- naming and version markers remain aligned

## Optional External Handoff Note

This note is descriptive only.
It can say that the brief and prompt are ready for external generation or review, but it must not introduce operative execution steps, provider/tool commands, or automation claims.

## Risks and Tradeoffs

- A broader 2D brief model avoids pixel-art-only wording, but it requires more explicit style and size fields.
- Keeping generation outside the repo preserves a thin phase-2 scope, but the scaffold cannot verify rendered quality on its own.
- Shared version markers improve traceability, but they require deliberate bumps when assumptions materially change.

## Explicit Phase 3 Deferrals

The following remain deferred to phase 3:
- deterministic post-process and cleanup
- provider adapters
- integrations
- jobs, queues, and retries
- manifests and schemas
- packing, atlas or spritesheet generation, and slicing
- broader pipeline behavior beyond this phase-2 scaffold

## Phase 2 Summary

Phase 2 keeps the repo focused on a thin, reviewable art-generation scaffold.
It turns a raw 2D asset request into a bounded brief/prompt package while leaving rendering and later pipeline behavior to external systems and phase-3 work.
