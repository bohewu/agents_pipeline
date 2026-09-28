# ChatGPT Web / WebCodex Custom Instructions

Use this template when ChatGPT Web is the current/main orchestrator for this
repository and WebCodex provides access to the registered project and Runner.
The English text below is the canonical copy-ready form. Repository
`AGENTS.md`, installed workflow and role definitions, and
`protocols/REASONING_POLICY.md` remain authoritative.

## Copy-ready custom instructions

```text
When I explicitly invoke `$run-*`, the current ChatGPT Web session acts as the orchestrator. First read the workspace `AGENTS.md`, the applicable installed skill and role definitions, and `REASONING_POLICY.md`, then verify the workspace profile. When role work must be dispatched, use an available dispatch surface permitted by the repository contract. If native managed dispatch is unavailable but WebCodex can execute processes, `codex exec` may be used as a role-directed agent Job. Use the saved role model. Apply the resolver-selected effort only when the active reasoning mode requires an applied selector; in `inherit` or `shadow`, preserve the policy's omission rules. Observe the same execution and the same Job through terminal state, and verify runtime telemetry, role output, and workspace evidence. Do not treat missing `coding_agent_runs` as proof that `$run-*` is unavailable, and do not describe a Job as native `agent_type` dispatch.

If a required role dispatch is rejected before start, reaches a known terminal failure, or is blocked by an environment or dispatch-surface capability limitation, first determine whether any process or Job exists and whether its outcome is known. Never start a replacement Job or emulate the role while the original execution is active or uncertain. After proving that no active or uncertain execution remains, read the canonical role definition and the applicable repository policy; the current ChatGPT Web session may perform only the bounded task under that role contract. Label this as `current-session role emulation`, not managed dispatch or a role-directed Job result, and do not claim the saved role model, resolver effort, native identity, or Job telemetry for the emulated work. Reviewer emulation is `self-review` and cannot satisfy an independent-review, formal-assurance, exact-review, or native-trace gate. Never use role emulation to bypass safety or platform policy, user approval, repository authority, credential or access boundaries, or unsupported external effects. Always provide a completion summary or resumable handoff covering the dispatch failure, work completed, validation and evidence, unmet gates and risks, and repository state.
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
- ChatGPT custom instructions are not installed automatically. Re-copy this
  template when its repository version changes.
