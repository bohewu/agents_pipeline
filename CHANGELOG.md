# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses SemVer tags (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

## [0.35.2] - 2026-08-03

### Changed

- Made minimal implementation and proportional verification explicit across executor, generalist, reviewer, and managed Codex guidance; adequate targeted evidence now stops work unless a concrete uncovered path requires broader validation.
- Changed reviewer failures from automatic repair authority into materiality-gated evidence: orchestrators now admit only P0-P2 followups tied to an unmet original requirement, concrete evidence, practical impact, and the smallest necessary fix.

## [0.35.1] - 2026-07-25

### Changed

- Material reasoning retries now carry the prior attempt's effective class and recover child effort before considering model uplift; a deep `executor` or `generalist` can automatically retry at `max` on the same model without a fake explicit override.
- Goal continuations now prefer the same run and completed-stage checkpoint, then a narrow remaining-work continuation with a concrete strategy change; budget exhaustion no longer justifies replaying the full workflow.
- Clarified that every stopped-and-respawned child is a new redispatch and consumes the existing workflow retry allowance.

## [0.35.0] - 2026-07-24

### Added

- Added deterministic child capability recovery with `off|shadow|auto` modes, one profile-bounded model-tier uplift for `executor`/`generalist`, read-only profile resolution, and model/effort trace verification.
- Added a shared materiality gate for repairs, reviewer followups, capability recovery, and Goal continuation so optional polish and P3 findings cannot consume bounded recovery work.

### Changed

- Adaptive `autonomous` and `delivery` presets now default capability recovery to `auto`; direct Simple, Flow, and Pipeline entry points and other Adaptive presets default it to `off`.
- Clarified that reviewer `max` remains effort-only and is reserved for explicit overrides, formal assurance, material security/data-integrity review, or reviewer reasoning recovery.
- Pipeline now atomically records each task's capability-recovery use against its existing retry opportunities before the promoted spawn, preventing resume from repeating an uplift or restoring that task's consumed retry.

## [0.34.1] - 2026-07-23

### Changed

- Changed child selection summaries to preserve one line per dispatch and forbid ambiguous slash-joined effort values; differing requested, dispatched, and effective effort values now use separate named fields.

## [0.34.0] - 2026-07-22

### Added

- Added bounded Codex child-model verification and a common user-visible child result label that distinguishes verified/effective runtime metadata from configured, requested, inherited, or unverified values.

### Changed

- Changed full/global Codex installs to default `agents.max_concurrent_threads_per_session` to `8` and `agents.max_depth` to `1`; explicit new values are preserved, numeric legacy `agents.max_threads` values are migrated, and workspace profiles continue to inherit global limits.

## [0.33.0] - 2026-07-22

### Added

- Enabled Codex multi-agent V2 in generated and installed config, documented the V2 child-spawn parameter mapping, and extended local trace verification to resolve parent-bound V2 task paths and distinguish explicit policy effort from a lower parent effort.

### Changed

- Changed fresh `$run-adaptive` execution to default to `--reasoning=adaptive`; direct Simple/Flow/Pipeline entry points, policy defaults, explicit flags, and persisted resume state retain their existing semantics.
- Preserved boolean and object-form V2 feature settings during install, accepted enabled V2 configuration objects in global health checks, and exported subagent roles as leaf workers because Codex V2 does not enforce `agents.max_depth`.

## [0.32.3] - 2026-07-17

### Changed

- Limited reviewer failures and repair routing to evidence-backed P0-P2 defects or explicit requirement violations; optional polish and wording preferences no longer trigger retries.
- Increased Pipeline task-local repair budgets from `0/1/1` to `1/2/2`, stopped only after two no-progress repairs or a true bound, and made tool/CLI/environment failures use separate operational retries without consuming repair budget.
- Required Adaptive, Simple, Flow, Pipeline, and summarizer output to translate internal agent/protocol terms into concise language matching the user.

## [0.32.2] - 2026-07-16

### Changed

- Changed fresh Adaptive, Simple, Flow, and Pipeline runs to default to `--reasoning=inherit`; selector-enforced effort remains available through explicit `--reasoning=adaptive`, while persisted resume modes remain unchanged.

## [0.32.1] - 2026-07-16

### Fixed

- Made Codex installation automatically replace real stale managed skill directories and unmarked or unreadable support roots transactionally, while preserving skill backups and rejecting links, reparse points, and non-directories.
- Applied observed workspace-ceiling and strict/exact mismatch validation before inherit, shadow, and selector-unavailable early returns, preventing runtime evidence from being silently discarded.
- Redacted raw child role/model values from Codex trace output and rejected trace roots or candidates reached through symlinked ancestors, Windows junctions, or other redirected paths.
- Required child/parent inheritance comparison whenever both effective efforts are known.
- Made Codex child trace evidence compare the child with the parent's effective effort at spawn, so a matching same-value request is marked `matches_parent`/causally indeterminate instead of being presented as proof that the native selector applied it.
- Added local Codex child-trace verification so managed workflows distinguish a requested per-spawn effort from the effort that actually ran, including custom-role runtimes that reapply parent effort.
- Made observed effort below dispatch or above the workspace ceiling a conflict; non-strict overprovisioning within the ceiling remains explicit `effective_effort_mismatch` degradation instead of being mislabeled as enforced.

## [0.32.0] - 2026-07-15

### Added

- Added policy-v2 `task_intent` classification, deterministic intent/signal/role/context resolution, selected-tier capability checks, failure-aware recovery, structured decisions/observations, schemas, fixtures, status projection, and shared workflow guidance.
- Added backward-compatible intent metadata to TaskList, FlowTaskList, DispatchPlan, and TaskStatus plus a checkpoint compatibility flag without changing their existing protocol versions.

### Changed

- Changed deep `mini` and `unknown` dispatches from an implicit max fallback to a capability conflict by default. The explicit `allow_degraded_deep` compatibility path can request only exact degraded deep `max` with `model_tier_below_deep_requirement`, never assurance; missing or mismatched max enforcement conflicts.
- Raised `cross_module` to a hard `deep` signal for intent-bearing policy-v2 records and added the bounded deliberative/deep signal vocabulary required by task-intent classification. Intent-less legacy payloads retain the v1 `cross_module -> deliberative` floor so persisted v0.31.1 artifacts do not change meaning.
- Tightened v2 policy, decision, observation, and status validation so managed role/context contracts, runtime enforcement evidence, assurance, and degraded-deep state cannot be weakened or forged in schema-valid artifacts.
- Bound requested and explicit classes as upward-only floors, managed role-policy snapshots and review contexts to their identifiers, AgentStatus to its embedded reasoning role, and unavailable-selector evidence to an exact non-dispatched degraded state.
- Made selector-unavailable conflicts content-free with respect to effective effort, applied exact upward-floor validation to every explicit effort value, and bound legacy classification sources to their requested class or canonical role target even on conflicts.
- Rejected every runtime or observed fallback away from a resulting exact effort request, cleared provisional recovery boosts unless the final class remains `deep`, and required legacy TaskStatus provenance to carry its class/signals pair.
- Closed policy-v2 customization gaps by making default, managed-role, and dispatch-context objects canonical snapshots with no extra keys; unlisted roles retain in-memory default resolution, while persisted AgentStatus reasoning is managed-role-only.
- Restored schema-v1 non-inherit `effective_class` parity, capped every non-formal signal floor at `deep`, rejected unknown keys throughout runtime policy validation, and limited policy-v2 dispatch records to the three canonical contexts.
- Canonicalized policy-v2 conflict metadata as a fixed `conflict` state token plus one free-text `conflict_reason`, removing a cross-field equality rule that JSON Schema could not enforce while preserving schema-v1 conflict text.
- Kept runtime-effort fallbacks and model-tier-below-deep compatibility marked `degraded` after matching trace evidence; matching the fallback proves what ran but does not satisfy or erase the original class/tier requirement.
- Made `inherit` classification-only: it never applies a child effort selector, so exact overrides such as `--review=max` and strict assurance now conflict instead of being enforced from inherit mode. `shadow` still computes requested effort without applying it.
- Clarified that workspace profiles select the actual child role model/tier, while the resolver selects child effort only and never routes or downgrades a model or changes current/main-agent effort.

## [0.31.1] - 2026-07-15

### Fixed

- Updated the PowerShell bootstrap happy-path fixture with the adaptive reasoning policy and resolver assets required by the hardened bundle preflight, restoring native Windows release validation.

## [0.31.0] - 2026-07-15

### Added

- Added the versioned adaptive child-reasoning policy, resolver CLI, schemas, and roadmap. Simple, Flow, Pipeline, and Adaptive now default to `--reasoning=adaptive`, classify work as routine, deliberative, deep, or assurance, and retain `inherit` as the rollback mode plus `shadow` for diagnostics.
- Added model-tier-aware quality floors and role policies: managed dispatches never resolve below `medium`, mini-tier models resolve no lower than `high`, formal assurance requires the strongest configured tier and maximum single-agent effort, and fixed roles keep immutable class ceilings.
- Added persisted reasoning decisions to checkpoints, dispatch/task status, AgentStatus, and bounded local observations without recording prompts, paths, logs, evidence contents, or free-text reasoning details.

### Changed

- Extended task-producing agents and schemas with bounded `reasoning_class` and `reasoning_signals`, including signal-floor validation, batch compatibility checks, and rerouting when a fixed role cannot accept the required class.
- Updated Codex, Claude Code, and Copilot exporters, bootstraps, managed support synchronization, CI, and release bundles to ship and validate the reasoning policy and resolver.
- Kept model selection owned by the effective workspace profile while the shared resolver owns per-spawn effort selection; model escalation remains a future, separately gated capability.

