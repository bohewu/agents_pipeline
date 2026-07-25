# Materiality Gate

This gate applies before a repair, reviewer followup, capability recovery, or
new Goal continuation round. It limits work to changes needed to complete the
original request. A repair or retry budget is an upper bound, not a quota.

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

Operational failures such as timeout, permission, network, dependency, browser,
CLI, or tool errors use their own operational handling. They are not evidence
for reasoning or model capability recovery.

## Admission decision

Before admitting followup work, answer all three questions:

1. Which original goal condition or explicit acceptance criterion remains
   unmet?
2. What concrete evidence proves the gap?
3. What practical impact occurs if it remains unchanged?

If any answer is missing, do not create repair work. Record it only as an
optional note when the user asked for optional suggestions.

`required_followups` contains only material blockers. `optional_notes` contains
requested non-blocking suggestions and never seeds a repair, retry, capability
recovery, or Goal continuation.

## Completion and Goal continuation

Once the original requirements, required verification, and material blocking
findings pass, freeze task scope and finish. Completion means the original
objective is satisfied, not that no further improvement is imaginable.

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
