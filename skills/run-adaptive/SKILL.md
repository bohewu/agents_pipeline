---
name: run-adaptive
description: "Select and either execute or prepare the smallest sufficient agents_pipeline engineering workflow while preserving route-independent execution presets and explicit policy overrides. Use when the user explicitly invokes `$run-adaptive` or asks for adaptive Simple/Flow/Pipeline routing."
---

# Run Adaptive

Act as a thin Codex-first routing controller. Do not spawn or register an
`orchestrator-adaptive` role. Select one of the installed Simple, Flow, or Pipeline
definitions and adopt that definition in the current/main agent.

## Preflight

1. Remove only the `$run-adaptive` token and preserve the remaining request and flags as raw input.
2. Always query the installed global profile manager for current-workspace JSON status before routing or execution. A normal workspace without a profile reports global inheritance and may continue.
   - For normal execution, if status cannot be verified or a configured profile's `health` is not `ok`, stop and ask the user to rerun workspace `set` or `clear`; never dispatch through an unhealthy or orphaned profile.
   - If a configured profile's `profile_eligibility` is not `eligible`, warn that Codex is ignoring the workspace layer and continue with global role routing.
   - In `prompt_mode = on`, profile problems are warnings because no dispatch occurs. Include the repair requirement beside the generated prompt.
3. Resolve the global definition root as `${CODEX_HOME:-$HOME/.codex}/agents/`. Never manually adopt a raw workspace role. Effective Codex configuration controls trusted workspace role routing.
4. Before executing or emitting a selected workflow prompt, require only the selected workflow's installed definition to exist:
   - `orchestrator-simple.toml`
   - `orchestrator-flow.toml`
   - `orchestrator-pipeline.toml`
   If the selected definition is absent, stop and ask for the global agents_pipeline Codex install. Do not reconstruct it from memory.

## Flags

Parse `raw_input`: tokens before the first `--*` flag form `main_task_prompt`; later
`--*` tokens are flags.

If `main_task_prompt` is empty, continue only when `--resume` is present and a valid
compatible checkpoint supplies the original prompt. Otherwise stop and require a
non-empty task; do not emit or adopt an empty workflow prompt.

Adaptive controls:

- `--route=auto|simple|flow|pipeline` -> route_mode; default `auto`
- `--preset=balanced|autonomous|careful|delivery|interactive` -> preset_mode; default `balanced`
- `--prompt=off|on` -> prompt_mode; default `off`

Accepted policy overrides:

- `--scout=auto|skip|force`
- `--skip-scout`
- `--force-scout`
- `--commit=off|before|after`
- `--review=off|on|max`
- `--reasoning=inherit|shadow|adaptive`
- `--capability-recovery=off|shadow|auto`
- `--handoff`
- `--kanban=off|manual|auto`
- `--output-dir=<path>`
- `--resume`
- `--confirm`
- `--verbose`
- `--autopilot`
- `--full-auto`

The effective `output_dir` defaults to `.pipeline-output/` when `--output-dir` is
omitted. Track whether the value was explicit so prompt-only output does not need to
repeat the default; the Simple handoff wrapper still passes the effective value as
`output_root`.

The effective `reasoning_mode` defaults to `adaptive` for a fresh Adaptive run. It is
route-independent and does not influence Simple/Flow/Pipeline selection. Invalid values
warn once and fall back to `adaptive`; `adaptive` is the selector-enforcement mode and
`shadow` is the diagnostic no-enforcement mode. `inherit` preserves classification metadata but
never applies a selector, so exact overrides and strict assurance conflict.
`shadow` computes requested effort without applying it; strict assurance
conflicts, while an ordinary shadowed review-max request remains unenforced.
`adaptive` requests the per-spawn selector and follows the selected workflow's
local Codex trace-verification contract for both wrapper and core children;
selector presence alone is never enforcement evidence.

Reject unknown Adaptive-only values rather than guessing. An invalid preset falls back
to `balanced` with one warning. On a fresh run, treat standalone `--full-auto` as the
compatibility form of `--preset=autonomous` only when no explicit preset was supplied;
with an explicit preset it remains a direct policy override. When used as the
compatibility form, consume and drop the raw `--full-auto` token after setting
`preset_mode = autonomous`; prompt output emits only `--preset=autonomous`. On
`--resume`, never perform this preset conversion: keep `--full-auto` as a current
individual override of the locked persisted preset. Retain `--full-auto` in normalized
output whenever it is an individual override.

