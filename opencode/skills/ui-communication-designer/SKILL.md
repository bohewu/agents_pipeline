---
name: ui-communication-designer
description: Communication-first UI design and critique workflow for task flows, screen-level recommendations, and microcopy rewrites.
license: See repository license
compatibility: Docs-only scaffold; best paired with /uiux for conceptual redesign and can consume /run-ux findings as input, but is not a browser-backed audit workflow.
---

# UI Communication Designer

Use this skill when you need a communication-first UI redesign or critique for one workflow, screen, or flow, especially for:
- new flows or screens
- forms, settings, navigation, checkout, onboarding, dashboards, and error states
- label, instruction, warning, confirmation, and error-message rewrites
- turning a PRD, user story, screenshot, wireframe, or existing flow into a clearer interaction model
- explaining why an interface is hard to use in task language rather than aesthetic opinion

Do not use this skill for:
- browser-backed UX audits, viewport scoring, or evidence collection; use `/run-ux`
- implementation-ready UI specs, acceptance criteria, or component contracts
- code generation or claims about rendered mockups, prototypes, or live previews

## Pairing

- Best fit: `/uiux` conceptual design and rewrite work
- Secondary fit: use after `/run-ux` when you already have findings and need a communication-first redesign direction
- Reference files:
  - `OUTPUT_TEMPLATE.md` for the standard response shape
  - `RUBRIC.md` for the aligned 12-dimension review rubric

## Minimal Intake

- product context
- target user or persona
- top task
- platform
- artifact (optional): screenshot, wireframe, copy, flow, spec, or `/run-ux` findings

## Output Contract

- task summary
- communication diagnosis
- conversation model
- revised task flow
- screen-level recommendations
- microcopy rewrite
- prioritized fixes
- five-second test questions
- rubric scores

## Core Belief

Do not start with, "Should this be a dropdown or a radio group?"  
Start with, "What does the interface need to make clear at this step?"

This skill is not about stacking features onto a screen. It is about making the task understandable so users can complete it without guessing, memorizing, trial and error, or training.

Treat the UI as a conversation between the product and the user:
- the user has goals, questions, risks, and hesitation
- the interface should answer questions, guide the next step, reduce effort, and build trust
- every element should be able to answer: what is it communicating?

## Design Principles

1. Define the message before choosing the UI form.  
   First write how a competent person would naturally explain the task face to face, then translate that into UI language.

2. Every UI element needs a clear communication job.  
   Controls, labels, layout, color, icons, feedback, and animation are not decoration; they are all speaking.

3. Choose components by communication fit, not preference.  
   There is no universally good or bad component, only whether it fits the message at that moment.

4. Respect the user; do not make the product sound rude, mechanical, or bureaucratic.  
   If a sentence, interruption, question, or warning would feel stupid in a real human conversation, it is also stupid in product form.

5. Prioritize self-explanatory design.  
   The interface should help the target user quickly understand actions and outcomes without relying on documentation, training, memory, or repeated attempts.

6. Solve the task before asking for settings.  
   Let users see results and complete the primary job first; defer settings and secondary detail.

7. The layout should support scanning, not force reading.  
   Users scan instead of reading line by line. Focus, path, hierarchy, and endpoint should be clear.

8. Make the system behave like a competent, considerate, trustworthy person.  
   Be specific, timely, empathetic, forgiving, calm, and accountable.

## Agent Workflow

### Step 1. Define the situation
Extract the following from the input:
- who the user is
- what task they are trying to complete now
- why this task matters
- how motivated they are
- the most likely risks, questions, or concerns they have
- what they get when the task is done successfully

If information is missing, make the lowest-risk assumption first and state it explicitly in the output.

### Step 2. Write the human-to-human explanation first
Do not design the UI yet.  
First write how a professional, natural person would guide the user through the task in real life.  
Requirements:
- explain the task in terms of the user goal, not the system mechanism
- use user language, not internal terminology
- say only what is necessary
- say what the user needs first, then secondary detail
- do not ask unnecessary questions
- if you must ask, ask the real question directly

### Step 3. Turn the conversation into a task flow
Break the human explanation into:
- entry point
- what the user decides at each step
- what the system must respond with at each step
- what information the user needs
- commit points, if there are irreversible consequences
- return, edit, or cancel points

The output must mark:
- primary flow
- exception flows
- error recovery
- information that can be deferred

### Step 4. Turn the task flow into UI language
For each step, when choosing a UI expression, explain:
- the purpose of the element
- how the user will discover it
- whether the affordance is clear
- whether the outcome is predictable
- whether it is lower effort than alternatives
- whether extra instruction is needed, and if so why the label alone is not enough

This step must explicitly handle:
- commands
- labels
- instructions
- feedback
- navigation
- errors, warnings, confirmations, and notifications
- progressive disclosure
- defaults and recommendations