### Fixed

- Made workspace ceilings, exact overrides, strict assurance requests, unsupported effort vocabularies, and selector-unavailable dispatches fail closed or report explicit degradation instead of silently weakening or claiming an unenforced effort.

## [0.30.1] - 2026-07-14

### Changed

- Replaced Codex custom-role dispatch guidance that named a low-level fork isolation setting with runtime-aligned wording: use native registered-role selectors without full-history forks, then verify the spawned child trace. This keeps GPT-5.5 root orchestration compatible with workspace-profile subagents without relying on the deprecated setting name.

## [0.30.0] - 2026-07-14

### Added

- Added `--review=max` to Adaptive, Simple, Flow, and Pipeline review controls. Codex applies maximum reasoning only to the registered reviewer role, including re-review, while preserving the workspace-profile-selected reviewer model and leaving all other roles unchanged.
- Added checkpoint persistence for inherited versus maximum reviewer reasoning so resumed Adaptive, Flow, and Pipeline runs retain the selected review policy.

### Changed

- Hardened the reusable reviewer role for both pipeline and ad hoc reviews with read-only constraints, explicit source-of-truth rules, P0-P3 severity guidance, evidence-backed findings, and deterministic pass/fail invariants.
- Clarified that the cross-runtime `reviewer` role and `$run-* --review=*` controls are separate from Codex's native `/review` command.

## [0.29.1] - 2026-07-14

### Added

- Added all five reusable capability skills to the marker-owned global Codex discovery collection, with `agents/openai.yaml` metadata and an explicit, backup-preserving migration path for older unmarked copies.

### Changed

- Reduced duplicated guidance across the non-`run-*` skills, moved detailed UI communication templates and scoring into on-demand references, and made the browser-audit lifecycle tool-neutral while retaining Chrome DevTools guidance.

### Fixed

- Added content-digest health checks for all 16 installed skills, rewrote installed protocol references to the persistent global support tree, and made reinstall preserve modified marker-owned copies outside the discovery root before repairing them.
- Made Codex global install sequencing interruption-safe with a manifest `pending`/`ready` skill-sync gate, preserved all V1 marker-owned skills before upgrading them, retained custom discovery roots during global `clear`, and made profile health require the capability protocols referenced by installed skills.

## [0.29.0] - 2026-07-13

### Added

- Added the Codex-first `$run-adaptive` skill-only engineering router. It selects Simple, Flow, or Pipeline without adding an Adaptive role/profile entry, supports route-independent `balanced`, `autonomous`, `careful`, `delivery`, and `interactive` presets plus explicit policy overrides, and provides a side-effect-free `--prompt=on` mode that emits a pinned next Adaptive prompt instead of executing.
- Added the runtime-neutral `checkpoint.updated` event for persisting non-empty derived-flag deltas without incorrectly advancing the completed stage during an in-progress recovery.

### Changed

- Split Flow failure handling into up to two transient operational retries, `0..2` task-local modify-and-verify cycles after the first attempt, and one persisted Flow-level recovery re-dispatch per run. Repeated failure signatures, no progress, exhausted bounds, and scope expansion now stop local iteration explicitly.
- Kept every Adaptive preset Simple-eligible by applying review, scout, handoff, kanban, commit, interaction, and autonomous settings as a bounded wrapper around the Simple core, while Flow and Pipeline receive equivalent native flags. Route promotion preserves and reapplies the normalized policy.
- Required Codex custom-role or non-parent model/reasoning dispatches to avoid full-history inheritance; full-history forks remain reserved for intentional parent role/model inheritance and no longer count as evidence that workspace profile routing succeeded.

## [0.28.2] - 2026-07-11

### Changed

- Kept Codex workflow orchestration compatible with `agents.max_depth = 1`: formal skills retain control in the current/main agent, and execution-enabled Modernize runs now adopt the Pipeline definition in place instead of spawning a nested primary orchestrator.

## [0.28.1] - 2026-07-11

### Changed

- Made Codex model profiles workspace-only. Global Codex installs now always generate model-free roles that inherit the parent session; global `status` and `clear` remain available only for installation diagnostics and legacy profile cleanup. Claude Code and GitHub Copilot retain their global profile workflows.
- Stopped Codex export and normal global install paths from writing `agents.max_threads` or `agents.max_depth`; existing user values are preserved and absent keys remain runtime-owned.
- Scoped profile-installation health checks to the common neutral core plus the selected runtime's required assets, so missing Tier 2-only adapters do not make Codex unhealthy while Claude Code and Copilot still validate their own support files.
- Standardized current workflow guidance on runtime-neutral invocation input and the formal Codex `$run-*` entry points; Claude Code and Copilot exports translate those references to their existing `/run-*` compatibility aliases.
- Replaced the README's deprecated OpenCode command blocks with a concise notice that keeps OpenCode frozen at `v0.26.1`.

### Removed

- Removed the tracked Claude Code user-local permission file and ignored `.claude/settings.local.json`; the repository-level `CLAUDE.md` Tier 2 guide remains.

## [0.28.0] - 2026-07-11

### Added

- Added the runtime-neutral `modes.json` manifest as the single source for mode names, aliases, and primary orchestrator routing.
- Added ten formal Codex workflow skills (`$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee`) as the primary invocation surface; global installs publish them under `~/.agents/skills/`, while `use <mode>` remains compatibility-only and `run-goal` stays removed.
- Added `tools/status-event.js` and the reusable `tools/status-runtime/` core for runtime-neutral checkpoint/status projection, ordered batches, cross-repo path anchoring, and resume discovery.
- Added the runtime-neutral `tools/agent-profile.py` manager and installed Bash/PowerShell entrypoints, with numbered `set`/`status`/`clear`/`list`, runtime/scope/profile/model-set selection, non-interactive explicit-choice support, and JSON status/list output. Runtime setup is global-first; Claude Code and Copilot profiles are global-only.
- Added isolated Codex workspace profiles. A workspace materializes only profile-specific `.codex/agents/*.toml`, a managed `.codex/config.toml` block, and `.codex/.agents-pipeline-project-profile.json`; skills, scripts, protocols, tools, and runtime support remain globally installed once.
- Added neutral release archives named `agents-pipeline-bundle-v<version>` containing the canonical core and the three retained runtime adapters.

### Changed

- Declared Codex the Tier 1, first-class runtime; Claude Code and GitHub Copilot remain Tier 2 best-effort export targets, while OpenCode is frozen at the `v0.26.1` OpenCode-first release.
- Replaced workflow `effort` controls with explicit, risk-derived verification, review, repair, retry, and resource policies. Model reasoning is now entirely runtime-owned.
- Moved canonical source from the OpenCode tree to top-level `agents/`, `protocols/`, `skills/`, and `tools/`; canonical agent frontmatter now contains only `name`, `description`, and `kind`.
- Made formal `$run-*` skills adopt global workflow definitions without manually loading repository role files. Every invocation runs the shared workspace-profile preflight, so unconfigured workspaces inherit global routing while unverifiable, orphaned, or unhealthy local role state stops before dispatch; healthy ineligible profiles warn and use global routing. Managed `use <mode>` aliases follow the same gate.
- Made Codex the native projection path: global installs synchronize a version-3 marker-owned support tree under `~/.codex/agents-pipeline`, rewrite and relocate neutral references there, and clean an installer-owned legacy `.codex/opencode` mirror during upgrades. The tree includes `AGENTS.md`, runtime catalogs, and installer scripts, so its profile manager supports `set`, `status`, `clear`, and `list` without a source clone. `install` remains a deprecated compatibility alias for `set`.
- Updated Claude Code and GitHub Copilot exporters/installers to consume neutral agents, exact manifest aliases, neutral profiles, and runtime-specific model catalogs while remaining Tier 2 best-effort adapters.
- Unified global model-profile set, status, clear, and list behavior across Codex, Claude Code, and Copilot. Codex global status reads its native installer manifest, project status validates its manifest and workspace-local role hashes, and Claude/Copilot use deterministic common runtime-profile manifests. No current profile path reads OpenCode settings.
- Made Codex workspace status trust-aware without granting trust: it reports local file health separately from `project_trust` and `profile_eligibility`, and warns when an untrusted project layer is ineligible to load.
- Replaced provider-metadata-backed model catalog updates with static policy validation for the retained Codex, Claude Code, and Copilot catalogs.
- Consolidated the originally planned v0.29 OpenCode deletion into this neutral-core release so main does not carry a deprecated runtime for another cycle.

### Fixed

- Hardened Codex upgrades against crafted manifest paths, unowned legacy-directory cleanup, and unmarked support-tree replacement; installed support documents now resolve their neutral references from the marker-owned managed root.
- Made Codex config merging TOML-aware for multiline strings, quoted agent tables, and dotted root settings; project overlays also preserve marker-looking string content and support non-BMP paths.
- Added content hashes for every generated Codex workspace-profile role and reject linked project config parents, linked support markers, stale/tampered local role content, and malformed managed markers.
- Added ownership markers plus rollback-capable, per-skill atomic replacement for the ten global user skills, refusing unowned, corrupt, linked, or junction-backed skill targets instead of overwriting them.
- Hardened all installer-managed output leaves against symlink traversal and partial-file writes; Codex configuration, manifests, global instructions, generated agents, and the Claude runner now use atomic sibling-file replacement.
- Refused control and shell-interpolation characters in paths that are embedded into generated Bash/PowerShell command snippets, with preflight checks before installer or bootstrap mutation while retaining normal spaces, apostrophes, and parentheses.
- Preserved unrelated Codex project configuration and role files when setting or clearing the managed project profile; only installer-owned workspace roles are replaced or removed, active global roles are never mutated, project profiles inherit effective global agent limits, and nested modes require `agents.max_depth >= 2`.
- Hardened the status writer with safe run/task/agent basenames, contained entity paths, compatible explicit resume checks, fresh-run ID collision rejection, strict RFC 3339 timestamps, pre-start update rejection, terminal resource-cleanup gates, all-entity validation before persistence, and automatic-resume identity checks.
- Added the required bounded Copilot coordinator tools, made Claude's runner-only `Agent` restriction explicit, fixed new-parent dry runs and target validation, fixed repeat PowerShell installs on Unix hosts with hidden manifests, and restored macOS Bash 3.2 compatibility in release bootstraps.
- Made tag releases validate and package the same selected revision; manual release dispatch now requires the workflow itself to run from the requested tag so artifact attestations carry the expected source ref.