## Preset policy

Preset and explicit flags are run-level policy, not route-selection filters. First
normalize one policy, then select a route from task complexity, then map the policy to
that route. Preserve the normalized policy across Simple -> Flow -> Pipeline promotion.

Preset defaults:

- `balanced`: use the selected workflow's normal risk-derived behavior.
- `autonomous`: set `full_auto_mode = true` and `autopilot_mode = true` within the selected workflow's existing safety and repair bounds.
- `careful`: set `scout_mode = force`, `review_mode = on`, and `review_reasoning_effort = inherit`.
- `delivery`: set `full_auto_mode = true`, `autopilot_mode = true`, `review_mode = on`, `review_reasoning_effort = inherit`, `kanban_mode = auto`, and `commit_mode = after`.
- `interactive`: set `confirm_mode = true` and `verbose_mode = true`.

Example: `$run-adaptive Fix the parser bug and add focused tests
--preset=delivery` still selects Flow because of the task, not because of the preset.
Only after selecting Flow does Adaptive apply full-auto/autopilot, review on, kanban
auto, and commit after through Flow's native controls. The same preset on a typo may
select Simple and apply the equivalent bounded outer wrapper instead.

Preset-owned fields are `scout_mode`, `review_mode`, `review_reasoning_effort`, `commit_mode`, `kanban_mode`,
`confirm_mode`, `verbose_mode`, `autopilot_mode`, and `full_auto_mode`. Track whether
each effective value came from the preset, an explicit flag, or the selected workflow
default during the current invocation so precedence never depends on flag ordering
alone. Do not require field-level provenance to survive in a checkpoint.

`reasoning_mode` is explicit run policy rather than preset-owned policy. Preserve it
unchanged across route mapping and promotion. Flow and Pipeline persist it with the
installed policy version and effective ceiling.

Normalize `capability_recovery_mode` independently from reasoning effort. A fresh
Adaptive `delivery` or `autonomous` preset defaults it to `auto`; `balanced`,
`careful`, and `interactive` default it to `off`. An explicit
`--capability-recovery=off|shadow|auto` always wins. Invalid values warn once and
fall back to the applicable default. This policy never changes route selection and
never authorizes a main/orchestrator model change; it only controls the bounded
child recovery defined in `protocols/CAPABILITY_RECOVERY.md`.

Precedence is deterministic:

1. Selected workflow hard safety constraints.
2. Explicit `--route=*`.
3. Explicit individual policy flags.
4. Preset defaults.
5. Selected workflow defaults.

Explicit `--review=off`, `--commit=off`, `--kanban=off`, or scout controls override the
corresponding preset value. Resolve autonomy versus interaction by provenance:

- Explicit `--review=on` sets `review_mode = on` and `review_reasoning_effort = inherit`.
- Explicit `--review=max` sets `review_mode = on` and `review_reasoning_effort = max`.
- Explicit `--review=off` sets `review_mode = off` and `review_reasoning_effort = inherit`.
- Explicit `--reasoning=*` replaces the selected workflow default without changing route selection.
- Explicit `--capability-recovery=*` replaces the preset/default recovery mode without changing route selection.
- Explicit `--confirm` or `--verbose` clears preset-derived `autopilot_mode` and `full_auto_mode` before mapping.
- Explicit `--autopilot` or `--full-auto` clears preset-derived `confirm_mode` and `verbose_mode`.
- If autonomy and interaction controls are both explicit, autopilot/full-auto wins with one warning, matching the native workflow safety rule.
- Force scout wins conflicting explicit scout flags; Pipeline review cannot be disabled.

## Resume routing

Treat an automatic Goal continuation for the same objective as a resume request even
when the replayed invocation does not contain literal `--resume`. The replayed
`$run-*` text is not a fresh invocation. Inspect compatible checkpoints first and
normalize a matching unfinished, blocked, partial, failed, or stale Flow/Pipeline run
to `--resume` with its exact run directory. Keep its route, checkpoint, completed
stages, outputs, and counters, and redispatch only the affected task. For an active
Adaptive Simple wrapper, use its existing narrow same-scope repair path instead of
re-entering `$run-adaptive` from the beginning.
Harness-only and operational failures are not automatic Goal continuation or workflow
promotion reasons. Handle them only within `protocols/MATERIALITY_GATE.md`; the same
harness or infrastructure signature twice consecutively stops the run.

