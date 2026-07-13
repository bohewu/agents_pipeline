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
- `--review=off|on`
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
- `careful`: set `scout_mode = force` and `review_mode = on`.
- `delivery`: set `full_auto_mode = true`, `autopilot_mode = true`, `review_mode = on`, `kanban_mode = auto`, and `commit_mode = after`.
- `interactive`: set `confirm_mode = true` and `verbose_mode = true`.

Example: `$run-adaptive Fix the parser bug and add focused tests
--preset=delivery` still selects Flow because of the task, not because of the preset.
Only after selecting Flow does Adaptive apply full-auto/autopilot, review on, kanban
auto, and commit after through Flow's native controls. The same preset on a typo may
select Simple and apply the equivalent bounded outer wrapper instead.

Preset-owned fields are `scout_mode`, `review_mode`, `commit_mode`, `kanban_mode`,
`confirm_mode`, `verbose_mode`, `autopilot_mode`, and `full_auto_mode`. Track whether
each effective value came from the preset, an explicit flag, or the selected workflow
default during the current invocation so precedence never depends on flag ordering
alone. Do not require field-level provenance to survive in a checkpoint.

Precedence is deterministic:

1. Selected workflow hard safety constraints.
2. Explicit `--route=*`.
3. Explicit individual policy flags.
4. Preset defaults.
5. Selected workflow defaults.

Explicit `--review=off`, `--commit=off`, `--kanban=off`, or scout controls override the
corresponding preset value. Resolve autonomy versus interaction by provenance:

- Explicit `--confirm` or `--verbose` clears preset-derived `autopilot_mode` and `full_auto_mode` before mapping.
- Explicit `--autopilot` or `--full-auto` clears preset-derived `confirm_mode` and `verbose_mode`.
- If autonomy and interaction controls are both explicit, autopilot/full-auto wins with one warning, matching the native workflow safety rule.
- Force scout wins conflicting explicit scout flags; Pipeline review cannot be disabled.

## Resume routing

When `--resume` is present, inspect checkpoints read-only before route selection. If
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
warning. This needs no persisted field-level provenance. A legacy checkpoint without
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
5. If `review_mode = on`, dispatch one ad-hoc reviewer with changed targets, requirements, and evidence. On failure, dispatch at most one narrow same-scope repair to the original worker or an existing `executor`, then run one re-review. The Adaptive/current agent must not modify application or business code directly. A second failure stops.
6. For handoff, dispatch `handoff-writer` with `mode = ad_hoc`, effective `output_root`, `orchestrator = orchestrator-simple`, the original `user_prompt`, `goal`, `scope_boundary`, `completed_items`, `pending_items`, `blocked_items`, `decisions`, `risks`, `artifact_paths`, `kanban_sync_required`, `kanban_updates`, `next_recommended_action`, `recommended_command`, and the in-memory Simple result/evidence. Generate `handoff_id` as the containment-safe basename `adaptive-simple-<UTC YYYYMMDDTHHMMSSZ>-<8 lowercase hex prompt digest>`; refuse an existing target instead of overwriting it. The writer must write under `<output_dir>/adaptive-simple-handoffs/<handoff_id>/` and must not discover or bind to an older persisted run. For `kanban_mode = auto`, run the kanban helper; for `manual`, report the manual sync action; for `off`, do nothing. Then run `commit_mode = after`; when review is enabled it must pass first, and the commit helper must safely separate run changes from pre-existing dirty changes.

These helpers do not become Simple tasks. Reviewer scope expansion or evidence that the
work is not a single bounded delivery recommends Flow. In `route_mode = auto`, retain
the normalized policy and promote once to Flow; with `route_mode = simple`, stop.
Optional handoff output may use `output_dir`, but the Simple core still writes no
checkpoint, status, task-list, or planning artifacts. Without an enabled helper that
writes output, `output_dir` is retained as policy metadata but reported as not
applicable rather than forcing a higher route.

### Flow

Translate the normalized policy into Flow's native flags and remove `--preset` and
`--route` before adoption. Flow supports the scout, commit, review, handoff, kanban,
output-dir, resume, confirm/verbose, autopilot, and full-auto controls directly.
Persist `preset_mode` beside the expanded effective flags in the Flow checkpoint.

### Pipeline

Translate the normalized policy into Pipeline's native flags and remove `--preset`
and `--route` before adoption. `review_mode = on` is redundant because Pipeline review
is mandatory; omit the flag and report the normalization. `review_mode = off` conflicts
with Pipeline's hard gate, so stop rather than weaken review. Persist `preset_mode`
beside the expanded effective flags in the Pipeline checkpoint.

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
4. Obey all selected workflow hard constraints, delegation, task bounds, verification, cleanup, status, and final-report requirements. Let effective Codex configuration select role models and reasoning.

For `route_mode = auto`, materially underestimated work may promote once from Simple to
Flow and once from Flow to Pipeline. Finish the current workflow honestly, retain
completed workspace changes and evidence, start a fresh higher workflow when needed,
and reapply the same normalized preset plus explicit overrides. Do not treat one
workflow's checkpoint as another's, do not nest primary orchestrators, and never
downgrade after execution begins. Ordinary operational errors or localized repairable
bugs are not promotion reasons.
