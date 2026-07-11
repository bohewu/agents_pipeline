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
