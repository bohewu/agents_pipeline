# UI/UX Workflow Foundation

This protocol defines the thin repo-facing entry surface for conceptual UI/UX work.

It exists to give the repo a bounded place for early UI/UX framing without introducing a new primary orchestrator.

## Repo Fit

- Use this workflow when the user needs conceptual UI/UX direction for one bounded experience, workflow, or surface.
- The workflow sits between raw product intent and later execution-oriented paths:
  - before `/run-spec` when concepts need approval before implementation-ready specs
  - after `/run-ux` when audit findings need conceptual follow-up
  - adjacent to `/artgen` when a concept also needs bounded 2D asset briefs or prompts
- The canonical entry surface is the non-run command `/uiux` routed directly to the hidden subagent `@ui-ux-designer`.
- Do not add a new primary orchestrator for this layer.

## Workflow Boundaries

### In scope

- conceptual experience briefs
- user and journey framing
- low-fidelity workflow steps and screen or surface maps
- interaction principles, state coverage prompts, and copy or trust guidance
- assumptions, open questions, and next-step handoff notes

### Out of scope

- implementation-ready specs, acceptance criteria, test plans, or task decomposition
- code generation, component implementation, or framework-specific UI output
- high-fidelity visual comps, rendered previews, interactive prototypes, or full preview/editor scope
- browser-backed audits or runtime automation
- provider or model selection behavior

## Reuse Points

### Reuse from `/run-ux`

- Reuse the normal-user perspective, journey framing, and evidence-aware caution when users bring existing audit findings into a conceptual redesign request.
- `/uiux` may translate UX findings into concept-level direction, but it must not perform or pretend to perform a live audit.

### Reuse from `/run-spec`

- Reuse the docs-first posture and explicit handoff boundary between concept work and implementation-ready specification.
- Approved conceptual output from `/uiux` can later become input for `/run-spec`.

### Reuse from `/artgen`

- Reuse the thin command-to-hidden-subagent pattern instead of introducing orchestration overhead.
- Reuse explicit assumption labeling, bounded scope, and copy-ready Markdown packaging.
- Keep the workflow non-executing and conceptual, just as `/artgen` stays prompt/brief oriented rather than acting as a renderer.

## Canonical Workflow Shape

1. User enters a conceptual UI/UX request through `/uiux`.
2. `@ui-ux-designer` returns a bounded concept brief for the primary workflow or surface.
3. If the user really needs evaluation of an existing experience, redirect or hand off to `/run-ux`.
4. If the concept is approved and needs implementation-ready specification, hand off to `/run-spec`.
5. If supporting 2D assets are needed, use `/artgen` separately for those asset briefs.

## Versioned Artifact Contract Bundle

When conceptual UI/UX work needs a durable handoff, emit a paired bundle:

- `ui-ux-bundle.json` — machine-readable conceptual contract
- `ui-ux-bundle.md` — human-readable review and handoff companion

Reference contract files in this repo:

- Schema: `./protocols/schemas/ui-ux-bundle.schema.json`
- Reference example: `./protocols/examples/ui-ux-bundle.valid.json`

### Source-of-truth rules

- The JSON bundle is the source of truth when both forms exist.
- The Markdown bundle is required review and handoff copy, but it must not add or override structured decisions that are absent from the JSON.
- Both forms must be derived from the same source content and kept in sync.
- If review changes are made in Markdown, the JSON must be updated before the bundle is considered complete.
- Markdown-only output is still acceptable for early exploration, but it is not the durable versioned contract for later tooling or handoff.

### Bounded v1 conceptual output bundle

For v1, a complete conceptual UI/UX handoff must enumerate these outputs in review order:

1. `project_ui_ux_assessment` — bounded assessment of the current project or requested surface, including problem framing, strengths, risks, assumptions, and open questions
2. `low_fi_wireframes` — low-fidelity screen or surface blocking focused on layout, regions, hierarchy, and primary actions
3. `mid_fi_design_drafts` — concept-level mid-fidelity drafts that clarify hierarchy, content weight, and state intent without becoming implementation-ready layouts
4. `user_flow` — the primary user journey plus alternate or recovery paths
5. `data_flow` — conceptual movement of user-visible inputs, outputs, and dependencies without API, schema, or persistence design
6. `operation_flow` — ordered operations or system interactions that matter to the concept without drifting into runtime implementation
7. `state_transitions` — named conceptual states, transition triggers, and outcome expectations without component/store/state-machine implementation detail
8. `prompt_export` — first-class reusable prompt payload for a downstream designer, generator, or reviewer
9. `thin_preview_handoff` — external or thin, read-only preview handoff describing what to show for review without introducing full preview/editor behavior

