#!/usr/bin/env python3
import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple


FRONTMATTER_BOUNDARY = re.compile(r"^\s*---\s*$")
TOP_LEVEL_KEY_RE = re.compile(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$")
AGENT_REF_RE = re.compile(r"@([a-z0-9][a-z0-9-]*(?:\*)?)")

KNOWN_SOURCE_FRONTMATTER_KEYS = {
    "name",
    "description",
    "mode",
    "hidden",
    "temperature",
    "tools",
    "model",
    "agent",
}

ORCHESTRATOR_PREFIX = "orchestrator-"
EXECUTOR_WILDCARD = "executor-*"


@dataclass
class AgentSource:
    path: Path
    name: str
    description: str
    body: str
    fm_keys: Set[str]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_frontmatter(content: str, path: Path) -> Tuple[Dict[str, str], str]:
    lines = content.splitlines()
    if not lines or not FRONTMATTER_BOUNDARY.match(lines[0]):
        raise ValueError(f"{path.as_posix()}: missing frontmatter block")

    end_idx: Optional[int] = None
    for idx in range(1, len(lines)):
        if FRONTMATTER_BOUNDARY.match(lines[idx]):
            end_idx = idx
            break
    if end_idx is None:
        raise ValueError(f"{path.as_posix()}: unterminated frontmatter block")

    fm: Dict[str, str] = {}
    for line in lines[1:end_idx]:
        match = TOP_LEVEL_KEY_RE.match(line)
        if match is None:
            continue
        key = match.group(1).strip()
        value = match.group(2).strip()
        fm[key] = strip_quotes(value)

    body = "\n".join(lines[end_idx + 1 :])
    if content.endswith("\n"):
        body += "\n"
    return fm, body


def strip_quotes(value: str) -> str:
    if len(value) >= 2 and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'")):
        return value[1:-1]
    return value


def parse_source_agents(source_agents_dir: Path) -> List[AgentSource]:
    agents: List[AgentSource] = []
    for path in sorted(source_agents_dir.glob("*.md")):
        source = read_text(path)
        fm, body = parse_frontmatter(source, path)
        name = fm.get("name", "").strip()
        description = fm.get("description", "").strip()
        if not name:
            raise ValueError(f"{path.as_posix()}: missing required frontmatter key 'name'")
        if not description:
            raise ValueError(f"{path.as_posix()}: missing required frontmatter key 'description'")
        agents.append(
            AgentSource(
                path=path,
                name=name,
                description=description,
                body=body,
                fm_keys=set(fm.keys()),
            )
        )
    return agents


def parse_catalog_agents(catalog_path: Path) -> Set[str]:
    if not catalog_path.exists():
        return set()
    rows = read_text(catalog_path).splitlines()
    agents: Set[str] = set()
    for line in rows:
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        parts = [part.strip() for part in stripped.split("|")]
        if len(parts) < 3:
            continue
        agent = parts[1]
        if agent in {"", "Agent"}:
            continue
        if set(agent) <= {"-"}:
            continue
        agents.add(agent)
    return agents


def ordered_unique(values: Sequence[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def expand_ref_token(token: str, available_agents: Set[str]) -> Tuple[List[str], List[str]]:
    if token == EXECUTOR_WILDCARD:
        return ["executor-core", "executor-advanced"], []
    if token.endswith("*"):
        return [], [token]
    if token in available_agents:
        return [token], []
    return [], [token]


def extract_subagents(body: str, available_agents: Set[str]) -> Tuple[List[str], List[str]]:
    resolved: List[str] = []
    unresolved: List[str] = []
    for match in AGENT_REF_RE.finditer(body):
        token = match.group(1)
        expanded, unknown = expand_ref_token(token, available_agents)
        resolved.extend(expanded)
        unresolved.extend(unknown)
    return ordered_unique(resolved), ordered_unique(unresolved)


def make_input_adapter(agent_name: str) -> str:
    suffix = agent_name[len(ORCHESTRATOR_PREFIX) :]
    command_token = f"/run-{suffix}"
    return (
        "## Copilot Input Adapter\n\n"
        "Copilot custom agents do not provide the OpenCode positional input variable.\n"
        "Use the user's latest message as `raw_input`.\n"
        f"If `raw_input` starts with `{command_token}`, remove that first token before parsing flags.\n"
        "Then apply the existing flag parsing protocol unchanged.\n"
    )


def make_solo_adapter() -> str:
    return (
        "## Copilot Fallback Mode (No Subagents)\n\n"
        "If subagents are unavailable in this environment, execute all stage responsibilities inline.\n"
        "Preserve stage order, output contracts, and quality gates.\n"
        "Do not expand scope; if blocked, report blockers explicitly.\n"
    )


def adapt_body(agent_name: str, original_body: str, solo_mode: bool) -> str:
    body = original_body.replace("$ARGUMENTS", "raw_input")
    blocks: List[str] = []
    if agent_name.startswith(ORCHESTRATOR_PREFIX):
        blocks.append(make_input_adapter(agent_name))
        if solo_mode:
            blocks.append(make_solo_adapter())
    blocks.append(body.lstrip("\n"))
    out = "\n\n".join(blocks).rstrip() + "\n"
    return out


def yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def build_agent_markdown(
    *,
    name: str,
    description: str,
    body: str,
    subagents: Sequence[str],
) -> str:
    lines: List[str] = [
        "---",
        f"name: {yaml_quote(name)}",
        f"description: {yaml_quote(description)}",
    ]
    if subagents:
        lines.append("agents:")
        for agent in subagents:
            lines.append(f"  - {agent}")
    lines.append("---")
    lines.append("")
    lines.append(body.rstrip("\n"))
    lines.append("")
    return "\n".join(lines)


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export OpenCode agents into VS Code Copilot .agent.md files."
    )
    parser.add_argument(
        "--source-agents",
        default="opencode/agents",
        help="Directory containing source OpenCode agent markdown files.",
    )
    parser.add_argument(
        "--target-dir",
        required=True,
        help="Directory where Copilot .agent.md files will be generated.",
    )
    parser.add_argument(
        "--catalog",
        default="AGENTS.md",
        help="Optional AGENTS catalog used for strict all-agent coverage checks.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing files.")
    parser.add_argument("--strict", action="store_true", help="Fail on unresolved refs or unknown keys.")
    parser.add_argument(
        "--emit-fallback",
        dest="emit_fallback",
        action="store_true",
        default=True,
        help="Emit '-solo' fallback files for orchestrator agents (default: enabled).",
    )
    parser.add_argument(
        "--no-emit-fallback",
        dest="emit_fallback",
        action="store_false",
        help="Disable '-solo' fallback file generation.",
    )
    args = parser.parse_args()

    source_agents_dir = Path(args.source_agents).expanduser()
    target_dir = Path(args.target_dir).expanduser()
    catalog_path = Path(args.catalog).expanduser()

    if not source_agents_dir.exists():
        print(f"Source directory not found: {source_agents_dir}", file=sys.stderr)
        return 2

    try:
        source_agents = parse_source_agents(source_agents_dir)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    available_agent_names = {agent.name for agent in source_agents}
    catalog_agents = parse_catalog_agents(catalog_path)

    errors: List[str] = []
    generated: List[Tuple[Path, str]] = []

    if args.strict and catalog_agents:
        if catalog_agents != available_agent_names:
            missing_in_source = sorted(catalog_agents - available_agent_names)
            missing_in_catalog = sorted(available_agent_names - catalog_agents)
            if missing_in_source:
                errors.append(
                    "Agents listed in AGENTS.md but missing in source: " + ", ".join(missing_in_source)
                )
            if missing_in_catalog:
                errors.append(
                    "Agents present in source but missing in AGENTS.md: " + ", ".join(missing_in_catalog)
                )

    for agent in source_agents:
        if args.strict:
            unknown_keys = sorted(agent.fm_keys - KNOWN_SOURCE_FRONTMATTER_KEYS)
            if unknown_keys:
                errors.append(
                    f"{agent.path.as_posix()}: unknown frontmatter key(s): {', '.join(unknown_keys)}"
                )

        subagents, unresolved = extract_subagents(agent.body, available_agent_names)
        if args.strict and unresolved:
            errors.append(
                f"{agent.path.as_posix()}: unresolved @agent reference(s): {', '.join(unresolved)}"
            )

        body_main = adapt_body(agent.name, agent.body, solo_mode=False)
        content_main = build_agent_markdown(
            name=agent.name,
            description=agent.description,
            body=body_main,
            subagents=subagents,
        )
        main_path = target_dir / f"{agent.name}.agent.md"
        generated.append((main_path, content_main))

        if args.emit_fallback and agent.name.startswith(ORCHESTRATOR_PREFIX):
            solo_name = f"{agent.name}-solo"
            body_solo = adapt_body(agent.name, agent.body, solo_mode=True)
            content_solo = build_agent_markdown(
                name=solo_name,
                description=f"{agent.description} (fallback: no subagents)",
                body=body_solo,
                subagents=[],
            )
            solo_path = target_dir / f"{solo_name}.agent.md"
            generated.append((solo_path, content_solo))

    if args.strict:
        for out_path, out_content in generated:
            if "$ARGUMENTS" in out_content:
                errors.append(f"{out_path.as_posix()}: output still contains '$ARGUMENTS'")

    if errors:
        print("Validation failed:", file=sys.stderr)
        for err in errors:
            print(f"- {err}", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"Dry run: would generate {len(generated)} files into {target_dir.as_posix()}")
        for out_path, _ in generated:
            print(f"- {out_path.as_posix()}")
        return 0

    target_dir.mkdir(parents=True, exist_ok=True)
    for out_path, out_content in generated:
        write_text(out_path, out_content)

    print(f"Generated {len(generated)} files into {target_dir.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
