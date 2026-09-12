# Instruction loading integration report

This report covers the bounded instruction-loading patch from the baseline at `b028384e46c7847de84f9270b0f10ca3dbb0a082`. Counts are Unicode code points. They are static source and required-read measurements, not token, cache, latency, invocation, runtime-read, or model-compliance measurements.

## Changes and retained boundaries

- The five capability descriptions were shortened while retaining their primary deliverable and strongest exclusion. Full art detail moved to `skills/artgen-scaffold/references/full-handoff.md`; full/scored communication detail is selected through `references/output-template.md` and `references/rubric.md`; durable UI/UX continues to use `protocols/UI_UX_WORKFLOW.md` and its schema.
- `art-director` and `ui-ux-designer` no longer duplicate full-mode contracts. Their compact paths are self-contained and their deeper branches name the canonical file to read before drafting. Integrated static review restored the direct leaf's unqualified-sprite default. Reviewer repair also preserved its existing `asset style`, `size input or stated size assumption`, and reusable `prompt` labels through entry-specific guidance in the shared full-handoff reference.
- Repository and generated Codex guidance retain entry, authority, profile preflight, leaf-worker, evidence, materiality, budget, stop, and Goal boundaries. Detailed dispatch, repair/resume, and recovery procedures now require the installed canonical protocols before the relevant action. `scripts/install-codex-config.py` supplies the actual support root to both global and workspace blocks.
- The agent catalog shape, role identities, mode aliases, model/profile assignments, reasoning/recovery behavior, `scripts/export-codex-agents.py`, the detailed public mapping/README guidance outside the managed block, and the single-path frontend/audit roots were retained. Changing those areas offered no loading benefit or would expand into parser/runtime policy work.

## Static character comparison

| Discovery/root source | Before | After | Delta |
|---|---:|---:|---:|
| art description | 360 | 152 | -208 |
| UI/UX description | 376 | 152 | -224 |
| communication description | 417 | 155 | -262 |
| frontend description | 407 | 166 | -241 |
| audit description | 392 | 144 | -248 |
| art skill root | 7,311 | 3,069 | -4,242 |
| UI/UX skill root | 6,663 | 3,564 | -3,099 |
| communication skill root | 6,394 | 2,837 | -3,557 |
| frontend skill root | 7,799 | 7,556 | -243 |
| audit skill root | 5,838 | 5,590 | -248 |

| Always-loaded/generated source | Before | After | Delta |
|---|---:|---:|---:|
| repository `AGENTS.md` | 13,066 | 8,255 | -4,811 |
| global managed block | 12,018 | 6,579 | -5,439 |
| workspace managed block | 11,926 | 6,487 | -5,439 |
| global-guidance generator | 20,066 | 14,580 | -5,486 |
| installer source | 67,982 | 68,401 | +419 |
| `docs/codex-mapping.md` | 40,305 | 34,866 | -5,439 |

The generated role comparison used the same `/baseline/agents-pipeline-support` rewrite root as the preserved baseline.

| Generated Codex role | Before | After | Delta | Current second entry |
|---|---:|---:|---:|---|
| `art-director` | 8,296 | 3,296 | -5,000 | full mode reads `skills/artgen-scaffold/references/full-handoff.md` |
| `ui-ux-designer` | 6,914 | 4,118 | -2,796 | durable mode reads `protocols/UI_UX_WORKFLOW.md`; communication work reads `skills/ui-communication-designer/SKILL.md` |
| `generalist` | 7,337 | 7,337 | 0 | its independent prompt-only injection is unchanged |
| `executor` | 9,114 | 9,114 | 0 | its independent frontend routing is unchanged |

## Static required-read sets