These outputs must stay conceptual and approval-oriented. They must not become implementation-ready layouts, component contracts, code-generation instructions, runtime automation, or full preview/editor behavior.

### Required artifact classes and grouped v1 outputs

Every durable bundle must include these conceptual artifact classes:

- `assessment_summary` — the project UI/UX assessment: problem framing, recommendation summary, assumptions, and open questions
- `wireframe_selection` — the low-fi wireframes plus paired mid-fi design drafts, including chosen layout direction, named regions, rationale, and alternatives considered
- `flow_summaries` — the user flow, data flow, operation flow, and state transitions, including major steps, conceptual dependencies, and state coverage
- `prompt_export` — a first-class reusable prompt payload for a downstream designer, generator, or reviewer
- `thin_preview_handoff` — an external or thin, read-only preview handoff describing surfaces, states, annotations, constraints, and non-goals

The current schema-lite bundle groups the nine v1 outputs into these five top-level artifact classes. The bundle must remain conceptual. Do not turn it into an implementation-ready UI schema, a full preview/editor contract, runtime automation instructions, or provider/model configuration.

### Human-readable pairing rules

- `ui-ux-bundle.md` should contain stable sections that correspond to each artifact class.
- Recommended review headings are:
  - `Project UI/UX Assessment`
  - `Low-Fi Wireframes`
  - `Mid-Fi Design Drafts`
  - `User Flow`
  - `Data Flow`
  - `Operation Flow`
  - `State Transitions`
  - `Prompt Export`
  - `Thin Preview Handoff`
- Each JSON artifact class must have a matching Markdown section, and grouped JSON classes must still expose the v1 outputs as named sections or subsections.
- `assessment_summary` maps to `Project UI/UX Assessment`.
- `wireframe_selection` maps to `Low-Fi Wireframes` and `Mid-Fi Design Drafts`.
- `flow_summaries` maps to `User Flow`, `Data Flow`, `Operation Flow`, and `State Transitions`.
- `prompt_export` and `thin_preview_handoff` remain first-class named sections.
- The Markdown may expand rationale, examples, or copy suggestions, but it must preserve the structured decisions captured in JSON.
- Prompt export content may appear verbatim in Markdown for easy reuse, but the structured JSON payload remains the canonical contract.
- Prompt export must never be treated as an appendix or optional note; it is a required handoff artifact.
- Thin preview handoff prose must state `external or thin, read-only` intent explicitly and must preserve non-goals that keep preview/editor scope thin.

### Repo-owned export mode

The thin `/uiux` surface may optionally export a durable bundle directly into repo-owned assets.

- Supported command flag: `--output-dir=<path>`
- Relative `output-dir` values should be treated as repo-root relative.
- This mode is for repo assets, not run-local `.pipeline-output/` artifacts.
- Recommended file naming:
  - `<output-dir>/<bundle-slug>.ui-ux-bundle.json`
  - `<output-dir>/<bundle-slug>.ui-ux-bundle.md`
- `bundle-slug` should be a lowercase kebab-case summary of the primary workflow or surface.
- Export mode should write both files together or neither file at all.
- The JSON file remains canonical; the Markdown file is the human-reviewable companion.
- If `/uiux` is used without `--output-dir`, it should remain inline-only and should not create files by default.

## v1 Conceptual Wireframe Template Catalog and Selection Matrix

Use the v1 catalog as a bounded vocabulary for `low_fi_wireframes` and `mid_fi_design_drafts`.

- A conceptual handoff may combine one shell template, one primary workflow template, and one or more state templates.
- The goal is faster review alignment on structure, hierarchy, and intent.
- Do not turn template use into implementation-ready screen specs, component inventories, measurements, breakpoint maps, or engineering-ready annotations.

### Catalog usage rules

