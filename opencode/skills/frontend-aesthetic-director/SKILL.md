---
name: frontend-aesthetic-director
description: "Use this skill for frontend implementation or review work that changes visible UI: landing pages, dashboards, components, forms, data tables, existing UI polish, visual cleanup, anti-slop passes, responsive cleanup, accessibility states, design-system alignment, screenshot/Figma implementation, or implementation of an approved UI concept while preserving the current flow. Do not use for pure backend work, non-visual logic changes, conceptual-only /uiux outputs, or screenshot/wireframe critique that has not yet reached implementation."
license: See repository license
compatibility: Implementation-facing UI guidance. Pair with /uiux for upstream concepts and with devtools-ux-audit or Playwright/browser tooling for rendered visual evidence.
---

# Frontend Aesthetic Director

Use this skill when implementing or reviewing visible frontend UI. The goal is intentional, usable, responsive UI with a clear design direction, especially when an existing surface needs polish without drifting into a full redesign.

## Boundary

- This is an implementation-facing skill for UI code changes and rendered visual QA.
- It does not replace `/uiux`; `/uiux` remains the conceptual workflow, wireframe, communication, and handoff layer.
- It does not replace `/run-ux`; `/run-ux` remains the formal audit and scoring workflow.
- It does not replace `ui-communication-designer`; screenshot, wireframe, or copy critique should stay conceptual until the user asks for implementation.
- It should preserve the current flow, IA, CTA priority, and trust posture unless the existing structure clearly blocks comprehension or task completion.
- It does not require high or xhigh reasoning by default. For polish, cleanup, or approved redesign-without-flow-change implementation work, spend budget on repo scan, state coverage, responsive checks, and rendered evidence.

## Pairing

- Use `references/layout-style-playbook.md` to choose one polish-first correction strategy when relevant, then one concrete layout archetype and visual style profile.
- Use `references/polish-checklist.md` for anti-slop guardrails, state coverage audit, responsive checks, contrast sanity checks, and pre-flight review.
- Use `references/ui-quality-rubric.md` when browser evidence is unavailable and you still need a disciplined self-review.

## Upstream /uiux Handoff Rule

If a `/uiux` bundle, wireframe, screenshot, Figma note, or conceptual handoff is provided, treat it as upstream source of truth.

Preserve:
- user flow and information architecture
- screen or surface structure unless it clearly blocks comprehension
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

Before implementation, form a short internal polish brief:

```text
Surface type: landing page | dashboard | CRUD app | form | docs | workflow builder | chat UI | other
Preserve vs modernize: preserve | selective modernize | stronger refresh
Primary user task:
Primary action:
Upstream source of truth: none | /uiux bundle | wireframe | screenshot | Figma | other
Layout archetype:
Visual style:
Visual risk:
Responsive risk:
State coverage risk:
Design-system constraints:
Verification plan:
```

Ask the user only if the task is impossible without more information. Otherwise make conservative assumptions and report them in the final summary.

### 2. Decide Polish Scope Before Redesign

Default to existing-UI polish, not reinvention.

Start with:
- hierarchy
- spacing
- typography
- contrast
- states
- responsive behavior
- accessibility

Only make layout changes when:
- the current structure hides the primary task
- the scan path is broken
- key actions are detached from their context
- responsive collapse cannot be fixed with local adjustments

When layout changes are needed, make the smallest viable change that restores clarity. Do not use "polish" as cover for a full redesign.

### 3. Choose One Layout And Style Direction

Use `references/layout-style-playbook.md`.

For existing surfaces:
- choose one polish-first correction strategy first
- then choose one layout archetype and one visual style profile

For greenfield or approved concept implementation, choose one layout archetype and one visual style profile. A correction strategy is not a substitute for a concrete layout and style direction.

Good pairings:
- marketing homepage for a dev tool: split hero + developer tool + quiet SaaS
- admin dashboard: dashboard shell + dense enterprise or quiet SaaS
- agent/pipeline UI: workflow command center + developer tool + quiet SaaS
- API docs: docs/developer tool layout + developer tool style
- onboarding or checkout: wizard + quiet SaaS or consumer warmth

Do not combine unrelated trends such as glassmorphism, brutalism, gradients, neumorphism, dense enterprise UI, and editorial layout in the same surface without a clear reason from the brief.

### 4. Verify Dependencies Before Adding UI Surface Area

Before importing any new font, icon package, animation library, UI library, or major utility:
- check `package.json` first
- reuse the existing stack when possible
- if a dependency is missing, present the install command before assuming it can be imported
- avoid adding a library when a token, utility class, or local component solves the problem cleanly

### 5. Work From Tokens And Product Reality

Reuse the existing design system first. If one does not exist, create the smallest local token set needed for the task.

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

Rules:
- Use a 4px or 8px base rhythm.
- Keep section spacing larger than component spacing.
- Use alignment and whitespace before adding borders or shadows.
- Replace placeholder copy with product-specific copy when the repo gives enough context.
- Use realistic sample data for dashboards, tables, logs, and empty states.
- Avoid KPI cards unless each number supports a decision or action.

### 6. Apply Anti-Slop Guardrails

Use `references/polish-checklist.md` as the detailed checklist. These are defaults, not universal bans; override them only when the brief clearly justifies it.

Do not:
- ship generic gradient plus card soup and call it polish
- add unreadable hero art, browser mockups, or decorative UI screenshots
- leave CTA, link, or focus contrast obviously weak
- invent fake KPIs or decorative status indicators that do not support a task
- over-round everything, stack heavy shadows, or add motion with no communication job
- polish only the happy path while ignoring empty, loading, error, disabled, stale, or long-content states

### 7. Accessibility And State Gate

Before finalizing, verify:
- headings are hierarchical and meaningful
- buttons and links use semantic elements and clear labels
- forms have labels, helper text, validation, and error messaging
- focus states are visible and not hidden by overlays
- contrast is sufficient for text, icons, borders used as affordances, and focus rings
- touch targets are practical
- keyboard flow follows visual flow
- important states are not communicated by color alone
- loading, empty, error, success, disabled, stale-data, and long-content states are handled where relevant

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
- use `references/polish-checklist.md` for the pre-flight audit
- explicitly report which visual checks were not performed

## Pre-Flight Ship Checklist

Before shipping, honestly confirm:
- desktop, tablet, and mobile have no obvious overflow or broken collapse
- the primary task is identifiable within a few seconds
- heading, CTA, and section hierarchy are clear
- button, link, and focus contrast pass a quick sanity check
- relevant empty, loading, error, disabled, and long-content states are covered
- any meaningful browser or rendered QA loop has been completed, or the gap is reported

## Final Response Shape

Report concisely:

```text
Design direction: <one sentence>
Changed files: <files>
Polish actions: <3-5 bullets>
Visual QA: <what was verified>
Assumptions / not verified: <only if relevant>
```

Focus on what changed and why it improves the product. Do not over-explain design theory.
