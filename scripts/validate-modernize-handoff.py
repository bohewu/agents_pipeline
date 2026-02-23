#!/usr/bin/env python3
"""Validate modernize->pipeline handoff payloads against the JSON schema."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, List


def _default_schema_path() -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root / "opencode" / "protocols" / "schemas" / "modernize-exec-handoff.schema.json"


def _load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"[ERROR] File not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"[ERROR] Invalid JSON in {path}: {exc}")


def _format_error_path(path_items: Iterable[object]) -> str:
    parts: List[str] = ["$"]
    for item in path_items:
        if isinstance(item, int):
            parts.append(f"[{item}]")
        else:
            parts.append(f".{item}")
    return "".join(parts)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate modernize execution handoff JSON against the schema."
    )
    parser.add_argument(
        "payload",
        nargs="+",
        help="Path(s) to handoff JSON payload(s) to validate.",
    )
    parser.add_argument(
        "--schema",
        default=str(_default_schema_path()),
        help="Path to schema JSON (default: opencode/protocols/schemas/modernize-exec-handoff.schema.json).",
    )
    parser.add_argument(
        "--expect-invalid",
        action="store_true",
        help="Invert expectation: treat validation failure as success (useful for negative test examples).",
    )
    parser.add_argument(
        "--max-errors",
        type=int,
        default=5,
        help="Maximum validation errors to print per payload (default: 5).",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    schema_path = Path(args.schema).resolve()
    if not schema_path.exists():
        print(f"[ERROR] Schema not found: {schema_path}", file=sys.stderr)
        return 2

    try:
        from jsonschema import Draft7Validator  # type: ignore
    except ImportError:
        print(
            "[ERROR] Missing dependency: jsonschema\n"
            "Install it with one of:\n"
            "  pip install jsonschema\n"
            "  py -m pip install jsonschema",
            file=sys.stderr,
        )
        return 2

    schema = _load_json(schema_path)
    validator = Draft7Validator(schema)

    overall_ok = True
    for payload_arg in args.payload:
        payload_path = Path(payload_arg).resolve()
        payload = _load_json(payload_path)
        errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))

        if args.expect_invalid:
            if errors:
                print(f"[OK] Expected invalid: {payload_path}")
                for err in errors[: args.max_errors]:
                    print(f"  - {_format_error_path(err.path)}: {err.message}")
            else:
                print(f"[FAIL] Expected invalid but schema validation passed: {payload_path}", file=sys.stderr)
                overall_ok = False
            continue

        if not errors:
            print(f"[OK] Valid: {payload_path}")
            continue

        print(f"[FAIL] Invalid: {payload_path}", file=sys.stderr)
        for err in errors[: args.max_errors]:
            print(f"  - {_format_error_path(err.path)}: {err.message}", file=sys.stderr)
        if len(errors) > args.max_errors:
            print(
                f"  - ... {len(errors) - args.max_errors} more error(s) omitted (use --max-errors)",
                file=sys.stderr,
            )
        overall_ok = False

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

