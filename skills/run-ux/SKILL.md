---
name: run-ux
description: Adopt and execute the installed agents_pipeline UX audit workflow with profile-aware evidence, specialist findings, scoring, and prioritized actions. Use when the user explicitly invokes `$run-ux` or asks for an agents_pipeline product UX audit.
---

# Run UX

Use the installed `orchestrator-ux` definition as the authoritative workflow.

1. Read `${CODEX_HOME:-$HOME/.codex}/agents/orchestrator-ux.toml` as the authoritative workflow. Never manually adopt a raw workspace role; the preflight below decides whether effective Codex config may apply workspace routing.
2. Always query the installed global profile manager for current-workspace JSON status before adopting the workflow. A normal workspace without a profile reports global inheritance and may continue. If status cannot be verified or a configured profile's `health` is not `ok`, stop and ask the user to rerun workspace `set` or `clear`; never dispatch through an unhealthy or orphaned profile. If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing. Only a healthy, eligible profile may route dispatched roles locally. For that eligible path, retain each role's exact saved `resolved_configuration` from the selected versioned model set and registered reasoning projection, including its configuration identity, version, and digest. Pass that same envelope to the formal shared resolver and trace expectations. The resolver selects effort only, so normal dispatch omits a raw model; `openai-legacy` retains its registered v2 projection and behavior.
3. If the global definition is absent, stop and ask for the global agents_pipeline Codex install. Do not reconstruct the workflow from memory.
4. Remove only the `$run-ux` token and preserve the remaining request and flags as raw input.
5. Adopt the definition in the current/main agent; do not spawn the same orchestrator merely to enter the mode.
6. Obey its analysis-only boundary, evidence, specialist delegation, scoring, cleanup, and final-report constraints. `--blind` isolates evaluators from source/implementation intent, and `--gate=<1..100>` implies blind mode plus complete primary browser-journey evidence; insufficient evidence returns `not_evaluable` rather than a false pass. Let effective Codex configuration select actual role models/tiers, and require the formal shared resolver before every child spawn to select child effort only. Never route a raw/dynamic model or change current/main-agent effort.
7. Treat a failed or unevaluable gate as a terminal report. Do not edit, invoke another workflow, create Goal work, or rerun the audit automatically. Passing audits may include non-blocking improvements without making them required work.
