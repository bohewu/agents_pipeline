---
description: Run UX audit pipeline (normal-user perspective scoring and report)
agent: orchestrator-ux
---

# Run UX Audit

## Raw input

```
$ARGUMENTS
```

## Parsing contract (for orchestrator-ux)

- Positional arguments `$1..$n` represent the user input split by whitespace.
- The orchestrator-ux MUST reconstruct the main task prompt by concatenating
  all positional arguments **until the first token starting with `--`**.
- All tokens starting with `--` are treated as flags.

> Source of truth: detailed flag parsing and behavior live in `opencode/agents/orchestrator-ux.md`.

### Supported flags (quick reference)

- `--profile=responsive-web|desktop-web|desktop-app|mobile-web`
- `--focus=<path-or-url>`
- `--journey=<text>`
- `--viewport-preset=desktop-2|desktop-3|responsive-core|mobile-core`
- `--scout=auto|skip|force`, `--skip-scout`, `--force-scout`
- `--output-dir=<path>`
- `--resume`, `--confirm`, `--verbose`

## Notes

- This pipeline is analysis-only. It does not implement UX fixes.
- The scoring model is profile-aware: desktop-first products are scored on desktop viewports first, and out-of-scope mobile checks should be reported as compatibility notes instead of dragging the main score.
- The recommended browser evidence workflow lives in `opencode/protocols/UX_DEVTOOLS_WORKFLOW.md` and is also packaged as the `devtools-ux-audit` skill, typically installed globally via `~/.agents/skills` with a `~/.claude/skills` compatibility mirror.
- Runtime/plugin writes canonical checkpoint and status artifacts under `<run_output_dir>/`.

## Examples

```text
/run-ux Audit the signup flow for a new user --profile=responsive-web --journey=create-account
/run-ux Evaluate our internal admin dashboard UX --profile=desktop-web --viewport-preset=desktop-3
/run-ux Review the settings page for clarity and trust --focus=src/pages/settings.tsx --journey=update-notifications
/run-ux Audit checkout experience --focus=http://localhost:3000/checkout --journey=complete-purchase --confirm
/run-ux Continue previous UX audit --resume
```