### Removed

- Removed `/run-goal`, `orchestrator-goal`, and the GoalManifest protocol surface. Long-running execution now uses each runtime's native goal/autopilot capability instead of a cross-runtime wrapper.
- Removed the OpenCode effort-control plugin, its dedicated installers, Pipeline `--effort`, checkpoint `effort_mode`, and Flow task `effort`; Flow tasks now carry explicit `risk` and `review_required` fields.
- Removed all current-tree OpenCode commands, plugins, tools, model sets, installers, aggregate installers, migration cleanup scripts, and release-bundle targets. OpenCode users remain pinned to `v0.26.1`.
- Removed OpenCode-only account, usage, skill-manager, and Codex image-generation bridge agents/tools, along with their canonical catalog entries.
- Removed duplicated command-file flag contracts; orchestrator definitions and `modes.json` now own workflow behavior and routing respectively.

## [0.26.1] - 2026-07-10

### Fixed

- Workspace Codex profile installs now inherit `agents.max_threads` and `agents.max_depth` from the global Codex configuration instead of overriding them with generated defaults.

## [0.26.0] - 2026-07-10

### Changed

- Refreshed workspace model-set catalogs with GPT-5.6 Luna/Terra/Sol as the OpenAI-first OpenCode and Codex defaults, current Anthropic and stable Google text models, and GPT-first Copilot fallback ordering.
- The model-set updater now manages every bundled catalog with `--provider all`, including a static policy-backed OpenAI target and collision-free mirrored output when an all-catalog output directory is supplied.

## [0.25.7] - 2026-06-26

### Added

- Added branch-first repo-local modernization guidance for `/run-modernize --mode=branch`, including branch naming, dirty-worktree handling, branch-local docs, and optional selected-phase execution handoff.

## [0.25.6] - 2026-06-23

### Fixed

- Stabilized the local-preview lifecycle smoke validation on macOS by using the shared Node fixture for the direct preview listener instead of Python `http.server`.

## [0.25.5] - 2026-06-23

### Fixed

- `agent-profile status --runtime <runtime>` now reports the selected runtime target instead of only showing the default OpenCode workspace profile state.
- Runtime profile installs through `agent-profile` now write a small runtime manifest for Codex, Copilot, and Claude Code so status can report the installed profile/model set.

## [0.25.4] - 2026-06-23

### Changed

- Codex mode-alias generation now reserves native goal entry points by omitting `/goal` and `use goal` style aliases; use `/run-goal` when explicitly invoking the agents-pipeline goal orchestrator.

## [0.25.3] - 2026-06-23

### Fixed

- Codex runtime model-profile installs through `agent-profile` now keep managed global Codex notes in the default global Codex home (`~/.codex/AGENTS.override.md` when active, otherwise `~/.codex/AGENTS.md`) instead of writing `AGENTS.md` under the workspace `.codex` target.

## [0.25.2] - 2026-06-23

### Fixed

- `agent-profile --runtime codex --workspace ...` no longer forwards the workspace root to the Codex installer, so workspace model-profile installs do not merge managed Codex notes into the caller repo's root `AGENTS.md`.

## [0.25.1] - 2026-06-22

### Fixed

- Installed OpenCode layouts now include the root `AGENTS.md` catalog so runtime Codex profile installs keep strict source/catalog validation without reading the caller project's `AGENTS.md`.
- `agent-profile --runtime codex --workspace ...` now forwards the workspace root to the Codex installer, so workspace `.codex` installs merge the managed mode-alias block into the workspace `AGENTS.md` instead of treating `.codex/AGENTS.md` as a global target.

## [0.25.0] - 2026-06-22

### Added

- `orchestrator-flow` now supports an optional `--review=off|on` post-synthesis reviewer gate with at most one bounded repair and re-review pass.
- `/run-flow` documents the new `--review=on` path, including `--commit=after` waiting for a passing review when review mode is enabled.

### Fixed

- Flow no longer emits terminal run status before the optional review gate can fail or request a bounded repair.

## [0.24.3] - 2026-06-15

### Fixed

- Codex workspace installs no longer treat the caller project's `AGENTS.md` as the strict export catalog when `install-codex-config.py` resolves its default catalog path.
- `agent-profile --runtime codex` now succeeds for workspace installs in repos that maintain their own project-specific `AGENTS.md` files.

## [0.24.2] - 2026-05-28

### Changed

- Updated `frontend-aesthetic-director` guidance with a preserve-vs-modernize polish dial, anti-slop checklist reference, aligned polish brief template, and clearer routing between conceptual UI critique and implementation-facing UI polish.

## [0.24.1] - 2026-05-20

### Fixed

- `orchestrator-goal` now records batch execution paths more accurately in goal-session state, distinguishing true inner-orchestrator delegation from definition-driven simulation in the current/main agent.
- `goal-manifest` schema/examples now expose execution-path metadata (`execution_mode`, optional `definition_source`) so resumable goal sessions can persist how each batch actually ran.

## [0.24.0] - 2026-05-20

### Added

- Added `/run-goal` plus the new `orchestrator-goal` primary orchestrator for resumable multi-batch goal sessions that persist outer goal state and resume by `--goal-id`.
- Added `goal-manifest.schema.json` and a valid example fixture for the outer goal-session state model.

### Changed

- Goal-session defaults now route unspecified batches to Flow while allowing per-batch override to existing orchestrators.
- Release-facing orchestrator allowlists, Codex fallback run-command mappings, and flag-contract validation now include the new `run-goal` / `orchestrator-goal` surfaces.

## [0.23.11] - 2026-05-17

### Fixed

- `install-codex` no longer backs up the generated `.codex/opencode` support tree on every run, keeping repeated installer backups small while still re-syncing the support files.

## [0.23.10] - 2026-05-11

### Fixed

- Release bundles now include `scripts/codex_mode_aliases.py`, so Codex shell installs from extracted bundles no longer fail on that import-time helper.
- OpenCode `install.sh` and `install.ps1` now include `scripts/codex_mode_aliases.py` in the managed scripts they install.
- Release-bundle validation now smoke-checks extracted Codex Python entrypoints so missing import-time helpers are caught before release.

## [0.23.9] - 2026-05-11

### Changed

- Codex managed AGENTS guidance and exported input adapters now make mode-alias authorization explicit.
- After applying a mode definition, the current/main agent must obey that orchestrator's hard constraints and delegation rules.
- When an applied mode routes scouting or implementation through helper roles, the current/main agent must not bypass those helpers inline.
- Added a shared Codex alias helper so installer-managed notes and exported input adapters stay in sync.

## [0.23.8] - 2026-05-11

### Changed

- Codex installer-managed mode guidance now makes definition-first behavior explicit for fresh/new sessions: an explicit mode alias first reads `.codex/agents/orchestrator-<mode>.toml` when available for the current workspace, otherwise `~/.codex/agents/orchestrator-<mode>.toml`, then the current/main agent simulates that mode and uses subagents according to that definition.
- The same-session reuse rule is now documented: repeated use of the same mode in one session does not need to reload the definition unless the mode, workspace, or definition source changes, the user asks to reload, or the agent is no longer confident it still has the relevant mode details.

## [0.23.7] - 2026-05-11

### Changed

- Codex installer-managed mode guidance now tells the current/main agent to consult installed Codex orchestrator definitions from `.codex/agents/orchestrator-<mode>.toml` first and `~/.codex/agents/orchestrator-<mode>.toml` second, instead of referring to source-repo `opencode/...` paths.
- Expanded the managed Codex mode summaries for `flow`, `simple`, `pipeline`, and `general` so users can rely on the installed guidance more often without restating "read the definition first" in each prompt.

## [0.23.6] - 2026-05-11

### Changed

- Codex installer-managed global and workspace AGENTS notes now tell the current/main agent to adopt explicit mode aliases such as `use flow` and `使用pipeline` directly, rather than first spawning the same-named orchestrator role.
- The managed Codex mode note now includes concise summaries for `flow`, `simple`, `pipeline`, and `general`, plus installed-definition fallback paths so users do not need to restate "read the definition first" on every request.

## [0.23.5] - 2026-05-11

### Added

- Codex global installs now auto-manage the active global AGENTS file (`AGENTS.override.md` when it exists and is non-empty, otherwise `AGENTS.md`) so installed aliases like `use flow` / `使用pipeline` work without manually pasting custom instructions.

### Changed

- Codex exporter input adapters now recognize conservative natural-language leading aliases for the repo's `run-*` modes, including the allowlisted `run-monetize -> orchestrator-general` mapping.
- Codex installer dry runs, backups, and docs now distinguish global `~/.codex` installs from optional `<workspace>/.codex` overrides while preserving workspace AGENTS merges for explicit workspace targets.

## [0.23.4] - 2026-05-04

### Fixed

