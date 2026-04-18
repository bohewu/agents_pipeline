#!/usr/bin/env python3
"""Validate that status event emission guidance stays conservative and batched."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CHECKS = {
    Path("opencode/protocols/PIPELINE_PROTOCOL.md"): [
        "roughly no more than once per 15 seconds per active agent",
        "skip the heartbeat and flush the final batch instead",
        'prefer one `event = "batch"` call',
    ],
    Path("opencode/agents/orchestrator-pipeline.md"): [
        "roughly no more than once per 15 seconds",
        "skip redundant heartbeats when completion or a richer batched delta is likely soon",
        'event = "batch"',
    ],
    Path("opencode/agents/orchestrator-flow.md"): [
        "roughly >=15 seconds",
        "only emit standalone heartbeats when the task is still active",
        'event = "batch"',
    ],
    Path("opencode/commands/run-pipeline.md"): [
        "coarse standalone heartbeat cadence",
    ],
    Path("opencode/commands/run-flow.md"): [
        "coarse standalone heartbeat cadence",
    ],
    Path("docs/status-implementation-checklist.md"): [
        "Standalone heartbeats are for long-running active work only",
        "roughly >=15 seconds",
    ],
}


def main() -> int:
    missing: list[str] = []
    for relative_path, tokens in CHECKS.items():
        path = REPO_ROOT / relative_path
        text = path.read_text(encoding="utf-8")
        absent = [token for token in tokens if token not in text]
        if absent:
            missing.append(f"{relative_path}: missing {absent}")

    if missing:
        print("FAIL: status emission guidance drift detected", file=sys.stderr)
        for line in missing:
            print(f"- {line}", file=sys.stderr)
        return 1

    print("OK: status emission guidance keeps batched flushes and coarse heartbeat cadence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
