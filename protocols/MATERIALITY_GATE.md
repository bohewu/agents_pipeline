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

A Goal continuation may start a new workflow round when work is genuinely
required. Only a material `required_followups` item that traces to an unmet
original Goal condition may seed that round. Optional notes, P3 findings, and
newly invented polish must not be described as remaining work.