- Installed `agent-profile --runtime codex` now correctly supports installed OpenCode layouts because `install-codex-config.py` resolves installed versus repo/bundle asset roots, avoiding the erroneous `<installed-root>/opencode` path on Windows.

## [0.23.3] - 2026-05-04

### Fixed

- OpenCode installs now ship the companion runtime installer/model-set assets required for `~/.config/opencode/tools/agent-profile.* install ... --runtime ...`, so installed runtime profile installs work without cloning the repo or extracting a release bundle first.
- `agent-profile.sh` and `agent-profile.ps1` now discover runtime companion assets from both installed OpenCode layouts and repo/release-bundle layouts while preserving the existing workspace-first default runtime targets.
- Corrected installed-path docs and examples for PowerShell and Bash runtime profile commands.

## [0.23.2] - 2026-05-04

### Changed

- `agent-profile.sh` and `agent-profile.ps1` now support workspace-first runtime installs for Codex, Copilot, and Claude via `--runtime`/`-Runtime`, with workspace-derived default targets for runtime-managed profiles.
- Updated docs/examples and validation coverage for the workspace-first runtime install flow.

## [0.23.1] - 2026-05-03

### Fixed

- Fixed local release-bundle packaging to include `scripts/agent_model_profiles.py` and the Codex, Copilot, and Claude runtime model-set directories.
- Extended release-bundle validation/smoke coverage so missing profile helper and runtime model-set assets are caught before release.

## [0.23.0] - 2026-05-03

### Added

- Added opt-in runtime agent model profiles for Codex, Copilot, and Claude Code exporter/installer output, reusing shared OpenCode profile tier maps while keeping canonical source agents free of `model` and `provider` frontmatter.
- Added a shared runtime model profile resolver plus runtime-specific Codex, Copilot, and Claude model-set catalogs for tier-to-model mapping and uniform model overrides.
- Added runtime model profile documentation, README/mapping updates, and regression tests covering resolver validation, exporter model output, source-frontmatter rejection, installer forwarding, and model-set updater behavior.

### Changed

- Extended release/bootstrap installer support and all-local installer flows to forward opt-in agent profile and model-set flags for generated Codex, Copilot, and Claude agent files.
- Updated the managed model-set updater to refresh static runtime catalogs alongside the existing provider-sourced OpenCode model sets.

## [0.22.31] - 2026-04-28

### Changed

- Removed Copilot premium-request lookup/report support from `/usage`, `provider-usage`, and the usage-status UI so the usage surface is scoped to live Codex quota inspection.

## [0.22.30] - 2026-04-27

### Added

- Added `/run-simple` and `orchestrator-simple`, a build-agent-style dispatcher that delegates to subagents without writing run manifests, checkpoint/status files, or `.pipeline-output` artifacts, with `--max-parallel=<n>` concurrency guidance.

## [0.22.29] - 2026-04-27

### Added

- Added CI validation for repo-managed skill frontmatter so YAML-sensitive scalar values are quoted before they can trigger Codex CLI skill warnings.

### Fixed

- Quoted the `frontend-aesthetic-director` skill description frontmatter to avoid Codex CLI YAML warnings from colon-containing scalar text.

## [0.22.28] - 2026-04-27

### Changed

- Repositioned `/run-general` and `orchestrator-general` as a general-purpose dispatcher for mixed coding, maintenance, planning, writing, and analysis tasks instead of a non-coding-only workflow, with `--full-auto` guidance for hands-off path selection.
- Added explicit reviewer `mode = pipeline` / `mode = ad_hoc` handling so pipeline quality gates stay strict while ad hoc review calls can inspect explicit targets without requiring pipeline artifacts.

## [0.22.27] - 2026-04-27

### Changed

- Clarified the frugal workspace agent profile description as cost-conservative routing without changing its mappings.
- Upgraded `atomizer` and `orchestrator-ci` to the `strong` tier in the premium workspace agent profile for higher-rigor task decomposition and CI/release workflow planning.

## [0.22.26] - 2026-04-27

### Changed

- Upgraded `analysis-numerics` to the `strong` tier in the premium workspace agent profile for higher-rigor numerical audits.

## [0.22.25] - 2026-04-27

### Added

- Added a maintainer script for refreshing bundled Anthropic and Google workspace agent model-set catalogs from `models.dev` metadata.

### Changed

- Agent profile validation now derives expected concrete model IDs from bundled model-set JSON files instead of duplicating hardcoded provider model names.

## [0.22.24] - 2026-04-27

### Changed

- Refreshed Anthropic and Google workspace agent model sets to current Claude 4.x and Gemini 3.x model IDs.

## [0.22.23] - 2026-04-27

### Changed

- Replaced project-specific workspace path examples in the agent model profile docs with generic placeholder paths.

## [0.22.22] - 2026-04-27

### Added

- Added deterministic workspace OpenCode agent model profile installers for PowerShell and Bash, with `frugal`, `balanced`, `premium`, and `uniform` modes that generate manifest-managed `.opencode/agents` overrides without modifying canonical source agents.
- Added provider model-set catalogs so profile routing uses logical `mini`, `standard`, and `strong` tiers while concrete model versions stay centralized in `opencode/tools/model-sets/*.json`.
- Added `/agent-profile`, user docs, README quickstart coverage, and validation scripts for profile install/status/clear, dry-run, unmanaged-target protection, and cross-platform installer parity.

## [0.22.21] - 2026-04-24

### Changed

- `codex-imagegen` now defaults delegated Codex CLI runs to `sandbox=danger-full-access` so image outputs can be copied back reliably when bubblewrap-style sandboxing blocks output-path writes.

## [0.22.20] - 2026-04-24

### Added

- Added the repo-managed `frontend-aesthetic-director` skill for frontend UI implementation and polish, including `/uiux` handoff preservation rules, layout/style references, a UI quality rubric, and a compact design brief template.

### Changed

- Frontend UI execution guidance now prefers medium/high effort plus design-system scanning, content realism, responsive/accessibility checks, and rendered browser/Playwright QA over treating UI polish as an automatic xhigh-reasoning task.

## [0.22.19] - 2026-04-23

### Changed

- The `devtools-ux-audit` skill docs now require explicit browser cleanup recovery and tighter not-connected recovery guidance so Chrome DevTools validation flows leave less ambiguous teardown state.
- Root-local scratch output under `.tmp/` is now ignored by default so ad hoc testing files do not show up as untracked worktree noise.

## [0.22.18] - 2026-04-18

### Changed

- `/artgen --gen-provider=codex` now supports generation-specific cost-control flags such as `--gen-effort`, `--gen-size`, `--gen-quality`, and `--gen-iterations`, with conservative defaults that bias toward medium effort, medium quality, single-pass output, and capped numeric raster sizes.
- `codex-imagegen` now supports optional reasoning-effort overrides, default-size fallbacks, numeric size caps, and a single-pass prompt bias so `/artgen` can avoid oversized or retry-heavy image runs by default.

## [0.22.17] - 2026-04-18

### Changed

- `/artgen` now supports optional `--gen-provider=codex` execution mode: the default brief/prompt handoff output stays intact, while the flag routes the final reusable prompt through the repo-managed `codex-imagegen` bridge, uses `danger-full-access` for that delegated image-generation step, and reports generated files separately from the External Handoff Package.
- Renamed the repo-managed `2d-asset-brief` skill to `artgen-scaffold` so the reusable docs-only scaffold matches the `/artgen` surface it supports.

## [0.22.16] - 2026-04-18

### Fixed

- Reverted the latest context-aware `effort-control` server-plugin expansion after local OpenCode validation showed it could trigger a startup crash in non-pure mode; the plugin returns to the prior GPT-5 floor behavior until the host-runtime compatibility issue is understood.

## [0.22.15] - 2026-04-18

### Changed

- `orchestrator-pipeline` now writes a minimal inline `context-pack.json` for clearly trivial successful `--compress` runs instead of always dispatching `@compressor`, keeping the flag/artifact contract unchanged while avoiding extra Stage 8 cost on obvious small-pass runs.
- Exported Copilot, Codex, and Claude orchestrator prompts now compact repeated checkpoint and run-status protocol sections at export time, reducing generated prompt overhead without changing source agent markdown, runtime contracts, or output paths.
- The effort-control plugin now suppresses its automatic GPT-5 medium floor on reliably detected planning-only slash-command runs such as `--dry` and `--decision-only`, while preserving stronger project/session overrides and the existing agent-based exclusions.
- `PROTOCOL_SUMMARY.md` is now smaller again: the global instruction file keeps only the two universal rules, while task traceability, evidence, and resource-control specifics stay in the local agent/protocol docs that already own those contracts.

## [0.22.14] - 2026-04-18

### Changed

- Helper artifact guidance now treats `todo-ledger.json` as the canonical kanban state while `kanban.md` stays a rendered view and `session-guide.md` stays stable repo guidance, with validator and CI coverage to keep those helper contracts aligned.
- Exported orchestrator prompts are leaner: runtime adapters, handoff boilerplate, responsibility matrices, response-mode defaults, and confirm/verbose progress rules are compacted at export time without changing source prompt readability, exporter CLIs, or output paths.
- The pipeline now defaults more aggressively to `ProblemSpec` for small isolated fixes by using an explicit `DevSpec` threshold gate instead of opening Stage 0.5 for most implementation-oriented uncertainty.
- Status runtime writes are cheaper and less chatty: same-run status deltas can flush through `status_runtime_event(event="batch")`, untouched status files are no longer rewritten on every event, redundant heartbeats are coalesced, and orchestrator guidance now treats standalone heartbeats as coarse liveness signals rather than routine per-step updates.
- GPT-5 effort-control exclusions now also cover additional structured low-reasoning roles such as `specifier`, `flow-splitter`, and `codex-account-manager`, reducing unnecessary medium-effort floors on planner-style work.
- Review failures now use in-band `[artifact]`, `[evidence]`, and `[logic]` prefixes so narrow formatting/evidence repairs can avoid broad retry loops when the underlying work is already present, with CI-backed guidance checks to keep reviewer and pipeline prompts aligned.