- Start with the smallest template that clearly supports the primary user goal.
- Combine templates only when persistent framing or explicit state coverage is needed.
- Name regions or slots rather than concrete components, pixel rules, or framework patterns.
- Record why the chosen template fits and which nearby alternative was rejected.
- If no template fits cleanly, name the closest fit and the mismatch instead of inventing a detailed custom layout system.

### v1 template catalog

#### 1. App shell template

**Intended use cases**
- multi-surface products that need persistent orientation or navigation
- workspaces where users move repeatedly between areas, queues, or tools
- concepts that need a stable frame around changing inner content

**Anti-cases**
- single-task views with no meaningful cross-surface navigation
- narrow flows where persistent chrome would distract from one primary action
- marketing or brand sites outside this conceptual workflow scope

**Required regions/slots**
- global orientation or navigation region
- page or surface identity region
- primary content canvas
- secondary utility or supporting-context zone
- system or workflow status/feedback space

**Common variants**
- left-nav workspace shell
- top-nav product shell
- task-focused shell with minimized support regions
- split-pane shell with persistent context

**Cross-platform adaptation guidance**
- Desktop can keep orientation and secondary context visible together.
- Tablet should preserve identity and primary work while collapsing one secondary region.
- Mobile should reduce the shell to lightweight orientation plus one dominant content region, with support content on demand.

**Theme or density notes**
- Compact density fits expert, repeat-use environments.
- Relaxed density fits onboarding, trust-sensitive, or mixed-expertise contexts.
- Theme direction should reinforce the posture of the inner workflow rather than compete with it.

**Prompt/export implications**
- State what stays persistent across surfaces versus what changes per screen.
- Name the navigation model conceptually.
- Call out which shell regions may collapse or disappear on smaller screens.

#### 2. Dashboard template

**Intended use cases**
- at-a-glance monitoring, prioritization, or daily orientation
- mixed-information surfaces where summary signals should guide next actions
- executive, operator, or team views that combine status plus entry points

**Anti-cases**
- workflows that are primarily sequential or form-driven
- deep reading or editing tasks centered on one object
- concepts where summary blocks would duplicate the real work surface

**Required regions/slots**
- summary or headline insight region
- key signals, metrics, or status blocks
- action-entry region for the next likely tasks
- trend, queue, or recent-activity region
- timeframe, segment, or scope context

**Common variants**
- KPI-first dashboard
- activity-and-alert dashboard
- role-based operations dashboard
- team overview dashboard with drill-in paths

**Cross-platform adaptation guidance**
- Desktop can show multiple summary regions in parallel.
- Tablet should keep one summary column plus one drill-in lane or stacked sections.
- Mobile should emphasize the most decision-useful signals first and defer lower-priority blocks behind scrolling or expansion.

**Theme or density notes**
- Higher density can work when users scan dashboards repeatedly for signal.
- Lower density helps when the dashboard must explain meaning, trust, or status changes clearly.
- Theme choice should keep emphasis on signal clarity over decoration.

**Prompt/export implications**
- Identify the top few signals that justify the dashboard rather than a list or detail view.
- State the primary follow-up actions each summary region should trigger.
- Note which blocks may be dropped or stacked first on smaller devices.

#### 3. List/filter template

**Intended use cases**
- discovery, triage, monitoring, or bulk review across many items
- searchable, sortable collections where comparison matters
- queues or backlogs that lead into detail or action views

**Anti-cases**
- single-object tasks with no comparison or selection step
- short decision flows better handled by a wizard or single action surface
- situations where filtering would add complexity without meaningful choice

**Required regions/slots**
- search, sort, or filter controls
- result collection region
- item selection or focus context
- bulk or list-level action region
- empty or no-match handling area

**Common variants**
- table-heavy operations list
- card or tile collection
- master-detail list
- queue with inline status or triage actions

**Cross-platform adaptation guidance**
- Desktop can keep filters, results, and selection context visible together.
- Tablet should preserve scanability while collapsing secondary filters or detail context.
- Mobile should prioritize quick query refinement and a single readable result stream, with secondary controls progressively revealed.

**Theme or density notes**
- Denser layouts fit expert review and comparison tasks.
- More open density helps mixed-content lists or lower-frequency usage.
- Theme direction should preserve strong contrast between control areas and result content.

**Prompt/export implications**
- Call out the dominant organization model: search-led, filter-led, or queue-led.
- Name the key comparison attributes users must scan quickly.
- Specify whether selection leads to inline action, separate detail, or batch handling.

