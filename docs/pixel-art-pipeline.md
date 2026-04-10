# Pixel-Art Pipeline (Phase 1)

## What Phase 1 Does

Phase 1 adds a docs-first workflow for turning a plain-language pixel-art request into:
- a structured asset brief
- a reusable prompt
- naming and output guidance
- a manual approval handoff

Phase 1 helps standardize the request and review flow.
It does **not** make this repo the place where raw images are generated or stored.

## What Phase 1 Intentionally Does Not Do

Phase 1 does **not**:
- generate images inside this repo
- claim that any repo workflow here already performs image generation
- store raw or approved PNG assets in this repo
- pack atlases or spritesheets
- run deterministic slicing, cleanup, or other post-process steps
- automate asset approval or publishing

Packing, atlas generation, and deterministic post-process are future work outside phase 1.

## Canonical Workflow

`request -> asset brief -> reusable prompt -> raw images elsewhere -> manual approval -> deterministic packing later`

### 1. Request

Start with a natural-language request such as a sprite, animation, or tileset need.

### 2. Asset Brief

Convert the request into a compact brief that locks the important art constraints:
- asset type
- target size
- subject
- viewpoint
- palette target
- transparent background
- separate-PNG output plan
- naming plan

This is the main phase-1 artifact.

### 3. Reusable Prompt

Expand the brief into a prompt that can be reused across retries, variants, or later external tooling.
The prompt should preserve the same palette discipline, viewpoint, proportions, and transparency rules.

### 4. Raw Images Elsewhere

Generate candidate PNGs in external tooling or another workspace.
This repository documents the handoff, but it does not claim to run the image-generation step today.

### 5. Manual Approval

A human reviews the candidates before they become reusable assets.
Approval should confirm:
- palette stayed within the intended range
- background is transparent
- viewpoint is correct
- proportions are consistent
- filenames match the naming convention

### 6. Deterministic Packing Later

Only approved outputs should move into a later packing or atlas workflow.
That later step should stay deterministic and separate from prompt-driven image generation.

## Output Guidance by Asset Type

| Asset type | Brief emphasis | Raw output expectation |
| --- | --- | --- |
| Sprite | Single pose or variant, silhouette, fixed viewpoint | One PNG per sprite or approved variant |
| Animation | Action/loop type, frame count, locked proportions | One PNG per frame before any sheet layout |
| Tileset | Tile size, tile roles, edge/corner/transition needs | One PNG per tile or small logical batch before packing |

Across all asset types, phase 1 favors low-color palette discipline, transparent backgrounds by default, and separate PNG outputs first.

## Optional Future Codex MCP Setup (Docs Only)

If you later want to connect external generation tooling, one lightweight direction is to run a local Codex MCP server.
This is **future setup guidance only**. Phase 1 does not require it, enable it, or assume it already exists in this repo.

Check the available command surface first:

```bash
codex mcp-server --help
```

Example config sketch:

```json
{
  "mcpServers": {
    "codex-art": {
      "command": "codex",
      "args": ["mcp-server"]
    }
  }
}
```

Notes:
- adapt the config shape to your MCP host/runtime
- keep authentication out of committed repo files
- do not commit secrets or generated PNG assets to this repository
- the phase-1 brief/prompt workflow remains useful even when no generator is connected

## Phase 1 Summary

Phase 1 is intentionally spec-first.
Its job is to make pixel-art requests repeatable and reviewable now, while leaving raw image generation and deterministic packing as later, separate concerns.