## [0.22.13] - 2026-04-18

### Changed

- Source agent prompts for `executor`, `peon`, `generalist`, `doc-writer`, `market-researcher`, and `test-runner` now use shorter cleanup and artifact wording while preserving the existing JSON contracts, artifact delimiters, cleanup evidence requirements, and non-clean success semantics.
- Exported Copilot, Codex, and Claude orchestrator prompts now use shorter runtime adapter text plus conservative markdown whitespace compaction, reducing generated prompt overhead without changing exporter CLI behavior or output paths.
- `orchestrator-pipeline` now defaults more small or mechanical runs back to `ProblemSpec`, reserving automatic `DevSpec` generation for behavior-heavier work where the extra traceability is more likely to pay off.
- The GPT-5 effort-control exclusions now also cover `planner`, `router`, and `repo-scout`, so structured planning/routing/scouting steps no longer inherit the default medium-effort floor.

## [0.22.12] - 2026-04-17

### Fixed

- `codex-imagegen` now resolves explicit `codex_command` values, `CODEX_IMAGEGEN_CODEX_COMMAND`, and common Windows npm/fnm Codex CLI install paths before falling back to `codex` on `PATH`, reducing false warnings when OpenCode is launched outside a shell-initialized PATH.
- `codex-imagegen` now supports deterministic `output_path` targets, including `/codex-imagegen --output-path=...` command text, and detects updates to an existing target file.

## [0.22.11] - 2026-04-17

### Added

- Added `/codex-imagegen`, the repo-managed `codex-imagegen` skill, and the `codex-imagegen` OpenCode custom tool for delegating image generation to Codex CLI `$imagegen` using the locally signed-in Codex account and Codex usage limits.

### Changed

- The Codex image generation bridge now enables Codex CLI's `image_generation` feature per run, suppresses non-actionable Codex plugin/analytics/shell-snapshot warning noise where possible, and returns warnings instead of using any API or provider fallback when Codex image generation fails.

## [0.22.10] - 2026-04-17

### Changed

- Codex installer/exporter flows now rewrite repo-managed `opencode/...` references inside generated role instructions to installed absolute paths under the target `.codex` directory, so global installs work reliably on Ubuntu/Linux, macOS, and Windows instead of depending on the original repo-relative layout.
- `install-codex` now mirrors the repo-managed `opencode/` support tree into the target Codex directory and includes that support tree in installer backups, keeping the generated roles and their referenced protocol/skill files aligned across platforms.

### Fixed

- Added regression coverage for Codex support-tree rewriting and installer command forwarding so Linux-style installed paths such as `~/.codex/opencode/...` stay validated in local and CI checks.

## [0.22.9] - 2026-04-16

### Added

- Added `scripts/validate-local-preview-lifecycle-smoke.cjs` plus a minimal `scripts/fixtures/local-preview-smoke/` fixture so the local-preview lifecycle behind `devtools-ux-audit` can be smoke-tested with explicit reachability and teardown checks.

### Changed

- The `devtools-ux-audit` skill, its Windows notes, and `UX_DEVTOOLS_WORKFLOW.md` now make the local-preview/dev-server boundary explicit: browser automation starts only after the target URL is reachable, teardown must verify both URL failure and closed listener port, Linux/Ubuntu/macOS still require the same reachability/cleanup proof, and Windows notes now call out the `npm.cmd` wrapper-PID caveat.
- CI and contributor validation guidance now include the local-preview lifecycle smoke harness, with dedicated macOS and Windows hosted-runner coverage in addition to the existing Ubuntu validation job.

## [0.22.8] - 2026-04-13

### Added

- Added the repo-managed `ui-communication-designer` skill as the communication-first companion to `/uiux`, covering task clarity, trust, labels, instructions, microcopy, and screen-level redesign guidance derived from *UI is Communication*.

### Changed

- The `/uiux` command, `ui-ux-designer` agent, `UI_UX_WORKFLOW.md` protocol, and `ui-ux-bundle` schema/example bundle now explicitly support communication-first redesign and critique inside the existing conceptual UI/UX surface instead of adding a separate command or orchestrator.
- Communication-first `/uiux` outputs and the optional `ui-ux-bundle` export fields now more explicitly preserve a short human-to-human explanation, revised task-flow structure, and targeted microcopy rewrites.

## [0.22.7] - 2026-04-12

### Added

- Added the thin conceptual UI/UX layer with `/uiux`, the hidden `ui-ux-designer` subagent, `UI_UX_WORKFLOW.md`, and the versioned `ui-ux-bundle` schema/example bundle for bounded concept-first UI/UX work.
- `/uiux` now supports repo-owned durable bundle export via `--output-dir=<path>`, writing paired `*.ui-ux-bundle.json` and `*.ui-ux-bundle.md` assets outside `.pipeline-output/` when requested.

### Changed

- The conceptual UI/UX workflow now explicitly supports rough low-fi ASCII/monospace wireframe sketches as a valid structure-first output format.
- Local repo-owned conceptual UI/UX export assets under `output/` are now ignored by default so smoke tests and saved bundles do not clutter the worktree.

## [0.22.6] - 2026-04-10

### Changed

- `/artgen` now behaves as a generic image-generation prompt generator on its normal output surface: it still returns the bounded brief and handoff package, but it now always ends with a `Direct Use Prompt` block that users can paste into an external image-generation tool without extracting prompt text manually.
- The art-generation scaffold, `/artgen` command contract, `artgen-scaffold` skill, and `art-director` source agent no longer foreground internal phase labels or Codex-specific formatting in user-facing wording; they now describe one generic handoff surface plus one directly usable prompt surface.

### Documentation

- Updated the top-level README art-generation pointer so it matches the current scaffold behavior and explicitly points readers at the standardized handoff package plus the final `Direct Use Prompt`.

## [0.22.5] - 2026-04-08

### Note

- `v0.22.5` is the first stable release for this Codex installer/mapping fix set. The intermediate tags `v0.22.2` through `v0.22.4` were withdrawn after CI-only follow-up corrections, and their Codex installer/exporter changes should be treated as superseded by this release.

### Fixed

- Resolved the remaining GitHub-only Pester 5 scope issue in `tests/install-codex.Tests.ps1` by resolving `install-codex.ps1` inside each test case instead of relying on top-level fixture variables, so the PowerShell installer regression suite now runs consistently on both local and hosted runners.

## [0.22.1] - 2026-04-08

### Added

- Added `tests/test_validate_orchestrator_contracts.py` to cover successful projections plus three negative cases: missing `AGENTS.md` entries, commands targeting unknown agents, and unallowlisted `run-*` aliases.

### Changed

- `scripts/validate-orchestrator-contracts.py` now validates the full `AGENTS.md` catalog, all command `agent:` frontmatter targets, and an explicit allowlist for intentional `run-*` aliases such as `run-monetize -> orchestrator-general`.
- CI now runs the new validator unit test coverage in addition to the existing compile-and-script checks for orchestrator contract projections.

## [0.22.0] - 2026-04-07

### Added

- Added `scripts/validate-orchestrator-contracts.py` and wired it into CI so primary orchestrator definitions in `opencode/agents/orchestrator-*.md` remain aligned with command routing, `AGENTS.md`, status-runtime constants, and protocol schema enums.
- Added contributor-facing governance and onboarding docs with `CONTRIBUTING.md`, `SECURITY.md`, `COMPATIBILITY.md`, GitHub PR/issue templates, `CODEOWNERS`, and a dedicated external-dependency risk guide in `docs/external-dependencies.md`.

### Changed

- `skill-manager` now supports `--ref=<tag|sha>` for remote GitHub catalog lookups/installations, and its text output/help now makes mutable default-branch installs explicit.
- `provider-usage` now exposes clearer help text, auth guidance, and fallback-oriented error messages for Codex and Copilot usage lookups.
- CI now runs orchestrator projection checks, status-runtime unit tests, the smoke harness, and helper-tool contract checks locally and in pull requests.

### Fixed

- Added the missing `orchestrator-analysis` allowlist entry to the status-runtime constants and the `run-status` / `checkpoint` schemas so analysis runs no longer fail validation/runtime writes due to stale hard-coded enums.

### Removed

- Removed the experimental `/session-tokens` POC because it reported the latest worktree-matched Codex rollout history rather than a trustworthy current single-session usage signal, and it frequently failed on machines without rollout session data.

## [0.21.14] - 2026-04-07

### Changed

- Shortened the experimental `/session-tokens` toast output to a compact `total | uncached | cached | out` summary and rounded `k`-scale values to whole thousands, so the usage-status UI no longer wraps awkwardly on narrow terminal widths.

## [0.21.13] - 2026-04-07

### Added

- Added `/run-monetize` as a research-capable monetization analysis workflow that reuses the general non-coding orchestrator, prefers a dedicated market-research lane, and steers outputs toward comparable scans, monetization-model comparisons, monthly USD scenarios, and validation experiments.
- Added the hidden `market-researcher` subagent for source-cited web market scans, pricing signal collection, and monetization benchmark gathering.
- Added `/session-tokens` as an experimental no-token POC command in the usage-status plugin that reads local Codex rollout `token_count` events, separates cached vs uncached input, and reports session-level token totals.

### Changed

