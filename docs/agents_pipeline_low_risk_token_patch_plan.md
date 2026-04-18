# bohewu/agents_pipeline — Low-Risk Token Reduction Patch Plan

## Goal
Reduce prompt/runtime token usage with the smallest practical behavior change. Keep the patch reviewable, avoid schema churn, and preserve the current repo architecture:
- `opencode/agents/*.md` stays the single source of truth.
- Exporters continue generating Copilot / Claude / Codex artifacts from source agents.
- Canonical pipeline artifact filenames, status/checkpoint semantics, and slash-command flags stay unchanged.

## Scope Guardrails

### In scope
1. Compact repeated source-prompt blocks that are currently duplicated across multiple agents.
2. Compact exporter-injected adapter text and apply conservative whitespace normalization in generated outputs.
3. Tighten the `DevSpec` auto-generation gate so trivial runs stop paying for an unnecessary Stage 0.5.
4. Expand GPT-5 baseline-effort exclusions for clearly structured low-reasoning agents.

### Out of scope for this patch
- No schema changes.
- No checkpoint format changes.
- No status-runtime event vocabulary changes.
- No retry-loop redesign.
- No file-first artifact protocol.
- No new dependencies.
- No hand-editing generated/exported agent outputs.

## Patch Set

| Priority | Patch | Risk | Expected savings | Why it is low risk |
|---|---|---:|---:|---|
| P1 | Compact repeated cleanup/artifact blocks in source agents | Low | Medium | Keeps the same contracts; only shortens wording |
| P2 | Compact exporter adapter text + safe markdown whitespace normalization | Low | Medium | Generated targets only; no source-of-truth behavior change |
| P3 | Conservative `DevSpec` gate tightening | Low-Medium | High on trivial runs | Changes only auto-generation heuristics, not the schema or filenames |
| P4 | Expand GPT-5 medium-floor exclusions for planning/routing/scout agents | Low | Medium (runtime cost) | Small plugin/table change; existing behavior remains for execution/review agents |

---

## P1 — Compact Repeated Source-Prompt Blocks

### Target files
- `opencode/agents/executor.md`
- `opencode/agents/peon.md`
- `opencode/agents/generalist.md`
- `opencode/agents/doc-writer.md`
- `opencode/agents/market-researcher.md`
- `opencode/agents/test-runner.md`

### Problem
Several agents repeat long versions of the same two ideas:
1. cleanup/teardown obligations
2. artifact-output formatting rules

These repeated blocks are carried into live prompt context and also flow into generated target runtimes.

### Change
Rewrite the repeated sections into shorter versions while preserving the exact behavior contract.

### Required invariants
- Preserve the exact artifact delimiters:

```text
=== ARTIFACT: <filename> ===
<content>
=== END ARTIFACT ===
```

- Preserve the rule that filename must include `task_id`.
- Preserve the rule that missing required artifact means incomplete task output.
- Preserve the requirement to tear down servers/browsers/watchers/background processes before success is claimed.
- Preserve the requirement to include cleanup evidence in `evidence` or `notes`.
- Preserve `test-runner` semantics: cleanup failure/uncertainty must keep status non-clean (`partial` or `fail`).
- Preserve `market-researcher` semantics: source citation and assumption labeling remain mandatory.
- Preserve all JSON output schemas exactly.

### Recommended edit pattern
Do **not** invent a new include system. Just shorten the text in place.

#### Cleanup block (short form)
Use a compact version that still states all required obligations:
- shut down servers / browsers / Playwright / Node / watchers / background processes
- track created resources (pid / port / temp profile / process tree where relevant)
- prefer bounded one-shot commands
- include cleanup evidence
- if cleanup is not verified, do not report success

#### Artifact block (short form)
Use a compact version that still states:
- for design / plan / spec / checklist / notes / analysis outputs, artifact block is mandatory
- exact delimiters are required
- filename must include `task_id`
- missing required artifact = incomplete

### Acceptance criteria
- All six files are shorter.
- No output JSON schema changes.
- Artifact delimiter wording remains exact.
- Reviewer-facing evidence expectations remain intact.

---

## P2 — Compact Exporter Adapter Text and Normalize Markdown Safely

### Target files
- `scripts/export-copilot-agents.py`
- `scripts/export-codex-agents.py`
- `scripts/export-claude-agents.py`

### Problem
Each exporter prepends adapter prose to generated orchestrators. That adapter prose is useful, but currently verbose. The scripts also preserve source spacing almost verbatim, which leaves some low-value blank-line overhead in generated prompts.

### Change
Implement a conservative output compaction step in exported bodies.

### Required behavior
#### 1) Shorten adapter copy, but keep meaning
- **Copilot input adapter** must still say:
  - use latest user message as `raw_input`
  - strip the leading slash command token when present
  - then apply existing flag parsing unchanged
- **Codex input/role adapter** must still say:
  - use `raw_input`
  - strip leading slash command token
  - interpret `@agent-name` references as generated role names
- **Claude input/delegation adapter** must still say:
  - use `raw_input`
  - strip leading slash command token
  - return a dispatch JSON block for top-level execution
  - preserve `deps` ordering semantics
  - preserve `worktree` semantics when delegated work must run elsewhere

#### 2) Add conservative markdown compaction
Implement a helper that:
- trims trailing spaces
- collapses repeated blank lines outside code fences to a maximum of one blank line
- preserves fenced code blocks exactly
- preserves bullets, headings, tables, and JSON examples
- does **not** rewrite source semantics

### Implementation note
Keep this patch small. Prefer one tiny helper per script or a very small shared helper only if the shared import is obviously reviewable. Do **not** build a new exporter framework in this patch.

