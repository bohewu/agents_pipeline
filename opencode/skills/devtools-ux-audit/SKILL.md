---
name: devtools-ux-audit
description: Browser-backed UX audit workflow for Chrome DevTools. Use when auditing normal-user experience across desktop-first or responsive web apps, collecting viewport-specific evidence, and producing profile-aware UX findings without assuming mobile-first behavior.
license: See repository license
compatibility: Requires a runtime with Chrome DevTools browser tools; best paired with /run-ux for reporting.
---

# DevTools UX Audit

Use this skill when you need browser evidence for a UX audit, especially for:
- desktop-first web apps
- responsive web apps
- browser-based desktop apps built on web UI

Do not use this as the primary workflow for native desktop UI frameworks that do not expose browser tooling.

## Helper Script

Helper script available:
- `scripts/viewport_plan.py` - emits a deterministic viewport/scoring plan for the chosen audit profile

Always run the helper with `--help` first before using it in a workflow.

## Pairing

- Use this skill as the browser evidence workflow.
- Use `/run-ux` as the reporting/scoring workflow when you want a formal scorecard and synthesized report.

If you need detailed background or want the repo-level source document, read `../../protocols/UX_DEVTOOLS_WORKFLOW.md`.

## Profile First

Before interacting with the browser, decide the product profile:

- `responsive-web`
- `desktop-web`
- `desktop-app`
- `mobile-web`

Do not assume mobile-first behavior by default.

## Viewport Presets

Pick one preset and stay consistent unless the user asks for a wider sweep.

If you want a deterministic plan instead of reconstructing presets manually, run:

```bash
python scripts/viewport_plan.py --profile desktop-web --format text
```

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

For `desktop-web` and `desktop-app`, mobile checks should normally be compatibility-only unless the user explicitly wants mobile quality scored.

## Evidence Loop

For each viewport:

1. Navigate to the target URL/page.
2. Resize or emulate the viewport.
3. Take a fresh page snapshot before interacting.
4. Execute the target journey.
5. Record friction in terms of:
   - discoverability
   - clarity
   - efficiency
   - confidence
   - recovery
6. If something looks wrong, capture supporting evidence:
   - console messages
   - relevant network requests
   - screenshot only when visual evidence matters
7. Summarize the viewport before moving on.

Prefer snapshots over screenshots for routine inspection.

## Suggested Tool Sequence

Typical browser sequence:

1. `chrome-devtools_new_page` or `chrome-devtools_navigate_page`
2. `chrome-devtools_resize_page` or `chrome-devtools_emulate`
3. `chrome-devtools_take_snapshot`
4. `chrome-devtools_fill`, `chrome-devtools_click`, `chrome-devtools_press_key`, `chrome-devtools_wait_for`
5. `chrome-devtools_list_console_messages`
6. `chrome-devtools_list_network_requests`
7. `chrome-devtools_take_screenshot` when needed

## Windows Notes

- Prefer `http://localhost:...` targets over `file://` paths when possible.
- If saving screenshots or request bodies, prefer absolute paths under the workspace or `%TEMP%`/the OS temp directory.
- Keep viewport names in reports normalized like `1366x768`; do not rely on window-title text or OS-specific labels.

For more Windows-specific notes, read `references/windows-notes.md`.

## Reporting Discipline

- Keep desktop-primary and compatibility-only findings separate.
- Do not lower the main score because a desktop-first app is weak on mobile unless the audit scope explicitly includes mobile quality.
- If browser tooling or navigation fails, report evidence as limited and lower confidence instead of guessing.
