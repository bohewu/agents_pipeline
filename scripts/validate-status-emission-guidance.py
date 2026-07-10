#!/usr/bin/env python3
"""Validate status emission, derived-flag persistence, and resume guidance."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CHECKS = {
    Path("opencode/protocols/PIPELINE_PROTOCOL.md"): [
        "roughly no more than once per 15 seconds per active agent",
        "skip the heartbeat and flush the final batch instead",
        'prefer one `event = "batch"` call',
        "runtime MUST merge these overrides over persisted `checkpoint.flags`",
        "Required derived-flag persistence points",
    ],
    Path("opencode/agents/orchestrator-pipeline.md"): [
        "roughly no more than once per 15 seconds",
        "skip redundant heartbeats when completion or a richer batched delta is likely soon",
        'event = "batch"',
        "hydrate the persisted effective flags from `checkpoint.flags` first",
        "Stage 3 completion event MUST persist the risk-derived `max_retry_rounds`",
    ],
    Path("opencode/agents/orchestrator-flow.md"): [
        "roughly >=15 seconds",
        "only emit standalone heartbeats when the task is still active",
        'event = "batch"',
        "legacy task with `effort` but without required `risk` / `review_required`",
        "Start a fresh run with a new `run_id`",
        "Stage 2 completion event MUST persist the risk-derived `review_mode`",
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

    print("OK: status guidance keeps batching, derived flags, and safe resume semantics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
