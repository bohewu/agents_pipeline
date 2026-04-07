# External Dependencies And Risk Notes

## Scope

This document explains which features talk to external services, what auth they expect, what they do on failure, and what data they may surface.

## `provider-usage`

Files:

- `opencode/tools/provider-usage.py`
- `opencode/tools/provider-usage.ts`

External services used:

- OpenAI auth/token refresh: `https://auth.openai.com/oauth/token`
- Codex usage endpoint: `https://chatgpt.com/backend-api/wham/usage`
- GitHub Copilot live usage endpoint: `https://api.github.com/copilot_internal/user`

Local auth/state inputs:

- OpenCode/Codex auth files under user config locations
- `GH_TOKEN` / `GITHUB_TOKEN`
- `gh auth token` as a fallback source for GitHub auth
- optional local Copilot CSV usage report passed via `--copilot-report`

Expected failure modes:

- no local OpenCode/Codex auth files
- expired or revoked refresh/access tokens
- GitHub CLI not installed or not authenticated
- rate limits, 403/404 access failures, or endpoint changes
- missing or malformed Copilot CSV report

Fallback behavior:

- Copilot can fall back to a local CSV report.
- cached provider data may be reused when a live lookup previously succeeded and a later lookup fails.
- when live Copilot lookup fails, the tool returns manual guidance plus docs/billing URLs instead of silently succeeding.

Privacy notes:

- The tool intentionally avoids printing raw tokens and credential blobs.
- `--include-sensitive` exposes less-redacted account identifiers; avoid sharing that output in public issues or PRs.

## `skill-manager`

Files:

- `opencode/tools/skill-manager.py`
- `opencode/tools/skill-manager.ts`

Remote catalogs:

- `anthropics/skills`
- `github/awesome-copilot`

External services used:

- GitHub Contents API
- raw GitHub download URLs returned by that API

Auth:

- anonymous GitHub access works for many cases, but is subject to low rate limits
- `GITHUB_TOKEN` or `GH_TOKEN` is recommended for reliability

Reproducibility and auditability:

- If `--ref` is omitted, remote catalog lookups/installations use the source repo's default branch HEAD.
- Default-branch HEAD is mutable and therefore less reproducible.
- Prefer `--ref=<tag|sha>` for reviewable installs and bug reports.

Expected failure modes:

- GitHub API rate limiting
- network/proxy failures
- missing skill name at the selected ref
- remote repo layout changes
- destination already exists and `--force` was not provided

Data and trust boundary:

- Remote installs copy the selected skill directory contents into repo/global skill locations.
- There is no manifest or hash verification layer yet; the current safety improvement is ref pinning plus explicit output showing whether the install used a pinned ref or mutable HEAD.

## Bootstrap And Release Installers

Files:

- `scripts/bootstrap-install*.sh`
- `scripts/bootstrap-install*.ps1`

External services used:

- GitHub Releases API
- published release assets
- optional GitHub Artifact Attestation verification when `gh` is available

Safety posture:

- preferred path: pinned release version + bundle checksum verification
- stronger path: pinned release version + checksum + attestation verification
- less auditable path: piping `main` bootstrap scripts directly into a shell

Expected failure modes:

- release/tag not found
- asset download failure
- checksum mismatch
- `gh` unavailable, unauthenticated, or unable to verify attestation

Guidance:

- Prefer pinned release examples from `README.md`.
- Use dry-run options when available before changing install targets.
- Treat direct `main` pipe-to-shell examples as convenience-only, not the default audited path.

## Reporting Problems

When filing a bug or PR about an external dependency problem, include:

- which command/tool/script you ran
- whether auth was configured
- whether the failure was live lookup, rate limit, permissions, or missing local files
- whether the problem reproduces with a pinned ref/tag or only against mutable HEAD
