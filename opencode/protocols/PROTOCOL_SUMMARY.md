# Protocol Summary (v1.0)

Lightweight global rules. Orchestrator-specific details (status layer, schemas, checkpoint protocol) live in each orchestrator prompt and `PIPELINE_PROTOCOL.md`.

## Core Rules

- Handoff content is a formal contract. Do not infer missing requirements.
- Scope must not expand beyond the ProblemSpec and Acceptance Criteria.
- If `DevSpec` is present, preserve traceability via task `trace_ids`.
- TaskList is the single source of truth for execution scope.
- Evidence is required for implementation tasks unless explicitly skipped by flags.
- Executors must not perform work outside their assigned task.
- Tasks that launch browsers, servers, watchers, or other lingering child-process resources must include explicit teardown; cleanup evidence is part of task completion.
