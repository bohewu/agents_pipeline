---
name: ui-ux-workflow
description: Create a compact concept or durable conceptual handoff for one UI surface or journey. Use for wireframes, flows, states, or prompt and preview guidance.
license: See repository license
---

# UI/UX Workflow

Produce a human-reviewable concept for one bounded experience. Approval-oriented describes the artifact's purpose; it does not require renewed approval when the direction is already approved. Stay conceptual rather than producing engineering specifications or implementation.

## Boundary and Pairing

This skill may produce a scoped assessment, low-fi structure, mid-fi direction, conceptual user/data/operation flows, state transitions, a provider-neutral prompt, and a thin external or read-only preview handoff.

Do not produce implementation-ready layouts, component/API/data contracts, acceptance criteria, code, editable prototypes, live integrations, or final branded design. Other skills or workflows are descriptive next steps only and require separate authorization:

- use `../ui-communication-designer/SKILL.md` as a compatible lens for communication-first diagnosis or microcopy
- use `../frontend-aesthetic-director/SKILL.md` for authorized implementation after approval
- use `$run-ux` with suitable browser tooling for browser evidence and scoring

## Choose the Output Depth

### Compact concept

Use a compact concept when the user asks one bounded question, such as choosing a layout, clarifying a state, or sketching a short flow. Include only the sections needed to decide that question. Do not require a durable artifact, full flow set, schema, another workflow, or suggested next stage.

Identify the surface or journey, primary task, primary user, device priority, important non-happy-path state, and material content or trust constraints. Ask only when an answer would materially change the concept; otherwise label a conservative assumption.

Keep one dominant focus and primary task per screen. Use the smallest conceptual layout that supports the task, keep critical information inline, and cover relevant empty, loading, error/recovery, confirmation, and success states. Describe hierarchy, density, theme posture, progressive disclosure, and adaptation conceptually without inventing final tokens or implementation details.

Cover only devices explicitly requested or already required by the product's established support scope. A desktop-only concept does not acquire tablet or mobile deliverables; responsive or mobile work must describe requested adaptations clearly enough for review.

Finish when the bounded question is answered, the main action and relevant states are clear, device scope is respected, assumptions are visible, and optional follow-on work has not been treated as authorized.

### Durable v1 bundle

Use a durable bundle when the user asks for a complete conceptual handoff, a versioned artifact, all flows/states, or repo-owned bundle files. Before drafting or exporting it, read `../../protocols/UI_UX_WORKFLOW.md` and follow its nine-heading Markdown, five-artifact JSON, schema pairing, versioning, communication fields, template, output-path, and completion contracts. Do not produce the durable bundle from this summary alone.

The JSON is canonical when paired Markdown exists. Write repo-owned files only when the user requests files; otherwise return the handoff inline. For file output, validate against `../../protocols/schemas/ui-ux-bundle.schema.json` and consult `../../protocols/examples/ui-ux-bundle.valid.json` when structural guidance is needed.
