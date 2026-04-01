# Token Optimization Report

Date: 2026-04-01

## Executive Summary

Analysis of the agents pipeline token consumption identifies **~13,000-25,000 tokens/run** of savings available without affecting pipeline quality. The largest single optimization is slimming `PROTOCOL_SUMMARY.md`, which is loaded into every subagent call but contains content only orchestrators need.

## Current Token Budget (Typical `orchestrator-pipeline` Run)

| Source | Est. Tokens | Notes |
|--------|-------------|-------|
| PROTOCOL_SUMMARY.md (global) | ~974 × 12 calls = **11,700** | Loaded for every agent call |
| Orchestrator prompt | ~7,600 | Loaded once |
| Subagent prompts (all stages) | ~4,000 total | Loaded once each |
| Handoff content | ~2,000-10,000/call | Varies by stage |
| Tool results | ~10,000-50,000+ | Dominant cost for repo-scout and executors |

## Findings

### 1. PROTOCOL_SUMMARY.md Global Tax

`PROTOCOL_SUMMARY.md` (~974 tokens) is injected into **every** agent call via `opencode.json` instructions. Most of its content (Status Layer, Schemas list, Todo Ledger) is irrelevant to subagents like specifier, planner, atomizer, router, executors, reviewer, compressor, and summarizer.

**Impact:** ~774 wasted tokens × 12 calls = **~9,300 tokens/run**

### 2. Orchestrator Prompt Duplication

These sections are copy-pasted across 7-8 orchestrators with minimal variation:

| Duplicated Section | Occurrences | Per-copy Size |
|--------------------|-------------|---------------|
| Handoff Protocol (GLOBAL) | 8 | ~400-600 tokens |
| Agent Responsibility Matrix | 7 | ~300-500 tokens |
| Flag Parsing Algorithm | 8 | ~100 tokens |
| RUN STATUS PROTOCOL | 7 | ~200-400 tokens |
| CONFIRM/VERBOSE PROTOCOL | 7 | ~100-200 tokens |

Most orchestrators list the full 14-agent responsibility matrix even when they only use 4-6 agents.

### 3. Compressor Stage Runs Unconditionally

Stage 8 (Compressor) produces `context-pack.json` on every pipeline run. This artifact is only useful when future runs need to reference prior context, which is rare.

**Impact:** ~2,500 tokens/run wasted on most runs.

### 4. executor-core and executor-advanced Are Identical

```diff
< name: executor-core
< description: Executes one atomic task using a cost-effective execution profile.
---
> name: executor-advanced
> description: Executes one atomic task using a high-rigor execution profile.
```

The remaining ~45 lines of prompt content are character-for-character identical. Differentiation should happen at the runtime/model layer, not the prompt layer.

## Optimization Tiers

### Tier 1: Zero Quality Risk

| Optimization | Est. Savings | Method |
|--------------|-------------|--------|
| Slim PROTOCOL_SUMMARY.md | ~9,300/run | Remove orchestrator-only content |
| Compressor opt-in (`--compress`) | ~2,500/run | Skip Stage 8 by default |
| Trim orchestrator boilerplate | ~1,500/run | Deduplicate repeated sections |
| **Tier 1 Total** | **~13,300/run** | **~15-20% reduction** |

### Tier 2: Low Quality Risk (Needs Testing)

| Optimization | Est. Savings | Method |
|--------------|-------------|--------|
| Inline Summarizer | ~2,500/run | Orchestrator generates summary directly |
| Merge Specifier stages (0 + 0.5) | ~3,000/run | One call produces ProblemSpec + DevSpec |
| Flow default scout=skip | ~2,500/run | Skip repo-scout for small tasks |
| **Tier 2 Total** | **~8,000/run** | **~10-12% additional** |

### Tier 3: Medium Risk (Needs A/B Testing)

| Optimization | Est. Savings | Method |
|--------------|-------------|--------|
| Merge Planner + Atomizer | ~4,000/run | Single call for plan + task decomposition |
| **Tier 3 Total** | **~4,000/run** | **~5% additional** |

### Combined Total: ~25,300 tokens/run (~30-35% reduction)

---

## Status-CLI Evaluation

### Component Profile

| Metric | Value |
|--------|-------|
| Location | `status-cli/` |
| Production code | 2,956 lines (Python) |
| Tests | 1,756 lines |
| Web viewer | 1,928 lines (JS + CSS) |
| Documentation | ~40 KB across 4 docs |
| Git commits | 18 dedicated commits |

### Integration Analysis

- **Zero hard dependencies**: Nothing in the pipeline imports, calls, or requires status-cli
- **Zero CI integration**: GitHub workflows do not invoke it
- **Documentation-only references**: 7 command docs mention it passively ("status artifacts are written for status-cli")
- **Standalone consumer**: Reads JSON files that the pipeline writes independently
- **Token cost**: Negligible (~50 tokens across all command doc mentions)

### Recommendation: Remove

Rationale:
1. The pipeline operates identically without it
2. ~500 KB of code/tests/assets to maintain with no operational integration
3. Status JSON files are human-readable and can be inspected with standard tools (`cat`, `jq`)
4. The planning docs (`status-cli-plan.md`, `status-cli-roadmap.md`) occupy context without delivering value
5. If inspection is ever needed, `jq '.status' .pipeline-output/*/status/run-status.json` accomplishes the same goal

### If Removing

Files to delete:
- `status-cli/` (entire directory)
- `docs/status-cli-plan.md`
- `docs/status-cli-roadmap.md`
- `docs/status-implementation-checklist.md`
- `docs/status-runtime-plugin-spec.md`
- References in `opencode/commands/run-*.md` (one line each)
- References in `README.md` and `CHANGELOG.md`

The status schemas, examples, and `PIPELINE_PROTOCOL.md` status contract should be **kept** since they define the format that orchestrators write, independent of any CLI consumer.
