---
name: frontend-aesthetic-director
description: "Use for bounded implementation or review that changes visible frontend UI: landing pages, dashboards, forms, tables, components, responsive cleanup, accessibility states, design-system alignment, existing-UI polish, or faithful implementation of an approved screenshot, Figma note, wireframe, or UI concept. Do not use for backend-only work, conceptual critique without implementation, or a formal UX audit."
license: See repository license
---

# Frontend Aesthetic Director

Implement intentional, usable UI within the authorized surface while preserving the product's approved task flow and existing support contracts. Default to focused polish rather than an unsolicited redesign.

## Boundary and Pairing

- Use `ui-ux-workflow` or `ui-communication-designer` only when the requested work includes unresolved flow, structure, communication, or visual-direction decisions. They are not prerequisites for bounded implementation or an approved design, and mentioning them does not authorize another workflow or handoff.
- Use `$run-ux` for a formal UX scorecard.
- Use `devtools-ux-audit` or suitable browser tooling for rendered evidence.
- Preserve information architecture, CTA priority, copy intent, trust posture, and state intent unless the current structure demonstrably blocks comprehension or task completion.

If an approved concept, screenshot, Figma note, wireframe, or explicit local request is supplied, proceed directly with the authorized implementation and treat that direction as upstream source of truth. Do not create a conceptual package or seek renewed approval first. Refine visual hierarchy, tokens, styling, responsive behavior, semantics, accessibility, interaction states, and defects within scope. If the handoff conflicts with the existing design system or is technically impractical, make the smallest viable adjustment and report it; ask only when resolving the conflict would materially change the flow or direction.

## Required Workflow

### 1. Inspect Before Editing

Establish:

- framework, styling stack, build commands, and component conventions
- existing tokens, CSS variables, themes, fonts, icons, motion, and spacing
- page/component structure and primary user task
- upstream design artifacts and relevant product copy
- affected components, states, shared tokens/layouts, breakpoints, and the product's supported viewport range
- existing loading, empty, error, success, disabled, stale, and long-content states relevant to the change
- available rendered-QA path

Use `assets/design-brief-template.md` as an optional internal aid when it helps resolve the change boundary or visual direction. It is not a required file, user-facing deliverable, or approval gate. Ask the user only when a missing decision would materially change the requirements, flow, visual direction, cost, permission, or an irreversible action; otherwise make a conservative in-scope assumption and report it.

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

Make verification proportional to the affected components, states, shared primitives, breakpoints, and existing product support. A local spacing, label, or desktop-column change needs checks of the affected surface, interaction, and plausible regressions. A shared component, site-wide layout, breakpoint, or design-system change needs representative pages, states, and supported devices across its impact. A desktop-only request does not create a new mobile design requirement, but it does not remove an existing cross-device contract or excuse a shared change that affects other supported viewports. An explicit full-responsive request still requires every requested device and relevant state.

Run the project's relevant build, typecheck, lint, or tests. When browser tooling is available:

1. Start the app using its normal workflow and confirm reachability.
2. Inspect the affected widths and every viewport required by the request or existing support contract.
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
- affected and contract-required responsive sizes do not overflow or collapse incorrectly
- interaction, focus, and semantic states are usable
- relevant non-happy-path states are covered
- implementation follows the existing design system or documents the minimal exception
- rendered QA was completed, or its absence is explicit

## Final Response

Lead with the result and report:

- design direction when it materially explains a redesign or visual choice
- changed files
- the material changes actually delivered, without a minimum count
- checks and rendered QA performed
- assumptions or unverified items only when relevant

Explain improvements in product terms, not vague claims such as “cleaner” or “more modern.”
