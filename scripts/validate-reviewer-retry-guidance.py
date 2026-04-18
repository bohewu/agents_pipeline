#!/usr/bin/env python3
"""Validate reviewer failure classification and retry guidance text."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CHECKS = {
    Path("opencode/agents/reviewer.md"): [
        "[artifact]",
        "[evidence]",
        "[logic]",
        "For review failures caused only by artifact/evidence gaps",
    ],
    Path("opencode/agents/orchestrator-pipeline.md"): [
        "reviewer MUST prefix every issue/followup string",
        "If every `required_followups` entry is `[artifact]` and/or `[evidence]`",
        "If any `required_followups` entry is `[logic]`",
        "Retry classification rules:",
    ],
    Path("opencode/commands/run-pipeline.md"): [
        "Reviewer failures are classified in-band with `[artifact]`, `[evidence]`, or `[logic]` prefixes",
    ],
}


def main() -> int:
    missing: list[str] = []
    for relative_path, tokens in CHECKS.items():
        text = (REPO_ROOT / relative_path).read_text(encoding="utf-8")
        absent = [token for token in tokens if token not in text]
        if absent:
            missing.append(f"{relative_path}: missing {absent}")

    if missing:
        print("FAIL: reviewer retry guidance drift detected", file=sys.stderr)
        for line in missing:
            print(f"- {line}", file=sys.stderr)
        return 1

    print("OK: reviewer retry guidance keeps in-band failure classification and narrow repair routing")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
