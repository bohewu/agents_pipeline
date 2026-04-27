---
name: frontend-aesthetic-director
description: "Use this skill for frontend implementation or review work that changes visible UI: landing pages, dashboards, components, forms, data tables, responsive polish, visual hierarchy, accessibility states, design-system alignment, screenshot/Figma implementation, or requests like make it beautiful, improve UI, polish dashboard, modernize page, UI/UX, interface, layout, visual design. Do not use for pure backend work, non-visual logic changes, or conceptual-only /uiux outputs."
license: See repository license
compatibility: Implementation-facing UI guidance. Pair with /uiux for upstream concepts and with devtools-ux-audit or Playwright/browser tooling for rendered visual evidence.
---

# Frontend Aesthetic Director

Use this skill when implementing or reviewing visible frontend UI. The goal is intentional, usable, responsive UI with a clear design direction, not generic component assembly.

## Boundary

- This is an implementation-facing skill for UI code changes and rendered visual QA.
- It does not replace `/uiux`; `/uiux` remains the conceptual workflow, wireframe, communication, and handoff layer.
- It does not replace `/run-ux`; `/run-ux` remains the formal audit and scoring workflow.
- It does not require high or xhigh reasoning by default. For a landing-page section, dashboard polish, or component UI task, start with medium or high effort and spend budget on design-system scan, content realism, responsive checks, and browser evidence.

## Upstream /uiux Handoff Rule

If a `/uiux` bundle, wireframe, screenshot, Figma note, or conceptual handoff is provided, treat it as upstream source of truth.

Preserve:
- user flow and information architecture
- screen or surface structure
- primary action and priority order
- copy intent, trust posture, and state intent

Refine only:
- visual direction and hierarchy
- design tokens and component styling
- spacing rhythm and density
- responsive behavior
- interaction states
- accessibility and semantic markup
- rendered defects found during QA

If the handoff conflicts with the existing design system or is technically impractical, make the smallest viable adjustment and report it clearly. Do not silently redesign the flow.

## Required Workflow

### 1. Scan Before Coding

Inspect the repository before changing files:
- framework and styling stack: React, Vue, Svelte, Next, Tailwind, CSS modules, styled-components, etc.
- existing components, tokens, CSS variables, theme files, spacing scale, fonts, icons, and motion conventions
- current page or component structure and the user flow
- product context from copy, routes, README, screenshots, tests, or existing UI
- any upstream `/uiux` output or design handoff

Before implementation, form a short internal design brief:

```text
Surface: landing page | dashboard | CRUD app | form | docs | workflow builder | chat UI | other
Primary user goal:
Primary action:
Upstream source of truth: none | /uiux bundle | wireframe | screenshot | Figma | other
Visual direction:
Layout archetype:
Density target: spacious | balanced | dense
Design-system constraints:
Responsive priorities:
Design risks:
Verification plan:
```

Ask the user only if the task is impossible without more information. Otherwise make conservative assumptions and report them in the final summary.

### 2. Choose One Layout And Style Direction

Use `references/layout-style-playbook.md` when choosing the layout archetype and visual style. Choose exactly one dominant visual direction.

Good pairings:
- marketing homepage for a dev tool: split hero + developer tool + quiet SaaS
- admin dashboard: dashboard shell + dense enterprise or quiet SaaS
- agent/pipeline UI: workflow command center + developer tool + quiet SaaS
- API docs: docs/developer tool layout + developer tool style
- onboarding or checkout: wizard + quiet SaaS or consumer warmth

Do not combine unrelated trends such as glassmorphism, brutalism, gradients, neumorphism, dense enterprise UI, and editorial layout in the same surface.

### 3. Work From Tokens

Reuse the existing design system first. If one does not exist, create the smallest local token set needed for this task.

Recommended token coverage:

```css
--bg
--surface
--surface-raised
--border
--text
--text-muted
--accent
--accent-contrast
--danger
--success
--warning
--radius-sm
--radius-md
--radius-lg
--shadow-soft
--shadow-strong
```

Typography roles:
- display: hero or page-level emphasis
- headline: section or card title
- body: readable content
- caption: metadata and helper text
- code: technical text when needed

Spacing rules:
- Use a 4px or 8px base rhythm.
- Keep section spacing larger than component spacing.
- Keep related controls close; separate unrelated groups clearly.
- Use alignment and whitespace before adding borders or shadows.

### 4. Content And Product Realism

- Replace placeholder copy with product-specific copy when the repository gives enough context.
- Use realistic sample data for dashboards, tables, logs, and empty states.
- Avoid KPI cards unless each number supports a decision or action.
- Keep the primary action discoverable within a few seconds.
- Use visual references or mood-board language when helpful, but encode the result as project tokens and components, not as copied artwork or an unrelated style.

### 5. Composition Rules

For the first viewport or primary surface:
- one clear focal point
- one obvious primary action
- no more than two competing high-emphasis regions
- cards only when they clarify grouping or interaction
- hierarchy created with contrast, type, placement, and whitespace

For dashboards and dense apps:
- scan path: page title -> key status -> primary action -> core data
- filters near the data they affect
- numeric values aligned for comparison
- useful empty, loading, error, stale-data, disabled, and long-content states

For workflow, agent, or pipeline UIs:
- show stage, status, owner or agent, last run, duration, logs, retry/cancel controls, and failure reason where relevant
- use progressive disclosure for logs/details
- distinguish queued/running/succeeded/failed/blocked states by more than color
- keep destructive actions visually secondary and confirmed

### 6. Implementation Rules

- Reuse existing components and utilities before adding new ones.
- Keep component boundaries meaningful: layout shell, navigation, content sections, reusable primitives.
- Prefer CSS variables/design tokens over repeated magic values.
- Use responsive primitives such as `minmax`, `clamp`, fluid grids, wrapping flex, and container constraints.
- Do not cause horizontal overflow on mobile.
- Avoid fixed heights for content-heavy cards.
- Keep floating/fixed elements from covering text, buttons, forms, or navigation.
- Respect reduced-motion preferences.
- Add microinteractions only when they clarify state or hierarchy.

### 7. Accessibility Gate

Before finalizing, verify:
- headings are hierarchical and meaningful
- buttons and links use semantic elements and clear labels
- forms have labels, helper text, validation, and error messaging
- focus states are visible and not hidden by overlays
- contrast is sufficient for text, icons, borders used as affordances, and focus rings
- touch targets are practical
- keyboard flow follows visual flow
- important states are not communicated by color alone
- loading, empty, error, success, disabled, and long-content states are handled where relevant

### 8. Visual QA Loop

When browser tooling or Playwright is available:
1. Run the app or preview using the project's normal command.
2. Inspect desktop, tablet, and mobile widths appropriate to the product.
3. Capture screenshots only when visual evidence is useful; otherwise prefer snapshots and console evidence.
4. Check above-the-fold composition, spacing rhythm, overflow, alignment, visual hierarchy, interaction states, console errors, and responsive collapse.
5. Fix issues and inspect again at least once when the first pass exposes visual defects.
6. Tear down any local server, browser, Playwright session, or background process that was started for QA.

When browser tooling is unavailable:
- run build, typecheck, lint, or tests when available
- review markup/CSS against `references/ui-quality-rubric.md`
- explicitly report which visual checks were not performed

## Final Response Shape

Report concisely:

```text
Design direction: <one sentence>
Changed files: <files>
UX improvements: <3-5 bullets>
Visual QA: <what was verified>
Assumptions / not verified: <only if relevant>
```

Focus on what changed and why it improves the product. Do not over-explain design theory.