### Acceptance criteria
- Exporter CLI behavior and output filenames are unchanged.
- Generated orchestrator files are equal or smaller in byte size; no target should grow materially.
- Generated files remain valid for existing dry-run and strict-export validation paths.

---

## P3 — Tighten `DevSpec` Auto-Generation Conservatively

### Target file
- `opencode/agents/orchestrator-pipeline.md`

### Problem
The current policy is biased toward generating `DevSpec` when uncertain. That improves traceability, but it also creates avoidable Stage 0.5 work for small runs.

### Change
Keep `DevSpec` for genuinely behavior-heavy work, but default back to `ProblemSpec` for clearly small or mechanical runs.

### New policy shape
#### Keep `DevSpec` auto-generation by default for
- explicit spec / BDD / TDD / scenario / acceptance-criteria requests
- user-facing behavior changes
- API contract or request/response behavior changes
- workflow/state-transition changes
- multi-scenario or multi-story work where traceability materially helps planning/testing/review

#### Skip `DevSpec` by default for
- `test_only = true`
- `decision_only = true`
- `dry_run = true`
- docs-only / copy-only / content-only changes
- formatting / lint / rename / comment-only / mechanical refactor with no behavior change
- config-only or dependency-only changes with no intended behavior change
- small single-path bugfixes where normal `ProblemSpec` acceptance criteria are enough

### Required wording change
Replace the current “if unsure and implementation-oriented, prefer generating `DevSpec`” posture with a more conservative default-to-`ProblemSpec` posture.

### Important non-changes
- Keep canonical filenames unchanged:
  - `dev-spec.json`
  - `dev-spec.md`
- Keep approved-spec reuse logic intact.
- Do not reorder stages.
- Do not change `ProblemSpec` / `DevSpec` schemas.

### Acceptance criteria
- Stage 0.5 still exists and is still used for behavior-heavy work.
- Trivial runs now skip `DevSpec` more often.
- No schema or artifact-path changes.

---

## P4 — Expand GPT-5 Medium-Floor Exclusions

### Target files
- `opencode/plugins/effort-control/state.js`
- `opencode/plugins/effort-control.test.mjs`
- `README.md`

### Problem
The effort-control plugin currently floors most GPT-5 non-mechanical agents to at least `medium`. That is reasonable for execution/review, but some structured planner/router/scout steps are cheaper and do not need that floor.

### Change
Add these agents to `EXCLUDED_BASELINE_AGENTS`:
- `planner`
- `router`
- `repo-scout`

### Deliberate non-changes
- Do **not** add a new `low` reasoning-effort mode in this patch.
- Do **not** change provider/model gating.
- Do **not** remove the floor for `executor`, `generalist`, `reviewer`, `atomizer`, or `specifier` in this patch.

### Test updates
Extend `opencode/plugins/effort-control.test.mjs` so GPT-5 default-effort resolution stays:
- `executor` -> still floored to `medium`
- `test-runner` -> still excluded
- `planner` -> excluded
- `router` -> excluded
- `repo-scout` -> excluded

### README update
Adjust the behavior note so it no longer implies a blanket floor for all planning/routing/scouting roles.

### Acceptance criteria
- Plugin logic change is limited to exclusion behavior.
- Tests reflect the new exclusions.
- README note matches actual behavior.

---

## Validation Plan

### Minimum required checks
```bash
python3 scripts/validate-flag-contracts.py
python3 scripts/validate-orchestrator-contracts.py
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir ./.tmp-copilot --strict --dry-run
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir ./.tmp-codex --strict --dry-run
python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir ./.tmp-claude --strict --dry-run
node --test opencode/plugins/effort-control.test.mjs
```

### Recommended extra checks
```bash
python3 scripts/export-copilot-agents.py --source-agents opencode/agents --target-dir ./.tmp-copilot --strict
python3 scripts/export-codex-agents.py --source-agents opencode/agents --target-dir ./.tmp-codex --strict
python3 scripts/export-claude-agents.py --source-agents opencode/agents --target-dir ./.tmp-claude --strict
```

Then record a small before/after size comparison for at least:
- `opencode/agents/executor.md`
- one generated `orchestrator-pipeline` export (Copilot, Claude, or Codex)

### Full baseline if you want broader parity
Run the repo’s broader recommended validation set from `CONTRIBUTING.md` after the focused checks above.

---

## Rollout / Review Strategy

### Recommended commit split
1. **Commit A** — source prompt compaction + exporter compaction
2. **Commit B** — `DevSpec` gate tightening + effort-control exclusions + docs/tests

This makes rollback easier if one change class proves controversial.

### Review checklist
- Did any JSON contract change? If yes, reject.
- Did any canonical filename change? If yes, reject.
- Did any exporter CLI flag or output path change? If yes, reject.
- Did any patch add schema work or runtime status work? If yes, move it out of this PR.
- Are the modified prompts materially shorter? If not, the patch is not paying for its risk.

---

## Explicitly Deferred Follow-Ups (Not for This Patch)

These still have savings potential, but they are **not** low-risk enough for this pass:
- file-first artifact protocol instead of inline artifact-body echoing
- retry-loop classification / no-full-rerun repair policy
- heartbeat throttling or event batching in status runtime
- checkpoint `stage_artifacts` pointer/hash mode instead of full inline stage payloads
- schema-level protocol changes

---

## Definition of Done
- P1–P4 are implemented.
- Focused validations pass.
- No schema or flag contract changes were introduced.
- Generated output paths and canonical artifact names are unchanged.
- The patch is visibly smaller/leaner in source prompts and exported prompts.
