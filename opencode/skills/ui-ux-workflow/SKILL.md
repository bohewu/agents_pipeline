---
name: ui-ux-workflow
description: Docs-only guidance for producing a bounded conceptual UI/UX bundle with assessment, low-fi wireframes, mid-fi drafts, flow definitions, template-selection guidance, prompt export, and thin read-only preview handoff.
license: See repository license
compatibility: Docs-only scaffold; conceptual output only, with durable bundle rules defined in ../../protocols/UI_UX_WORKFLOW.md.
---

# UI/UX Workflow

Use this skill when you need a bounded conceptual UI/UX output bundle for one experience, workflow, or surface, especially when the handoff must stay approval-oriented rather than implementation-ready.

If you need the repo-level protocol, read `../../protocols/UI_UX_WORKFLOW.md`.

## Boundary

This skill outputs conceptual documentation artifacts only:
- project UI/UX assessment
- low-fi wireframes
- mid-fi design drafts
- user flow
- data flow
- operation flow
- state transitions
- prompt export
- thin preview handoff

Do not use this skill for:
- implementation-ready layouts, component contracts, or engineering acceptance criteria
- code generation, framework-specific UI output, or runtime automation
- full preview/editor behavior, editable prototypes, or live integrations
- browser-backed audits (use `/run-ux` plus browser tooling when audit evidence is needed)

## Required v1 Conceptual Bundle

When a durable conceptual handoff is requested, return concise Markdown with these exact headings in this order:

1. `Project UI/UX Assessment`
2. `Low-Fi Wireframes`
3. `Mid-Fi Design Drafts`
4. `User Flow`
5. `Data Flow`
6. `Operation Flow`
7. `State Transitions`
8. `Prompt Export`
9. `Thin Preview Handoff`

Keep all nine sections present for the bounded v1 bundle.

## Section Expectations

### Project UI/UX Assessment
- frame the problem or opportunity for the target surface
- summarize the main conceptual recommendation
- list assumptions and open questions
- keep the assessment bounded to the requested workflow or surface

### Low-Fi Wireframes
- describe low-fidelity screen or surface blocking
- name key regions, hierarchy, and primary actions
- keep output layout-oriented and intentionally rough
- simple monospace ASCII sketches are welcome when they make the structure easier to review quickly
- select from the bounded v1 conceptual template catalog in `../../protocols/UI_UX_WORKFLOW.md` when possible
- explain template choice, layout direction, density, progressive disclosure, and cross-platform adaptation conceptually rather than as implementation detail

### Mid-Fi Design Drafts
- clarify content weight, hierarchy, and state intent beyond the low-fi pass
- stay grayscale or annotation-oriented when describing fidelity
- do not become pixel-perfect, tokenized, or implementation-ready

## Template Selection Alignment

For `Low-Fi Wireframes` and `Mid-Fi Design Drafts`, stay aligned with the protocol's bounded v1 template catalog and selection matrix:

- app shell
- dashboard
- list/filter
- detail/primary action
- form/create-edit
- wizard/step flow
- settings
- empty/loading/error states

Capture template rationale, theme direction, density, layout direction, progressive disclosure, concise copy posture, and desktop/tablet/mobile adaptation at a conceptual level only.

Use the protocol for the full catalog details. Do not turn template selection into implementation-ready screen specs or component-level requirements.

### User Flow
- describe the main actor journey and important alternate or recovery paths
- keep steps outcome-oriented rather than implementation-oriented

### Data Flow
- describe conceptual inputs, outputs, dependencies, and user-visible information movement
- do not define APIs, database models, or persistence contracts

### Operation Flow
- describe ordered operations or system interactions that matter to the concept
- do not define service choreography, job orchestration, or runtime wiring

### State Transitions
- name the important conceptual states and what causes movement between them
- include expected outcomes or visible changes
- do not define reducers, stores, component internals, or formal implementation state machines

### Prompt Export
- required first-class artifact, not an appendix
- provide one reusable prompt for a downstream designer, generator, or reviewer
- include must-include and must-avoid constraints
- keep it provider-agnostic and conceptual-only

### Thin Preview Handoff
- explicitly describe the handoff as `external or thin, read-only`
- list the surfaces or states worth showing for review
- specify required annotations and non-goals
- do not promise a full preview/editor, editable controls, persistence, or live integrations

## Non-Expert Design and Interaction Defaults