- `/next-codex-account` now routes through a local OpenCode plugin command path instead of an agent-backed command, making it a true local/no-model slash command in interactive OpenCode sessions.
- `run-monetize` now has a stronger output contract with separate research and synthesis lanes plus a preferred three-artifact structure (`market-scan`, `monetization-scenarios`, `monetization-report`).
- `/session-tokens` output now uses compact `k` / `M` token formatting and explicitly documents why safe subagent token attribution is still unavailable in this POC.

### Fixed

- Claude Code agent export now maps web research tools to the official tool names `WebFetch` and `WebSearch`, so the new market-researcher subagent exports cleanly to Claude.

## [0.21.12] - 2026-04-07

### Documentation

- Kept the shorter README landing page from `v0.21.11`, with clone-based developer install details living in `docs/developer-install.md` and common OpenCode commands surfaced near `Quick Start`.

### Fixed

- Updated the CI README installer-coverage check to validate the combined coverage from `README.md` and `docs/developer-install.md`, so moving clone-install details out of the main landing page no longer trips the coverage gate.

## [0.21.11] - 2026-04-07

### Documentation

- Shortened the README landing page by moving clone-based developer install instructions into `docs/developer-install.md`, trimming the table of contents, surfacing common OpenCode commands near `Quick Start`, and moving maintainer-only release notes back to the end of the README.

## [0.21.10] - 2026-04-07

### Documentation

- Documented the local Codex account management slash commands in the README, including `/codex-account`, `/codex-account-switch`, `/next-codex-account`, and the single-account / no-account behaviors users should expect.

## [0.21.9] - 2026-04-07

### Added

- Added local Codex account management helpers and slash commands for listing accounts, switching to a specific stored account, and rotating to the next stored account without editing `openai-codex-accounts.json` by hand.

### Fixed

- The `usage-status` OpenCode plugin now uses the same Windows `cmd.exe /d /c` Python resolution path as the other Python-backed helpers, so usage refreshes keep working on Windows installs where `python` is only reachable through normal shell resolution.
- `next-codex-account` now returns a stable no-op result when only one stored account is available, and a clear error when no local OpenCode account-selection file exists.

## [0.21.8] - 2026-04-07

### Fixed

- Python-backed OpenCode runtime helpers now execute Windows interpreter probes and Python script launches via `cmd.exe /d /c`, so Windows systems where `python` works through the normal shell resolution path also work inside Bun/OpenCode for `/usage`, `/usage-status-refresh`, `skill-manager`, and `validate-schema`.

## [0.21.7] - 2026-04-07

### Fixed

- Python-backed OpenCode runtime helpers now also probe the Windows `py` launcher (`py -3` / `py`) in addition to `python3` and `python`, so environments where interactive terminals can reach Python via the launcher no longer report a missing interpreter inside the Bun/OpenCode runtime.

## [0.21.6] - 2026-04-07

### Fixed

- Replaced the `Bun.spawnSync` Python-probe stdio settings in `provider-usage`, `usage-status-refresh`, `skill-manager`, and `validate-schema` with a Bun-compatible ignored-stdio form, fixing the `stdio must be array...` runtime failure seen on some OpenCode/Bun builds after installing `v0.21.5`.

## [0.21.5] - 2026-04-07

### Fixed

- `provider-usage`, `usage-status-refresh`, `skill-manager`, and `validate-schema` runtime paths now resolve `python3` before falling back to `python`, so Ubuntu environments without a `python` alias no longer fail when refreshing usage, running `/usage`, or invoking Python-backed tools.
- Python command examples, validator shebangs, and related install/help text now consistently prefer `python3`, reducing copy-paste failures on Linux hosts that only ship `python3`.

## [0.21.4] - 2026-04-07

### Fixed

- `install-plugin-usage-status.sh` and `install-plugin-effort-control.sh` now resolve `python3` before falling back to `python`, so Ubuntu installs can register the TUI plugins in `tui.json` without failing on systems that do not ship a `python` alias.

## [0.21.3] - 2026-04-05

### Changed

- Adjusted the `/run-ci` GitHub Actions guidance wording in `orchestrator-ci` to keep the v5 action-major requirement without tripping the agent-export validator on inline `@v5` text, and rolled the release metadata forward to `v0.21.3`.

## [0.21.2] - 2026-04-05

### Changed

- `/run-ci` GitHub Actions generation guidance now prefers `actions/checkout@v5` and `actions/setup-node@v5` pinned by full commit SHA, and documents runtime compatibility env flags as a temporary fallback instead of the primary fix for Node 20 deprecation warnings.

## [0.21.1] - 2026-04-05

### Changed

- `effort-control` now applies its automatic medium floor to OpenAI and GitHub Copilot `gpt-5*` models instead of only OpenAI `gpt-5.4*`, while still leaving Copilot Claude/Gemini and other non-GPT-5 providers untouched.

## [0.21.0] - 2026-04-05

### Added

- Added the installable OpenCode-only `effort-control` plugin, which floors GPT-5.4 reasoning to at least `medium` for most non-mechanical agents and exposes `/effort`, `/effort-medium`, `/effort-high`, `/effort-max`, and `/effort-clear` for project-default and session-scoped overrides.
- Added clone and release-bundle installers for `effort-control`, including dedicated `install-plugin-effort-control.*` and `bootstrap-install-plugin-effort-control.*` entry points.

### Changed

- `install-all-local` and `bootstrap-install-all-local` now include the `effort-control` plugin as part of the all-in OpenCode bundle, with explicit per-target override support for its plugin entry path.
- CI and release-bundle validation now cover `effort-control` installer dry-runs, README release snippets, and bundle assembly so tagged releases publish the plugin consistently.

## [0.20.0] - 2026-04-05

### Added

- Added `/run-ux` plus the `orchestrator-ux` expert roster (`ux-novice`, `ux-task-flow`, `ux-copy-trust`, `ux-visual-hierarchy`, `ux-judge`) for profile-aware normal-user UX audits with scorecards and report artifacts.
- Added the repo-managed `devtools-ux-audit` skill with a tested cross-platform helper script for deterministic viewport planning during browser-backed UX audits.
- Added `/skill-list`, `/skill-search`, and `/skill-install`, backed by the local `skill-manager` custom tool and the hidden `skill-curator` agent, so OpenCode can browse installed skills and install curated skills from `anthropics/skills` or `github/awesome-copilot`.

### Changed

- `run-flow` and `run-pipeline` now treat git commit helpers as orchestrator workflow actions instead of canonical tasks, so they no longer consume Flow task budget or pipeline task/retry/reviewer quota.
- Modernize-to-pipeline execution now carries explicit delegated worktree/target-project expectations, target-anchored status/checkpoint writes, and stronger handoff guidance for follow-up sessions started from the target repo.
- OpenCode installs now mirror repo-managed skills into `~/.agents/skills` as the global baseline and `~/.claude/skills` as a compatibility mirror while preserving the OpenCode config copy.

## [0.19.1] - 2026-04-05

### Changed

- Refined the `usage-status` OpenCode TUI plugin with short/detail modes, provider filtering (`all`, `codex`, `copilot`), a more stable session sidebar card, and local-time reset timestamps in detail mode.
- Added local cache fallback to `provider-usage` so stale-but-usable quota snapshots can still be surfaced when live Codex or Copilot lookups fail.
- Expanded README guidance for the usage-only install path, usage-status FAQ, mode/filter commands, and cache behavior.

## [0.19.0] - 2026-04-05

### Added

- Added `/usage` plus the hidden `usage-inspector` subagent so OpenCode can report live Codex quota windows and GitHub Copilot premium-request usage from local auth state.
- Added the installable `usage-status` OpenCode TUI plugin, which can show a compact Codex/Copilot quota footer and exposes `/usage-status`, `/usage-status-on`, `/usage-status-off`, and `/usage-status-refresh` commands.
- Added focused `usage-only` installers and release-bundle bootstraps so users can install just the usage command/tooling and TUI plugin without taking the full pipeline.

### Changed

- `provider-usage` now reads Codex CLI auth from `~/.codex/auth.json`, renders quota output with ASCII progress bars, and performs live GitHub Copilot quota lookup through `gh auth` when available.
- OpenCode usage-status installation now follows the official TUI plugin contract by registering the plugin in `tui.json` and shipping a target-exclusive `default export { id, tui }` module entry.
- README, CI coverage, and release-bundle assembly now include the usage-status plugin and usage-only installers so future releases validate and publish these assets automatically.

## [0.18.2] - 2026-04-04

### Fixed

- Release bundles now include `scripts/install-codex-config.py`, which `install-codex.*` needs for managed Codex config merges. This fixes the published `all-local` and Codex release-bundle install paths.

## [0.18.1] - 2026-04-04

### Changed

- Codex install now merges managed agent sections into existing `config.toml` instead of overwriting the whole file, while still forcing `features.multi_agent = true`, refreshing managed `[agents]` settings from this repo, backing up existing files, and removing stale managed Codex agent definitions.
- Codex exporter now writes `name`, `description`, and `developer_instructions` into each generated standalone agent TOML so the output matches the current official Codex custom-agent file schema.
- OpenCode core install now records a manifest of managed files so later installs can remove stale repo-managed `agents/commands/protocols/tools` files without deleting unrelated user-created files in the target directory.

## [0.18.0] - 2026-04-03

### Added

- Added `session-guide`, `kanban`, and `emit-handoff` helper commands plus supporting subagents for root-tracked repo guidance, kanban management, and run-local cross-session handoff output.
- Added `flow-splitter` and a dedicated `FlowTaskList` schema so `orchestrator-flow` can delegate bounded task decomposition instead of keeping it inside the orchestrator.
- Added `handoff-pack.schema.json`, `flow-task-list.schema.json`, and starter examples for session guide, kanban, flow task lists, and handoff artifacts.

