# Materiality Gate

This gate applies before a repair, reviewer followup, capability recovery, or
new Goal continuation round. It limits work to changes needed to complete the
original request. A repair or retry budget is an upper bound, not a quota. A
review failure is evidence to evaluate, not automatic authorization to edit.

## Material work

A change is material when concrete evidence shows at least one of these:

- an original goal condition or acceptance criterion is still unmet;
- an explicit requirement, contract, or invariant is violated;
- a reproducible correctness defect exists;
- a required test, build, deployment, or verification step fails because of
  the delivered work;
- a concrete security, data-integrity, compatibility, or reliability problem
  has a reachable failure path;
- a required deliverable is missing or unusable.

A small diff can be material. Judge necessity and practical impact, not line
count.

## Non-material work

Do not spend repair, retry, capability, or continuation budget on:

- P3 suggestions;
- wording, naming, comments, formatting, or style preferences;
- optional refactors, cleanup, hardening, or extra abstractions;
- speculative edge cases without a reachable path;
- unmeasured performance suggestions;
- more tests without a concrete defect, uncovered changed behavior, or an
  explicit coverage requirement;
- a reviewer's preferred architecture when the implemented design satisfies
  the stated contract.

A reviewer request to add a dependency, abstraction, helper layer, schema,
service, migration, broad refactor, or wider test matrix is non-material unless
concrete evidence shows that no smaller change or targeted verification can
satisfy the original requirement safely.

Operational failures such as timeout, permission, network, dependency, browser,
CLI, or tool errors use their own operational handling. They are not evidence
for reasoning or model capability recovery.

## Validation cost guardrails

Validation supports the requested product change; it is not a second product or
an independent workstream. During development, prefer the repository's existing
focused test, build, lint, and smoke commands. Classify a failed check before
editing anything:

- `product_failure`: the changed product violates an original requirement. Repair
  the smallest product surface and charge the normal repair budget.
- `harness_failure`: a fixture, assertion wrapper, validation script, run-local
  path, or harness setup fails without demonstrating a product defect. Make at
  most one smallest in-place correction to the canonical harness seam, rerun only
  the focused check, and do not charge repair, workflow retry/re-dispatch,
  reasoning recovery, model recovery, or Goal continuation budget.
- `operational_failure`: a command, permission, network, service, dependency,
  browser startup, CLI syntax, or tool failure. Use bounded operational handling;
  do not change product code, charge repair/recovery/continuation budget, or raise
  reasoning/model capability because of it.

A `harness_failure` or `operational_failure` must not create a fresh run, roadmap
task, refreeze, or recertification. If the same harness or infrastructure failure
signature occurs twice consecutively, stop and report the blocker instead of
opening another repair or continuation round. A harness-only failure after product
tests pass does not reopen the product unless concrete evidence proves a product
defect.

Create or expand validation tooling only when the original product contract
explicitly requires that tooling or a concrete uncovered changed behavior cannot
be verified with an existing command or a direct focused test. Keep it single
purpose and use the existing project pattern. Do not build candidate-zero
validators, mutation matrices, validators for validators, new proof frameworks,
or OS/process proof machinery. Bounded cleanup evidence for a process, server, or
browser actually started by the task remains required.

Fresh immutable one-shot certification is allowed only when the user or original
contract explicitly requires final certification and implementation, focused
automated tests, and required integration checks already pass. Development
verification must not repeatedly refreeze or recertify after local harness fixes.
Verification scope and cost must stay proportional to the changed product surface
and practical product risk; it must not grow merely to prove the harness itself.

## Admission decision

Before admitting followup work, answer all three questions:

1. Which original goal condition or explicit acceptance criterion remains
   unmet?
2. What concrete evidence proves the gap?
3. What practical impact occurs if it remains unchanged?
4. What is the smallest change or verification step that closes the gap?

If any answer is missing, do not create repair work. Record it only as an
optional note when the user asked for optional suggestions.

`required_followups` contains only material blockers. `optional_notes` contains
requested non-blocking suggestions and never seeds a repair, retry, capability
recovery, or Goal continuation.

## Completion and Goal continuation

Once the original requirements, required verification, and material blocking
findings pass, freeze task scope and finish. Completion means the original
objective is satisfied, not that no further improvement is imaginable.
Adequate targeted evidence is sufficient unless an explicit requirement or a
changed shared boundary requires broader verification.

A Goal continuation may continue work only when a material
`required_followups` item traces to an unmet original Goal condition. Choose
the smallest valid lane in this order:

1. **Resume the same run.** A compatible unfinished, blocked, partial, failed,
   or stale Flow/Pipeline run keeps its run directory, route, checkpoint,
   completed stages, outputs, and counters. Redispatch only the affected task.
   Replayed `$run-*` text from automatic Goal continuation is not a fresh
   invocation and does not justify replaying completed workflow stages.
2. **Start a narrow continuation run.** Use this only when the prior run cannot
   continue and a concrete strategy delta exists. Seed it with the unmet Goal
   condition, evidence, prior attempts, reusable outputs, and the new strategy;
   route only that remaining work through the smallest suitable workflow.
3. **Start a full fresh run.** Use this only when requirements materially
   changed, the prior plan is globally invalid, or workflow promotion is
   required and justified.

Budget exhaustion alone never justifies replaying the same full workflow. A
new run may receive its own local execution budget, but it preserves prior
failure and recovery history. The same model, effort, and strategy are not a
new strategy. Without a concrete strategy delta, report the Goal as blocked
instead of starting another automatic round.

Optional notes, P3 findings, and newly invented polish must not be described as
remaining work.
