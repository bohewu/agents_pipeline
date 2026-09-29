# Layout and Style Playbook

Use the relevant part of this reference when a visual decision is unresolved. Existing approved systems and references take precedence. For a local fix, retain the established archetype and style; do not repeat a style-selection exercise. For an authorized new surface or refresh, choose a coherent direction and translate it into the concrete decisions below.

## From Direction To Visible Decisions

Start with the user's task, not a component gallery. Define only choices affected by the request:

| Decision | What to decide | How to inspect it |
| --- | --- | --- |
| Composition | Dominant region, reading order, content width, panel proportions | Does the first viewport put the task ahead of decorative chrome? |
| Density | Reading, comparison, or manipulation; comfortable or compact | Can the user see the needed rows, fields, or canvas without unnecessary scrolling? |
| Typography | Heading, body, label, value, and control roles | Do size, weight, line height, and wrapping separate levels without tiny secondary text? |
| Rhythm | Shared alignment edges, small within-group gaps, larger between-group gaps | Are related controls grouped and section transitions deliberate? |
| Surfaces | Background, content, selection, overlays, semantic status | Is emphasis purposeful without nesting a card around every region? |
| Character | A domain-appropriate type, media, accent, or interaction treatment | Does it reinforce the product instead of competing with the task? |

A reference is useful when its structure or craft solves the same problem. Extract the transferable choice and note what does not transfer. Do not collage unrelated brands, require browsing for every task, or claim to have seen an inaccessible reference. Prefer existing project examples and free official design-system guidance over paid kits.

### Worked Directions, Not Universal Templates

- **University administration / records:** let the task title, scoped filters, record count, table, and contextual action form the hierarchy. Align labels and text columns consistently; align comparable numbers to the end and use tabular numerals where suitable. Preserve useful row density and full localized labels. A giant greeting hero and unrelated KPI cards steal space from the task.
- **Canvas editor:** give the document/canvas the dominant area; use quieter rails and a consistent inspector label/value grid. Set toolbar/control typography separately from zoomable canvas text. Inspect initial fit, pan/zoom, persisted selection, focus, and which panel owns scrolling. Enlarging the hero title or shrinking the whole interface does not repair a crowded inspector.
- **Operational dashboard:** organize existing status, anomalies, evidence, and recovery actions by urgency. Use color for meaningful state and stable neutral surfaces for normal operation. Keep the relevant failure and next action together; do not invent counters or turn every metric into an equally loud card.
- **Marketing / editorial:** use the real product promise, one focal composition, useful media, and deliberate headline/body contrast. Vary section rhythm when the requested page has multiple sections, while reusing alignment and type roles. Do not manufacture proof, testimonials, badges, or extra sections to make a template look complete.

### Starting Values When No System Exists

These are optional local design heuristics, not accessibility standards or defaults that override the brief. Adapt to the actual font, content, input method, viewport, and density; encode chosen values in reusable tokens rather than scattered magic numbers.

- A compact product surface might start with 14-16 CSS px body/control text, clearly separated 20-28 px page headings, and restrained 12-14 px secondary text only where readable. Marketing display type belongs to a different scale; do not apply it to inspector controls.
- Start with a small spacing rhythm such as 4/8/12/16/24/32 CSS px. Within-group spacing should usually be smaller than between-group spacing. Optical alignment can justify a small exception.
- Choose compatible control heights, paddings, and icon sizes as one family. Do not force all controls to grow or all text to shrink merely to fit a layout. Pointer targets and focus requirements still apply independently of visual density.
- Select surface and text roles first, then a restrained accent and semantic states. Adjust based on measured contrast, not a screenshot impression. Dark mode and rounded cards are choices, not quality requirements.

## Polish-First Selection

For an existing UI cleanup, choose the needed correction strategy and retain the established layout/style unless the authorized change calls for revisiting it.

### Preserve And Clarify

Best for: "polish this", "fix spacing", "clean up mobile", "improve states", "do not change the flow".

Focus on:
- clearer type hierarchy
- spacing rhythm
- CTA emphasis
- state coverage
- contrast and affordance repair

Avoid:
- changing the layout family unless the current scan path is broken
- replacing the design system just to look newer

