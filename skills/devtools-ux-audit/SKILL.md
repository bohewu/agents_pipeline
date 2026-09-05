---
name: devtools-ux-audit
description: Browser-evidence workflow for a normal-user journey audit or formal UX score gate across desktop-first, responsive, and mobile web interfaces. Use when the review needs declared viewport and journey coverage with navigation, interaction, snapshot, console, network, or screenshot evidence. A bounded frontend check may use ordinary browser tooling without invoking this formal audit workflow.
license: See repository license
---

# DevTools UX Audit

Collect browser evidence for one bounded user journey. This is the evidence layer; pair it with `$run-ux` when the user wants a formal multi-perspective scorecard and synthesized report.

Ordinary verification of an affected component or state may use available browser tooling at that smaller scope. That does not start this journey-audit contract or a `$run-ux` score gate. When the user requests this audit or a formal gate, preserve the complete declared product profile, journey, viewport, evidence, and `not_evaluable` requirements below.

Do not use it as the primary workflow for native interfaces that cannot be exercised through a browser.

For a blind audit, keep source code, RepoFindings, implementation intent, and design
rationale out of the evaluator handoff. The controller may use them only to locate or
start the target. A requested score gate requires complete browser coverage of every
declared primary journey and primary viewport; otherwise report `not_evaluable`.

## Capability Preflight

Before auditing:

1. Identify the available browser capability. Prefer Chrome DevTools tools. An equivalent browser or Playwright workflow is acceptable only if it can preserve viewport, interaction, snapshot, console/network, and screenshot evidence relevant to the task.
2. Confirm the target URL is reachable.
3. Decide who owns the local server and browser session.
4. Select a product profile and viewport preset.

If no suitable browser capability is available, do not infer rendered behavior from source alone. Report the evidence limitation and either stop or perform a clearly labeled source-only review when that still helps.

For Chrome-specific call order and recovery, read `references/chrome-devtools.md`. For Windows lifecycle details, read `references/windows-notes.md`.

## Ownership and Cleanup

- A paired server workflow owns startup, readiness, and teardown of a local preview.
- This task owns only the processes, pages, profiles, or browser sessions it starts. Never kill an unrelated shared browser or server.
- Reuse an already-authorized page or session when practical.
- If this task starts a server, completion requires the URL to stop responding and its expected port to stop listening.
- If this task starts a dedicated browser or DevTools session, completion requires that owned session to be closed.
- Record incomplete cleanup as a blocker or limitation; do not treat a disconnected tool as proof that the underlying process stopped.

## Choose the Product Profile

Select one before interaction:

- `desktop-web`: desktop is primary; mobile is normally compatibility-only
- `responsive-web`: desktop, tablet, and mobile are scored
- `desktop-app`: browser-hosted desktop UI; small viewports are compatibility-only unless requested
- `mobile-web`: mobile is primary

Do not assume mobile-first behavior.

## Choose a Viewport Preset

Use one preset consistently unless a defect requires an extra diagnostic size:

- `desktop-2`: `1366x768`, `1920x1080`
- `desktop-3`: `1366x768`, `1440x900`, `1920x1080`
- `responsive-core`: `390x844`, `768x1024`, `1366x768`
- `mobile-core`: `375x812`, `390x844`, plus secondary `430x932`

The bundled helper emits a deterministic plan. Inspect its interface before use:

```bash
python3 scripts/viewport_plan.py --help
python3 scripts/viewport_plan.py --profile desktop-web --format text
```

## Evidence Loop

For each scored viewport:

1. Navigate to the exact entry page and apply the viewport.
2. Capture a fresh semantic snapshot before interacting.
3. Execute the same target journey using normal-user inputs.
4. Record friction under discoverability, clarity, efficiency, confidence, and recovery.
5. Capture console or network evidence when it explains behavior.
6. Capture a screenshot only when visual layout, hierarchy, clipping, contrast, or state appearance is material.
7. Summarize the viewport before moving on.

Prefer semantic snapshots for routine inspection and screenshots for genuinely visual claims. Do not reuse stale evidence after navigation or a meaningful state change.

When a finding occurs only at one viewport, state that scope. Keep desktop-primary findings separate from compatibility-only mobile findings.

## Evidence Record

For each material observation, record:

- profile and viewport
- page or state
- attempted user action
- observed result
- evidence type: snapshot, screenshot, console, network, or interaction outcome
- severity or task impact
- confidence and any limitation

Do not claim a console, network, accessibility, or responsive result that was not actually checked.

## Reporting Discipline

- Score only the viewports included in the selected product profile.
- Do not lower a desktop-first product's primary score for a compatibility-only mobile defect unless mobile quality is in scope.
- Separate observed evidence from inference.
- When navigation, authentication, test data, browser tooling, or a local preview blocks part of the journey, report reduced coverage and confidence.
- Include cleanup evidence for resources started by this task.
- Do not repair the product or repeat an audit to chase a requested score. Return the
  observed evidence once; `$run-ux` owns the terminal gate decision.

The repo-level protocol contains the durable audit contract: `../../protocols/UX_DEVTOOLS_WORKFLOW.md`.
