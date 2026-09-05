---
name: ui-ux-workflow
description: Docs-only conceptual UI/UX workflow for one bounded experience, surface, or journey, from a compact concept through a requested durable handoff. Use for conceptual assessment, wireframes, flows, states, prompts, and thin preview guidance. Do not use for implementation-ready component contracts, code generation, browser-backed audit evidence, or a full interactive prototype.
license: See repository license
---

# UI/UX Workflow

Produce a human-reviewable concept for one bounded experience. Approval-oriented describes the artifact's purpose; it does not require a new approval when the requested direction is already approved. Keep the output useful for review without drifting into engineering specifications or implementation.

Read the durable protocol when exact bundle mapping, schema pairing, or the full template catalog is needed: `../../protocols/UI_UX_WORKFLOW.md`.

For communication-first diagnosis or microcopy, `../ui-communication-designer/SKILL.md` is a compatible lens. For implementation after approval, `../frontend-aesthetic-director/SKILL.md` may be a useful next step. For browser evidence and scoring, `$run-ux` with suitable browser tooling may be appropriate. These references are descriptive; they do not authorize or automatically start another skill, workflow, or agent.

## Boundary

This skill may produce:

- a scoped assessment
- low-fi structure
- mid-fi visual and content direction
- user, data, and operation flows
- conceptual state transitions
- a provider-neutral prompt export
- a thin, external or read-only preview handoff

Redirect implementation-ready layouts, component/API contracts, acceptance criteria, framework output, editable prototypes, live integrations, and final branded visual design to a later workflow.

## Choose the Output Depth

Use a compact concept when the user asks one bounded question, such as choosing a layout, clarifying a state, or sketching a short flow. Include only the sections necessary to decide that question. Mention a possible handoff only when it helps the user; do not make it a required next stage.

Use the durable v1 bundle when the user asks for a complete conceptual handoff, a versioned artifact, or all flows/states. In that case use these exact headings in order:

1. `Project UI/UX Assessment`
2. `Low-Fi Wireframes`
3. `Mid-Fi Design Drafts`
4. `User Flow`
5. `Data Flow`
6. `Operation Flow`
7. `State Transitions`
8. `Prompt Export`
9. `Thin Preview Handoff`

Keep all nine headings in a durable bundle, even when one section is brief.

## Minimal Intake

Determine:

- the one surface or journey and primary task
- primary user and device priority
- the most important non-happy-path state
- terminology, navigation, trust, compliance, or content constraints
- expected next step after review, when the user has one

Ask only when an answer would materially change the concept. Otherwise use a conservative, visible assumption.

## Concept Defaults

- Keep one primary task and one dominant focus per screen.
- Choose compact, balanced, or relaxed density based on familiarity, scan speed, and trust sensitivity.
- Use a conceptual spacing scale such as `tight`, `base`, `section`, and `region`; do not invent final pixel tokens.
- Prefer the smallest layout template that supports the task and use progressive disclosure for secondary detail.
- Keep critical information inline rather than tooltip-only.
- Cover empty, loading, error/recovery, confirmation, and success when relevant. State why each exists, what remains visible, and what the user can do next.
- Cover the devices explicitly requested and those required by the product's established support scope. A desktop-only concept does not need a new tablet or mobile design; responsive or mobile work should describe the requested adaptation in enough detail for review.
- Describe theme posture—such as neutral/utilitarian, calm/trust-oriented, or signal-forward—without final brand colors or marketing-grade polish.

Use the protocol's bounded template catalog when helpful: app shell, dashboard, list/filter, detail/primary action, form/create-edit, wizard, settings, and common system states. Explain the selection in conceptual terms.

## Durable Section Guidance

### Project UI/UX Assessment

Frame the problem, recommendation, assumptions, open questions, and explicit scope boundary.

### Low-Fi Wireframes

Show regions, hierarchy, navigation, primary actions, and rough state placement. Small ASCII wireframes are useful when they improve review speed. Annotate template, density, progressive disclosure, and cross-device adaptation without pixel specifications.

### Mid-Fi Design Drafts

Clarify content weight, hierarchy, visual posture, and state intent. Stay grayscale or annotation-oriented; do not turn this into tokens or implementation-ready comps.

### User Flow

Describe the main actor journey plus meaningful alternate and recovery paths in outcome-oriented steps.

### Data Flow

Describe user-visible inputs, outputs, dependencies, and information movement. Do not define APIs, database models, or persistence contracts.

### Operation Flow

Describe conceptual system interactions that matter to the experience. Do not specify services, jobs, or runtime choreography.

### State Transitions

Name important states, triggers, visible outcomes, retained context, and available next actions. Do not define reducers, stores, or component internals.

### Prompt Export

Provide one reusable, provider-neutral conceptual prompt with must-include and must-avoid constraints. Treat it as a first-class artifact, not an appendix.

### Thin Preview Handoff

Label it `external or thin, read-only`. List surfaces/states worth showing, required annotations, and non-goals. Do not promise editing, persistence, live data, or a full preview runtime.

## Review Gate

Before handing off, confirm that the concept:

- stays within one bounded journey or surface
- communicates a primary task and hierarchy
- covers relevant system and recovery states
- covers the requested and established device scope, including adaptation when relevant
- minimizes non-essential copy and keeps essential context visible
- remains approval-oriented rather than implementation-ready
- distinguishes optional recommendations from authorized follow-on work

For a durable JSON/Markdown pair, map the nine headings to the protocol's five artifact classes: `assessment_summary`, `wireframe_selection`, `flow_summaries`, `prompt_export`, and `thin_preview_handoff`. Write repo-owned artifacts only when the user asks for files; otherwise return the conceptual handoff inline.
