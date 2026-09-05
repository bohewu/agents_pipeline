# UX DevTools Workflow

This document is the reusable workflow source for browser-backed UX audits.

The same workflow is packaged as the repo-managed `devtools-ux-audit` skill under `skills/devtools-ux-audit/`. Codex receives it inside the namespaced support tree; other runtimes must install or reference the neutral skill through their own supported skill mechanism.

## Goal

Collect browser evidence for UX audits without assuming every product is mobile-first.

This formal journey-audit workflow is distinct from ordinary browser verification of an affected frontend component or state. A bounded implementation check does not by itself invoke the profile, multi-viewport journey, or score-gate contract below; an explicitly requested audit or score gate retains every declared coverage and evidence requirement.

The workflow is designed to support:
- responsive web apps
- desktop-first web apps
- browser-based desktop apps (for example Electron/Tauri-style shells backed by web UI)

It is **not** the right fit for native desktop UI frameworks that do not expose browser tooling.

## Blind Audit Isolation

When the caller requests a blind audit or score gate, evaluate the product as a
normal user from user-visible browser evidence only.

- Source inspection may be used by the controller to locate a route, preview command,
  or test account, but source code, RepoFindings, implementation notes, requirements
  rationale, and intended design behavior must not be passed to UX evaluators.
- Evaluators receive the declared journey/profile/viewports plus snapshots,
  interactions, screenshots, and relevant console/network outcomes.
- Do not use hidden implementation knowledge to explain away confusing behavior or to
  infer an action a normal user could not discover.
- If isolation cannot be preserved, label the audit informed rather than blind.

## Local Preview Boundaries

When the audit target is a local preview or dev server, pair this workflow with an equivalent local-server lifecycle workflow before starting browser automation.

- Keep this workflow browser-focused; the paired local-server lifecycle workflow owns local server startup, readiness checks, and teardown.
- Begin browser automation only after the target URL has been confirmed reachable.
- If the agent started the local server, cleanup is complete only when the URL no longer responds and the expected port is no longer listening.
- On Linux/Ubuntu/macOS, direct executable launch is optional, but reachability and teardown verification are still required.
- On Windows, `npm.cmd run ...` can return a wrapper PID instead of the real listener PID, so teardown may need a listener-PID fallback.

## Profiles

Pick one profile before testing:

- `responsive-web`
  - all core viewports are in-scope
- `desktop-web`
  - desktop viewports are primary; mobile is compatibility-only unless the user explicitly asks for it
- `desktop-app`
  - same scoring treatment as `desktop-web`, but prioritize common laptop/monitor sizes and windowed use
- `mobile-web`
  - mobile viewports are primary; larger screens are secondary or compatibility-only

## Viewport Presets

- `desktop-2`
  - `1366x768` primary
  - `1920x1080` primary
- `desktop-3`
  - `1366x768` primary
  - `1440x900` primary
  - `1920x1080` primary
- `responsive-core`
  - `390x844` primary
  - `768x1024` primary
  - `1366x768` primary
- `mobile-core`
  - `375x812` primary
  - `390x844` primary
  - `430x932` secondary

## Scoring Policy

- `primary` viewports count fully in the main score.
- `secondary` viewports count at half weight.
- `compatibility` viewports do **not** reduce the main score; use them to report degradation or breakage outside the declared core scope.

This avoids unfairly penalizing desktop-first products for not being mobile-first.

## Evidence Capture Loop

After the target URL is confirmed reachable, for each viewport in the selected preset:

1. Open or navigate to the target page/app entry point.
2. Resize/emulate the viewport.
3. Capture a fresh accessibility/tree snapshot before interacting.
4. Execute the selected user journey.
5. Record obvious friction:
   - can the user find the entry point?
   - can they tell what to do next?
   - do labels/messages inspire trust?
   - can they recover from errors or wrong turns?
6. If something looks wrong, capture supporting evidence:
   - console messages
   - relevant network requests
   - screenshot if the issue is visual/layout related
7. Summarize the viewport outcome before moving to the next viewport.

For a requested score gate, complete every declared primary journey at every primary
viewport. Missing browser capability, reachability, authentication, test data, or
journey coverage makes the gate `not_evaluable`; a source-only score cannot pass it.

## Suggested Tool Flow

When Chrome DevTools tools are available, a typical sequence once the target URL is reachable is:

1. `chrome-devtools_new_page` or `chrome-devtools_navigate_page`
2. `chrome-devtools_resize_page` or `chrome-devtools_emulate`
3. `chrome-devtools_take_snapshot`
4. `chrome-devtools_fill`, `chrome-devtools_click`, `chrome-devtools_press_key`, `chrome-devtools_wait_for`
5. `chrome-devtools_list_console_messages`
6. `chrome-devtools_list_network_requests`
7. `chrome-devtools_take_screenshot` when layout/visual evidence matters

Prefer snapshots over screenshots for routine inspection. Use screenshots only when visual evidence is necessary.

## Desktop-First Guidance

For `desktop-web` and `desktop-app`:

- Use `desktop-2` or `desktop-3` by default.
- Evaluate 2-3 common desktop resolutions before spending time on mobile.
- If mobile is checked at all, treat it as compatibility-only unless the user explicitly asks for responsive/mobile quality to count toward the score.

## Output Bundle

If the runtime writes audit artifacts, a useful bundle layout is:

```text
<run_output_dir>/ux/
  ux-report.md
  ux-scorecard.json
  ux-findings.json
  evidence/
    1366x768/
      snapshot.txt
      console.json
      network.json
      screenshot.png
```

## Failure Handling

- If the app cannot be opened, the journey cannot be executed, or browser tooling is unavailable, report the audit as evidence-limited.
- Lower confidence instead of inventing coverage.
- Recommend either rerunning with browser access or narrowing the audit to repo/screenshot evidence.
- A failed or unevaluable score gate is terminal evidence. Report the score gap,
  concrete reasons, and correction directions, but do not edit the product or rerun
  until it passes.
