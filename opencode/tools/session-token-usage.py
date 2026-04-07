#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect local Codex session token usage for the current worktree."
    )
    parser.add_argument("--project-root", default=os.getcwd())
    parser.add_argument("--format", default="json", choices=["json"])
    return parser.parse_args()


def norm_path(value: str) -> str:
    return os.path.normcase(os.path.normpath(str(Path(value).expanduser())))


def load_session_index(index_path: Path) -> Dict[str, Dict[str, Any]]:
    sessions: Dict[str, Dict[str, Any]] = {}
    if not index_path.exists():
        return sessions
    with index_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            session_id = payload.get("id")
            if isinstance(session_id, str) and session_id:
                sessions[session_id] = payload
    return sessions


def iter_rollout_files(root: Path) -> Iterable[Path]:
    if not root.exists():
        return []
    return root.glob("**/rollout-*.jsonl")


def parse_rollout(path: Path) -> Optional[Dict[str, Any]]:
    session_meta: Optional[Dict[str, Any]] = None
    latest_token_event: Optional[Dict[str, Any]] = None
    latest_timestamp: Optional[str] = None

    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            entry_type = payload.get("type")
            if entry_type == "session_meta" and isinstance(
                payload.get("payload"), dict
            ):
                session_meta = payload["payload"]
                continue

            if entry_type != "event_msg":
                continue
            event = payload.get("payload")
            if not isinstance(event, dict) or event.get("type") != "token_count":
                continue
            info = event.get("info")
            if not isinstance(info, dict):
                continue
            latest_token_event = event
            latest_timestamp = (
                payload.get("timestamp")
                if isinstance(payload.get("timestamp"), str)
                else latest_timestamp
            )

    if not session_meta or not latest_token_event:
        return None

    return {
        "session_meta": session_meta,
        "token_event": latest_token_event,
        "timestamp": latest_timestamp,
        "path": str(path),
    }


def with_uncached(values: Optional[Dict[str, Any]]) -> Dict[str, int]:
    source = values if isinstance(values, dict) else {}
    input_tokens = int(source.get("input_tokens") or 0)
    cached_input_tokens = int(source.get("cached_input_tokens") or 0)
    output_tokens = int(source.get("output_tokens") or 0)
    reasoning_output_tokens = int(source.get("reasoning_output_tokens") or 0)
    total_tokens = int(source.get("total_tokens") or (input_tokens + output_tokens))
    return {
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "uncached_input_tokens": max(input_tokens - cached_input_tokens, 0),
        "output_tokens": output_tokens,
        "reasoning_output_tokens": reasoning_output_tokens,
        "total_tokens": total_tokens,
    }


def format_compact_tokens(value: int) -> str:
    absolute = abs(int(value))
    sign = "-" if value < 0 else ""
    if absolute >= 1_000_000:
        rendered = f"{absolute / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{sign}{rendered}M"
    if absolute >= 1_000:
        rendered = f"{absolute / 1_000:.1f}".rstrip("0").rstrip(".")
        return f"{sign}{rendered}k"
    return f"{value}"


def with_display(values: Dict[str, int]) -> Dict[str, Any]:
    return {
        **values,
        "display": {key: format_compact_tokens(raw) for key, raw in values.items()},
    }


def select_session(project_root: Path, codex_root: Path) -> Dict[str, Any]:
    target_root = norm_path(str(project_root))
    session_index = load_session_index(codex_root / "session_index.jsonl")
    sessions_root = codex_root / "sessions"

    best: Optional[Dict[str, Any]] = None
    for rollout_path in iter_rollout_files(sessions_root):
        parsed = parse_rollout(rollout_path)
        if not parsed:
            continue
        session_meta = parsed["session_meta"]
        cwd = session_meta.get("cwd")
        if not isinstance(cwd, str) or norm_path(cwd) != target_root:
            continue
        session_id = (
            session_meta.get("id") if isinstance(session_meta.get("id"), str) else ""
        )
        index_entry = session_index.get(session_id, {})
        candidate_timestamp = (
            parsed.get("timestamp")
            or index_entry.get("updated_at")
            or session_meta.get("timestamp")
            or ""
        )
        candidate = {
            **parsed,
            "index_entry": index_entry,
            "sort_timestamp": candidate_timestamp,
        }
        if best is None or str(candidate["sort_timestamp"]) > str(
            best["sort_timestamp"]
        ):
            best = candidate

    if best is None:
        raise RuntimeError(
            f"No Codex rollout session with token_count data found for worktree: {project_root}"
        )
    return best


