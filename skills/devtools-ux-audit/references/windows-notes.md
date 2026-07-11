# Windows Notes

Use these notes when browser-backed UX audits are running on Windows.

## Path Handling

- Prefer absolute paths when saving screenshots, request bodies, or other browser artifacts.
- Keep saved artifacts inside the workspace or the system temp directory.
- Avoid depending on shell-only path tricks when a browser tool accepts a direct `filePath` argument.

## Local Targets

- Prefer `http://localhost:<port>` over `file://` URLs when the app can be served locally.
- For local preview or dev-server audits, pair the browser audit with an equivalent local-server lifecycle workflow before starting DevTools interactions.
- Begin browser automation only after the target URL is confirmed reachable.
- If the agent started the local server, cleanup is complete only when the URL no longer responds and the expected port is no longer listening.
- `npm.cmd run ...` may return a wrapper PID instead of the real listener PID, so teardown may need a listener-PID fallback.

These reachability and teardown checks still apply on Linux/Ubuntu/macOS even when direct executable launch is optional.

## Evidence Hygiene

- Normalize viewport labels as `WIDTHxHEIGHT` strings.
- Save screenshots only when the visual evidence is necessary; snapshots are usually cheaper and less fragile.
- Keep desktop-primary evidence separate from compatibility-only checks so later scoring remains profile-aware.
