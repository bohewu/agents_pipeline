#!/usr/bin/env python3
"""Validate repo-managed skill SKILL.md frontmatter for YAML-safe scalars."""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path


FRONTMATTER_BOUNDARY = "---"
KEY_VALUE_RE = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*)$")
SPECIAL_STARTS = set("-?:,[]{}#&*!|>'\"%@`")
RISKY_SUBSTRINGS = (": ", " #", "\t#")
REQUIRED_KEYS = {"name", "description"}
ALLOWED_KEYS = {"name", "description", "license", "allowed-tools", "metadata"}
SKILL_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
OPENAI_INTERFACE_KEYS = {"display_name", "short_description", "default_prompt"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate YAML-safe frontmatter in repo-managed skill files."
    )
    parser.add_argument(
        "--skills-dir",
        default="skills",
        help="Directory containing skill subdirectories (default: skills).",
    )
    return parser.parse_args()


def is_quoted_or_block(value: str) -> bool:
    return bool(value) and value[0] in {'"', "'", "|", ">"}


def decode_quoted_scalar(value: str) -> str:
    if value.startswith(('"', "'")):
        decoded = ast.literal_eval(value)
        if not isinstance(decoded, str):
            raise ValueError("quoted value is not a string")
        return decoded
    return value


def validate_openai_metadata(skill_dir: Path, skill_name: str) -> list[str]:
    path = skill_dir / "agents" / "openai.yaml"
    if path.is_symlink() or not path.is_file():
        return [f"{path}: missing regular agents/openai.yaml metadata"]
    fields: dict[str, tuple[int, str]] = {}
    errors: list[str] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "interface:":
        errors.append(f"{path}: metadata must start with an interface mapping")
    pattern = re.compile(
        r"^  (display_name|short_description|default_prompt):\s*(.+)$"
    )
    for line_no, line in enumerate(lines, start=1):
        match = pattern.match(line)
        if match:
            fields[match.group(1)] = (line_no, match.group(2).strip())
    missing = sorted(OPENAI_INTERFACE_KEYS - set(fields))
    if missing:
        errors.append(f"{path}: missing interface key(s): {', '.join(missing)}")
    decoded: dict[str, str] = {}
    for key, (line_no, raw_value) in fields.items():
        if not raw_value.startswith(('"', "'")):
            errors.append(f"{path}:{line_no}: {key} must be a quoted string")
            continue
        try:
            decoded[key] = decode_quoted_scalar(raw_value)
        except (SyntaxError, ValueError):
            errors.append(f"{path}:{line_no}: {key} must be a quoted string")
    short_description = decoded.get("short_description")
    if short_description is not None and not 25 <= len(short_description) <= 64:
        errors.append(
            f"{path}: short_description must be between 25 and 64 characters"
        )
    default_prompt = decoded.get("default_prompt")
    if default_prompt is not None and f"${skill_name}" not in default_prompt:
        errors.append(
            f"{path}: default_prompt must explicitly mention ${skill_name}"
        )
    return errors


def validate_scalar(path: Path, line_no: int, key: str, value: str) -> list[str]:
    errors: list[str] = []
    if not value:
        errors.append(f"{path}:{line_no}: frontmatter key '{key}' must not be empty")
        return errors

    if is_quoted_or_block(value):
        return errors

    if value[0] in SPECIAL_STARTS:
        errors.append(
            f"{path}:{line_no}: frontmatter key '{key}' must quote scalar starting with {value[0]!r}"
        )

    for token in RISKY_SUBSTRINGS:
        if token in value:
            errors.append(
                f"{path}:{line_no}: frontmatter key '{key}' must quote scalar containing {token!r}"
            )
            break

    return errors


def validate_skill(path: Path) -> list[str]:
    errors: list[str] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) < 3 or lines[0].strip() != FRONTMATTER_BOUNDARY:
        return [f"{path}: missing YAML frontmatter block"]

    frontmatter_end = None
    for idx, line in enumerate(lines[1:], start=2):
        if line.strip() == FRONTMATTER_BOUNDARY:
            frontmatter_end = idx
            break
    if frontmatter_end is None:
        return [f"{path}: unterminated YAML frontmatter block"]

    seen: dict[str, int] = {}
    for line_no, line in enumerate(lines[1 : frontmatter_end - 1], start=2):
        stripped = line.strip()
        if not stripped:
            errors.append(f"{path}:{line_no}: blank lines are not allowed in frontmatter")
            continue
        if line[0].isspace():
            errors.append(f"{path}:{line_no}: nested frontmatter values are not supported")
            continue
        match = KEY_VALUE_RE.match(line)
        if match is None:
            errors.append(f"{path}:{line_no}: malformed frontmatter line: {line!r}")
            continue
        key = match.group(1)
        value = match.group(2).strip()
        if key in seen:
            errors.append(
                f"{path}:{line_no}: duplicate frontmatter key '{key}' also seen on line {seen[key]}"
            )
        seen[key] = line_no
        errors.extend(validate_scalar(path, line_no, key, value))

    missing = sorted(REQUIRED_KEYS - set(seen))
    if missing:
        errors.append(f"{path}: missing required frontmatter key(s): {', '.join(missing)}")

    unexpected = sorted(set(seen) - ALLOWED_KEYS)
    if unexpected:
        errors.append(
            f"{path}: unsupported frontmatter key(s): {', '.join(unexpected)}"
        )

    expected_name = path.parent.name
    actual_name = ""
    for line_no, line in enumerate(lines[1 : frontmatter_end - 1], start=2):
        match = KEY_VALUE_RE.match(line)
        if match and match.group(1) == "name":
            actual_name = match.group(2).strip().strip('"').strip("'")
            break
    if actual_name and actual_name != expected_name:
        errors.append(
            f"{path}: frontmatter name must match skill directory: expected {expected_name!r}, got {actual_name!r}"
        )

    try:
        decoded_name = decode_quoted_scalar(actual_name)
    except (SyntaxError, ValueError):
        decoded_name = ""
    if decoded_name and (
        len(decoded_name) > 64 or SKILL_NAME_RE.fullmatch(decoded_name) is None
    ):
        errors.append(f"{path}: invalid skill name {decoded_name!r}")

    description_value = ""
    for line in lines[1 : frontmatter_end - 1]:
        match = KEY_VALUE_RE.match(line)
        if match and match.group(1) == "description":
            description_value = match.group(2).strip()
            break
    try:
        description = decode_quoted_scalar(description_value)
    except (SyntaxError, ValueError):
        description = ""
    if description and (len(description) > 1024 or "<" in description or ">" in description):
        errors.append(
            f"{path}: description must be at most 1024 characters without angle brackets"
        )

    errors.extend(validate_openai_metadata(path.parent, expected_name))

    return errors


def main() -> int:
    args = parse_args()
    skills_dir = Path(args.skills_dir)
    skill_files = sorted(skills_dir.glob("*/SKILL.md"))
    if not skill_files:
        print(f"No skill files found under {skills_dir}.", file=sys.stderr)
        return 1

    errors: list[str] = []
    for path in skill_files:
        errors.extend(validate_skill(path))

    if errors:
        print("Skill frontmatter validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: validated {len(skill_files)} skill frontmatter blocks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
