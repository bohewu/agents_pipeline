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
ALLOWED_RUN_COMMAND_ALIASES = {
    "run-monetize": "orchestrator-general",
}


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
    agent_names: list[str] = []
    for agent_path in sorted(AGENTS_DIR.glob("*.md")):
        frontmatter = parse_frontmatter(agent_path)
        name = frontmatter.get("name")
        if name != agent_path.stem:
            raise ValueError(
                f"{agent_path} frontmatter name must match file stem: expected {agent_path.stem!r}, got {name!r}."
            )
        agent_names.append(name)
    return agent_names


def discover_primary_orchestrators() -> list[str]:
    orchestrators: list[str] = []
    for agent_path in sorted(AGENTS_DIR.glob("orchestrator-*.md")):
        frontmatter = parse_frontmatter(agent_path)
        name = frontmatter.get("name")
        mode = frontmatter.get("mode")
        if mode != "primary":
            raise ValueError(f"{agent_path} must declare mode: primary. Got {mode!r}.")
        orchestrators.append(name)
    return orchestrators


def parse_agents_catalog_agents() -> list[str]:
    catalog_path = REPO_ROOT / "AGENTS.md"
    agents: list[str] = []
    for line in catalog_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*([A-Za-z0-9-]+)\s*\|", line)
        if match and match.group(1) not in {"Agent", "------"}:
            agents.append(match.group(1))
    return agents


def parse_agents_catalog_orchestrators() -> list[str]:
    return [name for name in parse_agents_catalog_agents() if name.startswith("orchestrator-")]


def parse_command_agents() -> dict[str, str]:
    command_agents: dict[str, str] = {}
    for command_path in sorted(COMMANDS_DIR.glob("*.md")):
        frontmatter = parse_frontmatter(command_path)
        agent_name = frontmatter.get("agent")
        if not agent_name:
            raise ValueError(f"{command_path} is missing frontmatter agent.")
        command_agents[command_path.stem] = agent_name
    return command_agents


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
            f"{label} is out of sync with expected members: {'; '.join(details)}"
        )


def validate_command_agents(command_agents: dict[str, str], agent_names: list[str]) -> None:
    valid_agents = set(agent_names)
    invalid = sorted(
        f"{command}:{agent}"
        for command, agent in command_agents.items()
        if agent not in valid_agents
    )
    if invalid:
        raise ValueError(
            "command frontmatter references unknown agents: " + ", ".join(invalid)
        )


def validate_run_command_aliases(
    command_agents: dict[str, str], primary_orchestrators: list[str]
) -> None:
    available_orchestrators = set(primary_orchestrators)
    run_commands = sorted(name for name in command_agents if name.startswith("run-"))

    stale_aliases = sorted(
        command_name
        for command_name in ALLOWED_RUN_COMMAND_ALIASES
        if command_name not in command_agents
    )
    if stale_aliases:
        raise ValueError(
            "run-command alias allowlist references missing commands: "
            + ", ".join(stale_aliases)
        )

    mismatches: list[str] = []
    for command_name in run_commands:
        actual_agent = command_agents[command_name]
        expected_agent = command_name.replace("run-", "orchestrator-", 1)
        allowed_alias = ALLOWED_RUN_COMMAND_ALIASES.get(command_name)

        if actual_agent == expected_agent:
            continue
        if allowed_alias:
            if actual_agent != allowed_alias:
                mismatches.append(
                    f"{command_name} expected alias target {allowed_alias} but found {actual_agent}"
                )
            continue
        if expected_agent in available_orchestrators:
            mismatches.append(
                f"{command_name} expected {expected_agent} but found {actual_agent}"
            )
            continue
        mismatches.append(
            f"{command_name} has no matching primary orchestrator and no allowlisted alias (found {actual_agent})"
        )

    if mismatches:
        raise ValueError("run-command mappings are out of sync: " + "; ".join(mismatches))


def main() -> int:
    agent_names = discover_agent_names()
    primary_orchestrators = discover_primary_orchestrators()
    command_agents = parse_command_agents()

    checks = [
        ("AGENTS.md full agent table", parse_agents_catalog_agents(), agent_names),
        ("AGENTS.md primary table", primary_orchestrators, parse_agents_catalog_orchestrators()),
        ("status-runtime constants", primary_orchestrators, parse_status_runtime_orchestrators()),
        (
            "run-status schema",
            primary_orchestrators,
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
            primary_orchestrators,
            parse_schema_orchestrators(
                REPO_ROOT
                / "opencode"
                / "protocols"
                / "schemas"
                / "checkpoint.schema.json"
            ),
        ),
    ]

    for label, expected, actual in checks:
        ensure_same_members(label, expected, actual)

    validate_command_agents(command_agents, agent_names)
    validate_run_command_aliases(command_agents, primary_orchestrators)

    print(
        "OK: orchestrator contracts match primary agent definitions: "
        + ", ".join(primary_orchestrators)
    )
    print(
        "OK: command frontmatter targets valid agents; allowlisted run-command aliases: "
        + ", ".join(
            f"{command}->{agent}"
            for command, agent in sorted(ALLOWED_RUN_COMMAND_ALIASES.items())
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
