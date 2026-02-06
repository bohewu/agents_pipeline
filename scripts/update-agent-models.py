#!/usr/bin/env python
import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


CATALOG_ROW_RE = re.compile(
    r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$"
)
FRONTMATTER_BOUNDARY = re.compile(r"^\s*---\s*$")
FRONTMATTER_KEY_RE = re.compile(r"^(\s*)([A-Za-z0-9_-]+)(\s*:\s*)(.*)$")


def detect_newline(content: str) -> str:
    return "\r\n" if "\r\n" in content else "\n"


def split_lines(content: str) -> List[str]:
    return content.splitlines()


def join_lines(lines: List[str], newline: str, had_trailing_newline: bool) -> str:
    updated = newline.join(lines)
    if had_trailing_newline:
        updated += newline
    return updated


def load_json(path: Path) -> Dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate_config(config: Dict) -> Tuple[Dict[str, str], List[str], List[str], List[str]]:
    errors: List[str] = []

    raw_mapping = config.get("agent_models")
    if not isinstance(raw_mapping, dict):
        errors.append("'agent_models' must be an object mapping agent -> model string")
        return {}, [], [], errors

    mapping: Dict[str, str] = {}
    for raw_agent, raw_model in raw_mapping.items():
        if not isinstance(raw_agent, str) or not raw_agent.strip():
            errors.append(f"Invalid agent key: {raw_agent!r}")
            continue
        if not isinstance(raw_model, str) or not raw_model.strip():
            errors.append(f"Invalid model for agent {raw_agent!r}: {raw_model!r}")
            continue
        mapping[raw_agent.strip()] = raw_model.strip()

    supported_raw = config.get("supported_models", [])
    discouraged_raw = config.get("discouraged_default_models", [])

    if not isinstance(supported_raw, list):
        errors.append("'supported_models' must be an array of strings")
        supported_raw = []
    if not isinstance(discouraged_raw, list):
        errors.append("'discouraged_default_models' must be an array of strings")
        discouraged_raw = []

    supported = [item.strip() for item in supported_raw if isinstance(item, str) and item.strip()]
    discouraged = [item.strip() for item in discouraged_raw if isinstance(item, str) and item.strip()]

    return mapping, supported, discouraged, errors


def update_agents_catalog(content: str, mapping: Dict[str, str]) -> Tuple[str, List[Tuple[str, str, str]], List[str]]:
    lines = split_lines(content)
    changed: List[Tuple[str, str, str]] = []
    warnings: List[str] = []
    seen_agents = set()
    out_lines: List[str] = []

    for line in lines:
        match = CATALOG_ROW_RE.match(line)
        if not match:
            out_lines.append(line)
            continue

        agent, role, model, mode, notes = [group.strip() for group in match.groups()]
        if agent == "Agent" or set(agent) <= {"-"}:
            out_lines.append(line)
            continue

        seen_agents.add(agent)
        target_model = mapping.get(agent)
        if target_model is None:
            warnings.append(f"AGENTS.md row has no mapping in config: {agent}")
            out_lines.append(line)
            continue

        if target_model != model:
            changed.append((agent, model, target_model))
            out_lines.append(f"| {agent} | {role} | {target_model} | {mode} | {notes} |")
        else:
            out_lines.append(line)

    for missing in sorted(set(mapping.keys()) - seen_agents):
        warnings.append(f"Config agent not found in AGENTS.md: {missing}")

    newline = detect_newline(content)
    had_trailing_newline = content.endswith("\n") or content.endswith("\r\n")
    return join_lines(out_lines, newline, had_trailing_newline), changed, warnings


def get_frontmatter_range(lines: List[str]) -> Optional[Tuple[int, int]]:
    if not lines:
        return None
    if not FRONTMATTER_BOUNDARY.match(lines[0]):
        return None
    for idx in range(1, len(lines)):
        if FRONTMATTER_BOUNDARY.match(lines[idx]):
            return 0, idx
    return None