When explicit or automatic `--resume` is effective, inspect checkpoints read-only
before route selection. If
`--output-dir` points directly to a run directory containing `checkpoint.json`, inspect
that run first. Otherwise treat `--output-dir` as the base output root and scan immediate
child run directories. Use the neutral status runtime's full resume compatibility
criteria: the output root and candidate run directory must be real, contained,
non-symlink/non-junction/non-reparse directories with no traversal; both
`checkpoint.json` and `status/run-status.json` must be regular,
non-symlink, parseable files; checkpoint `pipeline_id`, status `run_id`, and the run
directory basename must agree; both orchestrators must agree and be Flow or Pipeline.
Ignore malformed, missing, identity-mismatched, or orchestrator-incompatible candidates.
Select the newest compatible candidate by checkpoint modification time with
lexicographically newest run-directory name as the deterministic tie-breaker. If no
compatible run exists, stop and require an explicit task or valid run path. A checkpoint
for `orchestrator-flow` selects Flow; a checkpoint for
`orchestrator-pipeline` selects Pipeline. Do not reclassify a valid resumed run and
never route resume to Simple. An explicit conflicting `--route=*` or a selected
checkpoint for any other orchestrator is an error.

Hydrate the persisted `preset_mode` and expanded effective flags first. Preset is locked
for a resumable Flow/Pipeline run: an omitted or identical `--preset` continues, while
a different explicit preset is rejected with guidance to start a fresh Adaptive run.
This prevents old preset-owned fields from leaking into a replacement preset. Apply
only individual policy flags explicitly supplied by the resume invocation. Treat the
persisted expanded effective flags as the baseline regardless of their original source:
current explicit interaction clears baseline autonomy, current explicit autonomy clears
baseline interaction, and both current explicit forms resolve to autonomy with one
warning. A current explicit `--review=off|on|max` similarly replaces both the persisted
`review_mode` and `review_reasoning_effort`; when omitted, both persisted fields remain.
Current explicit `--reasoning=*` replaces persisted `reasoning_mode`; when omitted, the
persisted mode remains. Require the persisted policy version to match the installed
policy. A legacy checkpoint without reasoning fields uses `inherit` unless this resume
invocation explicitly selects a mode; the fresh-run Adaptive default does not rewrite an
older run's policy.
Current explicit `--capability-recovery=*` replaces persisted
`capability_recovery_mode`; when omitted, the persisted effective mode remains. A
legacy checkpoint without that field uses `off` unless the current invocation
explicitly supplies the flag. Persist the normalized mode before the next Flow or
Pipeline spawn.
This needs no persisted field-level provenance. A legacy checkpoint without
`preset_mode` is treated as a locked `balanced` run while retaining its persisted
expanded flags.

## Automatic route selection

`route_mode = auto` is Flow-biased and depends on the work, not the preset:

- Select Simple for one clear, low-risk, reversible, mechanical or obvious delivery. Examples include a typo, a direct rename, or one known configuration-value edit.
- Select Flow by default for normal engineering work that fits at most five bounded tasks. A behavioral bug fix, any request that changes or adds tests, or work requiring implementation plus verification defaults to Flow even when localized.
- Select Pipeline when the request is likely to need more than five tasks, crosses broad module or system boundaries, changes security-sensitive behavior or persistent-data migration/destructive behavior, needs multi-round repair or strong traceability, or otherwise cannot honestly satisfy Flow's fixed limits.

Review, scout, kanban, commit, handoff, interaction, or autonomous policy does not by
itself raise the route. Adaptive applies those concerns around a Simple core or through
native Flow/Pipeline controls. `--resume` is the exception because it must select the
persisted Flow or Pipeline workflow.

An explicit `--route=simple|flow|pipeline` pins the route. If the pinned workflow
cannot safely complete the task, stop and report the required route rather than
silently overriding it.

## Route policy mapping

### Simple

