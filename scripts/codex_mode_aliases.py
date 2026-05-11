from typing import List, Sequence


MODE_ALIAS_PATTERN_FAMILY_LINE = (
    "Treat only explicit leading mode phrases from this allowlisted pattern family — "
    "`use <mode>`, `using <mode>`, `使用 <mode>`, `使用<mode>`, `用 <mode>`, "
    "`用 <mode> 做...`, `請用 <mode>`, and `請用 <mode> 去執行...` — as mode "
    "aliases for a supported mode in the current/main agent, not generic prose."
)
MODE_ALIAS_ADOPT_LINE = (
    "Those aliases tell the current/main agent to adopt the requested mode directly."
)
MODE_ALIAS_AUTHORIZATION_GUARD_LINE = (
    "A mode alias changes the current/main agent's working style only. It does not "
    "automatically spawn subagents and does not override higher-priority rules for "
    "`spawn_agent` authorization."
)
MODE_ALIAS_DO_NOT_SPAWN_LINE = (
    "Do NOT first spawn the same-named orchestrator role just to enter the mode."
)
MODE_ALIAS_DEFINITION_HEADER_LINE = (
    "Definition-first order for an explicit mode alias in a fresh/new session:"
)
MODE_ALIAS_DEFINITION_LOOKUP_SENTENCE = (
    "On a recognized mode alias, first consult `.codex/agents/orchestrator-<mode>.toml` "
    "in the workspace; if absent, consult `~/.codex/agents/orchestrator-<mode>.toml`; "
    "then apply that definition."
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
    "NOT need to reload the definition when the mode, workspace, and definition source "
    "are unchanged."
)
SAME_SESSION_EXCEPTIONS_LINE = (
    "Reload/re-read when the mode changes, the workspace changes, the definition source "
    "changes between workspace `.codex/agents/...` and global `~/.codex/agents/...`, "
    "the user explicitly asks to reload/refresh/re-read, or the agent is no longer "
    "confident it still has the relevant mode details."
)
IGNORE_OPENCODE_DETAILS_LINE = (
    "When reading the installed definition for Codex mode simulation, ignore "
    "OpenCode-only plugin/command details that are not relevant in the current Codex "
    "runtime; focus on mode behavior, task decomposition, delegation rules, and output "
    "style."
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
    return ordered_unique(
        [f"/run-{alias}" for alias in aliases] + [f"/{alias}" for alias in aliases]
    )


def build_natural_language_mode_aliases(aliases: Sequence[str]) -> List[str]:
    return ordered_unique(
        pattern.format(alias=alias)
        for alias in aliases
        for pattern in NATURAL_LANGUAGE_MODE_ALIAS_PATTERNS
    )


def build_mode_summary_lines() -> List[str]:
    return [
        MODE_ALIAS_PATTERN_FAMILY_LINE,
        MODE_ALIAS_ADOPT_LINE,
        MODE_ALIAS_AUTHORIZATION_GUARD_LINE,
        MODE_ALIAS_DO_NOT_SPAWN_LINE,
        MODE_ALIAS_DEFINITION_HEADER_LINE,
        MODE_ALIAS_DEFINITION_LOOKUP_LINE,
        MODE_ALIAS_SIMULATE_LINE,
        MODE_ALIAS_OBEY_DEFINITION_LINE,
        MODE_ALIAS_NO_BYPASS_LINE,
        MODE_ALIAS_SUBAGENT_LINE,
        SAME_SESSION_NO_RELOAD_LINE,
        SAME_SESSION_EXCEPTIONS_LINE,
        IGNORE_OPENCODE_DETAILS_LINE,
    ]