#### 4. Detail/primary action template

**Intended use cases**
- reviewing one entity, case, or record while taking a decisive next action
- read-then-act workflows where context must stay adjacent to the main action
- approval, confirmation, purchase, resolution, or escalation surfaces

**Anti-cases**
- broad discovery or comparison across many items
- multi-step setup that depends on staged prerequisites
- settings-heavy configuration work better grouped elsewhere

**Required regions/slots**
- identity and status region for the focal object
- main detail or evidence region
- primary action region
- supporting metadata, history, or related-context zone
- guardrail or consequence messaging space

**Common variants**
- read-first detail surface
- action-first detail surface
- split detail plus activity/history surface
- review-and-confirmation surface

**Cross-platform adaptation guidance**
- Desktop can place primary action beside supporting detail when the relationship must stay visible.
- Tablet should keep the object identity and action region near the main evidence but may stack secondary context.
- Mobile should foreground the core detail and anchor the primary action while moving secondary metadata behind expansion or secondary screens.

**Theme or density notes**
- Higher density can suit expert case review if action consequences remain legible.
- Relaxed density helps trust, comprehension, and irreversible-action caution.
- Theme direction should emphasize clarity and confidence at the decision point.

**Prompt/export implications**
- Name the single most important action and why it belongs on the detail surface.
- State what context must remain visible before the action is taken.
- Call out any information that can safely move behind progressive disclosure on smaller screens.

#### 5. Form/create-edit template

**Intended use cases**
- creating, editing, or correcting structured information
- capturing inputs that belong to one object or one bounded submission event
- tasks where validation, helper text, and save behavior need explicit conceptual treatment

**Anti-cases**
- short binary or single-action tasks that do not justify a form shell
- dependent multi-step journeys that need staged progression or review checkpoints
- browse-first tasks where information entry is secondary

**Required regions/slots**
- context or intent header
- grouped input sections
- helper, validation, or guidance area
- commit, save, or cancel action region
- draft, progress, or completion-status space

**Common variants**
- short single-page form
- long sectional create or edit form
- side-panel quick edit
- review-before-submit form

**Cross-platform adaptation guidance**
- Desktop can show grouped sections with adjacent help or summary context.
- Tablet should keep clear grouping and touch-safe spacing while reducing side-by-side complexity.
- Mobile should favor single-column entry, short visible sections, and careful action anchoring.

**Theme or density notes**
- Relaxed density improves readability and error prevention for unfamiliar or high-risk inputs.
- Moderate density can work for expert-edit surfaces when grouping stays clear.
- Theme direction should support confidence, correctness, and recovery from mistakes.

**Prompt/export implications**
- Specify whether the concept is create-first, edit-first, or review-before-submit.
- Name the highest-risk input groups and where guidance is needed.
- State whether the export should emphasize validation, draft recovery, or confidence checks.

#### 6. Wizard/step flow template

**Intended use cases**
- onboarding, setup, checkout, or configuration journeys with dependencies between steps
- workflows where users benefit from staged focus and explicit progress
- higher-risk tasks that need review or confirmation before completion

**Anti-cases**
- simple forms or actions that can be completed on one surface
- exploratory workflows where users need flexible jumping between areas
- cases where step gates would create unnecessary friction

**Required regions/slots**
- step indicator or progress framing
- current-step task region
- next, back, pause, or exit controls
- review, confirmation, or summary region
- inline guidance for prerequisites, dependencies, or errors

**Common variants**
- linear onboarding wizard
- branching decision flow
- staged setup with review step
- short confirmation flow with checkpointing

**Cross-platform adaptation guidance**
- Desktop can show progress plus adjacent summary context without losing focus.
- Tablet should keep progress visible while simplifying side content.
- Mobile should keep the current step dominant, compress progress framing, and defer secondary explanation until needed.

**Theme or density notes**
- Relaxed density often helps comprehension and reduces missed steps.
- Moderate density can work for short expert flows if progress and consequences stay obvious.
- Theme direction should reinforce safety, forward motion, and completion confidence.

**Prompt/export implications**
- State why a staged flow is preferable to a single-page form.
- Name the gating decisions or dependencies between steps.
- Identify which steps may collapse, combine, or simplify on smaller devices.

#### 7. Settings template

