---
name: run
description: One-command entrypoint that runs the full orchestrator pipeline end-to-end.
mode: command
agent: orchestrator
---

# /run COMMAND

This command executes the **entire multi-agent pipeline** starting from the user's prompt.

## SUPPORTED PROMPT-LEVEL FLAGS (PARSED BY ORCHESTRATOR)

These are NOT OpenCode CLI flags. They are **prompt-level contracts** interpreted by the orchestrator.

- `--dry`
  - Stop after `atomizer + router`
  - Output TaskList + DispatchPlan only
  - No code changes

- `--budget=<low|medium|high>`
  - low: prefer Gemini Flash/Pro, minimize GPT usage
  - medium: default routing
  - high: allow GPT-5.2-codex more freely

- `--no-test`
  - Skip test-runner stage (reviewer will warn)

- `--test-only`
  - Only run test-runner + reviewer

## HANDOFF GUARANTEES

- Every agent handoff is treated as a **contract**, not a suggestion
- Review failures automatically generate delta tasks (max 2 retries)
- Evidence is mandatory for any task claiming completion

## WHEN TO USE

- New feature implementation
- Large refactors
- High-confidence changes
