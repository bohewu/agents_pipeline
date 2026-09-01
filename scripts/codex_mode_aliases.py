import json
import re
from pathlib import Path
from typing import Dict, List, Sequence


MODE_ALIAS_PATTERN_FAMILY_LINE = (
    "Treat only explicit leading mode phrases from this allowlisted pattern family — "
    "`use <mode>`, `using <mode>`, `使用 <mode>`, `使用<mode>`, `用 <mode>`, "
    "`用 <mode> 做...`, `請用 <mode>`, and `請用 <mode> 去執行...` — as mode "
    "aliases for a supported mode in the current/main agent, not generic prose."
)
MODE_ALIAS_ADOPT_LINE = (
    "Those aliases tell the current/main agent to adopt the requested mode directly."
)
FORMAL_MODE_SKILLS_LINE = (
    "Installed `$run-adaptive` routing plus `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, "
    "`$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and "
    "`$run-committee` skills are the formal workflow entry points. Adaptive is skill-only "
    "and intentionally has no orchestrator role or compatibility mode alias."
)
MODE_ALIAS_COMPATIBILITY_LINE = (
    "Natural-language forms such as `use pipeline` and `使用 pipeline` remain "
    "compatibility aliases; `$run-pipeline` is the primary full-pipeline entry point."
)
MODE_ALIAS_SKILL_EQUIVALENCE_LINE = (
    "Treat each recognized compatibility alias as the matching formal `$run-<mode>` "
    "skill invocation and apply that skill's preflight and workflow semantics."
)
WORKSPACE_PROFILE_PREFLIGHT_LINE = (
    "Before adopting the workflow, always query the globally installed profile "
    "manager for current-workspace JSON status. A normal workspace without a "
    "profile reports global inheritance and may continue. If status cannot be "
    "verified or a configured profile's `health` is not `ok`, stop before dispatch "
    "and ask the user to rerun workspace `set` or `clear`; never bypass an unhealthy "
    "or orphaned profile. If a configured profile's `profile_eligibility` is not "
    "`eligible`, warn that Codex is ignoring the workspace layer and continue with "
    "global role routing."
)
MODE_ALIAS_AUTHORIZATION_GUARD_LINE = (
    "A mode alias changes the current/main agent's working style only. It does not "
    "automatically spawn subagents and does not override higher-priority rules for "
    "`spawn_agent` authorization."
)
CUSTOM_ROLE_FORK_ISOLATION_LINE = (
    "On Codex surfaces that expose `agent_type`, `model`, or `reasoning_effort`, "
    "select a registered custom role or non-parent model/reasoning configuration "
    "through the native spawn selector without a full-history fork, then verify "
    "the spawned child trace with the installed local `codex-child-trace.js` helper "
    "when available. Matching effective effort satisfies the policy contract, but "
    "child/parent equality cannot distinguish an explicit same-value selector from "
    "inheritance and must not be described as selector causality. A full-history "
    "fork may inherit the parent agent "
    "type, model, and reasoning effort; use it only when that inheritance is "
    "intentional. If the selectors are unavailable, do not claim that workspace "
    "profile routing succeeded. On Codex multi-agent V2, pass the registered role as "
    "`agent_type`, normally omit `model`, pass a non-null resolver `dispatch_effort` as "
    "`reasoning_effort`, and use `fork_turns = \"none\"`. The only managed exception "
    "is an `auto` child CapabilityRecoveryDecision for `executor` or `generalist`: "
    "pass only the raw model returned by the active workspace profile's read-only "
    "`resolve-recovery` action, then verify both model and effort in the child trace. "
    "Never apply recovery to the current/main agent or an orchestrator. On a legacy spawn surface, "
    "use the equivalent no-history `fork_context = false`. V2 returns a task path; "
    "pass that path to `codex-child-trace.js --task-name`, while legacy surfaces "
    "use the returned UUID with `--agent-id`. Exported subagent roles are leaf "
    "workers and must not spawn another agent. When the adopted definition invokes the installed "
    "reasoning policy protocol, use its shared resolver for child effort and never "
    "infer effort from workflow risk or apply a child selector to the current/main agent."
)
AD_HOC_MANAGED_ROLE_DISPATCH_LINES = (
    "Ad-hoc managed-role dispatch:",
    "When the user explicitly requests a registered managed role outside a `$run-*` "
    "workflow, do not adopt or simulate a workflow. Before spawning:",
    "1. Query the current-workspace profile status in JSON. If status cannot be "
    "verified or a configured profile's health is not `ok`, stop before dispatch.",
    "2. If the workspace profile is configured, healthy, and eligible, keep its "
    "registered role routing. Use its logical model tier only when the profile/runtime "
    "proves that tier; a uniform raw-model profile or any other unprovable mapping "
    "passes tier `unknown` without guessing from the model slug. A normal workspace "
    "without a profile may continue through global role routing with tier `unknown`; "
    "if a configured profile is ineligible, warn and use that same global/unknown-tier path.",
    "3. Classify the bounded task intent and reasoning signals, then call the installed "
    "reasoning-policy resolver with `mode = adaptive`, the registered role, the proven "
    "tier or `unknown`, and selector availability. If the task exceeds a fixed role or "
    "role ceiling, report the conflict; do not lower the class or silently reassign it.",
    "4. Pass the resolver's non-null `dispatch_effort` as `reasoning_effort`. Never "
    "select effort directly from the role name or perceived task simplicity. If the "
    "resolver conflicts or the required selector is unavailable, stop before spawning.",
    "5. Spawn with `agent_type = <role>`, omit `model`, and use `fork_turns = \"none\"`.",
    "6. Verify the observed role and effective effort with `codex-child-trace.js`. "
    "Verify an expected model only when the eligible workspace profile proves one; "
    "otherwise report the bounded observed model without claiming profile routing.",
    "This is a lightweight dispatch preflight only. It must not create workflow "
    "artifacts, manifests, task decomposition, retry loops, or other `$run-*` behavior.",
)
MATERIALITY_AND_GOAL_LINE = (
    "Before any repair, reviewer followup, capability recovery, or new Goal "
    "continuation round, apply the installed `protocols/MATERIALITY_GATE.md`. "
    "Admit work only when an original goal condition remains unmet, concrete "
    "evidence proves it, and leaving it unchanged has practical impact. On a "
    "material reasoning retry, run reasoning-effort recovery before model capability "
    "recovery and carry the prior attempt's `effective_class` as the next retry floor; "
    "a deep child may automatically receive `max` through `recovery_boost`, not "
    "`explicit_effort`. A Goal continuation must prefer same-run resume, then a "
    "narrow continuation with a concrete strategy delta; replayed mode aliases are "
    "not fresh runs, and budget exhaustion alone does not justify replaying the full "
    "workflow. P3 findings, wording/style preferences, optional notes, speculative "
    "hardening, and possible polish must not become remaining work or consume "
    "repair/recovery budget."
)
CHILD_RESULT_SELECTION_LABEL_LINE = (
    "Whenever a child returns user-visible output, show one adjacent compact selection "
    "line with role, model, and effort. Use `model=<name> (verified)` only when a "
    "bounded expected model matches the local trace; otherwise label the configured "
    "model as unverified or use `unknown`. Use `(effective)` only for observed effort; "
    "otherwise label it requested or inherited/unverified. Emit one line per child "
    "dispatch, even when a role is dispatched more than once; never slash-join effort "
    "values such as `max/high`. If one child has different requested, dispatched, or "
    "effective efforts, show separate named fields. Do not make the child self-report "
    "this metadata or combine model and effort into one opaque value."
)
MINIMAL_DELIVERY_LINE = (
    "Use the smallest implementation and verification sufficient for the stated "
    "requirement. Rigor means proving the requested behavior, not adding "
    "abstractions, checks, or polish."
)
VALIDATION_COST_GUARD_LINE = (
    "Treat validation as bounded support for product delivery. Classify failed "
    "checks as product, harness, or operational failures before editing. A "
    "harness-only problem gets at most one smallest in-place correction and one "
    "focused rerun without consuming repair, workflow retry, or recovery budget; "
    "it never authorizes product changes, a new validator, fresh workflow run, "
    "refreeze, recertification, or reasoning/model recovery. Stop "
    "when the same harness or infrastructure signature occurs twice consecutively. "
    "Do not build candidate-zero validators, mutation matrices, validators for "
    "validators, or proof frameworks unless the original product contract explicitly "
    "requires them. Workflow-generated specs, tasks, Definitions of Done, test plans, "
    "and reviews are derivative and cannot promote assumptions or suggestions into "
    "original requirements. Validation infrastructure requires recorded explicit-user "
    "authority or an independently established repository contract that predates the "
    "workflow; same-run artifacts, executors, and reviewers cannot self-authorize it. "
    "Legacy payloads treat omitted authorization as false and remain usable after "
    "reconciliation to the original request or pre-workflow repository evidence."
)
MODE_ALIAS_DO_NOT_SPAWN_LINE = (
    "Do NOT first spawn the same-named orchestrator role just to enter the mode."
)
MODE_ALIAS_DEFINITION_HEADER_LINE = (
    "Definition-first order for an explicit mode alias in a fresh/new session:"
)
MODE_ALIAS_DEFINITION_LOOKUP_SENTENCE = (
    "On a recognized mode alias, read the globally installed "
    "`$CODEX_HOME/agents/orchestrator-<mode>.toml` (default "
    "`~/.codex/agents/orchestrator-<mode>.toml`) as the authoritative workflow "
    "definition. Do not manually adopt a repository `.codex/agents/` role; effective "
    "Codex configuration controls trusted workspace role routing."
)
MODE_ALIAS_DEFINITION_LOOKUP_LINE = f"1. {MODE_ALIAS_DEFINITION_LOOKUP_SENTENCE}"
MODE_ALIAS_SIMULATE_LINE = (
    "2. The current/main agent simulates that mode itself from the installed definition."
)
MODE_ALIAS_OBEY_DEFINITION_SENTENCE = (
    "After applying that definition, the current/main agent must obey that "
    "definition's hard constraints and delegation rules as if it were that "
    "orchestrator."
)
MODE_ALIAS_OBEY_DEFINITION_LINE = f"3. {MODE_ALIAS_OBEY_DEFINITION_SENTENCE}"
MODE_ALIAS_NO_BYPASS_SENTENCE = (
    "If the applied definition forbids direct implementation or routes "
    "scouting/implementation to helper roles, the current/main agent must not "
    "bypass those helpers by doing that work inline. It should delegate those "
    "work items when separately authorized."
)
MODE_ALIAS_NO_BYPASS_LINE = f"4. {MODE_ALIAS_NO_BYPASS_SENTENCE}"
MODE_ALIAS_SUBAGENT_SENTENCE = (
    "Use subagents according to that installed definition for real work items when "
    "separately authorized."
)
MODE_ALIAS_SUBAGENT_LINE = f"5. {MODE_ALIAS_SUBAGENT_SENTENCE}"
SAME_SESSION_NO_RELOAD_LINE = (
    "Same-session reuse rule: repeated use of the same mode in the same session does "
    "NOT need to reload the definition when the mode and global definition source are "
    "unchanged."
)
SAME_SESSION_EXCEPTIONS_LINE = (
    "Reload/re-read when the mode changes, the globally installed definition changes, "
    "the user explicitly asks to reload/refresh/re-read, or the agent is no longer "
    "confident it still has the relevant mode details. Recheck effective role routing "
    "and workspace profile status whenever the workspace changes."
)
MODE_DEFINITION_SCOPE_LINE = (
    "When reading the installed definition for Codex mode simulation, focus on mode "
    "behavior, task decomposition, delegation rules, and output style; ignore adapter "
    "details for other runtimes."
)
NATURAL_LANGUAGE_MODE_ALIAS_PATTERNS = (
    "use {alias}",
    "using {alias}",
    "使用 {alias}",
    "使用{alias}",
    "用 {alias}",
    "用 {alias} 做",
    "請用 {alias}",
    "請用 {alias} 去執行",
)
MODE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
AGENT_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CODEX_NATIVE_RESERVED_ALIASES = frozenset({"goal"})