**Intended use cases**
- configuring preferences, policies, permissions, or account/workspace behavior
- organizing options that persist beyond one immediate task
- concepts where discoverability, safety, and scope of change matter

**Anti-cases**
- urgent task completion that should remain close to the work surface
- first-run guidance that needs a wizard or guided setup instead
- one-off actions disguised as settings only because they are secondary

**Required regions/slots**
- scope or ownership context
- settings grouping or navigation region
- setting detail region with meaning and consequences
- apply, save, or reset behavior region
- dependency, permission, or warning space

**Common variants**
- account settings
- workspace or team settings
- advanced or expert settings
- policy-and-permission settings surface

**Cross-platform adaptation guidance**
- Desktop can keep category navigation and current setting detail visible together.
- Tablet should preserve grouping clarity while collapsing deeper category structures.
- Mobile should favor short groups, explicit category transitions, and clearly separated destructive or high-impact controls.

**Theme or density notes**
- Moderate density usually balances scanability with comprehension.
- Denser settings can work for expert admin tools if warnings and grouping remain strong.
- Theme direction should emphasize trust, clarity of impact, and recoverability.

**Prompt/export implications**
- Name the scope of change: self, team, workspace, or system.
- Specify whether changes apply immediately or after explicit confirmation at a conceptual level.
- Call out which settings need stronger warning, explanation, or grouping in downstream outputs.

#### 8. Empty/loading/error state templates

**Intended use cases**
- covering absence, wait, or failure states for any primary template
- clarifying how a concept behaves before data exists, while work is in progress, or when recovery is needed
- preventing optimistic happy-path wireframes from hiding key decision moments

**Anti-cases**
- treating state coverage as decoration after the main surface is already locked
- inventing novel full-screen layouts when the base template only needs a state treatment
- replacing the primary task structure with states that should remain temporary

**Required regions/slots**
- state label or framing message
- short explanation of why the state exists
- next-step, recovery, or retry action region
- preserved context from the parent surface where useful
- escalation, help, or fallback guidance when recovery is not immediate

**Common variants**
- first-run empty state versus no-results empty state
- initial loading versus background refresh state
- inline error versus blocking error state
- recoverable error versus support-needed failure state

**Cross-platform adaptation guidance**
- Desktop can preserve more surrounding context to explain what changed.
- Tablet should keep the state readable without overwhelming the base surface.
- Mobile should emphasize the message and next step first while removing nonessential surrounding detail.

**Theme or density notes**
- Empty states can be slightly more open to support orientation and encouragement.
- Loading states should stay lightweight and not simulate final detail density.
- Error states should bias toward clarity, calmness, and actionable recovery over visual intensity.

**Prompt/export implications**
- Require explicit mention of the state trigger and expected user reaction.
- Distinguish between first-use emptiness, filtered-no-result emptiness, temporary loading, and recoverable versus blocking failure.
- Preserve concise copy and clear next steps so downstream exports do not over-explain temporary states.

### Selection matrix

#### Template choice matrix

| Decision signal | Prefer this template | Why this fit is usually strongest |
|---|---|---|
| Users need persistent orientation across multiple areas or tools | App shell | A stable frame reduces reorientation cost and lets inner surfaces vary without losing navigation context. |
| Users must scan summary signals before deciding where to act | Dashboard | Summary-first structure surfaces status and priority better than jumping directly into detailed lists or forms. |
| Users must find, compare, triage, or batch-handle many items | List/filter | Search, filtering, and side-by-side comparison become the main task, so the layout should optimize scanability and narrowing. |
| Users must understand one entity and then take a clear next action | Detail/primary action | The concept succeeds when context and action stay coupled instead of forcing users to bounce between summary and action surfaces. |
| Users must enter or edit structured information for one bounded object or submission | Form/create-edit | Grouped input, guidance, and save behavior matter more than overview metrics or staged navigation. |
| Users must move through dependent steps with checkpoints or gating | Wizard/step flow | Staged progress lowers cognitive load and makes prerequisites, review points, and completion state easier to understand. |
| Users must configure persistent behavior, preferences, permissions, or policy | Settings | Grouping by scope and consequence makes more sense than embedding these controls inside task-focused surfaces. |
| The main need is to explain absence, waiting, or failure for another surface | Empty/loading/error state templates | State templates preserve the parent structure while making recovery, reassurance, or next steps explicit. |

