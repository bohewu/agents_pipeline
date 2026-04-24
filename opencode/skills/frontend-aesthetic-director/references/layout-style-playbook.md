# Layout and Style Playbook

Use this reference after the skill activates. Pick one layout archetype and one visual style. Do not combine many archetypes without a clear reason.

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

- Agent pipeline dashboard: workflow command center + developer tool + quiet SaaS.
- Marketing homepage for a dev tool: split hero + developer tool + quiet SaaS.
- Internal admin users page: table workspace + dense enterprise.
- Product analytics: dashboard shell + quiet SaaS or data command center.
- API documentation: docs layout + developer tool.
- Checkout/onboarding: wizard + consumer warmth or quiet SaaS.