def build_payload(project_root: Path) -> Dict[str, Any]:
    codex_root = Path.home() / ".codex"
    selected = select_session(project_root, codex_root)
    session_meta = selected["session_meta"]
    token_event = selected["token_event"]
    info = token_event.get("info") if isinstance(token_event.get("info"), dict) else {}
    total_usage = with_display(with_uncached(info.get("total_token_usage")))
    last_usage = with_display(with_uncached(info.get("last_token_usage")))
    rate_limits = (
        token_event.get("rate_limits")
        if isinstance(token_event.get("rate_limits"), dict)
        else {}
    )
    primary = (
        rate_limits.get("primary")
        if isinstance(rate_limits.get("primary"), dict)
        else {}
    )
    secondary = (
        rate_limits.get("secondary")
        if isinstance(rate_limits.get("secondary"), dict)
        else {}
    )
    index_entry = (
        selected.get("index_entry")
        if isinstance(selected.get("index_entry"), dict)
        else {}
    )

    return {
        "status": "ok",
        "poc": True,
        "project_root": str(project_root),
        "session_id": session_meta.get("id"),
        "thread_name": index_entry.get("thread_name") or None,
        "session_file": selected["path"],
        "timestamp": selected.get("timestamp")
        or index_entry.get("updated_at")
        or session_meta.get("timestamp"),
        "cwd": session_meta.get("cwd"),
        "source": session_meta.get("source"),
        "originator": session_meta.get("originator"),
        "model_provider": session_meta.get("model_provider"),
        "model_context_window": info.get("model_context_window"),
        "total_token_usage": total_usage,
        "last_token_usage": last_usage,
        "rate_limits": {
            "primary_used_percent": primary.get("used_percent"),
            "primary_window_minutes": primary.get("window_minutes"),
            "primary_resets_at": primary.get("resets_at"),
            "secondary_used_percent": secondary.get("used_percent"),
            "secondary_window_minutes": secondary.get("window_minutes"),
            "secondary_resets_at": secondary.get("resets_at"),
        },
        "coverage": {
            "session_total": True,
            "cached_tokens": True,
            "subagent_attribution": False,
            "notes": [
                "Reads Codex rollout token_count events from local ~/.codex session logs.",
                "Counts include cached_input_tokens separately so uncached input can be derived.",
                "Codex rollout logs used by this POC do not expose parent/child linkage fields for token_count events.",
                "OpenCode exposes session parent/children APIs, but this POC does not have a trustworthy token source attached to those OpenCode sessions.",
                "Subagent/child-agent token attribution is therefore not available in this POC; totals are session-level only.",
            ],
        },
        "research": {
            "codex_rollout_parent_child_linkage": False,
            "opencode_session_tree_api": True,
            "opencode_session_token_metadata": False,
            "conclusion": "No safe subagent token attribution path was found for this POC. The available trustworthy source is Codex rollout session totals only.",
        },
        "summary": {
            "total_tokens": total_usage["total_tokens"],
            "uncached_input_tokens": total_usage["uncached_input_tokens"],
            "cached_input_tokens": total_usage["cached_input_tokens"],
            "output_tokens": total_usage["output_tokens"],
            "reasoning_output_tokens": total_usage["reasoning_output_tokens"],
            "last_total_tokens": last_usage["total_tokens"],
            "display": {
                "total_tokens": total_usage["display"]["total_tokens"],
                "uncached_input_tokens": total_usage["display"][
                    "uncached_input_tokens"
                ],
                "cached_input_tokens": total_usage["display"]["cached_input_tokens"],
                "output_tokens": total_usage["display"]["output_tokens"],
                "reasoning_output_tokens": total_usage["display"][
                    "reasoning_output_tokens"
                ],
                "last_total_tokens": last_usage["display"]["total_tokens"],
            },
        },
    }


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    try:
        payload = build_payload(project_root)
    except RuntimeError as error:
        print(str(error), file=os.sys.stderr)
        return 1

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