#### Presentation and adaptation matrix

| Decision axis | Choose this direction when... | Avoid or downshift when... | Rationale |
|---|---|---|---|
| Theme direction | Use neutral/utilitarian direction for operator or productivity concepts; warmer/trust-focused direction for onboarding, support, or sensitive data moments; signal-heavy direction for monitoring or operational awareness. | The visual posture would compete with task clarity or imply brand polish beyond conceptual scope. | Theme should communicate product posture and trust level, not decorative specificity. |
| Density | Use compact density for expert repeat-use scanning; balanced density for mixed audiences; relaxed density for unfamiliar, risky, or explanation-heavy flows. | Higher density would hide consequences or make first-use comprehension harder. | Density is a conceptual choice about cognitive load and scan speed, not a fixed spacing spec. |
| Layout direction | Use hub-and-spoke or multi-region layouts when orientation and branching matter; use single-column forward flow when users should focus on one decision at a time; use split-context layouts when evidence must stay visible beside action. | Secondary regions exist only because the screen has room, not because the task needs them. | Layout direction should follow the dominant decision pattern: explore, compare, or commit. |
| Progressive disclosure | Reveal detail on demand when most users only need the primary path; stage or gate content when prerequisites matter; keep everything visible only when comparison or oversight is the task. | Users would need to repeatedly open hidden information just to complete the happy path. | Progressive disclosure should remove noise without hiding essential decision context. |
| Concise copy behavior | Use short labels plus terse helper text for expert or repeat-use flows; add slightly more explanatory or reassuring copy for risky, first-run, or error states; keep calls to action concrete and outcome-oriented. | Additional prose starts teaching implementation details or repeating obvious labels. | Copy length should reduce ambiguity at the decision point while preserving reviewable conceptual structure. |
| Desktop adaptation | Preserve multiple regions when simultaneous visibility improves orientation, comparison, or action confidence. | Secondary areas do not materially help the task. | Desktop can support parallel context, but only when that context changes decisions. |
| Tablet adaptation | Keep the same conceptual model as desktop, but collapse one supporting region and bias toward stacked sections with touch-safe spacing. | The design depends on three or more equally visible regions. | Tablet should preserve intent while simplifying competition for space and touch attention. |
| Mobile adaptation | Reduce to one dominant column or one dominant task region, move secondary context behind expansion, and keep the next action obvious. | The concept assumes constant side-by-side comparison or deep persistent chrome. | Mobile adaptation should protect completion and comprehension by prioritizing the single most important task path. |

## Non-Expert Design and Interaction Guidance

Use these defaults when producing `low_fi_wireframes` and `mid_fi_design_drafts` for reviewers who need conceptual clarity rather than implementation detail.

### Apply the guidance by fidelity

- `low_fi_wireframes` should emphasize blocking, grouping, the primary task, navigation model, and where major states appear.
- `mid_fi_design_drafts` should keep the same structure while clarifying content weight, emphasis, trust cues, and state messaging.
- Both outputs must stay conceptual. Neither should drift into branded polish, token specs, or implementation-ready layouts.

### Theme principles

- Treat theme as product posture, not final brand design.
- Choose one conceptual direction per surface: neutral/utilitarian, trust/calm, or signal-forward.
- In low-fi output, label theme direction in words only.
- In mid-fi output, describe contrast, tone, and emphasis conceptually, but do not specify final colors, type systems, design tokens, or polished brand treatment.
- Theme should reinforce the primary task and state clarity instead of adding decorative weight.

### Spacing and spacing scale

Use a simple relative spacing scale instead of pixel values or token names.

| Scale step | Use it for | Low-fi expectation | Mid-fi expectation |
|---|---|---|---|
| `tight` | items that belong to one control or content group | show that the items stay together | keep related controls or text visually adjacent |
| `base` | siblings within one section | separate peer items cleanly | preserve a readable scan rhythm |
| `section` | breaks between distinct content groups | make section boundaries obvious | reinforce hierarchy and chosen density |
| `region` | separation between major regions or task phases | distinguish main work from support areas | use only when extra separation improves orientation |

- Stay on one scale per surface unless an error, review, or confirmation moment needs one step more breathing room.
- Low-fi should show grouping through relative spacing, not measurements.
- Mid-fi may refine the same scale for clarity, but must not convert it into pixel specs, breakpoint math, or engineering tokens.

