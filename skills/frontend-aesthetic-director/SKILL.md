---
name: frontend-aesthetic-director
description: Implement or polish a bounded frontend UI with deliberate composition, typography, density, and rendered visual comparison. Use for approved designs, visually weak surfaces, components, responsive behavior, or design-system alignment.
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

Inspect the actual supplied reference, not just its filename or a summary. Preserve its composition, content priority, density, palette, asset treatment, and component geometry unless the request authorizes changes. An inaccessible reference is an explicit limitation, not permission to invent a replacement and claim fidelity. A low-fi wireframe constrains structure, not unspecified colors or type. No reference, image generation, moodboard, or new approval round is mandatory for a local fix; for an authorized new surface or visual refresh, resolve missing visual decisions at the smallest useful depth.

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

Choose one preserve-versus-modernize posture. Do not use “polish” as cover for a full redesign. Identify what is visually weak in the affected surface and what must stay unchanged. An explicit aesthetic-improvement request includes demonstrated hierarchy, proportion, density, and fidelity defects even when the UI still functions; do not reduce that request to accessibility or bug fixes alone.

### 3. Choose One Coherent Direction

Read `references/layout-style-playbook.md` when selecting a correction strategy, layout archetype, or visual style. Use one coherent direction grounded in product context. Avoid mixing unrelated trends without a reason from the brief.

Examples:

- admin dashboard: dashboard shell plus quiet SaaS or dense enterprise
- developer tool: split or tool-focused layout plus developer-tool styling
- agent/workflow UI: workflow command center plus restrained operational styling
- onboarding or checkout: wizard plus calm, trust-oriented styling

Turn the direction into decisions, not adjectives. For a visual refresh or new surface, establish the dominant region and reading order, content width and panel proportions, density, heading/body/control type roles, surface/accent roles, and any justified signature treatment. Reuse established decisions for a local fix; note only its visual delta. A short internal note is enough, not a new deliverable or gate.

Use the playbook's worked examples to connect these choices to the user's task. "Premium", "modern", or "quiet SaaS" alone is not direction. Distinctiveness can come from useful content, typography, and composition; it does not require a new font, novel controls, imagery, or decorative chrome.

### 4. Reuse the Existing System

Prefer existing components and tokens. Before adding a font, icon package, animation library, UI library, or major utility, inspect project dependencies and confirm that the new surface area is justified.

If no design system exists, introduce only the local tokens needed for this task: background/surface, text/muted text, border, accent/contrast, semantic states, radii, spacing, and shadows. Use alignment and whitespace before adding borders, cards, or decoration.

Use realistic product copy and data when the repository provides enough context. Do not invent KPIs or status indicators that do not support a user decision.

Define content and control typography deliberately: headings, labels, values, table cells, tabs, toolbars, inspectors, and status text should use coherent roles rather than accidental browser defaults. For CJK or mixed-language products, inspect the actual fallback font, line height, punctuation, long labels, and localized wrapping. Preserve i18n keys and existing locale support; never solve overflow by silently shortening required copy or shrinking all text.

Keep one compatible icon family with consistent optical size, stroke/fill, and alignment. Use the existing approved asset and font sources; new assets or kits must be free/open-source or already licensed for this use. Do not introduce paid kits, remote font dependencies, or a new framework merely to improve appearance. Real controls and text remain native UI, not a screenshot. Image generation is optional and subject to host capabilities and authorization, not a prerequisite for frontend work.

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

1. Start the app using its normal workflow and confirm reachability. For an existing visual change, capture the affected baseline before editing when feasible; do not reconstruct a missing before image as evidence.
2. Inspect the affected widths and every viewport required by the request or existing support contract. For comparisons, keep viewport, theme, locale, data, selected state, and zoom consistent; wait for fonts, assets, and loading to settle.
3. Exercise the changed interaction and relevant states. Use semantic inspection for behavior and computed styles to diagnose type, spacing, or contrast; these do not replace visual inspection.
4. For an aesthetic, layout, typography, or reference-fidelity change, capture and actually inspect the rendered screenshot. Compare it with the baseline or supplied reference at matching dimensions where practical. Inspect the affected first viewport and relevant detail, not only a scaled-down full-page image. A saved screenshot that was not viewed is not visual verification.
5. Record material mismatches as observation -> smallest in-scope correction -> recheck. Inspect the fresh screenshot after each material visual correction. Separate fidelity, visual quality, interaction/accessibility, and build/test results; one does not prove the others.
6. Stop when the requested visual delta is demonstrated and material in-scope defects are resolved, or report a concrete blocker. Do not chase a numerical score, a fixed number of polish items, or unlimited "10/10" iterations.
7. Stop only the server, browser, or background resources started for this task and verify cleanup.

Keep evidence proportional: a component crop with viewport/state context can support a local change; broader layout changes need representative affected regions. Report which reference/render was viewed, the viewport/state, and remaining deviations without creating a mandatory report file or formal audit.

If browser rendering or image inspection is unavailable, use `references/ui-quality-rubric.md` plus `references/polish-checklist.md`, run non-visual checks, and label visual quality/fidelity `unverified`. Do not replace missing visual evidence with a self-awarded score or claim that build success proves the UI looks good.

## Ship Gate

Before finishing, confirm:

- the primary task and primary action are obvious
- hierarchy and scan path are coherent
- affected and contract-required responsive sizes do not overflow or collapse incorrectly
- interaction, focus, and semantic states are usable
- relevant non-happy-path states are covered
- implementation follows the existing design system or documents the minimal exception
- visual direction is expressed in the delivered hierarchy, typography, proportions, and density rather than decoration alone
- rendered screenshots were actually inspected for visual changes, or visual quality/fidelity is explicitly unverified

## Final Response

Lead with the result and report:

- design direction when it materially explains a redesign or visual choice
- changed files
- the material changes actually delivered, without a minimum count
- checks and rendered QA performed
- assumptions or unverified items only when relevant

Explain improvements in product terms, not vague claims such as “cleaner” or “more modern.”
