#!/usr/bin/env python3
"""Validate reviewer failure classification and retry guidance text."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CHECKS = {
    Path("agents/reviewer.md"): [
        "[artifact]",
        "[evidence]",
        "[logic]",
        "Do not edit files, apply fixes, stage, commit",
        "the actual files and diff are the PRIMARY source of truth",
        "[logic][P1] src/auth.ts:84",
        "`overall_status = fail` requires at least one issue and at least one actionable required followup",
        "For review failures caused only by artifact/evidence gaps",
        "currently reachable wrong behavior or practical risk",
        "Omit P3 findings unless",
        "Never turn a warning, wording preference",
    ],
    Path("agents/orchestrator-pipeline.md"): [
        "reviewer MUST prefix every issue/followup string",
        "If every `required_followups` entry is `[artifact]` and/or `[evidence]`",
        "If any `required_followups` entry is `[logic]`",
        "Retry classification rules:",
        "Only evidence-backed blocking P0-P2 findings may fail the run",
        "P3 suggestions, wording preferences, and optional improvements never create delta tasks",
        "Apply `protocols/MATERIALITY_GATE.md` before every repair, re-review, retry, or",
        "Reviewer models never uplift",
        "generic risk",
        "`optional_notes` are not remaining work",
    ],
    Path("agents/orchestrator-flow.md"): [
        "Apply `protocols/MATERIALITY_GATE.md` before every repair, reviewer re-review, or",
        "Reviewer models never uplift",
        "generic risk alone does not",
        "unmet original requirement, concrete evidence, and practical impact",
    ],
    Path("agents/orchestrator-simple.md"): [
        "Apply `protocols/MATERIALITY_GATE.md` before every repair, re-review, or narrow recovery",
        "Reviewer models never uplift",
        "generic risk alone does not",
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