### Step 5. Run a scanning-first layout check
For each page, check:
- whether the focal point is clear
- whether the eye path is natural
- whether the main CTA sits at a sensible endpoint
- whether the primary task content appears on the scan path
- whether important information is hidden inside long hard-to-scan paragraphs
- whether must-read information is placed where users are most likely to miss it
- whether too many elements compete for attention

### Step 6. Run a human-level quality check
For each flow and screen, check:
- whether value is clearly communicated
- whether effort and perceived effort are reduced
- whether the design is forgiving around errors
- whether it builds trust
- whether it is smart enough without being over-smart
- whether it avoids annoyance
- whether it interrupts only when necessary
- whether it attracts attention in the least disruptive way
- whether it gives people confidence to continue

### Step 7. Output actionable recommendations
The response must be actionable, not abstract aesthetic commentary.  
Each recommendation should include at least:
- the problem
- why it harms clarity, trust, or efficiency
- the proposed change
- the expected improvement
- priority: High, Medium, or Low

## Hard Rules

1. Do not name the UI after engineering data structures.
   Avoid moving backend models, database fields, or internal workflow names directly onto the screen.

2. Do not ask pointless questions.
   Prefer, in order:
   - do not ask
   - infer automatically
   - provide a sensible default
   - ask later
   - only ask when necessary

3. Ask once.
   Do not request the same information repeatedly. If the system already knows it, fill it in.

4. Ask the real question.
   Do not ask around the mechanism; ask what the user actually needs to decide.

5. Put important text on the control label whenever possible.
   Instructions are easy to skip; labels are more likely to be read.

6. Error messages must be specific.
   They should include at least:
   - which object has the problem
   - what the problem is
   - what the user can do now

7. Do not blame the user.
   Avoid accusatory tone and do not package system limitations as user mistakes.

8. Use warnings and confirmations sparingly.
   Use them only when behavior genuinely needs to change, and prefer the least disruptive option.

9. Commit points must be obvious.
   Any purchase, deletion, submission, overwrite, or irreversible action should make consequences predictable.

10. Preserve user input.
    When users go back, change options, or hit a timeout, keep non-sensitive input whenever possible.

11. Use defaults to reduce work, but do not smuggle in business goals.
    Any option that creates user cost or risk must be explicit and default-safe.

12. If structure can explain it, do not patch it with long text.
    Layout, hierarchy, grouping, and ordering are communication tools.

## Output Format

Return sections in this order. Use `OUTPUT_TEMPLATE.md` for the standard response shape and `RUBRIC.md` for scoring:

### 1. Task Summary
- user
- goal
- platform
- success criteria

### 2. What the User Cares About Most Right Now
List 3-5 questions, for example:
- What is this page for?
- What am I supposed to do?
- Which option is right for me?
- What happens next?
- Can I trust this system?

### 3. Human-to-Human Explanation
Write a short, natural, professional explanation of the task.

### 4. Recommended Task Flow
List step by step:
- step
- user decision
- system response
- whether extra explanation is needed
- whether there is a commit point

### 5. Screen or Component Recommendations
Output by screen or section:
- component
- purpose
- displayed content
- microcopy
- interaction behavior
- feedback
- risk

### 6. Microcopy Rewrite
Rewrite at least:
- page title or main instruction
- CTA
- helper text
- error
- warning or confirmation, if needed

### 7. Main Issues and Fix Priorities
Sort by High, Medium, and Low.

### 8. Five-Second Test Questions
Write 3-5 five-second test questions for the key page.

## Evaluation Dimensions

Score each screen or flow using these dimensions from 0-2:

- Value clarity
- Task clarity
- Discoverability
- Understandability
- Affordance
- Predictability
- Efficiency
- Feedback
- Trust
- Forgiveness
- Non-annoyance
- Scanability

Score definitions:
- 0 = clearly problematic
- 1 = usable but unstable
- 2 = clear and reliable

If the total score is below 18/24, propose structural changes, not just copy fixes.

## Priority Decision Rules

When design options conflict, use this priority order:
1. Can the user quickly understand this step?
2. Does it reduce task effort?
3. Does it build trust and reduce risk?
4. Does it make the next step clear?
5. Does it keep the layout simple and scannable?
6. Does it align with platform conventions?
7. Does it improve visual polish or branding?

## Anti-Patterns

- Do not treat "looks modern" as a valid design reason
- Do not cram everything onto one page just because the feature set is large
- Do not use long instructions to patch a broken flow
- Do not overuse modals, confirmations, warnings, red text, or flashing attention cues
- Do not assume the user should already know
- Do not assume the user is willing to sign up, configure, read, remember, or re-enter information
- Do not front-load unnecessary setup work for system convenience

## Suitable Input Types

- PRD, spec, or user story
- screen screenshot
- wireframe
- Figma export notes
- existing UI copy
- task flow
- form field list
- problem report or usability issue

## Response Style

- Lead with the conclusion, then explain the reasoning
- Be as specific as possible at the component level
- Avoid vague adjectives such as "more intuitive" or "cleaner"
- Prefer causal wording such as "because... therefore..."
- If information is missing, make the smallest necessary assumption and label it