### Density

Choose one default density per surface and explain why it fits the task.

| Density | Use when... | Avoid when... |
|---|---|---|
| compact | expert users repeatedly scan, triage, or compare dense information | consequences, helper text, or first-use orientation would become easy to miss |
| balanced | mixed audiences or mixed-frequency tasks need both scanability and clarity | the concept really depends on either very rapid monitoring or especially careful explanation |
| relaxed | the flow is first-run, trust-sensitive, high-risk, or explanation-heavy | the layout would become slow to scan or force excessive scrolling for repeat users |

- Density is a cognitive-load choice, not a visual-style flourish.
- It is acceptable to loosen density slightly for empty, error, or confirmation states when comprehension matters more than scan speed.

### Hierarchy

- Default to one primary task per screen or surface.
- Give each screen one dominant focus: the current task, the current object, or the current decision.
- Keep one primary action clearly strongest; secondary and destructive actions must step down in emphasis.
- Low-fi should show hierarchy through placement, grouping, and labels.
- Mid-fi may clarify hierarchy through conceptual weight and emphasis notes, but should still avoid implementation-ready visual specs.

### Layout and navigation

- Start with the smallest template that supports the primary task.
- Persistent navigation is justified only when users must move repeatedly between areas or tools; otherwise prefer a task-focused surface.
- Use progressive disclosure for advanced settings, secondary metadata, and supporting explanation.
- Keep non-essential copy minimal. Each line should orient, reassure, explain a state, or support a decision.
- Critical information, prerequisites, warnings, and irreversible consequences must be visible inline or persistently. Never rely on tooltip-only or hover-only disclosure for essential information.
- Additional regions should appear only when they materially change the user's next decision.

### State rules across low-fi and mid-fi

| State | Low-fi requirement | Mid-fi requirement |
|---|---|---|
| empty | show why the surface is empty, what the primary next step is, and what parent context still exists | keep the message concise, preserve orientation, and add only enough encouragement or reassurance to help users start |
| loading | show what is loading, whether the wait blocks progress, and which surrounding regions remain stable | keep the loading treatment calm, avoid implying final detail density too early, and clarify whether users should wait, retry, or continue elsewhere |
| error | state what failed in user terms, preserve important context when possible, and offer a concrete recovery or fallback action | make severity and recovery clear, keep tone calm, and expose escalation/help paths when self-service recovery is not enough |
| confirmation | show what succeeded or was committed, what changed, and the next best action | confirm the outcome without celebratory noise, keep the next step obvious, and preserve context for users who need to continue or review |

- Cover these states in both low-fi and mid-fi outputs whenever they meaningfully affect the primary workflow.
- Avoid happy-path-only concepts. Reviewers should see how the experience behaves before data exists, while work is happening, when something fails, and after success.

### Cross-platform adaptation rules

| Viewport | Explicit rule |
|---|---|
| desktop | Multiple regions may remain visible only when simultaneous visibility improves orientation, comparison, or action confidence. Keep one primary task per screen even when support regions stay open. |
| tablet | Preserve the desktop concept, but collapse one supporting region, bias toward stacked sections, and keep touch-safe spacing. Do not depend on three or more equally important visible columns. |
| mobile | Reduce to one dominant column or one dominant task region, move secondary context behind expansion or secondary screens, keep actions obvious, and assume no hover affordance. Critical information must stay inline because tooltip-only disclosure is not reliable. |

- One primary task per screen remains the default across desktop, tablet, and mobile.
- Progressive disclosure should remove noise, not hide essential decision context.
- Minimal non-essential copy is the default on every viewport; smaller screens should lose optional prose before they lose core instructions.

## Intake Questions and Review Rubric

### Minimal intake question set

Use a small number of high-value intake questions before drafting. These five questions are the default set.

