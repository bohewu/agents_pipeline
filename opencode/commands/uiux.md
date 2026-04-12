---
description: Generate a conceptual UI/UX workflow brief and low-fidelity handoff
agent: ui-ux-designer
---

# UI/UX Concept Workflow

## Raw input

```text
$ARGUMENTS
```

## Parsing contract

- Positional arguments `$1..$n` represent the conceptual UI/UX request split by whitespace.
- Reconstruct the main request by concatenating all positional arguments until the first token starting with `--`.
- All tokens starting with `--` are treated as flags.

### Supported flags

- `--output-dir=<path>`
  - Write paired conceptual UI/UX bundle assets to a repo-owned directory outside `.pipeline-output/`.
  - Relative paths should be treated as repo-root relative.
  - When omitted, `/uiux` stays inline-only and does not write files.

## Notes

- This is the thin repo-facing conceptual UI/UX entry surface.
- It intentionally follows the `/artgen` pattern of a direct command-to-hidden-subagent route instead of introducing a new primary orchestrator.
- Source of truth for repo fit and workflow boundaries: `opencode/protocols/UI_UX_WORKFLOW.md`.
- When `--output-dir=<path>` is provided, `/uiux` should export a paired durable bundle:
  - `<output-dir>/<bundle-slug>.ui-ux-bundle.json`
  - `<output-dir>/<bundle-slug>.ui-ux-bundle.md`
- Export mode is for repo-owned assets, not run-local pipeline artifacts.
- Use this command for bounded conceptual outputs such as workflow framing, journey concepts, screen or surface maps, interaction guidance, and open questions.
- Low-fi wireframes may use simple monospace ASCII sketches when that communicates the structure faster than prose.
- Keep outputs conceptual-only:
  - no implementation-ready DevSpec, acceptance criteria, or test plans
  - no code generation, UI component code, or framework-specific implementation
  - no full preview/editor, interactive prototype, or rendered mockup claims
- If the request is primarily an audit of an existing product experience, prefer `/run-ux`.
- If the request is approved and needs implementation-ready specification, prefer `/run-spec`.
- If the request is for bounded 2D asset briefs or prompts, prefer `/artgen`.
- When a request mixes concept design with implementation asks, answer only the conceptual layer and label the excluded follow-up path.

## Output shape

- Request framing
- Concept direction
- Workflow outline
- Screen or surface concepts
- Interaction and copy notes
- Open questions or assumptions
- Suggested next handoff (`/run-ux`, `/run-spec`, `/artgen`, or none)
- In export mode, also write the paired `ui-ux-bundle` JSON/Markdown assets and report the written file paths.

## Examples

```text
/uiux Concept a first-run onboarding flow for a privacy-focused desktop app
/uiux Reframe our billing settings information architecture for admins and end users
/uiux Turn these /run-ux findings into a conceptual checkout-flow rewrite
/uiux Outline a low-fidelity lobby and ready-check experience for a co-op game
/uiux Concept a privacy settings refactor for a desktop app --output-dir=output/uiux/
```
