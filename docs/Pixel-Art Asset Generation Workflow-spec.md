# Phase 1 Spec Proposal (Historical) — Pixel-Art Asset Generation Workflow for agents_pipeline

## Status
Historical proposal retained for context.
It was superseded by the approved and implemented phase-2 scaffold.

Current live surfaces:
- `docs/art-generation-scaffold.md`
- `opencode/skills/2d-asset-brief/SKILL.md`

Names and paths below reflect the original phase-1 proposal and are preserved as historical context.

## Background
This repository is an OpenCode-first workflow-assets / protocol repository, not a game project repository.
Changes should fit the repo’s existing conventions:
- `opencode/agents/*.md` remain the source of truth for agent definitions
- `opencode/commands/*.md` remain the source of truth for command routing
- frontmatter should stay exporter-friendly and bounded
- avoid unnecessary changes to orchestrator/status/schema plumbing for phase 1

## Problem
I want to use this repository as the foundation for a personal-use workflow that helps generate pixel-art 2D game assets through OpenCode, using Codex image-generation capability when available.

The target assets include:
- character sprites
- simple animation frame sets
- environment tilesets
- possibly small UI/icon pixel-art assets later

The challenge is to add this capability in a way that:
- fits this repo’s workflow-assets nature
- stays maintainable
- does not over-engineer phase 1 into a production job system
- leaves room for a richer phase 2 later

## Goal
Add a minimal but genuinely useful phase-1 art-generation workflow scaffold for personal game development.

## Primary Success Criteria
1. The repo gains a clean user-facing entry point for art-generation requests.
2. The implementation reuses existing repo patterns instead of inventing a new orchestration model.
3. The phase-1 design supports both:
   - prompt/spec-first usage
   - execution-assisted usage when Codex/image-generation tooling is available
4. The repo documents a practical path for Codex MCP / Codex worker integration without making unstable runtime assumptions mandatory.
5. The change set remains small enough to review and maintain.

## Non-Goals
Phase 1 must NOT try to do all of the following:
- create a new primary orchestrator
- create a new `run-*` workflow
- modify status-runtime contracts or schema enums
- add binary/generated image assets into this repo
- turn this repo into a full asset-pipeline product
- implement atlas packing, slicing, metadata generation, or deterministic image post-processing as core repo logic
- build queueing, retries, billing, or production job management
- guarantee a fully automated end-to-end art pipeline on day 1

## Design Principles
- Prefer the smallest maintainable change that still has real personal-use value.
- Reuse existing repo conventions.
- Bias toward prompt discipline and reusable scaffolding.
- Treat image generation as optional capability, not a hard runtime requirement for phase 1.
- Keep raw image generation and deterministic post-processing conceptually separate.
- Keep generated outputs in consuming projects, not in this repo.

## Decision Options

### Option A — Spec-First Scaffold Only
Add:
- `opencode/agents/art-director.md`
- `opencode/commands/artgen.md`
- `.agents/skills/pixel-art-pipeline/SKILL.md`
- `docs/pixel-art-pipeline.md`

Behavior:
- `/artgen` primarily produces:
  - asset brief
  - reusable image prompt
  - naming recommendations
  - generation checklist
- no strong expectation of live image generation in phase 1
- docs may describe future Codex MCP integration, but execution behavior stays mostly conceptual

Pros:
- smallest change
- lowest maintenance
- strongest KISS fit

Cons:
- lower “immediate wow factor”
- less useful if the user expects direct generation assistance

### Option B — Thin Execution Scaffold (Recommended Baseline Candidate)
Add:
- `opencode/agents/art-director.md`
- `opencode/commands/artgen.md`
- `.agents/skills/pixel-art-pipeline/SKILL.md`
- `docs/pixel-art-pipeline.md`
- optional small README pointer if it fits naturally

Behavior:
- `/artgen` supports two modes:
  1. prompt/spec mode when Codex/image tooling is unavailable
  2. thin execution-oriented mode when Codex/image-generation workflow is available
- the agent should prefer Codex/image-generation workflow when present
- the command/agent should still degrade gracefully to “spec + reusable prompt” output
- docs include an example Codex MCP / `codex mcp-server` setup snippet, but repo-wide mandatory config changes are avoided in phase 1

Pros:
- still small and maintainable
- gives real personal-use value
- future-friendly without heavy architecture

