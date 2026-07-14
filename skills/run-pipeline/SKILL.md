---
name: run-pipeline
description: Adopt and execute the installed agents_pipeline full-pipeline workflow, including risk-derived planning, task routing, implementation, verification, review, retries, status artifacts, and cleanup. Use when the user explicitly invokes `$run-pipeline`, asks to use or run the agents_pipeline pipeline, or requests the full high-risk or multi-module workflow instead of a simple or bounded flow.
---

# Run Pipeline

Use the installed `orchestrator-pipeline` definition as the authoritative workflow. Keep model and inherited reasoning selection in the effective Codex runtime/profile configuration, except for the definition's explicit reviewer-only `--review=max` spawn override.

## Resolve the definition

1. Resolve the current workspace root.
2. Read `${CODEX_HOME:-$HOME/.codex}/agents/orchestrator-pipeline.toml` as the authoritative workflow definition. Never manually adopt a repository `.codex/agents/orchestrator-pipeline.toml`; Codex project trust and effective config, not raw file presence, control workspace role routing.
3. Always query the installed global profile manager for current-workspace JSON status before adopting the workflow. A normal workspace without a profile reports global inheritance and may continue. If status cannot be verified or a configured profile's `health` is not `ok`, stop and ask the user to rerun workspace `set` or `clear`; never dispatch through an unhealthy or orphaned profile. If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing. Only a healthy, eligible profile may route dispatched roles locally.
4. If the global definition does not exist, stop and ask the user to run the global agents_pipeline Codex installer. Do not reconstruct the pipeline from memory.
5. Treat its `developer_instructions` as authoritative for decomposition, delegation, artifacts, review, retries, cleanup, and final reporting.

After the preflight succeeds, workspace profiles change effective role/model routing for dispatched agents; they do not replace this global workflow source inside the current/main agent.

## Execute the workflow

1. Remove only the explicit `$run-pipeline` invocation token from the request. Preserve the remaining task text and pipeline flags as raw input.
2. Adopt the pipeline definition in the current/main agent. Do not spawn `orchestrator-pipeline` merely to enter the mode.
3. Obey the definition's hard constraints and delegation rules. If it routes scouting, implementation, testing, or review to helper roles, use those roles rather than bypassing them inline.
4. Let the effective workspace/global Codex agent configuration select profile-specific role files, models, and inherited reasoning. When the authoritative definition parses `--review=max`, dispatch every `reviewer` attempt without a full-history fork and with `reasoning_effort = max`, without passing a model. Do not rewrite role files or apply that override to the main agent or any non-review role.
5. Keep status, checkpoint, resource teardown, evidence, retry, and resume behavior exactly as required by the installed definition.
6. Return the definition's required user-facing synthesis, including changed paths, verification evidence, reviewer outcome, and explicit warnings or blockers.

Higher-priority runtime instructions and user approvals continue to apply.