def parse_frontmatter_key(lines: List[str], start: int, end: int, key: str) -> Optional[Tuple[int, str]]:
    target_key = key.lower()
    for idx in range(start + 1, end):
        match = FRONTMATTER_KEY_RE.match(lines[idx])
        if not match:
            continue
        found_key = match.group(2).strip().lower()
        if found_key != target_key:
            continue
        value = match.group(4).strip()
        return idx, value
    return None


def set_frontmatter_model(content: str, target_model: str) -> Tuple[str, Optional[str], bool, Optional[str]]:
    lines = split_lines(content)
    fm_range = get_frontmatter_range(lines)
    if fm_range is None:
        return content, None, False, "Missing frontmatter block"

    start, end = fm_range
    newline = detect_newline(content)
    had_trailing_newline = content.endswith("\n") or content.endswith("\r\n")

    model_info = parse_frontmatter_key(lines, start, end, "model")
    if model_info is None:
        lines.insert(end, f"model: {target_model}")
        updated = join_lines(lines, newline, had_trailing_newline)
        return updated, None, True, None

    model_idx, old_model = model_info
    match = FRONTMATTER_KEY_RE.match(lines[model_idx])
    if match is None:
        return content, None, False, "Invalid model line format"

    if old_model == target_model:
        return content, old_model, False, None

    indent = match.group(1)
    sep = match.group(3)
    lines[model_idx] = f"{indent}model{sep}{target_model}"
    updated = join_lines(lines, newline, had_trailing_newline)
    return updated, old_model, True, None


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8") as handle:
        return handle.read()


