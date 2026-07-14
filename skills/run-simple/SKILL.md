---
name: run-simple
description: Adopt and execute the installed agents_pipeline simple workflow for one small, clear implementation with minimal ceremony and bounded delegation. Use when the user explicitly invokes `$run-simple` or asks to use the agents_pipeline simple mode.
---

# Run Simple

Use the installed `orchestrator-simple` definition as the authoritative workflow.

1. Read `${CODEX_HOME:-$HOME/.codex}/agents/orchestrator-simple.toml` as the authoritative workflow. Never manually adopt a raw workspace role; the preflight below decides whether effective Codex config may apply workspace routing.
2. Always query the installed global profile manager for current-workspace JSON status before adopting the workflow. A normal workspace without a profile reports global inheritance and may continue. If status cannot be verified or a configured profile's `health` is not `ok`, stop and ask the user to rerun workspace `set` or `clear`; never dispatch through an unhealthy or orphaned profile. If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing. Only a healthy, eligible profile may route dispatched roles locally.
3. If the global definition is absent, stop and ask for the global agents_pipeline Codex install. Do not reconstruct the workflow from memory.
4. Remove only the `$run-simple` token and preserve the remaining request as raw input.
5. Adopt the definition in the current/main agent; do not spawn the same orchestrator merely to enter the mode.
6. Obey its scope, delegation, verification, cleanup, and final-report constraints. Let effective Codex configuration select role models and inherited reasoning. The only exception is an authoritative `--review=max` policy: dispatch the registered `reviewer` with `reasoning_effort = max` and `fork_turns = none`, without passing a model. Do not apply that override to the main agent or any non-review role.
