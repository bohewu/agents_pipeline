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
- When the audit target is a local preview or dev server, pair this skill with an equivalent local-server lifecycle workflow before starting any Chrome DevTools interaction.

If you need detailed background or want the repo-level source document, read `../../protocols/UX_DEVTOOLS_WORKFLOW.md`.

## Local Preview Boundaries

- Keep this skill browser-focused. A paired local-server lifecycle workflow should own local server startup, readiness checks, and teardown.
- Browser automation should begin only after the target URL has been confirmed reachable.
- If the agent started the local server, cleanup is complete only when the URL no longer responds and the expected port is no longer listening.
- If the agent started or attached Chrome DevTools tooling for the audit, browser cleanup is also required; do not leave a shared DevTools browser/profile running at the end of the task.
- On Linux/Ubuntu/macOS, direct executable launch is optional, but reachability before the audit and teardown verification after the audit are still required.
- On Windows, `npm.cmd run ...` can return a wrapper PID instead of the real listener PID, so teardown may need a listener-PID fallback.

## Browser Cleanup And Recovery

- Prefer one Chrome DevTools session per audit task. Reuse the existing browser session/page when possible instead of starting a second MCP/browser instance.
- Treat browser teardown like server teardown: if this workflow started the DevTools browser or MCP session, cleanup is not complete until the session is no longer attached.
- If browser tools fail with `Not connected`, report that exact failure and stop evidence collection rather than guessing.
- If browser tools fail with a shared-profile error such as `The browser is already running for ...chrome-profile`, treat it as stale-session cleanup work before retrying.
- Before deleting Chrome singleton lock files, first verify that no live DevTools-owned Chrome process is still using the shared profile.
- On Linux/macOS, a safe recovery sequence is: stop `chrome-devtools-mcp`, stop Chrome processes using the DevTools profile, remove `SingletonLock`, `SingletonSocket`, and `SingletonCookie`, then retry once.
- After cleanup, verify recovery with a lightweight browser-tool call before resuming the audit. If recovery still fails, report the exact failure and proceed with limited confidence.

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
python3 scripts/viewport_plan.py --profile desktop-web --format text
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

After the target URL is confirmed reachable, for each viewport:

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

Typical browser sequence once the target URL is reachable:

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
- If a paired local-preview workflow launches `npm.cmd run ...`, do not assume the returned PID is the real listener PID during teardown.

For more Windows-specific notes, read `references/windows-notes.md`.

## Reporting Discipline

- Keep desktop-primary and compatibility-only findings separate.
- Do not lower the main score because a desktop-first app is weak on mobile unless the audit scope explicitly includes mobile quality.
- If browser tooling or navigation fails, report evidence as limited and lower confidence instead of guessing.