### Changed

- Simplified execution routing by merging `executor-core` and `executor-advanced` into a single `executor` agent with handoff-controlled `effort`, `verification`, and `repair_budget` settings.
- Reworked `orchestrator-flow` to delegate ProblemSpec extraction and task decomposition, support optional handoff/kanban terminal helpers, and allow a single bounded same-task recovery path without adding retry loops.
- Clarified artifact ownership: root-tracked files such as `session-guide.md`, `todo-ledger.json`, and `kanban.md` now stay outside `.pipeline-output/`, while run-local handoff artifacts remain under the run directory.
- Exporters and docs now enforce runtime-owned model/provider selection; source agent frontmatter must not define `model` or `provider`.

### Removed

- Removed the redundant dual-executor naming split (`executor-core` / `executor-advanced`) and related schema/export assumptions.

## [0.17.0] - 2026-04-02

### Removed

- **Init pipeline**: Removed `orchestrator-init`, `/run-init` command, and all supporting artifacts (`INIT_TEMPLATES.md`, `INIT_EXAMPLE.md`, `INIT_TO_PIPELINE.md`). The init pipeline's outputs were only consumed by `orchestrator-pipeline` and had no auto-update mechanism, making them a stale-docs liability. Greenfield planning is covered by `/run-spec` and `/run-pipeline`.
- **Target bootstrap in modernize**: Removed `--init-target` flag and Stage 4.5 (Target Bootstrap) from `orchestrator-modernize`. Users should create target directories manually before running execution modes.
- Removed `MODERNIZE_TARGET_BOOTSTRAP_EXAMPLE.md` (documented the removed `--init-target` workflow).
- Removed `orchestrator-init` from `AGENTS.md`, schema enums (`checkpoint.schema.json`, `run-status.schema.json`), and status runtime constants.

## [0.14.0] - 2026-04-01

### Changed

- Claude Code orchestrator export now uses native Agent tool delegation instead of inlining all stages into a single agent context. Orchestrators receive the `Agent` tool and a delegation protocol adapter that maps `@agent-name` references to `Agent(subagent_type=...)` calls.
- Resolved `@agent-name` references are listed in each orchestrator's generated adapter so the agent knows which subagents are available.
- Updated `docs/claude-mapping.md` to document the new delegation approach, replacing the previous inline-only orchestrator limitation.

## [0.13.0] - 2026-04-01

### Changed

- Slim `PROTOCOL_SUMMARY.md` from ~974 to ~200 tokens; orchestrator-only content (status layer, schema paths, todo ledger) removed from global instructions, saving ~9,300 tokens/run across subagent calls.
- Make Compressor (Stage 8) opt-in via `--compress` flag; most runs do not reference prior context packs.
- Trim boilerplate across all 8 orchestrators: condensed flag parsing, status protocol, confirm/verbose protocol, and agent responsibility matrix sections (-435 lines).
- Inline Stage 9 summary in `orchestrator-pipeline` (eliminates one subagent call).
- Default `orchestrator-flow` scout mode to `skip` instead of `auto`; Flow targets small tasks where the orchestrator's direct tool access is sufficient.

### Removed

- `status-cli/` component and related planning docs (`docs/status-cli-plan.md`, `docs/status-cli-roadmap.md`). The status contract (schemas, examples, validation) is preserved; only the unused CLI consumer is removed.

## [0.12.6] - 2026-03-30

### Changed

- Bootstrap release installers now keep GitHub Artifact Attestation logs quiet by default and only print attestation details when users opt in with `--verbose` on Bash or `-Verbose` on PowerShell.

## [0.12.5] - 2026-03-30

### Changed

- Bootstrap release installers now verify GitHub Artifact Attestations automatically when `gh` is available, while preserving the existing checksum-only path on machines that do not have GitHub CLI installed.

## [0.12.4] - 2026-03-30

### Changed

- `/run-ci` and the paired CI/CD protocol docs now treat software supply chain integrity as a first-class design requirement, including pinned GitHub Actions, least-privilege workflow permissions, immutable release inputs, and explicit release verification gates.

### Fixed

- Release publishing workflows now pin artifact transfer actions by full commit SHA, disable persisted checkout credentials, re-verify bundle checksums after artifact download, and require GitHub Artifact Attestation verification before publishing release assets.

## [0.12.3] - 2026-03-27

### Fixed

- Status runtime now validates `agent.started` payloads at the entry point and reports missing `agent_id` and/or `agent` fields with a single clearer error before deeper runtime processing begins.

## [0.12.2] - 2026-03-25

### Changed

- `README.md` install guidance now uses a more consistent copy-paste-first structure across release targets, keeps clone-based install guidance scoped to developers, and clarifies the all-in-one Bash flow.
- Codex install docs now explain that the standard install path already backs up and overwrites existing `.codex` files, instead of making users reach for a separate overwrite flag.

### Fixed

- Codex install and bootstrap scripts now enable overwrite mode by default, matching the behavior users already expect from the other installers while preserving backups and backward-compatible force flags.
- Bash release install one-liners now use safer command chaining, and the README version-sync helper now matches the updated install snippet layout.

## [0.12.1] - 2026-03-25

### Changed

- `README.md` now leads with release / no-clone installation, adds a copy-paste Ubuntu/macOS/Linux all-in-one one-liner, and keeps clone-based install as a secondary path.
- Release-bundle install sections in `README.md` now use collapsible blocks, and pinned bootstrap examples are synchronized from `VERSION` via `scripts/sync-readme-version.py` so future version bumps are easier to keep in sync.
- `README.md` now folds more maintainer/reference sections into collapsible blocks and clarifies the Bash-first Ubuntu/macOS/Linux all-in-one bootstrap flow.
- Flow and pipeline orchestrator guidance now explicitly asks visible subagent attempts to use unique `agent_id` values or include disambiguating metadata when a base id is reused.

### Fixed

- Status runtime agent tracking now preserves multiple visible agent records when the same base `agent_id` is reused, instead of silently overwriting prior nodes in `status-cli`.
- Release bundle packaging now normalizes shipped shell/Python script permissions, and the all-in-one Bash bootstrap installer reapplies readable/executable bits after extraction to avoid Linux permission-denied install failures.
- `scripts/sync-readme-version.py` now covers the added all-in-one shell snippet so README release examples stay aligned with `VERSION`.

## [0.12.0] - 2026-03-24

### Added

- OpenCode status runtime plugin support is now documented and release-published as a first-class install target alongside the core asset bundle.

### Changed

- OpenCode entry-contract guidance and release examples now align around the runtime-owned status plugin entry path and updated install shape.
- Deterministic pipeline glue helpers now centralize run-resolution and flag-contract checks, with a smoke harness covering the status runtime integration path.

## [0.11.5] - 2026-03-23

### Changed

- Flow and Pipeline guidance now treat the selected output path as a base output root, with fresh runs writing checkpoint, status, and artifacts into run-specific subdirectories and resume-only flows preferring the newest compatible run.

### Fixed

- `status-cli` now rejects non-canonical status JSON instead of guessing through legacy layouts, and its project-root discovery now prefers the newest run-specific output directory under `.pipeline-output/`.

### Added

- `docs/status-runtime-plugin-spec.md` describing a small runtime-owned plugin that can emit canonical run/task/agent status artifacts from lifecycle events.

## [0.11.4] - 2026-03-20

### Changed

- Status contract and orchestrator guidance now require visible `AgentStatus` records for delegated stage-scoped subagents such as `repo-scout`, even before canonical task ids exist.

### Fixed

- `status-cli` terminal and web graph views now show run-scoped agents directly under the run instead of silently dropping task-less subagents from the visualization.

## [0.11.3] - 2026-03-20

### Fixed

- Claude bootstrap install examples in `README.md` now use directly downloadable bootstrap scripts, so the documented copy-paste install flow works as written for global and optional project-local targets.

## [0.11.2] - 2026-03-20

### Fixed

- Claude Code docs now correctly treat the global `~/.claude/agents` directory as the default install target, with project-local `.claude/agents` documented only as an explicit override.

## [0.11.1] - 2026-03-20

### Fixed

- Claude support follow-up fixes now align README pinned release examples and stabilize the new CI regressions for Claude exporter frontmatter and stale generated-file cleanup coverage.

## [0.11.0] - 2026-03-19

### Added

- Claude Code support docs covering project-local `.claude/agents` installs, release-bundle bootstrap copying, and mapping guidance alongside existing OpenCode, Copilot, and Codex docs.
- `docs/claude-mapping.md` documenting source-of-truth usage, frontmatter/tool mapping, input adaptation, and current inline/no-nested-subagent guidance for Claude Code orchestrators.
- Claude Code exporter/install/bootstrap support with release-bundle and CI coverage via `scripts/export-claude-agents.py`, `scripts/install-claude.*`, and `scripts/bootstrap-install-claude.*`.

### Changed

- Root docs and exporter notes now describe Claude Code output generation alongside Copilot and Codex outputs.
- `status-cli/README.md` now includes a short cross-repo `web serve` cheatsheet for monitoring a fresh `run-*` execution from another repository via `.pipeline-output/<run-id>/...`.

## [0.10.1] - 2026-03-19

### Changed

- All primary `run-*` orchestrator prompts and command docs now align to runtime/plugin-owned status artifacts under `<run_output_dir>/status/`, so fresh runs can produce inputs that `status-cli` can inspect across repos.

### Fixed

- `checkpoint.schema.json` now includes `orchestrator-spec`, allowing `/run-spec` checkpoint smoke validation to pass end-to-end.

