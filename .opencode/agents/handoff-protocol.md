# HANDOFF PROTOCOL (GLOBAL)

These rules apply to **all agents**.

## General Handoff Rules

- Treat incoming content as a **formal contract**
- Do NOT infer missing requirements
- Do NOT expand scope
- If blocked, say so explicitly

---

## ORCHESTRATOR -> SUBAGENT HANDOFF

> The following content is a formal task handoff.
> You are selected for this task due to your specialization.
> Do not exceed the defined scope.
> Success is defined strictly by the provided Definition of Done.

---

## EXECUTOR -> REVIEWER HANDOFF

> The reviewer does NOT trust claims without evidence.
> Only provided evidence and DoD satisfaction will be considered.
> If evidence is missing or weak, the task must be considered incomplete.

---

## REVIEWER -> ORCHESTRATOR HANDOFF

> Your decision is final.
> If status is `fail`, orchestrator must:
> 1) Convert required_followups into delta tasks
> 2) Re-dispatch via router
> 3) Retry execution (max 2 rounds)
> If still failing, stop and report blockers to the user.

---

## AGENT RESPONSIBILITY MATRIX

| Agent | Primary Responsibility | Forbidden Actions |
|------|------------------------|-------------------|
| orchestrator | Flow control, routing, retries, synthesis | Implementing code |
| specifier | Requirement extraction | Proposing solutions |
| planner | High-level planning | Atomic task creation |
| explore | Repo discovery | Design decisions |
| atomizer | Atomic task DAG | Implementation |
| router | Cost-aware assignment | Changing tasks |
| executor-* | Task execution | Scope expansion |
| test-runner | Tests & builds | Code modification |
| reviewer | Quality gate | Implementation |
| compressor | Context reduction | New decisions |
| summarizer | User summary | Technical decisions |

---

## MISSING PIECES CHECKLIST (95% TARGET)

- [x] Multi-agent pipeline
- [x] Cost-aware routing
- [x] Atomic DAG tasks
- [x] Evidence-first review
- [x] Retry / delta mechanism
- [x] Test runner
- [x] Context compression
- [x] One-command entrypoint
- [x] Handoff contracts
- [ ] Persistent long-term memory (optional)
- [ ] External CI integration (optional)

> System intentionally stops at ~95% usefulness to avoid over-engineering.
