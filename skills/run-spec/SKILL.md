---
name: run-spec
description: Adopt and execute the installed agents_pipeline docs-first specification workflow to produce a review-ready development specification and handoff. Use when the user explicitly invokes `$run-spec` or asks for an agents_pipeline development spec.
---

# Run Spec

Use the installed `orchestrator-spec` definition as the authoritative workflow.

1. Read `${CODEX_HOME:-$HOME/.codex}/agents/orchestrator-spec.toml` as the authoritative workflow. Never manually adopt a raw workspace role; the preflight below decides whether effective Codex config may apply workspace routing.
2. Always query the installed global profile manager for current-workspace JSON status before adopting the workflow. A normal workspace without a profile reports global inheritance and may continue. If status cannot be verified or a configured profile's `health` is not `ok`, stop and ask the user to rerun workspace `set` or `clear`; never dispatch through an unhealthy or orphaned profile. If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing. Only a healthy, eligible profile may route dispatched roles locally.
3. If the global definition is absent, stop and ask for the global agents_pipeline Codex install. Do not reconstruct the workflow from memory.
4. Remove only the `$run-spec` token and preserve the remaining request and flags as raw input.
5. Adopt the definition in the current/main agent; do not spawn the same orchestrator merely to enter the mode.
6. Obey its docs-first scope, artifact, validation, and handoff constraints. Let effective Codex configuration select actual role models/tiers, and require the installed policy-v2 resolver before every child spawn to select child effort only. Never route a raw/dynamic model or change current/main-agent effort.