Keep Simple's core lightweight: no ProblemSpec, FlowTaskList, checkpoint, status
writer, multi-task retry loop, or primary-orchestrator nesting. Adaptive owns only the
explicit policy wrapper around that core:

1. Adaptive owns interaction for the composed Simple run. If confirm/verbose is effective, pause before the first wrapper or core dispatch and include wrapper steps in verbose progress; consume those flags instead of asking again inside the Simple core.
2. Run `commit_mode = before` through one bounded `peon` helper when requested.
3. For `scout_mode = force`, run one focused `repo-scout`; for `auto`, inspect only when target files are unclear.
4. Execute the Simple workflow. Full-auto/autopilot suppresses pauses but never expands Simple's narrow recovery bound.
5. If `review_mode = on`, dispatch one ad-hoc reviewer with changed targets, requirements, explicit non-goals or out-of-scope constraints when supplied, required verification, and evidence. Treat a failed review as evidence, not automatic authorization to edit. Apply `protocols/MATERIALITY_GATE.md` to each finding before any repair or re-review; on an admitted material failure that identifies the unmet requirement, concrete evidence, practical impact, and smallest necessary fix, dispatch at most one narrow same-scope repair to the original worker or an existing `executor`, then run one re-review. Alternative designs that already satisfy the contract and requests for broader verification without a concrete uncovered path do not qualify. Ordinary review uses the profile's strong tier with `xhigh` effort. Only explicit `--review=max`, material high-consequence security/data-integrity review, or reviewer reasoning recovery may request `max`; generic risk alone does not and reviewer models never uplift. Resolve both reviewer attempts through `protocols/REASONING_POLICY.md` with `dispatch_context = ad-hoc-review`; when `review_reasoning_effort = max`, also pass exact reviewer-only `explicit_effort = max`. Adaptive applies it, shadow records it without applying it, and inherit conflicts; it stays deep ordinary review and does not certify the work. Every wrapper/core child uses the normalized `reasoning_mode` and registered role selection without passing a model. The Adaptive/current agent must not modify application or business code directly. A second failure stops.
6. For handoff, dispatch `handoff-writer` with `mode = ad_hoc`, effective `output_root`, `orchestrator = orchestrator-simple`, the original `user_prompt`, `goal`, `scope_boundary`, `completed_items`, `pending_items`, `blocked_items`, `decisions`, `risks`, `artifact_paths`, `kanban_sync_required`, `kanban_updates`, `next_recommended_action`, `recommended_command`, and the in-memory Simple result/evidence. Generate `handoff_id` as the containment-safe basename `adaptive-simple-<UTC YYYYMMDDTHHMMSSZ>-<8 lowercase hex prompt digest>`; refuse an existing target instead of overwriting it. The writer must write under `<output_dir>/adaptive-simple-handoffs/<handoff_id>/` and must not discover or bind to an older persisted run. For `kanban_mode = auto`, run the kanban helper; for `manual`, report the manual sync action; for `off`, do nothing. Then run `commit_mode = after`; when review is enabled it must pass first, and the commit helper must safely separate run changes from pre-existing dirty changes.

These helpers do not become Simple tasks. Reviewer scope expansion or evidence that the
work is not a single bounded delivery recommends Flow. In `route_mode = auto`, retain
the normalized policy and promote once to Flow; with `route_mode = simple`, stop.
Simple never performs execution model recovery: retain the normalized
`capability_recovery_mode` only as route policy metadata and report that an `auto` or
`shadow` request cannot produce a recovery spawn on this route.
Optional handoff output may use `output_dir`, but the Simple core still writes no
checkpoint, status, task-list, or planning artifacts. Without an enabled helper that
writes output, `output_dir` is retained as policy metadata but reported as not
applicable rather than forcing a higher route.

### Flow

Translate the normalized policy into Flow's native flags and remove `--preset` and
`--route` before adoption. Flow supports the scout, commit, review (including `--review=max`), handoff, kanban,
reasoning, output-dir, resume, confirm/verbose, autopilot, and full-auto controls directly.
Forward normalized `--capability-recovery=off|shadow|auto` and persist it with
`preset_mode` beside the expanded effective flags in the Flow checkpoint.

### Pipeline