Apply these defaults to both `Low-Fi Wireframes` and `Mid-Fi Design Drafts`:

- **Theme principles:** describe posture, not final branding. Use conceptual directions such as neutral/utilitarian, trust/calm, or signal-forward. Do not specify final brand colors, polished visual identity, or marketing-grade comps.
- **Spacing and spacing scale:** use a simple relative scale such as `tight`, `base`, `section`, and `region` to show grouping and separation. Keep it conceptual only; no pixel specs, tokens, or breakpoint math.
- **Density:** choose compact, balanced, or relaxed density based on scan speed, trust sensitivity, and user familiarity. Explain the choice briefly.
- **Hierarchy:** default to one primary task per screen, one dominant focus, and one clearly strongest primary action.
- **Layout/navigation:** start with the smallest template that supports the task, use progressive disclosure for secondary detail, keep non-essential copy minimal, and never rely on tooltip-only critical information.
- **State rules:** cover empty, loading, error, and confirmation states explicitly in both low-fi and mid-fi output. Each state should explain why it exists, what the user can do next, and what context remains visible.
- **Cross-platform adaptation:** state how the concept changes for desktop, tablet, and mobile. Desktop may keep parallel context, tablet should collapse one supporting region, and mobile should reduce to one dominant task region with inline critical information.

## Minimal Intake Questions

Use a small number of high-value questions before drafting. Default set:

1. What is the one workflow, screen, or surface, and what is the one primary task on it?
2. Who is the main user or actor, and which devices matter first: desktop, tablet, mobile, or a mix?
3. Which non-happy-path moment most needs coverage: empty, loading, error/recovery, or confirmation?
4. What constraints must stay true: trust/compliance needs, navigation dependencies, existing terminology, content limits, or support expectations?
5. What follow-up is expected after review: stay conceptual, `/run-ux`, `/run-spec`, or `/artgen`?

## High-Value Review Rubric

Use this short rubric to keep the output reviewable:

| Review question | Why it matters | Recommendation if missing |
|---|---|---|
| Is the concept bounded to one primary workflow or surface, with one primary task per screen? | Prevents multi-surface scope creep. | Narrow scope or split follow-up concepts. |
| Do low-fi and mid-fi outputs describe theme posture, spacing scale, density, hierarchy, layout/navigation, and desktop/tablet/mobile adaptation conceptually? | These are the minimum design signals needed for review. | Add short conceptual annotations only; do not add implementation detail. |
| Are empty, loading, error, and confirmation states explicit? | Avoids happy-path-only concepts. | Add missing states with trigger, message, and next action. |
| Does the concept use progressive disclosure well, keep non-essential copy minimal, and avoid tooltip-only critical information? | Keeps the workflow clear without hiding essential context. | Inline essential information, trim copy, and move only secondary detail behind expansion. |
| Does the bundle stay approval-oriented rather than implementation-ready? | Protects the boundary between concept work and later specification. | Remove engineering-ready detail and hand off to `/run-spec` if needed later. |
| Is the next handoff path explicit? | Prevents scope drift into unrelated workflows. | Choose exactly one next step: stay conceptual, `/run-ux`, `/run-spec`, or `/artgen`. |

Reject the request or review output if it asks for:

- implementation-ready components or developer-ready layout contracts
- code generation or framework-specific UI output
- full preview/editor scope, editable prototypes, or runtime automation
- detailed provider/model selection or execution instructions
- final branded design or polished visual identity treatment

## Durable Bundle Mapping

When the output also needs the versioned bundle pairing from the protocol:

- `assessment_summary` maps to `Project UI/UX Assessment`
- `wireframe_selection` maps to `Low-Fi Wireframes` and `Mid-Fi Design Drafts`
- `flow_summaries` maps to `User Flow`, `Data Flow`, `Operation Flow`, and `State Transitions`
- `prompt_export` stays a first-class artifact
- `thin_preview_handoff` stays a first-class artifact and must remain external or thin/read-only

The JSON bundle may group sections under these five artifact classes, but the Markdown handoff should still expose all nine named sections.

If the caller wants repo-owned assets rather than inline-only output, write the paired bundle to a repo path such as `output/uiux/` and keep the JSON file canonical.

## Explicit Rejections

Reject requests that try to turn this surface into:
- implementation-ready layouts or developer-ready UI specs
- code generation or framework/component output
- provider/model execution instructions
- full preview/editor behavior or editable prototyping scope
- final branded design or polished visual identity treatment