### Selective Modernize

Best for: generic but salvageable surfaces that need stronger grouping, cleaner tokens, and more deliberate hierarchy.

Focus on:
- reducing visual noise
- removing decorative card soup
- strengthening grouping and section rhythm
- refreshing surfaces, borders, and accents without changing the product model

Avoid:
- introducing a second unrelated aesthetic language
- moving primary actions away from their original task context

### Stronger Refresh Without Flow Change

Best for: pages that feel dated, untrustworthy, or incoherent, but whose flow and IA still basically work.

Focus on:
- a cleaner dominant style profile
- clearer focal points
- more intentional first-viewport composition
- stronger state and status semantics

Avoid:
- turning a cleanup request into a full redesign
- using motion, gradients, or novelty as a substitute for structure

## Layout Archetypes

### Full-Bleed Narrative Hero

Best for: landing pages, product launches, portfolio entries, branded campaigns.

Structure:
- full viewport or strong above-the-fold composition
- brand or product signal, one headline, one support sentence, one CTA group
- dominant image, video, workflow visual, or atmospheric background
- proof, product details, and final CTA after the first viewport

Avoid:
- stats strips in the hero
- multiple badges or chips floating on media
- four-column feature grids immediately above the fold

### Split Hero

Best for: SaaS landing pages, apps with a clear product screenshot, technical tools.

Structure:
- left side: product promise and actions
- right side: product screenshot, workflow preview, or code/console surface
- strong vertical alignment; avoid tiny unreadable media cards

Avoid:
- generic browser mockups with unreadable fake UI
- equal emphasis across too many side elements

### Editorial / Magazine Layout

Best for: content-heavy brands, studios, portfolios, insight pages.

Structure:
- type contrast, asymmetric grids, generous whitespace
- intentionally varied section rhythm
- images and callouts that support the story

Avoid:
- small text on low-contrast backgrounds
- random asymmetry that hurts scanability

### Bento Grid

Best for: feature overviews and product capability summaries.

Structure:
- 3-7 modules with different spans
- each module has one job and a clear visual cue
- larger cards carry the strongest claims

Avoid:
- equal-size card soup
- bento as a substitute for information architecture

### Dashboard Shell

Best for: analytics, ops, monitoring, admin tools.

Structure:
- persistent side or top navigation
- page header with status and primary action
- data modules arranged by decision priority
- filters near affected data

Avoid:
- decorative hero sections
- KPI cards that are not tied to actions

### Table + Filters Workspace

Best for: CRUD/admin, logs, users, tasks, transactions.

Structure:
- search and filters above or beside the table
- clear active filter state and reset
- bulk actions only when selection exists
- sticky header or visible pagination for long lists

Avoid:
- hiding primary row actions behind unclear icons
- center-aligning numeric or status-heavy columns

### Master-Detail Layout

Best for: inbox, tickets, jobs, customers, workflows.

Structure:
- list: searchable index and status
- detail: selected item, actions, history
- mobile collapses into list -> detail navigation

Avoid:
- equal visual weight between list and detail
- losing context after an action

### Canvas / Editor Workspace

Best for: visual editors, diagrams, timelines, and creation tools.

Structure:
- dominant working canvas/document with stable tool rails
- contextual inspector with consistent label/value alignment
- explicit selected, focused, disabled, and active-tool states
- intentional panel scroll ownership and initial fit/zoom

Avoid:
- marketing headers consuming the working area
- scaling app chrome with the document
- nested scroll regions or floating controls that obscure the task

### Wizard / Stepper

Best for: onboarding, setup, checkout, complex forms.

Structure:
- clear progress indicator
- one conceptual step per screen
- review/summary before destructive or costly submit

Avoid:
- long forms disguised as steps
- progress labels that do not map to user goals

### Workflow / Pipeline Command Center

Best for: agent pipelines, CI/CD, ETL, orchestration, automation tools.

Structure:
- summary bar: health, running jobs, failures, last run
- main area: stage list, DAG, timeline, or hybrid
- details panel: selected run logs, metadata, retries
- clear status semantics: queued, running, succeeded, failed, blocked, canceled

