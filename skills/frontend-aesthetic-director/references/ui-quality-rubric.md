# UI Quality Rubric

Use this rubric before finalizing frontend UI work. A score below 4 in any critical category requires another iteration unless the user explicitly asked for a rough draft.

Scoring:
- 5: strong, intentional, production-ready
- 4: good, minor refinements only
- 3: acceptable but generic or risky
- 2: visibly weak or hard to use
- 1: broken, confusing, or inaccessible

## 1. First Impression And Visual Identity

Questions:
- Does the first viewport have a clear focal point?
- Can the user identify what product or surface this is within a few seconds?
- Would the UI still feel distinct if the logo/nav were removed?
- Is the style intentional rather than a collection of defaults?

Common failures:
- generic gradient hero
- repeated card soup
- weak brand or product signal
- no clear primary action

## 2. Information Architecture

Questions:
- Is the page organized around user goals rather than component inventory?
- Does each section have one job?
- Is the primary action near the relevant context?
- Are secondary actions visually secondary?

Common failures:
- too many competing CTAs
- filters far from affected data
- important status hidden behind tabs or modals

## 3. Layout And Spacing

Questions:
- Is there a consistent spacing rhythm?
- Are related elements grouped and unrelated elements separated?
- Are grids aligned across sections?
- Does the design handle long content?

Common failures:
- inconsistent margins
- dense UI inside huge containers
- overuse of borders/shadows instead of whitespace
- horizontal overflow on mobile

## 4. Typography

Questions:
- Is there a clear type scale?
- Are headings, body, metadata, and code visually distinct?
- Is line length readable?
- Are labels and values easy to scan?

Common failures:
- no hierarchy beyond browser defaults
- too many text sizes
- centered long paragraphs
- tiny low-contrast metadata

## 5. Color And Contrast

Questions:
- Is there one dominant accent and clear semantic colors?
- Is contrast sufficient for body text, muted text, icons, borders-as-affordances, and focus states?
- Are status colors used consistently?
- Does the UI avoid color-only communication?

Common failures:
- purple bias with no brand reason
- low-contrast gray on gray
- random color per section
- status chips that rely only on hue

## 6. Component Quality

Questions:
- Do buttons, inputs, selects, tables, tabs, modals, and cards have clear states?
- Are components reusable and token-driven?
- Are interactive affordances obvious?
- Are empty/loading/error/disabled states present where relevant?

Common failures:
- clickable divs instead of buttons or links
- missing focus, disabled, or loading states
- tables without sorting/filter feedback
- cards used as decoration only

## 7. Responsiveness

Questions:
- Does the layout work at mobile, tablet, and desktop widths?
- Do sidebars, tables, grids, and hero media collapse intentionally?
- Are touch targets practical?
- Are fixed/floating elements safe on small screens?

Common failures:
- desktop-only grid
- overflowing tables
- fixed headers covering content
- CTA buttons wrapping awkwardly

## 8. Accessibility And Usability

Questions:
- Are semantic elements used correctly?
- Is keyboard navigation logical?
- Are labels, descriptions, and validation messages connected to controls?
- Are focus states visible and not obscured?

Common failures:
- missing labels
- missing modal focus traps
- icon-only buttons without names
- errors shown only by red border

## 9. Product Realism

Questions:
- Is copy specific to the product/domain?
- Are sample data and states realistic?
- Does the UI support actual user decisions?
- Are there any lorem ipsum or fake metrics that reduce trust?

Common failures:
- placeholder content
- unrealistic KPI cards
- demo data that does not match the workflow

## 10. Implementation Maintainability

Questions:
- Are design decisions encoded as tokens or reusable utilities?
- Are components factored at useful boundaries?
- Does the code follow project conventions?
- Did build/lint/typecheck pass, or are failures reported clearly?

Common failures:
- magic values repeated everywhere
- inline styles for major theme decisions
- new UI library added unnecessarily
- ignoring existing components

## Critical Fail Conditions

Do not ship without fixing or explicitly reporting these:
- mobile horizontal overflow
- primary action unclear or missing
- text contrast obviously insufficient
- keyboard focus invisible
- important state communicated only by color
- broken loading/error/empty states in the core flow
- UI cannot be built or rendered
