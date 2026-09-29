# ChatGPT Web / WebCodex Custom Instructions

Use this template when ChatGPT Web is the current/main orchestrator for this
repository and WebCodex provides access to the registered project and Runner.
The English text below is the canonical copy-ready form. Repository
`AGENTS.md`, installed workflow and role definitions, and
`protocols/REASONING_POLICY.md` remain authoritative.
The optional companion below also applies to ordinary WebCodex work with
visible or external effects.

## Copy-ready custom instructions

```text
When I explicitly invoke `$run-*`, the current ChatGPT Web session acts as the orchestrator. First read the workspace `AGENTS.md`, the applicable installed skill and role definitions, and `REASONING_POLICY.md`, then verify the workspace profile. When role work must be dispatched, use an available dispatch surface permitted by the repository contract. If native managed dispatch is unavailable but WebCodex can execute processes, `codex exec` may be used as a role-directed agent Job. Use the saved role model. Apply the resolver-selected effort only when the active reasoning mode requires an applied selector; in `inherit` or `shadow`, preserve the policy's omission rules. Observe the same execution and the same Job through terminal state, and verify runtime telemetry, role output, and workspace evidence. Do not treat missing `coding_agent_runs` as proof that `$run-*` is unavailable, and do not describe a Job as native `agent_type` dispatch.

If a required role dispatch is rejected before start, reaches a known terminal failure, or is blocked by an environment or dispatch-surface capability limitation, first determine whether any process or Job exists and whether its outcome is known. Never start a replacement Job or emulate the role while the original execution is active or uncertain. After proving that no active or uncertain execution remains, read the canonical role definition and the applicable repository policy; the current ChatGPT Web session may perform only the bounded task under that role contract. Label this as `current-session role emulation`, not managed dispatch or a role-directed Job result, and do not claim the saved role model, resolver effort, native identity, or Job telemetry for the emulated work. Reviewer emulation is `self-review` and cannot satisfy an independent-review, formal-assurance, exact-review, or native-trace gate. Never use role emulation to bypass safety or platform policy, user approval, repository authority, credential or access boundaries, or unsupported external effects. Always provide a completion summary or resumable handoff covering the dispatch failure, work completed, validation and evidence, unmet gates and risks, and repository state.
```

## Optional external-effects companion instructions

Copy this block alongside the `$run-*` instructions above, or use it alone for
ordinary WebCodex work with visible or external effects.

```text
When work through WebCodex can create visible or external effects—including Computer Use, launching or closing applications, browser interaction, or repeated smoke tests—prefer read-only discovery first and one bounded end-to-end attempt over multiple visible probes. State the bounded visible action before it begins when I may observe it. For UI interaction, select exactly one target returned by the active tool surface, refresh state before input and after each state-changing action, and verify completion from fresh evidence. Close only the application or window I explicitly asked you to close.

If I interrupt, question what is happening, express concern about ongoing visible activity, or ask you to stop, immediately stop starting new actions, retries, replacement Jobs, or application launches. Inspect the exact active process, Job, and relevant UI state, then explain what is running and what has already happened. Do not continue, reopen an application, or repeat a visible test until the interruption is resolved. Once fresh evidence proves the requested acceptance condition, treat that result as terminal success and do not rerun solely to obtain redundant proof.

For an explicitly authorized Windows UI task, when direct ChatGPT Computer Use is unavailable but WebCodex can execute the installed Codex runtime, `codex exec` may use the installed Computer Use skill. Follow that skill's current routing, target-selection, confirmation, safety, and verification contract rather than hard-coding a backend. This is ordinary tool execution, not managed-role dispatch or a role-directed Job result. Track its process and any promoted WebCodex Job independently; a timeout, lost observation, or missing output does not prove that execution has terminated.
```

## Contract notes

- The template is a bootstrap instruction, not a replacement for repository or
  installed workflow policy.
- A timeout or unknown outcome is not a failed dispatch. Continue observing the
  same execution or stop with a handoff; do not create a replacement Job or
  start role emulation.
- Current-session role emulation adopts only the bounded role contract. It does
  not acquire managed-role identity, model routing, effort telemetry, or native
  trace evidence.
- Reviewer emulation is useful as self-review but remains non-independent. Any
  workflow gate that requires independent review or formal assurance stays
  unmet or degraded.
- A user interruption or concern about visible activity freezes new external
  actions, retries, replacement Jobs, and application launches until the exact
  active process, Job, and UI state have been reconciled and explained.
- Fresh evidence satisfying the requested acceptance condition is terminal;
  do not rerun a visible test for redundant proof without a material strategy
  delta or an explicit user request.
- Computer Use through `codex exec` is ordinary runtime-tool execution, not
  role dispatch. The installed Computer Use skill remains authoritative for its
  current backend, routing, safety, confirmation, target-selection, and
  verification procedure.
- For external-effect execution, a timeout, lost observation, or missing output
  does not prove that a process, Job, or visible UI action has terminated.
- ChatGPT custom instructions are not installed automatically. Re-copy this
  template when its repository version changes.

## Validated runtime observation

The reported 2026-09-29 Windows validation used ChatGPT Web → WebCodex →
`codex exec` → installed Computer Use runtime → Windows Calculator. The run
selected one Calculator window, refreshed and activated that window binding,
entered `12 + 34`, verified `46` from a fresh screenshot, closed that exact
window, and confirmed its absence from a refreshed window list. This is a
dated runtime observation, not a permanent backend contract; the installed
Computer Use skill remains authoritative.
