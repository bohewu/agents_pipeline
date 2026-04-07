#!/usr/bin/env python3
"""Validate orchestrator projections against the repo's primary agent definitions."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENTS_DIR = REPO_ROOT / "opencode" / "agents"
COMMANDS_DIR = REPO_ROOT / "opencode" / "commands"


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


def discover_primary_orchestrators() -> list[str]:
    orchestrators: list[str] = []
    for agent_path in sorted(AGENTS_DIR.glob("orchestrator-*.md")):
        frontmatter = parse_frontmatter(agent_path)
        name = frontmatter.get("name")
        mode = frontmatter.get("mode")
        if name != agent_path.stem:
            raise ValueError(
                f"{agent_path} frontmatter name must match file stem: expected {agent_path.stem!r}, got {name!r}."
            )
        if mode != "primary":
            raise ValueError(f"{agent_path} must declare mode: primary. Got {mode!r}.")
        orchestrators.append(name)
    return orchestrators


def parse_agents_catalog_orchestrators() -> list[str]:
    catalog_path = REPO_ROOT / "AGENTS.md"
    orchestrators: list[str] = []
    for line in catalog_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*(orchestrator-[^\s|]+)\s*\|", line)
        if match:
            orchestrators.append(match.group(1))
    return orchestrators


def parse_run_command_agents() -> list[str]:
    agents: set[str] = set()
    for command_path in sorted(COMMANDS_DIR.glob("run-*.md")):
        frontmatter = parse_frontmatter(command_path)
        agent_name = frontmatter.get("agent")
        if not agent_name:
            raise ValueError(f"{command_path} is missing frontmatter agent.")
        agents.add(agent_name)
    return sorted(agents)


def parse_status_runtime_orchestrators() -> list[str]:
    constants_path = (
        REPO_ROOT / "opencode" / "plugins" / "status-runtime" / "constants.js"
    )
    text = constants_path.read_text(encoding="utf-8")
    match = re.search(r"const\s+ORCHESTRATORS\s*=\s*\[(.*?)\];", text, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find ORCHESTRATORS array in {constants_path}.")
    return re.findall(r'"([^"]+)"', match.group(1))


def parse_schema_orchestrators(schema_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    orchestrator_property = schema.get("properties", {}).get("orchestrator", {})
    enum_values = orchestrator_property.get("enum")
    if not isinstance(enum_values, list):
        raise ValueError(
            f"{schema_path} does not expose properties.orchestrator.enum as a list."
        )
    return [str(value) for value in enum_values]


def ensure_same_members(label: str, expected: list[str], actual: list[str]) -> None:
    expected_set = set(expected)
    actual_set = set(actual)
    if expected_set != actual_set:
        missing = sorted(expected_set - actual_set)
        unexpected = sorted(actual_set - expected_set)
        details: list[str] = []
        if missing:
            details.append(f"missing={missing}")
        if unexpected:
            details.append(f"unexpected={unexpected}")
        raise ValueError(
            f"{label} is out of sync with primary orchestrators: {'; '.join(details)}"
        )


def main() -> int:
    primary_orchestrators = discover_primary_orchestrators()

    checks = [
        ("AGENTS.md primary table", parse_agents_catalog_orchestrators()),
        ("run-* command frontmatter", parse_run_command_agents()),
        ("status-runtime constants", parse_status_runtime_orchestrators()),
        (
            "run-status schema",
            parse_schema_orchestrators(
                REPO_ROOT
                / "opencode"
                / "protocols"
                / "schemas"
                / "run-status.schema.json"
            ),
        ),
        (
            "checkpoint schema",
            parse_schema_orchestrators(
                REPO_ROOT
                / "opencode"
                / "protocols"
                / "schemas"
                / "checkpoint.schema.json"
            ),
        ),
    ]

    for label, actual in checks:
        ensure_same_members(label, primary_orchestrators, actual)

    print(
        "OK: orchestrator contracts match primary agent definitions: "
        + ", ".join(primary_orchestrators)
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