| Scenario and entry | Before | After |
|---|---:|---:|
| S04 copy-only, skill | communication root: 6,394 | communication root: 2,837 |
| S04 full scored flow, skill | root + template + rubric: 9,639 | root + template + rubric: 8,440 |
| S06 prompt-only, skill | art root: 7,311 | art root: 3,069 |
| S06 prompt-only, direct leaf | art leaf: 7,937 | art leaf: 2,903 |
| S07 full art, skill | art root: 7,311 | root + full reference: 8,026 |
| S07 full art, direct leaf | art leaf: 7,937 | leaf + full reference: 7,860 |
| S10 compact desktop concept, skill | UI/UX root: 6,663 | UI/UX root: 3,564 |
| S10 compact desktop concept, direct leaf | UI/UX leaf: 6,383 | UI/UX leaf: 3,621 |
| S11 durable file bundle, skill | root + protocol + schema: 67,822 | root + protocol + schema: 64,723 |
| S11 durable file bundle, direct leaf | leaf + protocol + schema: 67,542 | leaf + protocol + schema: 64,780 |
| Local UI verification, base | frontend root: 7,799 | frontend root: 7,556 |
| Local UI, correction-strategy selection | root + layout/style playbook: 16,946 | root + layout/style playbook: 16,703 |
| Local UI, detailed state/anti-slop pass | root + polish checklist: 12,380 | root + polish checklist: 12,137 |
| Local UI, rendered QA unavailable after detailed pass | root + checklist + rubric: 17,605 | root + checklist + rubric: 17,362 |
| S12 formal gate | audit root: 5,838 | audit root: 5,590 |

For S11, the 16,055-character example is read only when structural guidance is needed. A communication-focused durable branch enters through the communication skill root, then selects its template and rubric only for full/scored work. For local UI work, the 9,147-character layout/style playbook is selected when choosing a correction strategy, layout archetype, or visual style; the 4,581-character checklist supports the detailed state and anti-slop pass. Only unavailable rendered QA adds the 5,225-character rubric. A path selecting all three references totals 26,752 characters before and 26,509 after. S12 conditionally adds the 1,561-character Chrome reference and/or 1,408-character Windows reference; missing required mobile evidence still yields an incomplete or `not_evaluable` gate.

## Verification and delivery

Baseline T1 ran seven focused guidance/export tests with no failures. T2 reported sync/installer/runtime-exporter coverage passing; T3 reported the full 69-test Codex install/export suite and six catalog checks passing. The combined tree then ran:

- `python3 -m unittest tests.test_sync_codex_skills tests.test_codex_skill_installer_integration tests.test_codex_install_export tests.test_runtime_exporters tests.test_export_prompt_compaction` — 125 passed in 28.023 seconds. Its `cache seeding failed` text is an expected negative fixture; exit status was zero.
- `python3 scripts/validate-skill-frontmatter.py --skills-dir skills` — 16 passed.
- `python3 scripts/validate-helper-contracts.py` — both checks passed.
- `python3 scripts/validate-orchestrator-contracts.py` — ten orchestrator projections and the mode-alias catalog passed.
- A strict 46-role Codex export after the static-sprite repair confirmed the direct leaf rule and custom-root full-handoff reference. Reviewer repair then extended the existing installer assertion for all entry-specific art labels; all nine installer integration tests and another strict 46-role custom-reference export passed. Temporary outputs were cleaned.

A supplementary temporary install/export probe created a custom Codex home, user-skills root, workspace, support trees, global/workspace guidance, and Codex/Claude/Copilot export roots with spaces. Discovery skills, support files, branch references, generated guidance, and direct leaf paths resolved before its final custom assertion. The first attempt was rejected before execution because shell cleanup was disallowed. One harness correction replaced an incorrect expectation that the UI leaf directly names the communication template; the actual two-step route is leaf to skill root, then branch-specific template/rubric. A later assertion treated the deliberately preserved generated `# Source:` header as an unresolved developer-instruction reference, so the supplementary probe was stopped under the harness bound. Both executed temporary probes were removed automatically. The passing existing suites remain the authoritative integration evidence, including custom roots, paths with spaces, Windows rewrite, and Codex/Claude/Copilot support sync/export.

No baseline product failure was recorded. Integrated static review found the direct art leaf's static-sprite reachability gap, and reviewer comparison found three exact direct-entry label compatibility gaps in the shared full reference. Both were static instruction-contract findings; their smallest repairs passed targeted install/export checks. No live model misbehavior was observed and no new product failure remains. The manual S01–S15 behavior cases remain `not run`; no model, browser, image, UI fixture, external API, active install, profile change, Goal, commit, or release operation ran.

Deployment uses the existing mechanisms. A normal global update must refresh discovery skills, the support tree, and global guidance. Because source leaf roles changed, existing configured workspaces also need their normal `set` refresh using the same profile and model set so leaf exports are regenerated. Do not use `clear` or `reset` for this update.

Review: the normal post-synthesis gate identified two material gaps in direct-art field-label compatibility and frontend read accounting. Both were corrected in one bounded cycle; the single re-review passed with no required followups.
