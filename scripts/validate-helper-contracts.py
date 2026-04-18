#!/usr/bin/env python3
"""Validate helper fixtures for kanban render fidelity and session-guide stability."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LEDGER_PATH = REPO_ROOT / "todo-ledger.example.json"
DEFAULT_KANBAN_PATH = REPO_ROOT / "kanban.example.md"
DEFAULT_SESSION_GUIDE_PATH = REPO_ROOT / "session-guide.example.md"
DEFAULT_SESSION_GUIDE_TEMPLATE_PATH = REPO_ROOT / "session-guide.example.md"

KANBAN_STATUS_TO_HEADING = {
    "backlog": "Backlog",
    "ready": "Ready",
    "doing": "Doing",
    "blocked": "Blocked",
    "done": "Done",
    "archived": "Archived",
    "open": "Ready",
    "obsolete": "Archived",
}
KANBAN_HEADING_ORDER = [
    "Backlog",
    "Ready",
    "Doing",
    "Blocked",
    "Done",
    "Archived",
]
KANBAN_ITEM_RE = re.compile(r"^- `([^`]+)` (.+?)\s*$")
SESSION_GUIDE_DISALLOWED_PATTERNS = [
    (re.compile(r"\b(?:run progress|run status|run state|per-run status|current run)\b", re.IGNORECASE), "run status/progress"),
    (re.compile(r"\btemporary blockers?\b", re.IGNORECASE), "temporary blockers"),
    (re.compile(r"\btask counts?\b", re.IGNORECASE), "task counts"),
    (re.compile(r"\b\d+\s*/\s*\d+\s+tasks?\b", re.IGNORECASE), "task progress counts"),
    (re.compile(r"\btasks?\s+(?:complete|completed|remaining|left)\b", re.IGNORECASE), "task progress status"),
    (re.compile(r"^#{2,6}\s+(?:kanban|backlog|ready|doing|blocked|done|archived)\b", re.IGNORECASE), "kanban headings"),
    (re.compile(r"^\s*-\s+`kb-[^`]+`", re.IGNORECASE), "kanban item bullets"),
    (re.compile(r"^\s*[-*]\s+\[(?: |x|X)\]", re.IGNORECASE), "task checklist state"),
]


@dataclass(frozen=True)
class KanbanItem:
    item_id: str
    summary: str


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"Missing required file: {path}") from error


def _load_json(path: Path) -> object:
    try:
        return json.loads(_read_text(path))
    except json.JSONDecodeError as error:
        raise ValueError(f"{path} is not valid JSON: {error}") from error


def _ensure_expected_headings(
    label: str, path: Path, expected: list[str], actual: list[str]
) -> None:
    if actual == expected:
        return

    missing = [heading for heading in expected if heading not in actual]
    unexpected = [heading for heading in actual if heading not in expected]
    details: list[str] = []
    if missing:
        details.append(f"missing={missing}")
    if unexpected:
        details.append(f"unexpected={unexpected}")
    if not missing and not unexpected:
        details.append(f"expected order={expected}")
        details.append(f"actual order={actual}")
    raise ValueError(f"{path} {label} do not match the expected contract: {'; '.join(details)}")


def _load_expected_kanban_items(ledger_path: Path) -> dict[str, list[KanbanItem]]:
    payload = _load_json(ledger_path)
    if not isinstance(payload, dict):
        raise ValueError(f"{ledger_path} must contain a JSON object.")

    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError(f"{ledger_path} must expose an 'items' array.")

    grouped = {heading: [] for heading in KANBAN_HEADING_ORDER}
    seen_ids: set[str] = set()

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"{ledger_path} item #{index} must be an object.")

        item_id = item.get("id")
        summary = item.get("summary")
        status = item.get("status")
        if not isinstance(item_id, str) or not item_id:
            raise ValueError(f"{ledger_path} item #{index} is missing a non-empty string id.")
        if not isinstance(summary, str) or not summary:
            raise ValueError(
                f"{ledger_path} item {item_id!r} is missing a non-empty string summary."
            )
        if not isinstance(status, str) or not status:
            raise ValueError(
                f"{ledger_path} item {item_id!r} is missing a non-empty string status."
            )
        if item_id in seen_ids:
            raise ValueError(f"{ledger_path} contains duplicate item id {item_id!r}.")

        heading = KANBAN_STATUS_TO_HEADING.get(status)
        if heading is None:
            supported = sorted(KANBAN_STATUS_TO_HEADING)
            raise ValueError(
                f"{ledger_path} item {item_id!r} has unsupported status {status!r}; expected one of {supported}."
            )

        grouped[heading].append(KanbanItem(item_id=item_id, summary=summary))
        seen_ids.add(item_id)

    return grouped


def _parse_kanban_sections(kanban_path: Path) -> dict[str, list[KanbanItem]]:
    lines = _read_text(kanban_path).splitlines()
    title_line = next((line.strip() for line in lines if line.strip()), "")
    if title_line != "# Kanban":
        raise ValueError(f"{kanban_path} must start with '# Kanban'.")

    sections: dict[str, list[KanbanItem]] = {}
    section_order: list[str] = []
    seen_ids: set[str] = set()
    current_heading: str | None = None
    saw_none_marker: dict[str, bool] = {}

    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.rstrip()
        heading_match = re.match(r"^##\s+(.+?)\s*$", line)
        if heading_match:
            current_heading = heading_match.group(1).strip()
            if current_heading in sections:
                raise ValueError(
                    f"{kanban_path}:{line_number} repeats section heading {current_heading!r}."
                )
            sections[current_heading] = []
            section_order.append(current_heading)
            saw_none_marker[current_heading] = False
            continue

        if current_heading is None:
            continue

        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "- None":
            if sections[current_heading]:
                raise ValueError(
                    f"{kanban_path}:{line_number} mixes '- None' with items in section {current_heading!r}."
                )
            if saw_none_marker[current_heading]:
                raise ValueError(
                    f"{kanban_path}:{line_number} repeats '- None' in section {current_heading!r}."
                )
            saw_none_marker[current_heading] = True
            continue

        item_match = KANBAN_ITEM_RE.match(stripped)
        if not item_match:
            raise ValueError(
                f"{kanban_path}:{line_number} contains unsupported content inside section {current_heading!r}: {stripped}"
            )
        if saw_none_marker[current_heading]:
            raise ValueError(
                f"{kanban_path}:{line_number} mixes items with '- None' in section {current_heading!r}."
            )

        item = KanbanItem(item_id=item_match.group(1), summary=item_match.group(2))
        if item.item_id in seen_ids:
            raise ValueError(f"{kanban_path}:{line_number} repeats item id {item.item_id!r}.")
        sections[current_heading].append(item)
        seen_ids.add(item.item_id)

    _ensure_expected_headings(
        "sections",
        kanban_path,
        KANBAN_HEADING_ORDER,
        section_order,
    )

    return sections


def validate_kanban_render(ledger_path: Path, kanban_path: Path) -> None:
    expected_sections = _load_expected_kanban_items(ledger_path)
    actual_sections = _parse_kanban_sections(kanban_path)

    expected_by_id = {
        item.item_id: (heading, item.summary)
        for heading, items in expected_sections.items()
        for item in items
    }
    actual_by_id = {
        item.item_id: (heading, item.summary)
        for heading, items in actual_sections.items()
        for item in items
    }

    missing_ids = sorted(set(expected_by_id) - set(actual_by_id))
    unexpected_ids = sorted(set(actual_by_id) - set(expected_by_id))
    wrong_sections = {
        item_id: {
            "expected": expected_by_id[item_id][0],
            "actual": actual_by_id[item_id][0],
        }
        for item_id in sorted(set(expected_by_id) & set(actual_by_id))
        if expected_by_id[item_id][0] != actual_by_id[item_id][0]
    }
    summary_mismatches = {
        item_id: {
            "expected": expected_by_id[item_id][1],
            "actual": actual_by_id[item_id][1],
        }
        for item_id in sorted(set(expected_by_id) & set(actual_by_id))
        if expected_by_id[item_id][1] != actual_by_id[item_id][1]
    }
    order_mismatches = {
        heading: {
            "expected": [item.item_id for item in expected_sections[heading]],
            "actual": [item.item_id for item in actual_sections[heading]],
        }
        for heading in KANBAN_HEADING_ORDER
        if [item.item_id for item in expected_sections[heading]]
        != [item.item_id for item in actual_sections[heading]]
        and sorted(item.item_id for item in expected_sections[heading])
        == sorted(item.item_id for item in actual_sections[heading])
    }

    issues: list[str] = []
    if missing_ids:
        issues.append(f"missing ids={missing_ids}")
    if unexpected_ids:
        issues.append(f"unexpected ids={unexpected_ids}")
    if wrong_sections:
        issues.append(f"wrong sections={wrong_sections}")
    if summary_mismatches:
        issues.append(f"summary mismatches={summary_mismatches}")
    if order_mismatches:
        issues.append(f"order mismatches={order_mismatches}")
    if issues:
        raise ValueError(
            f"{kanban_path} does not render {ledger_path} faithfully: {'; '.join(issues)}"
        )


def _extract_session_guide_sections(path: Path) -> tuple[list[str], dict[str, list[tuple[int, str]]]]:
    lines = _read_text(path).splitlines()
    title_line = next((line.strip() for line in lines if line.strip()), "")
    if title_line != "# Session Guide":
        raise ValueError(f"{path} must start with '# Session Guide'.")

    sections: list[str] = []
    content_by_section: dict[str, list[tuple[int, str]]] = {}
    current_heading: str | None = None
    for line_number, line in enumerate(lines, start=1):
        heading_match = re.match(r"^##\s+(.+?)\s*$", line)
        if heading_match:
            current_heading = heading_match.group(1).strip()
            if current_heading in content_by_section:
                raise ValueError(f"{path}:{line_number} repeats section heading {current_heading!r}.")
            sections.append(current_heading)
            content_by_section[current_heading] = []
            continue
        if current_heading is not None:
            content_by_section[current_heading].append((line_number, line))

    if not sections:
        raise ValueError(f"{path} must contain stable '##' sections.")
    return sections, content_by_section


def _expected_session_guide_sections(template_path: Path) -> list[str]:
    sections, _ = _extract_session_guide_sections(template_path)
    return sections


def validate_session_guide(
    session_guide_path: Path, session_guide_template_path: Path
) -> None:
    expected_sections = _expected_session_guide_sections(session_guide_template_path)
    actual_sections, content_by_section = _extract_session_guide_sections(session_guide_path)

    if actual_sections != expected_sections:
        missing = [heading for heading in expected_sections if heading not in actual_sections]
        unexpected = [heading for heading in actual_sections if heading not in expected_sections]
        details: list[str] = []
        if missing:
            details.append(f"missing={missing}")
        if unexpected:
            details.append(f"unexpected={unexpected}")
        if not missing and not unexpected:
            details.append(f"expected order={expected_sections}")
            details.append(f"actual order={actual_sections}")
        raise ValueError(
            f"{session_guide_path} top-level sections do not match template {session_guide_template_path}: {'; '.join(details)}"
        )

    for heading, content_lines in content_by_section.items():
        if not any(line.strip() for _, line in content_lines):
            raise ValueError(f"{session_guide_path} section {heading!r} must not be empty.")

    lines = _read_text(session_guide_path).splitlines()
    for line_number, line in enumerate(lines, start=1):
        for pattern, label in SESSION_GUIDE_DISALLOWED_PATTERNS:
            if pattern.search(line):
                raise ValueError(
                    f"{session_guide_path}:{line_number} contains ephemeral content ({label}): {line.strip()}"
                )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate the checked-in helper contracts: kanban.example.md must stay a faithful "
            "render of todo-ledger.example.json, and session-guide outputs must keep the stable "
            "section contract while excluding ephemeral run-state content."
        )
    )
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER_PATH), help="Path to the todo-ledger JSON to validate against.")
    parser.add_argument("--kanban", default=str(DEFAULT_KANBAN_PATH), help="Path to the kanban Markdown render to validate.")
    parser.add_argument(
        "--session-guide",
        dest="session_guide",
        default=str(DEFAULT_SESSION_GUIDE_PATH),
        help="Path to the session-guide Markdown file to validate.",
    )
    parser.add_argument(
        "--session-guide-template",
        dest="session_guide_template",
        default=str(DEFAULT_SESSION_GUIDE_TEMPLATE_PATH),
        help="Stable session-guide template whose top-level sections define the allowed structure.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    ledger_path = Path(args.ledger)
    kanban_path = Path(args.kanban)
    session_guide_path = Path(args.session_guide)
    session_guide_template_path = Path(args.session_guide_template)

    validate_kanban_render(ledger_path, kanban_path)
    validate_session_guide(session_guide_path, session_guide_template_path)

    print(f"OK: {kanban_path} matches {ledger_path} item/status render fidelity.")
    print(
        "OK: "
        f"{session_guide_path} matches the stable session-guide contract from {session_guide_template_path}."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
