# Windows Notes

Use these notes when browser-backed UX audits are running on Windows.

## Path Handling

- Prefer absolute paths when saving screenshots, request bodies, or other browser artifacts.
- Keep saved artifacts inside the workspace or the system temp directory.
- Avoid depending on shell-only path tricks when a browser tool accepts a direct `filePath` argument.

## Local Targets

- Prefer `http://localhost:<port>` over `file://` URLs when the app can be served locally.
- If a local app requires a dev server, start it separately and verify the page loads before beginning the viewport sweep.

## Evidence Hygiene

- Normalize viewport labels as `WIDTHxHEIGHT` strings.
- Save screenshots only when the visual evidence is necessary; snapshots are usually cheaper and less fragile.
- Keep desktop-primary evidence separate from compatibility-only checks so later scoring remains profile-aware.
