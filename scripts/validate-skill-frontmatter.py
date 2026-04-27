#!/usr/bin/env python3
"""Validate repo-managed skill SKILL.md frontmatter for YAML-safe scalars."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


FRONTMATTER_BOUNDARY = "---"
KEY_VALUE_RE = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*)$")
SPECIAL_STARTS = set("-?:,[]{}#&*!|>'\"%@`")
RISKY_SUBSTRINGS = (": ", " #", "\t#")
REQUIRED_KEYS = {"name", "description"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate YAML-safe frontmatter in repo-managed skill files."
    )
    parser.add_argument(
        "--skills-dir",
        default="opencode/skills",
        help="Directory containing skill subdirectories (default: opencode/skills).",
    )
    return parser.parse_args()


def is_quoted_or_block(value: str) -> bool:
    return bool(value) and value[0] in {'"', "'", "|", ">"}


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