## [0.10.0] - 2026-03-18

### Added

- Status-layer MVP contract artifacts, schemas, examples, and validation coverage for the in-repo pipeline status layout.
- In-repo read-only `status-cli` inspection flows for run summaries, record views, visual inspection, task and agent listing, terminal dashboard triage, self-contained HTML export, and a loopback-only localhost web viewer with bounded refresh controls.

### Changed

- Status CLI planning and handoff docs now allow bounded same-repo localhost viewing and HTML export while keeping the feature read-only, local-only, non-controlling, and outside hosted/remote runtime scope.
- `--full-auto` guidance is now aligned across README, protocol docs, command docs, and orchestrator prompts around pause suppression, explicit flag precedence, bounded recovery, hard blockers, and cleanup boundaries.

### Fixed

- Release publishing job now checks out the repo before invoking `gh release`, so tag and manual releases can publish assets successfully.

## [0.9.1] - 2026-03-17

### Changed

- Release workflows now use Node 24-compatible artifact actions and GitHub CLI publishing to avoid Node 20 deprecation warnings in release jobs.

## [0.9.0] - 2026-03-17

### Added

- Resource-aware DispatchPlan schema coverage with positive and negative fixtures for browser, server, and bounded process routing.
- CI checks for dispatch-plan resource validation and prompt/documentation coverage of the resource-control contract.

### Changed

- Pipeline and Flow orchestration docs now require resource classification, conservative heavy-task scheduling, and teardown evidence for lingering resources.
- Router, executor, test-runner, and reviewer prompts now treat cleanup as part of task completion and enforce teardown evidence for heavy batches.
- DispatchPlan batches now carry required resource metadata fields for `resource_class`, `max_parallelism`, and `teardown_required`.

## [0.8.0] - 2026-03-12

### Added

- `--full-auto` preset for `run-pipeline`, `run-modernize`, and `run-flow` to bundle stronger hands-off execution defaults.

### Changed

- Pipeline autopilot guidance now explicitly continues runnable work and performs a bounded non-hard blocker recovery pass before surfacing a stop condition.
- Flow documentation now exposes a consistent `--full-auto` hands-off preset with forced repo scouting by default.
- README now includes a comparison table and rule-of-thumb guide for choosing between `--autopilot` and `--full-auto`.

## [0.7.0] - 2026-03-11

### Added

- CI now covers mocked bootstrap dry runs for shell and PowerShell installer flows across base, Copilot, and Codex targets.

### Changed

- PowerShell CI validation now handles expected non-zero exit codes correctly when checking switch-like target rejection.
- Release bundle build and validation now run through a reusable release workflow.
- Pipeline docs now use `effort` terminology instead of `budget` for non-committee execution semantics.
- Committee docs now default omitted `--budget` handling to `medium`.
- General pipeline docs no longer carry a budget-ignore contract.

### Fixed

- README pinned-version checks now validate documented versions against `VERSION`.
- Exporters now use deterministic, bounded frontmatter parsing.
- Generated Copilot and Codex output cleanup in CI is now bounded to expected stale files.

## [0.6.1] - 2026-03-10

### Changed

- Release bundles now include `README.md`, `CHANGELOG.md`, and `LICENSE` at the archive root.
- CI now simulates the release bundle layout to catch missing packaged files before tagging.
- PowerShell install/bootstrap scripts now reject switch-like target values and use safer parameter forwarding for nested installer calls.

## [0.6.0] - 2026-03-10

### Added

- `DevSpec` schema, examples, and pipeline/spec workflow documentation for human-readable, pipeline-consumable development specs.
- `orchestrator-spec` plus `/run-spec` for review-first spec generation.
- Task-level `trace_ids` support for linking execution back to stories, scenarios, acceptance criteria, and test cases.
- Codex multi-agent export CLI (`scripts/export-codex-agents.py`) that converts `opencode/agents/*.md` into `.codex/config.toml` plus per-role TOML files.
- Codex mapping documentation (`docs/codex-mapping.md`).
- Codex install/bootstrap scripts for local and release-bundle installation.

### Changed

- `orchestrator-pipeline`, `planner`, `atomizer`, `reviewer`, and `doc-writer` now understand optional `DevSpec` artifacts and canonical spec output paths.
- Modernize execution semantics now distinguish non-interactive `--autopilot` from phase traversal, persist reusable handoff contracts, and document source-planning versus target-implementation ownership.
- Modernize flow now documents `--init-target` target bootstrap behavior and reuses init docs as target-project constraints before implementation handoff.
- README and protocol docs now include spec handoff, modernize handoff, and end-to-end workflow examples.

## [0.5.6] - 2026-03-06

### Added

- `--autopilot` flag guidance across Flow/Pipeline command and protocol docs, including non-interactive precedence over `--confirm`/`--verbose`.
- Resume-only invocation documentation for `/run-flow --resume` and `/run-pipeline --resume`.

### Changed

- Flow/Pipeline orchestrator docs now specify checkpoint-based prompt hydration (`checkpoint.user_prompt`) when `--resume` is used without a new prompt.
- README flag guidance now includes resume-only and autopilot usage with updated examples.

## [0.5.5] - 2026-03-05

### Added

- `--require-jsonschema` flag for `opencode/tools/validate-schema.py` to enforce full-schema validation when required.

### Changed

- CI now installs `jsonschema` and runs modernize handoff schema checks with `--require-jsonschema`.
- Bash bootstrap installers now parse GitHub release JSON via structured Python parsing instead of `grep|cut|head` chains.
- Root `.gitignore` now uses targeted local artifact patterns in place of broad wildcard rules.

### Fixed

- Added `orchestrator-general` to `checkpoint.schema.json` orchestrator enum to align schema with active orchestrators.

## [0.5.4] - 2026-02-23

### Added

- Optional `modernize -> pipeline` execution handoff contract schema (`modernize-exec-handoff.schema.json`) with valid/invalid example payloads.
- `scripts/validate-modernize-handoff.py` helper for validating handoff payloads against the schema.

### Changed

- `orchestrator-modernize` now supports planning plus optional phase execution handoff modes (`plan+handoff`, `phase-exec`, `full-exec`) delegated to `@orchestrator-pipeline`.
- `orchestrator-pipeline` now documents compatibility rules for phase-scoped modernization execution handoffs.
- CI now validates modernize handoff schema examples (positive + negative case), and release bundles now include the handoff validation script.

## [0.5.3] - 2026-02-20

### Changed

- Copilot install scripts now default to `~/.copilot/agents` to match current Copilot CLI custom agent resolution.
- Updated Copilot install docs to use `~/.copilot/agents` as the default target.

## [0.5.2] - 2026-02-20

### Changed

- Copilot PowerShell installer default target now follows `${XDG_CONFIG_HOME:-~/.config}/copilot/agents` across platforms.
- Copilot export filename generation now uses source file stem with `.agent.md` suffix for deterministic CLI agent IDs.

### Fixed

- Updated repository docs to align Copilot install location and custom agent filename rules with GitHub Copilot docs.

## [0.5.1] - 2026-02-15

### Added

- Modernize depth profiles via `--depth=lite|standard|deep` for verbosity control.
- A stricter summarizer output contract for concise final responses.

### Changed

- Orchestrators now default to concise output and only provide stage-by-stage progress in `--confirm`/`--verbose` modes.
- Command docs were simplified to quick-reference flags and now point to orchestrator/protocol docs as the source of truth.
- Modernize templates now use shorter executive summaries and remove fixed per-section word minimums.

### Fixed

- Aligned checkpoint resume validation and test/retry semantics across orchestrator and protocol docs.
- Clarified artifact filename policy between fixed-name docs and task-id metadata usage.

## [0.4.0] - 2026-02-13

### Added

- General-purpose non-coding orchestrator (`opencode/agents/orchestrator-general.md`).
- General-purpose command entrypoint (`opencode/commands/run-general.md`).

### Changed

- General-purpose pipeline now ignores `--budget` and focuses on task-fit routing.
- General-purpose artifact outputs are now explicitly required to be human-friendly.

## [0.3.0] - 2026-02-13

### Added

- VS Code Copilot agent export CLI (`scripts/export-copilot-agents.py`).
- Copilot installers (`scripts/install-copilot.ps1`, `scripts/install-copilot.sh`).
- Copilot bootstrap installers (`scripts/bootstrap-install-copilot.ps1`, `scripts/bootstrap-install-copilot.sh`).
- Copilot mapping documentation (`docs/copilot-mapping.md`).

### Changed

- CI now validates Copilot export/install dry-run paths.
- Release bundle now includes Copilot installer/export scripts.

## [0.2.0] - 2026-02-13

### Changed

- Removed per-agent model mapping management (`agent-models.json` and sync script).
- Switched model selection to runtime-driven behavior in docs and workflows.
- Neutralized executor naming and routing schema fields (`executor-core`, `executor-advanced`, `advanced_reserve_tasks`).

## [0.1.1] - 2026-02-06

### Added

- CI workflow (`.github/workflows/ci.yml`) for PR/main validation.
- Checksum verification in bootstrap installers (`scripts/bootstrap-install.ps1`, `scripts/bootstrap-install.sh`).

### Changed

- Added root `VERSION` source-of-truth and enforced release tag alignment in workflow checks.
- Pinned GitHub Actions in workflows to immutable commit SHAs.

## [0.1.0] - 2026-02-06

### Added

- Initial release automation with release bundle publishing.
- Local installers (`scripts/install.ps1`, `scripts/install.sh`) and no-clone bootstrap installers.
- Agent model mapping config (`agent-models.json`) and sync script (`scripts/update-agent-models.py`).
