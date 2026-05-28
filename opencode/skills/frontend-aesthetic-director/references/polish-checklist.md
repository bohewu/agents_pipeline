# Polish Checklist

Use this reference after the skill activates when the task is polish, cleanup, or redesign-without-flow-change work. The goal is to correct common AI defaults with a compact, repeatable review loop.

## 1. Preserve Vs Modernize Dial

Choose one level before editing:

- `preserve`
  - Keep layout, component structure, and visual language largely intact.
  - Fix hierarchy, spacing, typography, contrast, states, responsive issues, and a11y defects.
- `selective modernize`
  - Keep task flow and IA intact.
  - Allow localized layout cleanup, token refresh, clearer grouping, and stronger CTA hierarchy.
- `stronger refresh`
  - Still preserve the core flow and primary task.
  - Allow larger visual shifts only when the current surface is visibly generic, cluttered, or untrustworthy.

If the request says "do not change the flow", default to `preserve` or `selective modernize`.

## 2. Anti-Slop Guardrails

Treat these as default warnings. Override only when the brief clearly asks for the effect and the result still supports the task.

- Do not add generic gradients to hide weak hierarchy.
- Do not use equal-size card grids when the content needs clear priority.
- Do not ship tiny unreadable hero screenshots or browser mockups.
- Do not create fake KPI cards, fake activity feeds, or decorative status chips.
- Do not add heavy shadows, oversized blur, or over-rounded controls by default.
- Do not add motion that does not explain state, hierarchy, or feedback.
- Do not make dark mode, glass, or "premium" styling the default answer to weak UX.

## 3. State Coverage Audit

For the primary flow, confirm which of these exist and whether they need UI treatment:

- empty
- loading
- error
- success
- disabled
- stale-data
- long-content
- destructive confirmation

Rules:
- A polished surface is not happy-path only.
- Error and empty states should explain what happened and what the user can do next.
- Disabled states should still make the intended action understandable.
- Loading indicators should match layout shape when possible instead of default spinners.

## 4. Responsive Audit

Check at least one desktop, one tablet, and one mobile width when possible.

Look for:
- horizontal overflow
- clipped headings
- wrapped CTA groups that become awkward or ambiguous
- sidebars or sticky elements covering content
- tables that become unusable without a fallback pattern
- detail panels that lose context when collapsed
- fixed heights that fail with real content

Default fixes:
- use wrapping flex and `minmax` grids
- reduce side-by-side density before shrinking type aggressively
- move secondary controls below the primary action on small screens
- prefer scroll regions or alternate list/detail patterns over crushed tables

## 5. Contrast And Affordance Sanity Check

Quick checks before shipping:

- body and helper text remain readable against their background
- CTA labels are readable on their fills
- ghost or outline buttons are still visible on complex backgrounds
- focus rings are visible on all interactive elements
- borders used as affordances are visible enough to communicate interactivity
- status meaning is not color-only

If a button, link, field, or tab looks decorative instead of actionable, it needs another pass.

## 6. Pre-Flight Review

Do not ship without checking:

- the primary task is obvious within 3-5 seconds
- the main CTA appears near the context that justifies it
- the scan path is clear from title to status/content to action
- typography and spacing do most of the hierarchy work
- the UI still looks intentional if gradients, shadows, and illustrations are mentally removed
- any new dependency has been verified in `package.json`
- any unverified visual risk is called out in the final response
