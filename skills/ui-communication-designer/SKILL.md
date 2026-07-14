---
name: ui-communication-designer
description: Communication-first conceptual UI design and critique for one task flow, screen, or bounded journey. Use to diagnose unclear interaction, restructure a flow, recommend screen-level changes, or rewrite labels, instructions, CTAs, helper text, errors, warnings, and confirmations from a PRD, screenshot, wireframe, copy set, or UX findings. Do not use for browser evidence collection or implementation-ready component specifications.
license: See repository license
---

# UI Communication Designer

Design the conversation before designing the screen. Explain UI problems through clarity, effort, trust, predictability, and recovery—not aesthetic preference.

## Boundary and Pairing

- Pair with `ui-ux-workflow` when a broader conceptual bundle or wireframe is needed.
- Consume `$run-ux` findings when browser evidence already exists; this skill does not collect that evidence itself.
- Hand approved implementation work to `frontend-aesthetic-director` or another implementation workflow.
- Do not claim rendered behavior, accessibility results, or viewport evidence that was not observed.

Use a compact response for one copy or component question. Use the full format in `references/output-template.md` for a multi-screen critique, redesign handoff, or explicit scored review. The aligned heuristic is in `references/rubric.md`.

## Minimal Intake

Identify the target user, immediate task, platform, success outcome, supplied artifact, and material risk. Ask only if a missing fact would change the recommended task flow; otherwise make the smallest safe assumption and label it.

## Core Workflow

### 1. Define the User's Situation

State:

- what the user is trying to accomplish now
- why it matters to them
- the questions or hesitations they bring
- the value they receive on success
- any cost, risk, commitment, or recovery concern

### 2. Write the Human Explanation First

Before choosing components, explain the task as a competent person would. Use user language, lead with the goal, put necessary information before secondary detail, and ask the real decision directly.

### 3. Convert It into a Task Flow

Map the entry point, each user decision, the system response, required information, commit points, exception/recovery paths, and details that can be deferred. Preserve non-sensitive input across backtracking and recoverable errors.

### 4. Translate the Flow into UI Language

For each screen or step, specify the element's communication job, discoverability, affordance, predicted outcome, feedback, and whether instruction is truly needed. Cover commands, labels, navigation, defaults, progressive disclosure, errors, warnings, confirmations, and notifications.

Choose a component because it fits the decision—not because it is fashionable or familiar to the designer.

### 5. Check Scanning and Trust

Verify that the focal point, eye path, primary action, and endpoint are obvious; essential information is on the scan path; and competing elements do not dilute attention. Make costs, consequences, data use, and irreversible actions clear before commitment.

### 6. Recommend Concrete Fixes

Each material recommendation includes:

- observed or supplied problem
- why it harms clarity, efficiency, trust, or recovery
- proposed change
- expected improvement
- High, Medium, or Low priority

## Communication Rules

- Name concepts in user language, not database or internal workflow terms.
- Prefer, in order: do not ask, infer safely, provide a safe default, ask later, then ask now only when necessary.
- Ask once; reuse information the product already has.
- Put critical wording on the control or adjacent label instead of burying it in instructions.
- Make errors identify the affected object, the problem, and the next action.
- Do not blame the user for system behavior.
- Use warnings and confirmations only when they materially change behavior or prevent meaningful harm.
- Make purchase, delete, submit, overwrite, and other commit points predictable.
- Never preselect an option that creates hidden cost or risk.
- Use hierarchy, grouping, order, and progressive disclosure before adding explanatory paragraphs.
- Avoid vague recommendations such as “make it intuitive”; describe the causal improvement.

## Response Contract

For compact work, lead with the diagnosis and include only the relevant flow, screen, and copy changes.

For a full review, use `references/output-template.md` and include:

1. task summary
2. three to five questions the user cares about now
3. human-to-human explanation
4. primary and recovery flow
5. screen or section recommendations
6. microcopy rewrites
7. prioritized fixes
8. three to five five-second test questions
9. rubric scores when enough evidence exists

Rewrite at least the title or main instruction, primary CTA, helper text, and error copy when those artifacts are in scope. Add warning or confirmation copy only when the flow needs it.

## Scoring Discipline

The 12-dimension rubric is a communication heuristic, not a substitute for user research or browser evidence. Score only dimensions supported by the supplied artifact or observed findings. Mark unseen dimensions `not assessed`, state confidence, and do not fabricate a total from missing evidence.

When all dimensions can be assessed, a score below `18/24` calls for structural flow or hierarchy changes rather than copy-only edits.

## Decision Priority

When recommendations conflict, prefer:

1. comprehension
2. lower task effort
3. trust and risk reduction
4. a clear next step
5. simple scanning
6. platform convention
7. visual polish

End with the highest-leverage change, not a list of generic design principles.