Recommended components:
- status chips with icon and label
- timeline rows with duration and agent/owner
- retry/cancel buttons near failure context
- log viewer with copy, filter, and collapse

Avoid:
- pure node graphs for everything; they become hard to scan
- status by color only
- hiding failure reasons behind multiple clicks

### Docs / Developer Tool

Best for: API docs, SDKs, internal tools, CLIs.

Structure:
- left nav or command palette
- main reading column with max width
- code examples, callouts, and copy buttons
- stable anchors and search

Avoid:
- marketing-style cards inside reference docs
- low-contrast code blocks

### Chat / AI Workspace

Best for: assistants, copilots, support bots, agent consoles.

Structure:
- conversation is primary; controls are secondary
- input has clear affordance, attachments, submit/stop
- tool/status/source visibility near relevant messages
- empty state teaches the user what to do next

Avoid:
- oversized chrome that squeezes messages
- ambiguous running/completed tool states

## Visual Style Profiles

### Quiet SaaS

Traits: neutral surfaces, crisp text, subtle borders, one restrained accent, disciplined whitespace.

Use when: B2B tools, dashboards, AI productivity apps, developer SaaS.

Do:
- use typography scale and spacing as the main design tools
- make primary actions obvious but not loud
- use borders before heavy shadows

Avoid:
- random gradients
- over-rounded everything
- too many accent colors

### Premium Editorial

Traits: large type contrast, asymmetry, strong imagery, refined whitespace, fewer boxes.

Use when: brands, portfolios, high-end services, storytelling pages.

Do:
- let content and imagery breathe
- use fewer sections with stronger hierarchy

Avoid:
- dense dashboards
- excessive UI chrome

### Developer Tool

Traits: precise spacing, monospace accents, terminal/code surfaces, clear status states, command-palette feel.

Use when: APIs, agents, infrastructure tools, CLIs, observability.

Do:
- use code blocks, logs, and status semantics carefully
- keep contrast high and controls explicit

Avoid:
- making everything dark by default
- decorative terminal aesthetics that reduce readability

### Dense Enterprise

Traits: compact tables, conservative palette, clear labels, robust states, minimal animation.

Use when: admin panels, internal operations, financial/healthcare/compliance tools.

Do:
- optimize for repeated work and data comparison
- keep controls predictable

Avoid:
- marketing-style hero layouts
- excessive whitespace that hurts productivity

### Consumer Warmth

Traits: approachable copy, softer palette, expressive illustrations or photos, friendly states.

Use when: consumer apps, onboarding, education, health/wellness, community tools.

Do:
- humanize empty states and feedback
- keep core tasks simple

Avoid:
- childish visuals unless the product requires it
- low-contrast pastel text

### Data / Ops Command Center

Traits: high information density, strong status hierarchy, timeline/log/metric focus, dark mode optional.

Use when: monitoring, pipelines, incident response, automation control rooms.

Do:
- make anomalies and next actions obvious
- use color consistently for state
- include timestamps, durations, and ownership

Avoid:
- fancy charts without decisions
- color-only state communication

## Pattern Pairing Examples

- Agent pipeline dashboard: workflow command center + developer tool styling.
- Marketing homepage for a dev tool: split hero + quiet SaaS styling.
- Internal admin users page: table workspace + dense enterprise.
- Product analytics: dashboard shell + quiet SaaS or data command center.
- API documentation: docs layout + developer tool.
- Checkout/onboarding: wizard + consumer warmth or quiet SaaS.
- Existing dashboard cleanup: preserve and clarify + dashboard shell + quiet SaaS or dense enterprise.
- Existing landing page cleanup: selective modernize + split hero or full-bleed narrative hero + one restrained style profile.
- Existing workflow UI cleanup: preserve and clarify + workflow command center + developer tool.

## Official Reference Anchors

These explain specific decisions, not mandatory component dependencies. Consult only what the task needs; no full-site research requirement.

- Carbon data table usage: https://carbondesignsystem.com/components/data-table/usage/ — task-oriented table anatomy, coordinated density, and usable content space.
- W3C WCAG quick reference: https://www.w3.org/WAI/WCAG22/quickref/ — verify applicable accessibility criteria and exceptions rather than treating a visual heuristic as compliance.
