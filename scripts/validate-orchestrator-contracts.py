#!/usr/bin/env python3
"""Validate neutral agent, mode, status, and schema projections."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENTS_DIR = REPO_ROOT / "agents"
MODES_PATH = REPO_ROOT / "modes.json"
RESERVED_MODE_NAMES = frozenset({"goal"})
WORKFLOW_CONTRACTS = (
    Path("skills/run-adaptive/SKILL.md"),
    Path("agents/orchestrator-simple.md"),
    Path("agents/orchestrator-flow.md"),
    Path("agents/orchestrator-pipeline.md"),
)
CAPABILITY_RECOVERY_CONTRACT = Path("protocols/CAPABILITY_RECOVERY.md")
MATERIALITY_GATE_CONTRACT = Path("protocols/MATERIALITY_GATE.md")


def normalize_mode_alias(value: str) -> str:
    normalized = value.lstrip("/")
    if normalized.startswith("run-"):
        normalized = normalized[len("run-") :]
    return normalized


def parse_frontmatter(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path} is missing a frontmatter block.")

    frontmatter: dict[str, str] = {}
    for line in lines[1:]:
        stripped = line.strip()
        if stripped == "---":
            return frontmatter
        if not stripped or ":" not in line:
            continue
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"').strip("'")
    raise ValueError(f"{path} has an unterminated frontmatter block.")


def discover_agent_names() -> list[str]:
    names: list[str] = []
    for path in sorted(AGENTS_DIR.glob("*.md")):
        frontmatter = parse_frontmatter(path)
        expected = path.stem
        actual = frontmatter.get("name")
        if actual != expected:
            raise ValueError(
                f"{path} frontmatter name must match file stem: expected {expected!r}, got {actual!r}."
            )
        kind = frontmatter.get("kind")
        if kind not in {"primary", "subagent"}:
            raise ValueError(
                f"{path} must declare kind: primary|subagent. Got {kind!r}."
            )
        unexpected = sorted(
            set(frontmatter) - {"name", "description", "kind"}
        )
        if unexpected:
            raise ValueError(
                f"{path} uses runtime-specific frontmatter keys: {unexpected}."
            )
        names.append(expected)
    return names


def discover_primary_orchestrators() -> list[str]:
    names: list[str] = []
    for path in sorted(AGENTS_DIR.glob("orchestrator-*.md")):
        frontmatter = parse_frontmatter(path)
        if frontmatter.get("kind") != "primary":
            raise ValueError(f"{path} must declare kind: primary.")
        names.append(path.stem)
    return names


def parse_agents_catalog_agents() -> list[str]:
    agents: list[str] = []
    for line in (REPO_ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*([A-Za-z0-9-]+)\s*\|", line)
        if match and match.group(1) not in {"Agent", "------"}:
            agents.append(match.group(1))
    return agents


def parse_agents_catalog_orchestrators() -> list[str]:
    return [
        name for name in parse_agents_catalog_agents() if name.startswith("orchestrator-")
    ]


def parse_modes() -> list[dict[str, Any]]:
    document = json.loads(MODES_PATH.read_text(encoding="utf-8"))
    if document.get("version") != 1:
        raise ValueError(f"{MODES_PATH} must declare version: 1.")
    modes = document.get("modes")
    if not isinstance(modes, list) or not modes:
        raise ValueError(f"{MODES_PATH} must contain a non-empty modes array.")

    seen_names: set[str] = set()
    seen_aliases: set[str] = set()
    for index, mode in enumerate(modes):
        if not isinstance(mode, dict):
            raise ValueError(f"modes[{index}] must be an object.")
        name = mode.get("name")
        agent = mode.get("agent")
        aliases = mode.get("aliases")
        if not isinstance(name, str) or not name:
            raise ValueError(f"modes[{index}].name must be a non-empty string.")
        if normalize_mode_alias(name) in RESERVED_MODE_NAMES:
            raise ValueError(
                f"mode {name!r} is reserved for host-runtime native behavior."
            )
        if not isinstance(agent, str) or not agent:
            raise ValueError(f"modes[{index}].agent must be a non-empty string.")
        if not isinstance(aliases, list) or not aliases or not all(
            isinstance(alias, str) and alias for alias in aliases
        ):
            raise ValueError(f"modes[{index}].aliases must be a non-empty string array.")
        if len(set(aliases)) != len(aliases):
            raise ValueError(f"modes[{index}].aliases contains duplicate values.")
        reserved_aliases = sorted(
            alias
            for alias in aliases
            if normalize_mode_alias(alias) in RESERVED_MODE_NAMES
        )
        if reserved_aliases:
            raise ValueError(
                f"mode {name!r} uses host-runtime reserved aliases: {reserved_aliases}."
            )
        if name in seen_names:
            raise ValueError(f"duplicate mode name: {name}")
        duplicate_aliases = sorted(set(aliases) & seen_aliases)
        if duplicate_aliases:
            raise ValueError(f"duplicate mode aliases: {duplicate_aliases}")
        if name not in aliases or f"run-{name}" not in aliases:
            raise ValueError(
                f"mode {name!r} must include aliases {name!r} and {'run-' + name!r}."
            )
        seen_names.add(name)
        seen_aliases.update(aliases)
    return modes


def parse_status_runtime_orchestrators() -> list[str]:
    path = REPO_ROOT / "tools" / "status-runtime" / "constants.js"
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const\s+ORCHESTRATORS\s*=\s*\[(.*?)\];", text, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find ORCHESTRATORS array in {path}.")
    return re.findall(r'"([^"]+)"', match.group(1))


def parse_schema_orchestrators(path: Path) -> list[str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    values = document.get("properties", {}).get("orchestrator", {}).get("enum")
    if not isinstance(values, list):
        raise ValueError(f"{path} must expose properties.orchestrator.enum as a list.")
    return [str(value) for value in values]


def ensure_same_members(label: str, expected: list[str], actual: list[str]) -> None:
    missing = sorted(set(expected) - set(actual))
    unexpected = sorted(set(actual) - set(expected))
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing={missing}")
        if unexpected:
            details.append(f"unexpected={unexpected}")
        raise ValueError(f"{label} is out of sync with expected members: {'; '.join(details)}")


def validate_capability_and_materiality_contracts() -> None:
    for relative_path in WORKFLOW_CONTRACTS:
        text = (REPO_ROOT / relative_path).read_text(encoding="utf-8")
        required = ["--capability-recovery=off|shadow|auto", "protocols/MATERIALITY_GATE.md"]
        missing = [token for token in required if token not in text]
        if missing:
            raise ValueError(f"{relative_path} is missing capability/materiality guidance: {missing}")

    adaptive = (REPO_ROOT / WORKFLOW_CONTRACTS[0]).read_text(encoding="utf-8")
    simple = (REPO_ROOT / WORKFLOW_CONTRACTS[1]).read_text(encoding="utf-8")
    flow = (REPO_ROOT / WORKFLOW_CONTRACTS[2]).read_text(encoding="utf-8")
    pipeline = (REPO_ROOT / WORKFLOW_CONTRACTS[3]).read_text(encoding="utf-8")
    capability = (REPO_ROOT / CAPABILITY_RECOVERY_CONTRACT).read_text(
        encoding="utf-8"
    )
    materiality = (REPO_ROOT / MATERIALITY_GATE_CONTRACT).read_text(
        encoding="utf-8"
    )
    checks = {
        "capability recovery order": (
            capability,
            [
                "Reasoning-effort recovery is mandatory before model capability recovery",
                "does not use `explicit_effort`",
                "`no_higher_tier_available` is not a terminal blocker",
                "prior attempt's `effective_class`",
                "`deep` plus `max` attempt",
                "profile recovery ceiling",
            ],
        ),
        "Goal continuation lanes": (
            materiality,
            [
                "Resume the same run",
                "Start a narrow continuation run",
                "Start a full fresh run",
                "Budget exhaustion alone never justifies",
                "Replayed `$run-*` text",
                "concrete strategy delta",
            ],
        ),
        "KISS materiality admission": (
            materiality,
            [
                "review failure is evidence to evaluate",
                "no smaller change or targeted verification",
                "smallest change or verification step that closes the gap",
                "Adequate targeted evidence is sufficient",
            ],
        ),
        "adaptive presets/resume": (
            adaptive,
            [
                "delivery` or `autonomous` preset defaults it to `auto`",
                "persisted effective mode remains",
                "automatic Goal continuation",
                "not a fresh invocation",
                "latest attempt's persisted reasoning",
                "narrow continuation run",
                "full fresh run",
                "Do not create a `run-goal`",
            ],
        ),
        "simple no-recovery boundary": (
            simple,
            [
                "Simple MUST NOT perform",
                "never invokes `resolve-recovery`",
                "reasoning-effort recovery",
                "`recovery_boost`",
                "do not encode this as `explicit_effort`",
                "prior attempt's `effective_class`",
                "rather than re-enter",
                "`$run-adaptive`",
            ],
        ),
        "flow capability sequence": (
            flow,
            [
                "reasoning-effort recovery before model capability recovery",
                "`prior_failure_type = reasoning_failure`",
                "`recovery_boost = true`",
                "`no_higher_tier_available`",
                "attempt's persisted `reasoning.effective_class`",
                "`deep` plus `max`",
                "tools/capability-recovery.js",
                "resolve-recovery",
                "without the old\nrecovery boost",
                "Missing selector, profile, or trace",
                "Other runtime exports conflict",
            ],
        ),
        "pipeline capability sequence": (
            pipeline,
            [
                "reasoning-effort recovery",
                "before model capability recovery",
                "`recovery_boost`",
                "`no_higher_tier_available`",
                "prior task attempt's persisted",
                "`reasoning.effective_class`",
                "`deep` plus `max`",
                "never the same attempt",
                "tools/capability-recovery.js",
                "resolve-recovery",
                "no inherited recovery boost",
                "Reviewer models never uplift",
                "`optional_notes` are not remaining work",
                "`capability_recovery_used = true`",
                "`retry_opportunities_used = <persisted value + 1>`",
            ],
        ),
    }
    for label, (text, tokens) in checks.items():
        missing = [token for token in tokens if token not in text]
        if missing:
            raise ValueError(f"{label} is missing required contract guidance: {missing}")


def main() -> int:
    agent_names = discover_agent_names()
    orchestrators = discover_primary_orchestrators()
    modes = parse_modes()
    mode_agents = [str(mode["agent"]) for mode in modes]

    checks = [
        ("AGENTS.md full agent table", parse_agents_catalog_agents(), agent_names),
        ("AGENTS.md primary table", orchestrators, parse_agents_catalog_orchestrators()),
        ("modes.json targets", orchestrators, mode_agents),
        ("status-runtime constants", orchestrators, parse_status_runtime_orchestrators()),
        (
            "run-status schema",
            orchestrators,
            parse_schema_orchestrators(REPO_ROOT / "protocols/schemas/run-status.schema.json"),
        ),
        (
            "checkpoint schema",
            orchestrators,
            parse_schema_orchestrators(REPO_ROOT / "protocols/schemas/checkpoint.schema.json"),
        ),
    ]
    for label, expected, actual in checks:
        ensure_same_members(label, expected, actual)

    validate_capability_and_materiality_contracts()

    unknown_targets = sorted(set(mode_agents) - set(agent_names))
    if unknown_targets:
        raise ValueError(f"modes.json references unknown agents: {unknown_targets}")

    print("OK: neutral orchestrator projections match: " + ", ".join(orchestrators))
    print(
        "OK: mode aliases are unique and target primary orchestrators: "
        + ", ".join(str(mode["name"]) for mode in modes)
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