def write_text(path: Path, content: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(content)


def update_opencode_agents(
    opencode_root: Path, mapping: Dict[str, str]
) -> Tuple[List[Tuple[str, str, str]], List[str], List[Tuple[Path, str]]]:
    changed: List[Tuple[str, str, str]] = []
    warnings: List[str] = []
    pending_writes: List[Tuple[Path, str]] = []

    agents_dir = opencode_root / "agents"
    if not agents_dir.exists():
        warnings.append(f"Directory not found: {agents_dir}")
        return changed, warnings, pending_writes

    for path in sorted(agents_dir.glob("*.md")):
        agent_name = path.stem
        target = mapping.get(agent_name)
        if target is None:
            warnings.append(f"No model mapping for opencode agent file: {path.as_posix()}")
            continue

        source = read_text(path)
        updated, old_model, is_changed, error = set_frontmatter_model(source, target)
        if error:
            warnings.append(f"{path.as_posix()}: {error}")
            continue
        if is_changed:
            previous = old_model if old_model is not None else "<missing>"
            changed.append((path.as_posix(), previous, target))
            pending_writes.append((path, updated))

    return changed, warnings, pending_writes


def strip_quotes(value: str) -> str:
    if len(value) >= 2 and ((value[0] == value[-1] == "'") or (value[0] == value[-1] == '"')):
        return value[1:-1]
    return value


def update_opencode_commands(
    opencode_root: Path, mapping: Dict[str, str]
) -> Tuple[List[Tuple[str, str, str]], List[str], List[Tuple[Path, str]]]:
    changed: List[Tuple[str, str, str]] = []
    warnings: List[str] = []
    pending_writes: List[Tuple[Path, str]] = []

    commands_dir = opencode_root / "commands"
    if not commands_dir.exists():
        warnings.append(f"Directory not found: {commands_dir}")
        return changed, warnings, pending_writes

    for path in sorted(commands_dir.glob("*.md")):
        source = read_text(path)
        lines = split_lines(source)
        fm_range = get_frontmatter_range(lines)
        if fm_range is None:
            warnings.append(f"{path.as_posix()}: Missing frontmatter block")
            continue

        start, end = fm_range
        agent_info = parse_frontmatter_key(lines, start, end, "agent")
        if agent_info is None:
            warnings.append(f"{path.as_posix()}: Missing frontmatter 'agent'")
            continue

        _, agent_value = agent_info
        command_agent = strip_quotes(agent_value.strip())
        target = mapping.get(command_agent)
        if target is None:
            warnings.append(f"{path.as_posix()}: Agent '{command_agent}' not found in config mapping")
            continue

        updated, old_model, is_changed, error = set_frontmatter_model(source, target)
        if error:
            warnings.append(f"{path.as_posix()}: {error}")
            continue
        if is_changed:
            previous = old_model if old_model is not None else "<missing>"
            changed.append((path.as_posix(), previous, target))
            pending_writes.append((path, updated))

    return changed, warnings, pending_writes


def print_changes(title: str, changes: List[Tuple[str, str, str]]) -> None:
    print(f"{title}: {len(changes)}")
    for item, old_model, new_model in changes:
        print(f"- {item}: {old_model} -> {new_model}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync model defaults from JSON into AGENTS.md and opencode frontmatter files."
    )
    parser.add_argument("--config", default="agent-models.json", help="Path to model mapping JSON.")
    parser.add_argument("--agents", default="AGENTS.md", help="Path to AGENTS.md.")
    parser.add_argument(
        "--opencode-root",
        default="opencode",
        help="Path to opencode root that contains agents/ and commands/.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing files.")
    parser.add_argument(
        "--strict-supported",
        action="store_true",
        help="Fail when an agent model is not listed in supported_models.",
    )
    args = parser.parse_args()

    config_path = Path(os.path.expanduser(args.config))
    agents_md_path = Path(os.path.expanduser(args.agents))
    opencode_root = Path(os.path.expanduser(args.opencode_root))

    try:
        config = load_json(config_path)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Failed to load config JSON: {exc}", file=sys.stderr)
        return 2

    mapping, supported_models, discouraged_models, errors = validate_config(config)
    if errors:
        for err in errors:
            print(f"Config error: {err}", file=sys.stderr)
        return 2

    warnings: List[str] = []

    supported_set = set(supported_models)
    for agent, model in mapping.items():
        if supported_set and model not in supported_set:
            message = f"Model for {agent} is not listed in supported_models: {model}"
            if args.strict_supported:
                print(f"Config error: {message}", file=sys.stderr)
                return 2
            warnings.append(message)

    discouraged_set = set(discouraged_models)
    for agent, model in mapping.items():
        if model in discouraged_set:
            warnings.append(f"Discouraged default model used by {agent}: {model} (typically higher cost)")

    catalog_changes: List[Tuple[str, str, str]] = []
    catalog_write: Optional[str] = None
    try:
        catalog_source = read_text(agents_md_path)
    except OSError as exc:
        print(f"Failed to read AGENTS.md: {exc}", file=sys.stderr)
        return 2

    catalog_updated, changed_rows, catalog_warnings = update_agents_catalog(catalog_source, mapping)
    warnings.extend(catalog_warnings)
    for agent, old_model, new_model in changed_rows:
        catalog_changes.append((f"{agents_md_path.as_posix()}:{agent}", old_model, new_model))
    if catalog_updated != catalog_source:
        catalog_write = catalog_updated

    op_agents_changes, op_agents_warnings, op_agents_writes = update_opencode_agents(opencode_root, mapping)
    warnings.extend(op_agents_warnings)
    op_commands_changes, op_commands_warnings, op_commands_writes = update_opencode_commands(opencode_root, mapping)
    warnings.extend(op_commands_warnings)

    print_changes("AGENTS.md rows updated", catalog_changes)
    print_changes("opencode/agents frontmatter updated", op_agents_changes)
    print_changes("opencode/commands frontmatter updated", op_commands_changes)

    if warnings:
        print("Warnings:")
        for warning in sorted(set(warnings)):
            print(f"- {warning}")

    if args.dry_run:
        print("Dry-run mode: no files written.")
        return 0

    if catalog_write is not None:
        write_text(agents_md_path, catalog_write)

    for path, content in op_agents_writes + op_commands_writes:
        write_text(path, content)

    print("Write complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