Translate the normalized policy into Pipeline's native flags and remove `--preset`
and `--route` before adoption. `review_mode = on` with inherited effort is redundant
because Pipeline review is mandatory; omit that flag and report the normalization.
Preserve `--review=max` so Pipeline can enforce the reviewer-only spawn override.
`review_mode = off` conflicts with Pipeline's hard gate, so stop rather than weaken review. Persist `preset_mode`
and `capability_recovery_mode` beside the expanded effective flags in the Pipeline
checkpoint.

## Prompt-only mode

When `prompt_mode = on`, classify and normalize but do not execute:

- Do not modify files or git state.
- Do not dispatch subagents.
- Do not run tests, reviewers, commit helpers, handoff helpers, or kanban helpers.
- Do not create checkpoints, status files, or `.pipeline-output` artifacts.
- A small amount of direct read-only repository inspection is allowed when needed to classify honestly.

Return:

1. `Selected route: Simple|Flow|Pipeline` (or `Required route: ...` for a conflict)
2. `Applied preset: ...`, a concise routing reason, expanded policy summary, normalization, and any profile warning
3. One copy-ready `Next prompt`

The next prompt invokes `$run-adaptive` with the concrete `--route=<selected>` and the
preserved `--preset=<preset>` plus explicit overrides. Remove `--prompt=*`. A concrete
route prevents reclassification while Adaptive retains the cross-cutting Simple
wrapper or Flow/Pipeline policy mapping. If policy conflicts with the required route,
return `Next prompt: not emitted`; do not emit an unsafe prompt.

For prompt-only resume, replace a base output root with the exact selected run
directory in the generated `--output-dir=<selected_run_dir>` and preserve `--resume`.
This pins the checkpoint that was classified even if a newer compatible run appears
before the generated prompt is used.

## Execution mode

When `prompt_mode = off`:

1. Read the selected installed TOML definition.
2. Apply the route mapping above while retaining the normalized run policy in the Adaptive controller.
3. Adopt the selected definition in the current/main agent. Do not spawn the selected primary orchestrator merely to enter its mode.
4. Obey all selected workflow hard constraints, delegation, task bounds, verification, cleanup, status, reasoning, and final-report requirements. Let effective Codex configuration select actual role models/tiers and resolve every child through policy v2 as intent -> class -> selected capability -> effort. The resolver selects effort only: never change the current/main agent or dynamically route a model. The sole exception is a Flow/Pipeline child recovery that fully satisfies `protocols/CAPABILITY_RECOVERY.md`: on Codex only, its one recovery spawn may pass the profile-resolved raw model and must verify that model and effort by child trace before acceptance. Other runtime exports conflict rather than inventing model routing; shadow may only compute a proven tier policy without spawning. In the final response, match the user's language and translate internal agent/protocol output into ordinary engineering language unless protocol details were requested.

For `route_mode = auto`, materially underestimated work may promote once from Simple to
Flow and once from Flow to Pipeline. Finish the current workflow honestly, retain
completed workspace changes and evidence, start a fresh higher workflow when needed,
and reapply the same normalized preset plus explicit overrides. Do not treat one
workflow's checkpoint as another's, do not nest primary orchestrators, and never
downgrade after execution begins. Ordinary operational errors, harness failures, and
localized repairable product bugs are not promotion reasons.

## Goal continuation admission

A Goal continuation first uses the automatic resume behavior above. If the prior run
cannot continue, apply `protocols/MATERIALITY_GATE.md`; only an admitted unmet original
Goal condition with concrete evidence, practical impact, and a concrete strategy delta
may start a narrow continuation run. Seed only the remaining gap, prior evidence and
attempts, reusable outputs, and new strategy, then choose the smallest suitable route.
A resumed or narrow continuation keeps the latest attempt's persisted reasoning
`effective_class` as the next retry floor; it does not restart reasoning recovery from
the task's original class.
A full fresh run is reserved for materially changed requirements, a globally invalid
prior plan, or justified workflow promotion. Budget exhaustion alone does not justify
replaying the full workflow, and the same model, effort, and strategy do not constitute
a strategy delta. Without one, report blocked instead of starting another automatic
round. `required_followups` contains only material blockers; `optional_notes`, P3
findings, and polish never become remaining work. Do not create a `run-goal` artifact
or synthetic goal task.
