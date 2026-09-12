---
name: artgen-scaffold
description: Write one paste-ready 2D asset prompt or a complete versioned brief and handoff. Use only when the requested deliverable is documentation, not an image.
license: See repository license
---

# Artgen Scaffold

Write a directly usable prompt or a reviewable brief and prompt package for one bounded 2D asset or asset family. Pixel art is the canonical example; adjacent 2D styles are supported when style and dimensions are explicit.

If the request says `sprite` without mentioning animation, frames, a loop, a cycle, or a sequence, treat it as one static sprite.

## Boundary

This skill produces documentation only. It does not generate or edit images, call a provider, run post-processing, pack atlases, or promise emitted assets. Do not intercept an ordinary image-generation or editing request merely because it mentions sprites, tiles, or icons.

If the user explicitly invokes this scaffold while requesting an image, explain that the scaffold cannot deliver the image and do not force a full handoff first. The host may handle generation separately only when its capabilities, authorization, and higher-priority rules permit it; this skill does not create a bridge, start another agent, or grant that permission. If an image edit lacks an accessible source image, request the source rather than claiming to have inspected or preserved it.

## Choose the Delivery Depth

Use prompt-only output only when the user explicitly asks for only a prompt, one paste-ready prompt, or no brief or handoff package, and does not also require an incompatible structured package.

### Prompt only

- Return exactly one fenced `text` block containing one self-contained, directly usable prompt. Add no Request Record, External Handoff Package, repeated prompt, or surrounding delivery prose.
- Include asset type, style, dimensions, subject, viewpoint, palette, background, and necessary consistency constraints.
- Put every necessary inference visibly inside the block as `Assumption: ...`, especially a missing size or style.
- Preserve identifiers, naming, or version constraints supplied by the user, but do not require IDs, version packaging, a directory plan, atlas planning, or manual checks.
- Do not create files or claim that an asset was generated.

Finish when the single block is self-contained, the requested dimensions and style are explicit, necessary assumptions are visible, and no generation claim or extra package was added.

If prompt-only conflicts with an explicit full machine-readable or structured handoff, clarify only that delivery ambiguity. Do not silently replace an existing export or consumer's full-output contract.

### Full handoff

A complete asset brief, versioned asset family, or request for the complete package uses the full handoff. Before preparing it, read [references/full-handoff.md](references/full-handoff.md) and follow its seven-section contract, exact field labels, identifiers, versioning, naming, assumptions, and final checks. Do not produce the full handoff from this summary alone.
