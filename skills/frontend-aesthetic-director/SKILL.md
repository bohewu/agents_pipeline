---
name: frontend-aesthetic-director
description: "Use for implementation or review that changes visible frontend UI: landing pages, dashboards, forms, tables, components, responsive cleanup, accessibility states, design-system alignment, existing-UI polish, or faithful implementation of an approved screenshot, Figma note, wireframe, or UI concept. Do not use for backend-only work, conceptual critique without implementation, or a formal UX audit."
license: See repository license
---

# Frontend Aesthetic Director

Implement intentional, usable, responsive UI while preserving the product's approved task flow. Default to focused polish rather than an unsolicited redesign.

## Boundary and Pairing

- Use `ui-ux-workflow` or `ui-communication-designer` for conceptual structure, flow, and copy critique before implementation.
- Use `$run-ux` for a formal UX scorecard.
- Use `devtools-ux-audit` or suitable browser tooling for rendered evidence.
- Preserve information architecture, CTA priority, copy intent, trust posture, and state intent unless the current structure demonstrably blocks comprehension or task completion.

If an approved concept, screenshot, Figma note, or wireframe is supplied, treat it as upstream source of truth. Refine visual hierarchy, tokens, styling, responsive behavior, semantics, accessibility, interaction states, and defects. If the handoff conflicts with the existing design system or is technically impractical, make the smallest viable adjustment and report it.

## Required Workflow

### 1. Inspect Before Editing

Establish:

- framework, styling stack, build commands, and component conventions
- existing tokens, CSS variables, themes, fonts, icons, motion, and spacing
- page/component structure and primary user task
- upstream design artifacts and relevant product copy
- current loading, empty, error, success, disabled, stale, and long-content states
- available rendered-QA path

Use `assets/design-brief-template.md` to form a compact internal brief. Ask the user only when a missing decision would materially change the flow or visual direction; otherwise make a conservative assumption and report it.

### 2. Set the Change Boundary

Start with hierarchy, spacing, typography, contrast, states, responsive behavior, and accessibility. Change layout only when the primary task is hidden, the scan path is broken, actions are separated from their context, or responsive collapse cannot be repaired locally.

Choose one preserve-versus-modernize posture. Do not use “polish” as cover for a full redesign.

### 3. Choose One Coherent Direction

Read `references/layout-style-playbook.md` when selecting a correction strategy, layout archetype, or visual style. Use one coherent direction grounded in product context. Avoid mixing unrelated trends without a reason from the brief.

Examples:

- admin dashboard: dashboard shell plus quiet SaaS or dense enterprise
- developer tool: split or tool-focused layout plus developer-tool styling
- agent/workflow UI: workflow command center plus restrained operational styling
- onboarding or checkout: wizard plus calm, trust-oriented styling

### 4. Reuse the Existing System

Prefer existing components and tokens. Before adding a font, icon package, animation library, UI library, or major utility, inspect project dependencies and confirm that the new surface area is justified.

If no design system exists, introduce only the local tokens needed for this task: background/surface, text/muted text, border, accent/contrast, semantic states, radii, spacing, and shadows. Use alignment and whitespace before adding borders, cards, or decoration.

Use realistic product copy and data when the repository provides enough context. Do not invent KPIs or status indicators that do not support a user decision.

### 5. Cover Interaction and Accessibility States

Where relevant, implement and verify:

- semantic headings, buttons, links, labels, and landmarks
- clear helper, validation, and error text
- visible focus and logical keyboard order
- sufficient text, icon, affordance, and focus contrast
- practical pointer/touch targets
- state communication that does not rely on color alone
- loading, empty, error, success, disabled, stale-data, and long-content behavior

Use `references/polish-checklist.md` for the detailed state and anti-slop pass. Avoid generic gradient-and-card composition, decorative mockups, excessive rounding/shadows, meaningless motion, weak CTA contrast, and happy-path-only polish.

### 6. Verify the Implementation

Run the project's relevant build, typecheck, lint, or tests. When browser tooling is available:

1. Start the app using its normal workflow and confirm reachability.
2. Inspect product-appropriate desktop, tablet, and mobile widths.
3. Exercise the changed interaction and relevant states.
4. Check hierarchy, spacing rhythm, alignment, overflow, responsive collapse, focus, and console errors.
5. Fix observed defects and inspect the affected viewport again.
6. Stop only the server, browser, or background resources started for this task and verify cleanup.

Prefer semantic inspection for routine checks; save screenshots when visual comparison or evidence matters.

If rendered QA is unavailable, use `references/ui-quality-rubric.md` plus `references/polish-checklist.md`, run non-visual checks, and state exactly what was not verified.

## Ship Gate

Before finishing, confirm:

- the primary task and primary action are obvious
- hierarchy and scan path are coherent
- relevant responsive sizes do not overflow or collapse incorrectly
- interaction, focus, and semantic states are usable
- relevant non-happy-path states are covered
- implementation follows the existing design system or documents the minimal exception
- rendered QA was completed, or its absence is explicit

## Final Response

Lead with the result and report:

- design direction
- changed files
- three to five material polish actions
- checks and rendered QA performed
- assumptions or unverified items only when relevant

Explain improvements in product terms, not vague claims such as “cleaner” or “more modern.”