Cons:
- slightly more behavioral complexity than option A
- some runtime assumptions are documented but not enforced

### Option C — Full Art Pipeline Integration
Add:
- a new art-specific primary orchestrator
- a new `run-*` command
- deeper runtime/plugin/status/checkpoint integration
- stronger execution semantics around generation flow

Pros:
- more ambitious and more “complete”

Cons:
- too heavy for phase 1
- higher maintenance burden
- likely poor fit for repo purpose
- higher risk of exporter/runtime/projection drift

## Recommended Initial Direction
Current proposal favors **Option B**.

Reason:
It is the best balance between:
- personal-use usefulness
- repo fit
- maintainability
- future extensibility

## Proposed Phase 1 Deliverables

### 1. Hidden subagent
`opencode/agents/art-director.md`

Responsibilities:
- accept sprite / animation / tileset generation requests
- prefer image-generation workflow when available
- otherwise fall back to structured spec/prompt output
- keep output concise and operator-friendly
- emphasize prompt reuse and style consistency
- avoid blindly overwriting approved assets
- avoid pretending deterministic packing/post-processing already exists

### 2. User-facing command
`opencode/commands/artgen.md`

Responsibilities:
- route to `art-director`
- accept raw natural-language requests
- expose examples such as:
  - `/artgen 16x16 top-down farmer walk cycle`
  - `/artgen 32x32 slime attack animation`
  - `/artgen 16x16 forest tileset grass dirt cliff water`
- not be a new `run-*` command

### 3. Repo-local skill
`.agents/skills/pixel-art-pipeline/SKILL.md`

Responsibilities:
- define pixel-art prompt rules
- enforce palette discipline / low-color guidance
- enforce transparent background by default
- require fixed viewpoint and consistent proportions across frames
- prefer separate PNG outputs first, packing later
- distinguish guidance for:
  - sprite
  - animation
  - tileset
  - optional icon/UI asset
- define naming and output conventions
- explicitly recommend deterministic local post-process later for packing/atlas/slicing

### 4. Documentation
`docs/pixel-art-pipeline.md`

Should include:
- what phase 1 is for
- what phase 1 intentionally does not do
- suggested workflow:
  - asset brief
  - prompt
  - raw outputs
  - manual approval / curation
  - deterministic packing later
- sample Codex MCP / `codex mcp-server` configuration snippet
- practical usage examples
- notes on graceful degradation when generation tooling is unavailable

## Implementation Constraints
- keep frontmatter compatible with current exporter expectations
- do not add a new primary orchestrator unless explicitly justified by committee
- do not add generated images to this repo
- do not add status/schema/orchestrator-projection changes unless unavoidable
- prefer documentation and behavioral scaffolding over brittle runtime coupling

## Acceptance Criteria
1. The new agent/command/skill/docs fit repo conventions.
2. Export dry-runs still pass.
3. No new primary orchestrator or `run-*` workflow is added in phase 1.
4. The resulting workflow is useful even before phase 2 exists.
5. The design clearly separates:
   - image generation guidance
   - asset approval
   - deterministic post-processing

## Minimal Validation Target
- `python3 scripts/validate-flag-contracts.py`
- `python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir ./.tmp-copilot --strict --dry-run`
- `python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir ./.tmp-codex --strict --dry-run`
- `python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir ./.tmp-claude --strict --dry-run`

Only run `scripts/validate-orchestrator-contracts.py` if phase 1 ends up touching primary orchestrator surfaces.

## Explicit Questions for Committee
1. Should phase 1 choose Option A or Option B?
2. If Option B is chosen, should `/artgen` default to:
   - spec/prompt-first output, or
   - attempt execution-first when tooling exists?
3. Should the Codex MCP setup stay docs-only in phase 1, or should this repo include a stronger local integration hook?
4. Should README be updated now, or should documentation stay isolated to `docs/pixel-art-pipeline.md` until phase 2?
5. Is there any justified reason to escalate phase 1 beyond hidden subagent + command + skill + docs?

## Phase 2 Candidates (Out of Scope for Now)
- real Codex MCP bridge / wrapper integration
- deterministic atlas/spritesheet packing helper
- asset manifest schema
- prompt/version tracking
- review/approval helpers
- resume/checkpoint-aware art workflows
- stronger execution semantics for batch generation