| Intake question | Why it matters |
|---|---|
| What is the one workflow, screen, or surface we are designing, and what is the one primary task on it? | This keeps the concept bounded and prevents multi-surface scope creep. |
| Who is the main user or actor, and which devices matter first: desktop, tablet, mobile, or a mix? | This determines hierarchy, density, and cross-platform adaptation from the start. |
| Which non-happy-path moment most needs coverage: empty, loading, error/recovery, or confirmation? | This forces state coverage early instead of treating it as cleanup work. |
| What constraints must stay true: trust/compliance needs, navigation dependencies, existing terminology, content limits, or support expectations? | This keeps the concept anchored in real constraints without over-collecting implementation detail. |
| What follow-up do you expect after review: stay conceptual, `/run-ux`, `/run-spec`, or `/artgen`? | This protects the boundary between conceptual work and later audit, spec, or asset paths. |

### High-value review rubric

Review with a short set of high-value questions and route changes based on the rationale below.

| Review question | Why it matters | Recommendation if the answer is no |
|---|---|---|
| Is the concept clearly bounded to one primary workflow or surface, with one primary task per screen? | A bounded concept is easier to review, compare, and hand off without accidental product redesign. | Narrow the scope, split extra flows into follow-up work, or restate the one task the screen exists to support. |
| Do the low-fi and mid-fi outputs describe theme posture, spacing scale, density, hierarchy, layout/navigation, and desktop/tablet/mobile adaptation at a conceptual level? | These are the minimum signals reviewers need to judge usability direction without demanding implementation detail. | Add short conceptual annotations for the missing design signals; do not add pixel specs, components, or breakpoints. |
| Are empty, loading, error, and confirmation states explicit, with clear next steps and preserved context where needed? | Happy-path-only concepts create false confidence and hide recovery or reassurance gaps. | Add the missing states before approval, keeping each one tied to trigger, message, and next action. |
| Does the concept use progressive disclosure appropriately, keep non-essential copy minimal, and avoid tooltip-only critical information? | Good conceptual UI/UX reduces noise without hiding the information users need to act safely. | Inline essential warnings or prerequisites, trim repetitive prose, and move secondary detail behind expansion or separate surfaces. |
| Does the bundle stay approval-oriented rather than implementation-ready? | This layer exists to align on concept before specification or execution. | Remove engineering-ready detail and redirect implementation asks to `/run-spec` after concept approval. |
| Is the next handoff path explicit and appropriate? | Clear routing prevents the conceptual layer from turning into an audit, build plan, or asset-generation task. | Choose exactly one next step: stay conceptual, `/run-ux`, `/run-spec`, or `/artgen`. |

Automatic rejection conditions for this workflow:

- implementation-ready components, component inventories, or developer-ready layout contracts
- code generation or framework-specific UI output
- full preview/editor scope, editable prototyping behavior, or runtime automation
- detailed provider/model selection or execution instructions
- final branded design, polished visual identity treatment, or marketing-grade comps

### Versioning rules

- The top-level bundle uses `protocol_version` in `major.minor` format.
- The bundle `artifact_type` is `ui-ux-bundle`.
- Each artifact class may include its own `class_version`, also in `major.minor` format.
- Bump the major version when changing required fields, renaming artifact classes, or changing source-of-truth semantics.
- Bump the minor version for additive, backward-compatible fields or clarifying notes.

## Phased Rollout Assumptions

- Phase 0 established the workflow foundation: protocol, non-run command, and hidden subagent.
- Phase 1 introduces a schema-lite conceptual artifact bundle with required JSON plus Markdown pairing rules for assessment, low-fi wireframes, mid-fi design drafts, flow definitions, prompt export, thin preview handoff, and the bounded v1 template catalog plus selection matrix for conceptual wireframe choice.
- Phase 2 may add richer template helpers or lightweight synthesis helpers beyond the bounded v1 catalog, but still must not introduce a new primary orchestrator.
- Full preview/editor behavior, implementation generation, and runtime automation remain explicitly out of scope for this workflow.

## Cross-Platform Guardrails

- Keep examples, prompts, and artifacts path-agnostic and Markdown-first.
- Do not require OS-specific shells, local servers, browsers, or generated runtime outputs.
- Keep this layer conceptual and repo-facing rather than toolchain- or platform-specific.
- `opencode/agents/*.md` remains the source of truth for agent behavior; generated runtime or export outputs should not be hand-edited.

## Quick Routing Rule

- Need conceptual UI/UX direction -> `/uiux`
- Need to evaluate an existing experience -> `/run-ux`
- Need implementation-ready behavior/spec artifacts -> `/run-spec`
- Need bounded 2D asset briefs/prompts -> `/artgen`