def _normalize_mode_name(value: object, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context} must be a non-empty string")
    name = value.strip().lstrip("/")
    if name.startswith("run-"):
        name = name[len("run-") :]
    if MODE_NAME_RE.fullmatch(name) is None:
        raise ValueError(
            f"{context} must be a safe mode name matching {MODE_NAME_RE.pattern}"
        )
    return name


def _normalize_agent_name(value: object, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context} must be a non-empty string")
    name = value.strip()
    if AGENT_NAME_RE.fullmatch(name) is None:
        raise ValueError(
            f"{context} must be a safe agent name matching {AGENT_NAME_RE.pattern}"
        )
    return name


def load_mode_agents(path: Path) -> Dict[str, str]:
    """Load ordered mode-to-agent routing from the neutral ``modes.json`` manifest.

    The canonical shape is ``{"modes": [{"name": "flow", "agent":
    "orchestrator-flow"}]}``. Object-map mode entries are also accepted so an
    extracted bundle fails only on semantic errors, not on harmless JSON layout
    differences during the migration.
    """

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Mode manifest not found: {path.as_posix()}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{path.as_posix()}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    except OSError as exc:
        raise ValueError(f"Unable to read mode manifest {path.as_posix()}: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError(f"{path.as_posix()}: mode manifest must be a JSON object")
    if type(payload.get("version")) is not int or payload.get("version") != 1:
        raise ValueError(f"{path.as_posix()}: mode manifest version must be 1")
    raw_modes = payload.get("modes")
    if isinstance(raw_modes, dict):
        entries = []
        for raw_name, raw_value in raw_modes.items():
            if isinstance(raw_value, str):
                entries.append({"name": raw_name, "agent": raw_value})
            elif isinstance(raw_value, dict):
                entries.append({"name": raw_name, **raw_value})
            else:
                raise ValueError(
                    f"{path.as_posix()}: mode '{raw_name}' must map to an agent string or object"
                )
    elif isinstance(raw_modes, list):
        entries = raw_modes
    else:
        raise ValueError(
            f"{path.as_posix()}: field 'modes' must be an array or object"
        )

    mode_agents: Dict[str, str] = {}
    for index, raw_entry in enumerate(entries):
        if not isinstance(raw_entry, dict):
            raise ValueError(
                f"{path.as_posix()}: modes[{index}] must be an object"
            )
        mode_name = _normalize_mode_name(
            raw_entry.get("name"), f"{path.as_posix()}: modes[{index}].name"
        )
        agent_name = _normalize_agent_name(
            raw_entry.get("agent"), f"{path.as_posix()}: mode '{mode_name}' agent"
        )
        raw_aliases = raw_entry.get("aliases", [])
        if not isinstance(raw_aliases, list):
            raise ValueError(
                f"{path.as_posix()}: mode '{mode_name}' aliases must be an array"
            )
        names = [mode_name]
        names.extend(
            _normalize_mode_name(
                alias,
                f"{path.as_posix()}: mode '{mode_name}' alias",
            )
            for alias in raw_aliases
        )
        for name in ordered_unique(names):
            if name in CODEX_NATIVE_RESERVED_ALIASES:
                raise ValueError(
                    f"{path.as_posix()}: mode '{mode_name}' uses host-runtime reserved alias '{name}'"
                )
            previous = mode_agents.get(name)
            if previous is not None and previous != agent_name:
                raise ValueError(
                    f"{path.as_posix()}: mode alias '{name}' maps to both '{previous}' and '{agent_name}'"
                )
            mode_agents[name] = agent_name

    if not mode_agents:
        raise ValueError(f"{path.as_posix()}: mode manifest contains no modes")
    return mode_agents


def ordered_unique(values: Sequence[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def inline_code_list(values: Sequence[str]) -> str:
    return ", ".join(f"`{value}`" for value in values)


def build_slash_mode_aliases(aliases: Sequence[str]) -> List[str]:
    out: List[str] = []
    for alias in aliases:
        if alias in CODEX_NATIVE_RESERVED_ALIASES:
            continue
        out.append(f"/run-{alias}")
        out.append(f"/{alias}")
    return ordered_unique(out)


def build_natural_language_mode_aliases(aliases: Sequence[str]) -> List[str]:
    return ordered_unique(
        pattern.format(alias=alias)
        for alias in aliases
        if alias not in CODEX_NATIVE_RESERVED_ALIASES
        for pattern in NATURAL_LANGUAGE_MODE_ALIAS_PATTERNS
    )


def build_mode_summary_lines() -> List[str]:
    return [
        MODE_ALIAS_PATTERN_FAMILY_LINE,
        MODE_ALIAS_ADOPT_LINE,
        FORMAL_MODE_SKILLS_LINE,
        MODE_ALIAS_COMPATIBILITY_LINE,
        MODE_ALIAS_SKILL_EQUIVALENCE_LINE,
        WORKSPACE_PROFILE_PREFLIGHT_LINE,
        MODE_ALIAS_AUTHORIZATION_GUARD_LINE,
        CUSTOM_ROLE_FORK_ISOLATION_LINE,
        *AD_HOC_MANAGED_ROLE_DISPATCH_LINES,
        CHILD_RESULT_SELECTION_LABEL_LINE,
        MINIMAL_DELIVERY_LINE,
        VALIDATION_COST_GUARD_LINE,
        MATERIALITY_AND_GOAL_LINE,
        MODE_ALIAS_DO_NOT_SPAWN_LINE,
        MODE_ALIAS_DEFINITION_HEADER_LINE,
        MODE_ALIAS_DEFINITION_LOOKUP_LINE,
        MODE_ALIAS_SIMULATE_LINE,
        MODE_ALIAS_OBEY_DEFINITION_LINE,
        MODE_ALIAS_NO_BYPASS_LINE,
        MODE_ALIAS_SUBAGENT_LINE,
        SAME_SESSION_NO_RELOAD_LINE,
        SAME_SESSION_EXCEPTIONS_LINE,
        MODE_DEFINITION_SCOPE_LINE,
    ]
