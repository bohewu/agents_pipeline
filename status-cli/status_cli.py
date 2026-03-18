#!/usr/bin/env python3
from __future__ import annotations

import argparse
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sys
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence, cast
from urllib.parse import urlsplit


class StatusCliError(Exception):
    """Raised for predictable CLI usage and file-discovery errors."""


@dataclass
class StatusContext:
    run_status_path: Path
    status_root: Path
    project_dir: Optional[Path]
    output_dir: Optional[Path]
    status_dir: Optional[Path]


TASK_COUNT_ORDER = [
    "pending",
    "ready",
    "in_progress",
    "waiting_for_user",
    "done",
    "blocked",
    "failed",
    "skipped",
    "stale",
]

FOCUS_CHOICES = ("blocked", "stale", "active")
WEB_THEME_CHOICES = ("auto", "light", "dark")
WEB_REFRESH_INTERVAL_CHOICES = (5, 10, 15, 30, 60)
WEB_DEFAULT_REFRESH_INTERVAL = 15
WEB_MAX_REFRESH_FAILURES = 3
WEB_STATUS_COLORS = {
    "pending": "#64748b",
    "ready": "#0ea5e9",
    "in_progress": "#8b5cf6",
    "waiting_for_user": "#f59e0b",
    "done": "#10b981",
    "blocked": "#ef4444",
    "failed": "#dc2626",
    "skipped": "#94a3b8",
    "stale": "#f97316",
    "unknown": "#475569",
    "run": "#7c3aed",
}


def add_path_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--status-file", help="Path to run-status.json")
    parser.add_argument("--status-dir", help="Path to the status/ directory")
    parser.add_argument("--output-dir", help="Path to the output directory")
    parser.add_argument("--project-dir", help="Path to a project or fixture directory")


def load_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise StatusCliError(f"Status file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise StatusCliError(f"Failed to parse JSON from {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise StatusCliError(f"Expected a JSON object in {path}")
    return data


def unique_paths(paths: Iterable[Optional[Path]]) -> list[Path]:
    seen: set[Path] = set()
    ordered: list[Path] = []
    for path in paths:
        if path is None:
            continue
        resolved = path.expanduser().resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        ordered.append(resolved)
    return ordered


def first_existing(paths: Iterable[Optional[Path]]) -> Optional[Path]:
    for path in unique_paths(paths):
        if path.is_file():
            return path
    return None


def discover_run_status(args: argparse.Namespace) -> StatusContext:
    status_file = Path(args.status_file).expanduser() if args.status_file else None
    status_dir = Path(args.status_dir).expanduser() if args.status_dir else None
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else None
    project_dir = Path(args.project_dir).expanduser() if args.project_dir else None

    if status_file is not None:
        run_status_path = status_file.resolve()
        if not run_status_path.is_file():
            raise StatusCliError(f"Status file not found: {run_status_path}")
        inferred_status_dir = (
            run_status_path.parent if run_status_path.parent.name == "status" else None
        )
        inferred_output_dir = (
            run_status_path.parent.parent if inferred_status_dir is not None else None
        )
        return StatusContext(
            run_status_path=run_status_path,
            status_root=run_status_path.parent,
            project_dir=project_dir.resolve() if project_dir else None,
            output_dir=output_dir.resolve() if output_dir else inferred_output_dir,
            status_dir=status_dir.resolve() if status_dir else inferred_status_dir,
        )

    if status_dir is not None:
        run_status_path = (status_dir / "run-status.json").resolve()
        if not run_status_path.is_file():
            raise StatusCliError(
                f"No run-status.json found in status directory: {status_dir.resolve()}"
            )
        return StatusContext(
            run_status_path=run_status_path,
            status_root=run_status_path.parent,
            project_dir=project_dir.resolve() if project_dir else None,
            output_dir=output_dir.resolve()
            if output_dir
            else run_status_path.parent.parent,
            status_dir=run_status_path.parent,
        )

    if output_dir is not None:
        candidates = [
            output_dir / "status" / "run-status.json",
            output_dir / "run-status.json",
        ]
        run_status_path = first_existing(candidates)
        if run_status_path is None:
            candidate_text = "\n  - ".join(str(path.resolve()) for path in candidates)
            raise StatusCliError(
                "Could not find run-status.json from --output-dir. Tried:\n"
                f"  - {candidate_text}"
            )
        return StatusContext(
            run_status_path=run_status_path,
            status_root=run_status_path.parent,
            project_dir=project_dir.resolve() if project_dir else None,
            output_dir=output_dir.resolve(),
            status_dir=(
                run_status_path.parent
                if run_status_path.parent.name == "status"
                else None
            ),
        )

    base_dir = project_dir or Path.cwd()
    direct_candidates = [
        base_dir / "status" / "run-status.json",
        base_dir / "run-status.json",
        base_dir / ".pipeline-output" / "status" / "run-status.json",
        base_dir / ".pipeline-output" / "run-status.json",
    ]
    run_status_path = first_existing(direct_candidates)
    if run_status_path is not None:
        return StatusContext(
            run_status_path=run_status_path,
            status_root=run_status_path.parent,
            project_dir=base_dir.resolve(),
            output_dir=output_dir.resolve() if output_dir else None,
            status_dir=(
                run_status_path.parent
                if run_status_path.parent.name == "status"
                else None
            ),
        )

    recursive_matches = sorted(base_dir.glob("**/run-status.json"))
    if len(recursive_matches) == 1:
        run_status_path = recursive_matches[0].resolve()
        return StatusContext(
            run_status_path=run_status_path,
            status_root=run_status_path.parent,
            project_dir=base_dir.resolve(),
            output_dir=output_dir.resolve() if output_dir else None,
            status_dir=(
                run_status_path.parent
                if run_status_path.parent.name == "status"
                else None
            ),
        )

    if len(recursive_matches) > 1:
        listed = "\n  - ".join(str(path.resolve()) for path in recursive_matches[:10])
        extra = (
            ""
            if len(recursive_matches) <= 10
            else f"\n  ... and {len(recursive_matches) - 10} more"
        )
        raise StatusCliError(
            "Multiple run-status.json files were found. Use --status-file, --status-dir, or --output-dir for an explicit target.\n"
            f"  - {listed}{extra}"
        )

    raise StatusCliError(
        "Could not discover run-status.json. Provide --status-file, --status-dir, --output-dir, or --project-dir."
    )


def render_value(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(not isinstance(item, (dict, list)) for item in value):
            return ", ".join(str(item) for item in value)
        return json.dumps(value, indent=2)
    if isinstance(value, dict):
        return json.dumps(value, indent=2, sort_keys=True)
    return str(value)


def line(label: str, value: object) -> str:
    return f"{label}: {render_value(value)}"


def render_list(title: str, values: Optional[list[object]]) -> list[str]:
    if not values:
        return [f"{title}: none"]
    lines = [f"{title}:"]
    for value in values:
        lines.append(f"  - {render_value(value)}")
    return lines


def render_summary(run_status: dict, context: StatusContext) -> str:
    lines = [
        line("Run ID", run_status.get("run_id")),
        line("Orchestrator", run_status.get("orchestrator")),
        line("Status", run_status.get("status")),
        line("Layout", run_status.get("layout", "-")),
        line("Created", run_status.get("created_at")),
        line("Updated", run_status.get("updated_at")),
        line("Last heartbeat", run_status.get("last_heartbeat_at")),
        line("Waiting on", run_status.get("waiting_on")),
        line("Resume from checkpoint", run_status.get("resume_from_checkpoint")),
        line("Current stage", run_status.get("current_stage")),
        line("Next stage", run_status.get("next_stage")),
        line("Completed stages", len(run_status.get("completed_stages", []))),
        line("Active task IDs", run_status.get("active_task_ids", [])),
        line("Active agent IDs", run_status.get("active_agent_ids", [])),
        line("Output dir", run_status.get("output_dir")),
        line("Checkpoint", run_status.get("checkpoint_path")),
        line("Loaded from", context.run_status_path),
    ]

    task_counts = run_status.get("task_counts")
    if isinstance(task_counts, dict):
        ordered_counts = ", ".join(
            f"{name}={task_counts[name]}"
            for name in TASK_COUNT_ORDER
            if name in task_counts
        )
        lines.append(f"Task counts: {ordered_counts}")

    if run_status.get("last_error"):
        lines.append(line("Last error", run_status.get("last_error")))

    if run_status.get("layout") == "expanded":
        lines.append(line("Task refs", len(run_status.get("task_refs", []))))
        lines.append(line("Agent refs", len(run_status.get("agent_refs", []))))

    lines.extend(render_list("Notes", run_status.get("notes")))
    return "\n".join(lines)


def render_run_show(run_status: dict, context: StatusContext) -> str:
    lines = [render_summary(run_status, context), "", "Completed stages:"]
    completed = run_status.get("completed_stages") or []
    if not completed:
        lines.append("  - none")
    else:
        for stage in completed:
            if isinstance(stage, dict):
                lines.append(
                    "  - "
                    f"stage={stage.get('stage')} name={stage.get('name')} "
                    f"status={stage.get('status')} timestamp={stage.get('timestamp')}"
                )

    if run_status.get("task_refs"):
        lines.append("")
        lines.append("Task refs:")
        for item in run_status["task_refs"]:
            lines.append(f"  - {item.get('task_id')}: {item.get('path')}")

    if run_status.get("agent_refs"):
        lines.append("")
        lines.append("Agent refs:")
        for item in run_status["agent_refs"]:
            lines.append(f"  - {item.get('agent_id')}: {item.get('path')}")

    return "\n".join(lines)


def format_status_counts(task_counts: object) -> str:
    if not isinstance(task_counts, dict):
        return "none"
    parts = [
        f"{name}={task_counts[name]}"
        for name in TASK_COUNT_ORDER
        if name in task_counts
    ]
    return ", ".join(parts) if parts else "none"


def load_referenced_records(
    run_status: dict,
    context: StatusContext,
    ref_key: str,
    id_key: str,
) -> tuple[list[dict], list[str]]:
    records: list[dict] = []
    warnings: list[str] = []
    entity_name = id_key[:-3] if id_key.endswith("_id") else id_key

    for item in run_status.get(ref_key) or []:
        if not isinstance(item, dict):
            continue

        entity_id = item.get(id_key)
        ref_path = item.get("path")
        if not entity_id or not ref_path:
            continue

        resolved = resolve_ref_path(str(ref_path), context)
        if resolved is None:
            warnings.append(f"Missing {entity_name} file for {entity_id}: {ref_path}")
            continue

        try:
            records.append(load_json(resolved))
        except StatusCliError as exc:
            warnings.append(str(exc))

    return records, warnings


def require_expanded_layout(run_status: dict, entity_dir_name: str) -> None:
    layout = run_status.get("layout")
    if layout != "expanded":
        noun = entity_dir_name[:-1].capitalize()
        raise StatusCliError(
            f"{noun} files are not available for this run (layout={layout or 'unknown'})."
        )


def render_task_list(
    run_status: dict,
    context: StatusContext,
    status_filter: Optional[str] = None,
) -> str:
    require_expanded_layout(run_status, "tasks")
    tasks, warnings = load_referenced_records(
        run_status, context, ref_key="task_refs", id_key="task_id"
    )

    filtered_tasks: list[dict] = []
    for task in tasks:
        if status_filter and str(task.get("status")) != status_filter:
            continue
        filtered_tasks.append(task)

    heading = f"Tasks ({len(filtered_tasks)})"
    if status_filter:
        heading = f"{heading} [status={status_filter}]"

    lines = [heading + ":"]
    if not filtered_tasks:
        lines.append("  - none")
    else:
        for task in filtered_tasks:
            details = []
            if task.get("assigned_agent_id"):
                details.append(f"agent={render_value(task.get('assigned_agent_id'))}")
            if task.get("resource_status") not in {None, "not_required"}:
                details.append(f"resource={render_value(task.get('resource_status'))}")
            lines.append(
                f"  - {render_value(task.get('task_id'))} [{render_value(task.get('status'))}] "
                + render_value(task.get("summary"))
                + (f" ({', '.join(details)})" if details else "")
            )

    if warnings:
        lines.append("")
        lines.append("Warnings:")
        for warning in warnings:
            lines.append(f"  - {warning}")

    return "\n".join(lines)


def render_agent_list(
    run_status: dict,
    context: StatusContext,
    status_filter: Optional[str] = None,
    task_id_filter: Optional[str] = None,
) -> str:
    require_expanded_layout(run_status, "agents")
    agents, warnings = load_referenced_records(
        run_status, context, ref_key="agent_refs", id_key="agent_id"
    )

    filtered_agents: list[dict] = []
    for agent in agents:
        if status_filter and str(agent.get("status")) != status_filter:
            continue
        if task_id_filter and str(agent.get("task_id")) != task_id_filter:
            continue
        filtered_agents.append(agent)

    filter_parts: list[str] = []
    if status_filter:
        filter_parts.append(f"status={status_filter}")
    if task_id_filter:
        filter_parts.append(f"task_id={task_id_filter}")

    heading = f"Agents ({len(filtered_agents)})"
    if filter_parts:
        heading = f"{heading} [{', '.join(filter_parts)}]"

    lines = [heading + ":"]
    if not filtered_agents:
        lines.append("  - none")
    else:
        for agent in filtered_agents:
            details = [
                f"task={render_value(agent.get('task_id'))}",
                f"agent={render_value(agent.get('agent'))}",
            ]
            if agent.get("attempt") is not None:
                details.append(f"attempt={render_value(agent.get('attempt'))}")
            if agent.get("cleanup_status") not in {None, "not_required"}:
                details.append(f"cleanup={render_value(agent.get('cleanup_status'))}")
            lines.append(
                f"  - {render_value(agent.get('agent_id'))} [{render_value(agent.get('status'))}] "
                + " ".join(details)
            )

    if warnings:
        lines.append("")
        lines.append("Warnings:")
        for warning in warnings:
            lines.append(f"  - {warning}")

    return "\n".join(lines)


def render_visual(run_status: dict, context: StatusContext) -> str:
    lines = [
        "READ-ONLY VISUAL INSPECTION",
        "This view only reads existing status artifacts and never writes files.",
        f"Loaded from: {context.run_status_path}",
        "",
        f"Run [{render_value(run_status.get('status'))}] {render_value(run_status.get('run_id'))}",
        f"  Orchestrator: {render_value(run_status.get('orchestrator'))}",
        f"  Layout: {render_value(run_status.get('layout', '-'))}",
        f"  Current stage: {render_value(run_status.get('current_stage'))}",
        f"  Next stage: {render_value(run_status.get('next_stage'))}",
        f"  Waiting on: {render_value(run_status.get('waiting_on'))}",
        f"  Task counts: {format_status_counts(run_status.get('task_counts'))}",
    ]

    if run_status.get("layout") != "expanded":
        lines.append("  Tasks: not available in run-only layout")
        return "\n".join(lines)

    tasks, task_warnings = load_referenced_records(
        run_status, context, ref_key="task_refs", id_key="task_id"
    )
    agents, agent_warnings = load_referenced_records(
        run_status, context, ref_key="agent_refs", id_key="agent_id"
    )
    warnings = [*task_warnings, *agent_warnings]

    agents_by_task: dict[str, list[dict]] = {}
    for agent in agents:
        task_id = agent.get("task_id")
        if not isinstance(task_id, str):
            continue
        agents_by_task.setdefault(task_id, []).append(agent)

    if not tasks:
        lines.append("  Tasks: none")
    else:
        lines.append("  Tasks:")
        for index, task in enumerate(tasks):
            task_id = render_value(task.get("task_id"))
            task_status = render_value(task.get("status"))
            summary = render_value(task.get("summary"))
            is_last_task = index == len(tasks) - 1
            task_prefix = "  `-- " if is_last_task else "  |-- "
            child_prefix = "      " if is_last_task else "  |   "
            lines.append(f"{task_prefix}Task [{task_status}] {task_id} - {summary}")

            task_agents = agents_by_task.get(str(task.get("task_id")), [])
            if not task_agents:
                lines.append(f"{child_prefix}`-- Agents: none")
                continue

            for agent_index, agent in enumerate(task_agents):
                agent_id = render_value(agent.get("agent_id"))
                agent_status = render_value(agent.get("status"))
                agent_name = render_value(agent.get("agent"))
                is_last_agent = agent_index == len(task_agents) - 1
                agent_prefix = "`-- " if is_last_agent else "|-- "
                lines.append(
                    f"{child_prefix}{agent_prefix}Agent [{agent_status}] {agent_id} ({agent_name})"
                )

    if warnings:
        lines.append("")
        lines.append("Warnings:")
        for warning in warnings:
            lines.append(f"  - {warning}")

    return "\n".join(lines)


def record_matches_focus(record: dict, focus: str, active_ids: set[str]) -> bool:
    status = str(record.get("status") or "")
    record_id = str(record.get("task_id") or record.get("agent_id") or "")

    if focus == "blocked":
        return status == "blocked"
    if focus == "stale":
        return status == "stale"
    if focus == "active":
        return status in {"in_progress", "waiting_for_user"} or record_id in active_ids
    return False


def summarize_status_counts(counts: object) -> list[str]:
    if not isinstance(counts, dict):
        return ["  - none"]

    lines: list[str] = []
    for name in TASK_COUNT_ORDER:
        if name in counts:
            lines.append(f"  - {name}: {render_value(counts.get(name))}")
    return lines or ["  - none"]


def render_dashboard_task_entry(task: dict) -> list[str]:
    details: list[str] = []
    if task.get("assigned_agent_id"):
        details.append(f"agent={render_value(task.get('assigned_agent_id'))}")
    if task.get("assigned_executor"):
        details.append(f"executor={render_value(task.get('assigned_executor'))}")
    if task.get("resource_status") not in {None, "not_required"}:
        details.append(f"resource={render_value(task.get('resource_status'))}")

    lines = [
        f"  - {render_value(task.get('task_id'))} [{render_value(task.get('status'))}] "
        f"{render_value(task.get('summary'))}"
        + (f" ({', '.join(details)})" if details else "")
    ]

    if task.get("error"):
        lines.append(f"    issue: {render_value(task.get('error'))}")
    if task.get("resume_note"):
        lines.append(f"    resume: {render_value(task.get('resume_note'))}")

    return lines


def build_agent_hotspot_rollups(
    agents: list[dict], active_agent_ids: set[str], focus: Optional[str]
) -> list[dict[str, object]]:
    filtered_agents = agents
    if focus:
        filtered_agents = [
            agent
            for agent in agents
            if record_matches_focus(agent, focus, active_agent_ids)
        ]

    rollups: dict[str, dict[str, object]] = {}
    for agent in filtered_agents:
        agent_name = str(agent.get("agent") or "unknown")
        rollup = rollups.setdefault(
            agent_name,
            {
                "agent": agent_name,
                "count": 0,
                "active": 0,
                "cleanup_issues": 0,
                "statuses": {},
                "tasks": [],
            },
        )

        rollup["count"] = cast(int, rollup["count"]) + 1

        agent_id = str(agent.get("agent_id") or "")
        if agent_id in active_agent_ids:
            rollup["active"] = cast(int, rollup["active"]) + 1

        status = str(agent.get("status") or "unknown")
        statuses = cast(dict[str, int], rollup["statuses"])
        statuses[status] = int(statuses.get(status, 0)) + 1

        if agent.get("cleanup_status") in {"failed", "unknown"} or agent.get(
            "resource_status"
        ) in {"cleanup_failed", "unknown"}:
            rollup["cleanup_issues"] = cast(int, rollup["cleanup_issues"]) + 1

        task_id = agent.get("task_id")
        tasks = cast(list[object], rollup["tasks"])
        if task_id and task_id not in tasks:
            tasks.append(task_id)

    return sorted(
        rollups.values(),
        key=lambda item: (
            -cast(int, item["cleanup_issues"]),
            -cast(int, item["active"]),
            -cast(int, item["count"]),
            str(item["agent"]),
        ),
    )


def render_dashboard_agent_hotspots(
    agents: list[dict], active_agent_ids: set[str], focus: Optional[str]
) -> list[str]:
    lines = ["Agent hotspots:"]
    ranked_rollups = build_agent_hotspot_rollups(agents, active_agent_ids, focus)
    if not ranked_rollups:
        lines.append("  - none")
        return lines

    for rollup in ranked_rollups:
        agent_name = str(rollup["agent"])
        statuses = cast(dict[str, int], rollup["statuses"])
        status_bits = [
            f"{name}={statuses[name]}" for name in TASK_COUNT_ORDER if name in statuses
        ]
        if "unknown" in statuses:
            status_bits.append(f"unknown={statuses['unknown']}")

        details = [f"count={cast(int, rollup['count'])}"]
        if cast(int, rollup["active"]):
            details.append(f"active={rollup['active']}")
        if status_bits:
            details.append("statuses=" + ", ".join(status_bits))
        if cast(int, rollup["cleanup_issues"]):
            details.append(f"cleanup_issues={rollup['cleanup_issues']}")

        tasks = rollup["tasks"]
        assert isinstance(tasks, list)
        if tasks:
            details.append("tasks=" + ", ".join(str(task_id) for task_id in tasks))

        lines.append(f"  - {agent_name}: " + "; ".join(details))

    return lines


def render_dashboard_section(
    title: str,
    tasks: list[dict],
    focus: Optional[str],
    active_task_ids: set[str],
) -> list[str]:
    if focus:
        tasks = [
            task for task in tasks if record_matches_focus(task, focus, active_task_ids)
        ]

    lines = [f"{title}:"]
    if not tasks:
        lines.append("  - none")
        return lines

    for task in tasks:
        lines.extend(render_dashboard_task_entry(task))
    return lines


def render_dashboard(
    run_status: dict, context: StatusContext, focus: Optional[str] = None
) -> str:
    header = "READ-ONLY DASHBOARD"
    if focus:
        header = f"{header} [focus={focus}]"

    lines = [
        header,
        "This dashboard only reads existing status artifacts.",
        "",
        "Run overview:",
        f"  - Run ID: {render_value(run_status.get('run_id'))}",
        f"  - Status: {render_value(run_status.get('status'))}",
        f"  - Orchestrator: {render_value(run_status.get('orchestrator'))}",
        f"  - Layout: {render_value(run_status.get('layout', '-'))}",
        f"  - Current stage: {render_value(run_status.get('current_stage'))}",
        f"  - Next stage: {render_value(run_status.get('next_stage'))}",
        f"  - Updated: {render_value(run_status.get('updated_at'))}",
        f"  - Last heartbeat: {render_value(run_status.get('last_heartbeat_at'))}",
        f"  - Loaded from: {render_value(context.run_status_path)}",
        "",
        "Task counts:",
        *summarize_status_counts(run_status.get("task_counts")),
    ]

    if run_status.get("waiting_on") is not None:
        lines.append(f"  - Waiting on: {render_value(run_status.get('waiting_on'))}")
    if run_status.get("resume_from_checkpoint") is not None:
        lines.append(
            f"  - Resume from checkpoint: {render_value(run_status.get('resume_from_checkpoint'))}"
        )
    if run_status.get("last_error"):
        lines.append(f"  - Last error: {render_value(run_status.get('last_error'))}")

    active_task_ids = {str(item) for item in run_status.get("active_task_ids") or []}
    active_agent_ids = {str(item) for item in run_status.get("active_agent_ids") or []}

    if run_status.get("layout") != "expanded":
        task_counts = run_status.get("task_counts")
        blocked_count = (
            task_counts.get("blocked", 0) if isinstance(task_counts, dict) else 0
        )
        stale_count = (
            task_counts.get("stale", 0) if isinstance(task_counts, dict) else 0
        )

        lines.extend(
            [
                "",
                "Blocked tasks:",
                f"  - count={blocked_count} (details unavailable in run-only layout)",
                "",
                "Stale tasks:",
                f"  - count={stale_count} (details unavailable in run-only layout)",
                "",
                "Active work:",
            ]
        )
        if active_task_ids:
            for task_id in sorted(active_task_ids):
                lines.append(f"  - task={task_id}")
        else:
            lines.append("  - none")

        lines.extend(["", "Agent hotspots:"])
        if active_agent_ids:
            lines.append(
                "  - active_agent_ids="
                + ", ".join(sorted(active_agent_ids))
                + " (details unavailable in run-only layout)"
            )
        else:
            lines.append("  - none (agent files unavailable in run-only layout)")

        return "\n".join(lines)

    tasks, task_warnings = load_referenced_records(
        run_status, context, ref_key="task_refs", id_key="task_id"
    )
    agents, agent_warnings = load_referenced_records(
        run_status, context, ref_key="agent_refs", id_key="agent_id"
    )
    warnings = [*task_warnings, *agent_warnings]

    task_by_id = {
        str(task.get("task_id")): task
        for task in tasks
        if isinstance(task.get("task_id"), str)
    }

    blocked_tasks = [task for task in tasks if str(task.get("status")) == "blocked"]
    stale_tasks = [task for task in tasks if str(task.get("status")) == "stale"]

    active_tasks: list[dict] = []
    for task_id in sorted(active_task_ids):
        task = task_by_id.get(task_id)
        if task is None:
            warnings.append(f"Missing task file for active task {task_id}.")
            continue
        active_tasks.append(task)

    lines.extend(
        [
            "",
            *render_dashboard_section(
                "Blocked tasks", blocked_tasks, focus, active_task_ids
            ),
        ]
    )
    lines.extend(
        [
            "",
            *render_dashboard_section(
                "Stale tasks", stale_tasks, focus, active_task_ids
            ),
        ]
    )
    lines.extend(
        [
            "",
            *render_dashboard_section(
                "Active work", active_tasks, focus, active_task_ids
            ),
        ]
    )
    lines.extend(
        ["", *render_dashboard_agent_hotspots(agents, active_agent_ids, focus)]
    )

    if warnings:
        lines.extend(["", "Warnings:"])
        for warning in warnings:
            lines.append(f"  - {warning}")

    return "\n".join(lines)


def theme_palette(theme: str) -> dict[str, str]:
    if theme == "light":
        return {
            "scheme": "light",
            "bg": "#f8fafc",
            "panel": "#ffffff",
            "text": "#0f172a",
            "muted": "#475569",
            "border": "#dbe2ea",
            "accent": "#2563eb",
        }
    if theme == "dark":
        return {
            "scheme": "dark",
            "bg": "#0b1220",
            "panel": "#111a2e",
            "text": "#e5eefb",
            "muted": "#94a3b8",
            "border": "#24324a",
            "accent": "#60a5fa",
        }
    return {
        "scheme": "light dark",
        "bg": "#f8fafc",
        "panel": "#ffffff",
        "text": "#0f172a",
        "muted": "#475569",
        "border": "#dbe2ea",
        "accent": "#2563eb",
    }


def file_uri(path: Optional[Path], directory: bool = False) -> Optional[str]:
    if path is None:
        return None
    uri = path.resolve().as_uri()
    if directory and not uri.endswith("/"):
        uri = f"{uri}/"
    return uri


def serialize_record(record: dict) -> dict[str, object]:
    return {key: record[key] for key in sorted(record)}


def build_web_payload(
    run_status: dict,
    context: StatusContext,
    focus: Optional[str] = None,
    refresh_interval: int = WEB_DEFAULT_REFRESH_INTERVAL,
    viewer_label: str = "Read-only web export",
    refresh_warning: Optional[str] = None,
    refresh_source_overrides: Optional[dict[str, Optional[str]]] = None,
) -> dict[str, object]:
    active_task_ids = {str(item) for item in run_status.get("active_task_ids") or []}
    active_agent_ids = {str(item) for item in run_status.get("active_agent_ids") or []}
    run_id = str(run_status.get("run_id") or "-")
    warnings: list[str] = []
    refresh_source = {
        "run_status_url": file_uri(context.run_status_path),
        "status_root_url": file_uri(context.status_root, directory=True),
        "status_parent_url": file_uri(
            context.status_root.parent
            if context.status_root.name == "status"
            else None,
            directory=True,
        ),
        "status_dir_url": file_uri(context.status_dir, directory=True),
        "output_dir_url": file_uri(context.output_dir, directory=True),
        "project_dir_url": file_uri(context.project_dir, directory=True),
    }
    if refresh_source_overrides:
        refresh_source.update(refresh_source_overrides)

    payload: dict[str, object] = {
        "meta": {
            "title": f"Status viewer: {run_id}",
            "focus": focus,
            "loaded_from": str(context.run_status_path),
            "read_only": True,
            "viewer_label": viewer_label,
            "refresh": {
                "enabled": True,
                "default_interval_seconds": refresh_interval,
                "interval_options_seconds": list(WEB_REFRESH_INTERVAL_CHOICES),
                "max_failures": WEB_MAX_REFRESH_FAILURES,
                "warning": refresh_warning
                or "Live refresh is read-only and attempts to re-read the original local status files. Some browsers block local file fetches for exported HTML.",
                "source": refresh_source,
            },
        },
        "run": {
            "run_id": run_status.get("run_id"),
            "status": run_status.get("status"),
            "orchestrator": run_status.get("orchestrator"),
            "layout": run_status.get("layout", "-"),
            "current_stage": run_status.get("current_stage"),
            "next_stage": run_status.get("next_stage"),
            "updated_at": run_status.get("updated_at"),
            "last_heartbeat_at": run_status.get("last_heartbeat_at"),
            "waiting_on": run_status.get("waiting_on"),
            "resume_from_checkpoint": run_status.get("resume_from_checkpoint"),
            "last_error": run_status.get("last_error"),
            "task_counts": dict(run_status.get("task_counts") or {}),
            "active_task_ids": sorted(active_task_ids),
            "active_agent_ids": sorted(active_agent_ids),
            "record": serialize_record(run_status),
        },
        "tasks": [],
        "agents": [],
        "warnings": warnings,
        "hotspots": [],
        "panels": {"blocked": [], "stale": [], "active": []},
        "graph": {
            "nodes": [
                {
                    "id": f"run:{run_id}",
                    "type": "run",
                    "label": run_id,
                    "status": str(run_status.get("status") or "unknown"),
                    "subtitle": str(run_status.get("orchestrator") or "-"),
                    "column": 0,
                    "detail": serialize_record(run_status),
                }
            ],
            "edges": [],
        },
    }

    panels = cast(dict[str, list[dict[str, object]]], payload["panels"])

    if run_status.get("layout") != "expanded":
        task_counts = cast(
            dict[str, int], cast(dict[str, object], payload["run"])["task_counts"]
        )
        panels["blocked"] = [
            {
                "task_id": "run-only",
                "summary": f"count={task_counts.get('blocked', 0)} (details unavailable in run-only layout)",
                "status": "blocked",
            }
        ]
        panels["stale"] = [
            {
                "task_id": "run-only",
                "summary": f"count={task_counts.get('stale', 0)} (details unavailable in run-only layout)",
                "status": "stale",
            }
        ]
        panels["active"] = [
            {
                "task_id": "run-only",
                "summary": ", ".join(sorted(active_task_ids))
                if active_task_ids
                else "none",
                "status": "in_progress" if active_task_ids else "unknown",
            }
        ]
        return payload

    tasks, task_warnings = load_referenced_records(
        run_status, context, ref_key="task_refs", id_key="task_id"
    )
    agents, agent_warnings = load_referenced_records(
        run_status, context, ref_key="agent_refs", id_key="agent_id"
    )
    warnings.extend([*task_warnings, *agent_warnings])

    task_cards: list[dict[str, object]] = []
    task_card_by_id: dict[str, dict[str, object]] = {}
    graph = cast(dict[str, list[dict[str, object]]], payload["graph"])

    for task in tasks:
        task_id = str(task.get("task_id") or "")
        card = {
            "task_id": task.get("task_id"),
            "summary": task.get("summary"),
            "status": str(task.get("status") or "unknown"),
            "assigned_agent_id": task.get("assigned_agent_id"),
            "assigned_executor": task.get("assigned_executor"),
            "resource_status": task.get("resource_status"),
            "result_summary": task.get("result_summary"),
            "error": task.get("error"),
            "resume_note": task.get("resume_note"),
            "record": serialize_record(task),
        }
        task_cards.append(card)
        task_card_by_id[task_id] = card
        graph["nodes"].append(
            {
                "id": f"task:{task_id}",
                "type": "task",
                "label": task_id,
                "status": str(task.get("status") or "unknown"),
                "subtitle": str(task.get("summary") or "-"),
                "column": 1,
                "detail": serialize_record(task),
            }
        )
        graph["edges"].append(
            {
                "from": f"run:{run_id}",
                "to": f"task:{task_id}",
                "status": str(task.get("status") or "unknown"),
            }
        )

    agent_cards: list[dict[str, object]] = []
    for agent in agents:
        agent_id = str(agent.get("agent_id") or "")
        task_id = str(agent.get("task_id") or "")
        card = {
            "agent_id": agent.get("agent_id"),
            "agent": agent.get("agent"),
            "status": str(agent.get("status") or "unknown"),
            "task_id": agent.get("task_id"),
            "attempt": agent.get("attempt"),
            "cleanup_status": agent.get("cleanup_status"),
            "resource_status": agent.get("resource_status"),
            "result_summary": agent.get("result_summary"),
            "error": agent.get("error"),
            "resource_handles": agent.get("resource_handles"),
            "record": serialize_record(agent),
        }
        agent_cards.append(card)
        graph["nodes"].append(
            {
                "id": f"agent:{agent_id}",
                "type": "agent",
                "label": agent_id,
                "status": str(agent.get("status") or "unknown"),
                "subtitle": str(agent.get("agent") or "-"),
                "column": 2,
                "detail": serialize_record(agent),
            }
        )
        graph["edges"].append(
            {
                "from": f"task:{task_id}",
                "to": f"agent:{agent_id}",
                "status": str(agent.get("status") or "unknown"),
            }
        )

    for task_id in sorted(active_task_ids):
        if task_id not in task_card_by_id:
            warnings.append(f"Missing task file for active task {task_id}.")

    panels["blocked"] = [item for item in task_cards if item["status"] == "blocked"]
    panels["stale"] = [item for item in task_cards if item["status"] == "stale"]
    panels["active"] = [
        task_card_by_id[task_id]
        for task_id in sorted(active_task_ids)
        if task_id in task_card_by_id
    ]

    if focus:
        task_cards = [
            item
            for item in task_cards
            if record_matches_focus(cast(dict, item["record"]), focus, active_task_ids)
        ]
        agent_cards = [
            item
            for item in agent_cards
            if record_matches_focus(cast(dict, item["record"]), focus, active_agent_ids)
        ]
        for key in ("blocked", "stale", "active"):
            panels[key] = [
                item
                for item in panels[key]
                if record_matches_focus(
                    cast(dict, item["record"]), focus, active_task_ids
                )
            ]

    payload["tasks"] = task_cards
    payload["agents"] = agent_cards
    payload["hotspots"] = build_agent_hotspot_rollups(agents, active_agent_ids, focus)
    return payload


def render_web_export(
    run_status: dict,
    context: StatusContext,
    focus: Optional[str] = None,
    theme: str = "auto",
    refresh_interval: int = WEB_DEFAULT_REFRESH_INTERVAL,
    viewer_label: str = "Read-only web export",
    refresh_warning: Optional[str] = None,
    refresh_source_overrides: Optional[dict[str, Optional[str]]] = None,
) -> str:
    palette = theme_palette(theme)
    payload = build_web_payload(
        run_status,
        context,
        focus=focus,
        refresh_interval=refresh_interval,
        viewer_label=viewer_label,
        refresh_warning=refresh_warning,
        refresh_source_overrides=refresh_source_overrides,
    )
    title = str(cast(dict[str, object], payload["meta"])["title"])
    payload_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    theme_override = ""
    if theme == "auto":
        dark_palette = theme_palette("dark")
        theme_override = f"""
      @media (prefers-color-scheme: dark) {{
        :root {{
          --bg: {dark_palette["bg"]};
          --panel: {dark_palette["panel"]};
          --text: {dark_palette["text"]};
          --muted: {dark_palette["muted"]};
          --border: {dark_palette["border"]};
          --accent: {dark_palette["accent"]};
        }}
      }}
"""

    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{escape(title)}</title>
  <style>
    :root {{
      color-scheme: {palette["scheme"]};
      --bg: {palette["bg"]};
      --panel: {palette["panel"]};
      --text: {palette["text"]};
      --muted: {palette["muted"]};
      --border: {palette["border"]};
      --accent: {palette["accent"]};
      --line: rgba(148, 163, 184, 0.18);
    }}
{theme_override}    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(124, 58, 237, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 24%),
        linear-gradient(180deg, var(--bg) 0%, #030712 100%);
      color: var(--text);
    }}
    main {{ max-width: 1460px; margin: 0 auto; padding: 28px; }}
    .panel {{ background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 20px; margin-bottom: 18px; box-shadow: 0 20px 50px rgba(2, 6, 23, 0.35); }}
    .hero {{ padding: 24px; }}
    .hero-top {{ display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }}
    h1 {{ margin: 6px 0 0; font-size: 2rem; }}
    h2, h3 {{ margin-top: 0; }}
    .eyebrow {{ color: var(--accent); text-transform: uppercase; letter-spacing: 0.14em; font-size: 12px; font-weight: 700; }}
    .subtitle {{ color: var(--muted); margin-top: 6px; max-width: 900px; }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }}
    .pill {{ display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.92rem; }}
    .stats, .triage, .two-col {{ display: grid; gap: 18px; }}
    .stats {{ grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }}
    .two-col {{ grid-template-columns: 2.1fr 1.1fr; align-items: start; }}
    .triage {{ grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }}
    .refresh-bar {{ margin-top: 18px; padding: 16px; border-radius: 18px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); }}
    .refresh-controls {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }}
    .control-label {{ color: var(--muted); font-size: 0.92rem; }}
    .control-select, .control-button {{ border-radius: 12px; border: 1px solid var(--line); background: rgba(15, 23, 42, 0.65); color: var(--text); padding: 9px 12px; font: inherit; }}
    .control-button {{ cursor: pointer; }}
    .control-button:hover {{ border-color: var(--accent); }}
    .refresh-status {{ margin-top: 10px; font-size: 0.92rem; color: var(--muted); }}
    .warning-banner {{ margin-top: 10px; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.08); color: #fbbf24; }}
    .stat {{ padding: 16px; border-radius: 18px; border: 1px solid var(--line); background: rgba(15, 23, 42, 0.45); }}
    .stat-label {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }}
    .stat-value {{ font-size: 28px; font-weight: 700; margin-top: 8px; }}
    .stat-sub {{ color: var(--muted); font-size: 13px; margin-top: 6px; }}
    .graph-wrap {{ overflow: auto; border: 1px solid var(--line); border-radius: 18px; background: rgba(2, 6, 23, 0.26); }}
    svg {{ display: block; width: 100%; min-height: 320px; }}
    .list {{ display: grid; gap: 12px; }}
    .item {{ background: rgba(15, 23, 42, 0.5); border: 1px solid var(--line); border-radius: 16px; padding: 14px; }}
    .item-top {{ display: flex; justify-content: space-between; gap: 10px; align-items: start; }}
    .item-title {{ font-weight: 700; }}
    .item-sub {{ color: var(--muted); margin-top: 6px; font-size: 13px; }}
    .chips, .legend {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }}
    .chip {{ font-size: 12px; padding: 6px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--text); }}
    .status-pill {{ color: #fff; font-size: 12px; padding: 6px 8px; border-radius: 999px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }}
    .legend-item {{ display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }}
    .dot {{ width: 10px; height: 10px; border-radius: 999px; display: inline-block; }}
    .empty {{ color: var(--muted); }}
    pre {{ margin: 0; white-space: pre-wrap; word-break: break-word; font-family: Consolas, SFMono-Regular, Menlo, monospace; font-size: 0.92rem; line-height: 1.55; color: var(--text); }}
    .detail {{ max-height: 680px; overflow: auto; border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(2, 6, 23, 0.35); }}
    .note {{ color: var(--muted); margin: 0; }}
    @media (max-width: 1080px) {{ .two-col {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class=\"panel hero\">
      <div class=\"hero-top\">
        <div>
          <div class=\"eyebrow\" id=\"viewer-label\"></div>
          <h1 id=\"hero-title\"></h1>
          <p class=\"subtitle\" id=\"hero-subtitle\"></p>
        </div>
        <div class=\"meta\" id=\"hero-meta\"></div>
      </div>
      <div class=\"stats\" id=\"stats\"></div>
      <div class=\"refresh-bar\">
        <div class=\"eyebrow\">Bounded live refresh</div>
        <p class=\"note\" id=\"refresh-note\"></p>
        <div class=\"refresh-controls\">
          <label class=\"control-label\" for=\"refresh-interval\">Interval</label>
          <select class=\"control-select\" id=\"refresh-interval\"></select>
          <button class=\"control-button\" id=\"refresh-now\" type=\"button\">Refresh now</button>
        </div>
        <div class=\"refresh-status\" id=\"refresh-status\"></div>
        <div class=\"warning-banner\" id=\"refresh-warning\"></div>
      </div>
    </section>
    <section class=\"two-col\">
      <div class=\"panel\">
        <h2>Run → tasks → agents</h2>
        <p class=\"note\">Graph view of existing status artifacts. Click any node to inspect its source JSON.</p>
        <div class=\"graph-wrap\"><svg id=\"graph\" aria-label=\"Status graph\"></svg></div>
        <div class=\"legend\" id=\"legend\"></div>
      </div>
      <div class=\"panel\">
        <h2>Selected detail</h2>
        <p class=\"note\" id=\"detail-caption\"></p>
        <pre class=\"detail\" id=\"detail\"></pre>
      </div>
    </section>
    <section class=\"triage\">
      <div class=\"panel\"><h3>Blocked</h3><div class=\"list\" id=\"blocked-list\"></div></div>
      <div class=\"panel\"><h3>Stale</h3><div class=\"list\" id=\"stale-list\"></div></div>
      <div class=\"panel\"><h3>Active</h3><div class=\"list\" id=\"active-list\"></div></div>
    </section>
    <section class=\"two-col\">
      <div class=\"panel\"><h2>Agent hotspots</h2><div class=\"list\" id=\"hotspots\"></div></div>
      <div class=\"panel\"><h2>Warnings</h2><div class=\"list\" id=\"warnings\"></div></div>
    </section>
    <script id=\"status-data\" type=\"application/json\">{payload_json}</script>
    <script>
      const data = JSON.parse(document.getElementById('status-data').textContent);
      const COLORS = {json.dumps(WEB_STATUS_COLORS, ensure_ascii=False)};
      const FIXED_THEME = {json.dumps(theme)};
      function colorFor(status) {{ return COLORS[String(status || 'unknown')] || COLORS.unknown; }}
      function el(name, className, text) {{ const node = document.createElement(name); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }}
      function setText(id, text) {{ document.getElementById(id).textContent = text; }}
      function renderHero() {{ const run = data.run; setText('viewer-label', String((data.meta || {{}}).viewer_label || 'Read-only web export')); setText('hero-title', `${{run.run_id}} · ${{run.status}}`); setText('hero-subtitle', `Layout=${{run.layout}}. Orchestrator=${{run.orchestrator}}. Loaded from ${{data.meta.loaded_from}}.`); const meta = document.getElementById('hero-meta'); [`theme=${{FIXED_THEME}}`, `focus=${{data.meta.focus || 'all'}}`, `waiting_on=${{run.waiting_on ?? '-'}}`, `current_stage=${{run.current_stage ?? '-'}}`, `next_stage=${{run.next_stage ?? '-'}}`].forEach(text => meta.appendChild(el('span', 'pill', text))); const stats = document.getElementById('stats'); const counts = run.task_counts || {{}}; [['Tasks', data.tasks.length || Object.values(counts).reduce((a, b) => a + Number(b || 0), 0), `layout=${{run.layout}}`], ['Agents', data.agents.length, run.layout === 'expanded' ? 'expanded detail loaded' : 'run-only layout'], ['Blocked', Number(counts.blocked || 0), 'requires review'], ['Stale', Number(counts.stale || 0), 'resume or reconcile'], ['Active refs', (run.active_task_ids || []).length + (run.active_agent_ids || []).length, 'current pointers'], ['Warnings', (data.warnings || []).length, 'non-fatal missing refs']].forEach(([label, value, sub]) => {{ const card = el('div', 'stat'); card.appendChild(el('div', 'stat-label', String(label))); card.appendChild(el('div', 'stat-value', String(value))); card.appendChild(el('div', 'stat-sub', String(sub))); stats.appendChild(card); }}); }}
      function renderItemList(targetId, items, builder) {{ const root = document.getElementById(targetId); if (!items || !items.length) {{ root.appendChild(el('div', 'empty', 'none')); return; }} items.forEach(item => root.appendChild(builder(item))); }}
      function taskCard(item) {{ const card = el('div', 'item'); const top = el('div', 'item-top'); const left = el('div'); left.appendChild(el('div', 'item-title', String(item.task_id || 'task'))); left.appendChild(el('div', 'item-sub', String(item.summary || ''))); top.appendChild(left); const pill = el('div', 'status-pill', String(item.status || 'unknown')); pill.style.background = colorFor(item.status); top.appendChild(pill); card.appendChild(top); const chips = el('div', 'chips'); [item.assigned_agent_id && `agent=${{item.assigned_agent_id}}`, item.assigned_executor && `executor=${{item.assigned_executor}}`, item.resource_status && `resource=${{item.resource_status}}`].filter(Boolean).forEach(text => chips.appendChild(el('div', 'chip', text))); if (chips.childNodes.length) card.appendChild(chips); if (item.error) card.appendChild(el('div', 'item-sub', `issue: ${{item.error}}`)); if (item.resume_note) card.appendChild(el('div', 'item-sub', `resume: ${{item.resume_note}}`)); return card; }}
      function hotspotCard(item) {{ const card = el('div', 'item'); const top = el('div', 'item-top'); top.appendChild(el('div', 'item-title', String(item.agent || 'unknown'))); const pill = el('div', 'status-pill', `count ${{item.count}}`); pill.style.background = colorFor(item.cleanup_issues ? 'blocked' : (item.active ? 'in_progress' : 'done')); top.appendChild(pill); card.appendChild(top); const chips = el('div', 'chips'); [`active=${{item.active}}`, `cleanup_issues=${{item.cleanup_issues}}`].forEach(text => chips.appendChild(el('div', 'chip', text))); Object.entries(item.statuses || {{}}).forEach(([status, count]) => chips.appendChild(el('div', 'chip', `${{status}}=${{count}}`))); (item.tasks || []).forEach(task => chips.appendChild(el('div', 'chip', `task=${{task}}`))); card.appendChild(chips); return card; }}
      function warningCard(text) {{ const card = el('div', 'item'); card.appendChild(el('div', 'item-title', 'warning')); card.appendChild(el('div', 'item-sub', String(text))); return card; }}
      function showDetail(title, record) {{ setText('detail-caption', title); setText('detail', JSON.stringify(record, null, 2)); }}
      function renderLegend() {{ const legend = document.getElementById('legend'); Object.entries(COLORS).forEach(([status, color]) => {{ if (status === 'run') return; const item = el('div', 'legend-item'); const dot = el('span', 'dot'); dot.style.background = color; item.appendChild(dot); item.appendChild(el('span', '', status)); legend.appendChild(item); }}); }}
      function renderGraph() {{ const svg = document.getElementById('graph'); const ns = 'http://www.w3.org/2000/svg'; const nodes = data.graph.nodes || []; const edges = data.graph.edges || []; const columns = [nodes.filter(n => n.column === 0), nodes.filter(n => n.column === 1), nodes.filter(n => n.column === 2)]; const colX = [80, 420, 760]; const width = 250; const heightBox = 76; const maxRows = Math.max(...columns.map(col => Math.max(col.length, 1))); svg.setAttribute('viewBox', `0 0 1080 ${{maxRows * 120 + 120}}`); svg.innerHTML = ''; const positions = new Map(); columns.forEach((col, column) => col.forEach((node, row) => positions.set(node.id, {{ x: colX[column], y: 52 + row * 120 }}))); edges.forEach(edge => {{ const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return; const path = document.createElementNS(ns, 'path'); path.setAttribute('d', `M ${{from.x + width}} ${{from.y + heightBox / 2}} C ${{from.x + width + 70}} ${{from.y + heightBox / 2}}, ${{to.x - 70}} ${{to.y + heightBox / 2}}, ${{to.x}} ${{to.y + heightBox / 2}}`); path.setAttribute('fill', 'none'); path.setAttribute('stroke', colorFor(edge.status)); path.setAttribute('stroke-opacity', '0.45'); path.setAttribute('stroke-width', '3'); svg.appendChild(path); }}); nodes.forEach(node => {{ const pos = positions.get(node.id); const group = document.createElementNS(ns, 'g'); group.style.cursor = 'pointer'; const rect = document.createElementNS(ns, 'rect'); rect.setAttribute('x', pos.x); rect.setAttribute('y', pos.y); rect.setAttribute('width', width); rect.setAttribute('height', heightBox); rect.setAttribute('rx', '18'); rect.setAttribute('fill', 'rgba(15,23,42,0.95)'); rect.setAttribute('stroke', colorFor(node.type === 'run' ? 'run' : node.status)); rect.setAttribute('stroke-width', '2'); group.appendChild(rect); const glow = document.createElementNS(ns, 'rect'); glow.setAttribute('x', pos.x + 8); glow.setAttribute('y', pos.y + 8); glow.setAttribute('width', '8'); glow.setAttribute('height', String(heightBox - 16)); glow.setAttribute('rx', '4'); glow.setAttribute('fill', colorFor(node.status)); group.appendChild(glow); const label = document.createElementNS(ns, 'text'); label.setAttribute('x', String(pos.x + 28)); label.setAttribute('y', String(pos.y + 30)); label.setAttribute('fill', '#f8fafc'); label.setAttribute('font-size', '15'); label.setAttribute('font-weight', '700'); label.textContent = String(node.label || ''); group.appendChild(label); const subtitle = document.createElementNS(ns, 'text'); subtitle.setAttribute('x', String(pos.x + 28)); subtitle.setAttribute('y', String(pos.y + 52)); subtitle.setAttribute('fill', '#94a3b8'); subtitle.setAttribute('font-size', '12'); subtitle.textContent = String(node.subtitle || '').slice(0, 34); group.appendChild(subtitle); const badge = document.createElementNS(ns, 'text'); badge.setAttribute('x', String(pos.x + width - 18)); badge.setAttribute('y', String(pos.y + 28)); badge.setAttribute('fill', colorFor(node.status)); badge.setAttribute('font-size', '11'); badge.setAttribute('font-weight', '700'); badge.setAttribute('text-anchor', 'end'); badge.textContent = String(node.status || '').toUpperCase(); group.appendChild(badge); group.addEventListener('click', () => showDetail(node.id, node.detail)); svg.appendChild(group); }}); }}
      renderHero(); renderItemList('blocked-list', data.panels.blocked, taskCard); renderItemList('stale-list', data.panels.stale, taskCard); renderItemList('active-list', data.panels.active, taskCard); renderItemList('hotspots', data.hotspots, hotspotCard); renderItemList('warnings', data.warnings, warningCard); renderLegend(); renderGraph(); showDetail(`run:${{data.run.run_id}}`, data.run.record);
    </script>
    <script>
      const refreshState = {{
        intervalSeconds: Number((((data.meta || {{}}).refresh || {{}}).default_interval_seconds) || 0),
        timerId: null,
        refreshing: false,
        failureCount: 0,
        lastDetailKey: `run:${{data.run.run_id}}`,
        lastDetailRecord: data.run.record,
      }};
      const baseShowDetail = showDetail;
      showDetail = function(title, record) {{
        refreshState.lastDetailKey = String(title || '');
        refreshState.lastDetailRecord = record || {{}};
        baseShowDetail(title, record);
      }};
      function clearNode(node) {{ while (node.firstChild) node.removeChild(node.firstChild); }}
      function replaceData(nextData) {{ Object.keys(data).forEach(key => delete data[key]); Object.assign(data, nextData); }}
      function unique(values) {{ const seen = new Set(); return values.filter(value => value && !seen.has(value) && seen.add(value)); }}
      function sortedRecord(record) {{ const next = {{}}; Object.keys(record || {{}}).sort().forEach(key => {{ next[key] = record[key]; }}); return next; }}
      function refreshConfig() {{ return ((data.meta || {{}}).refresh || {{}}); }}
      function refreshSources() {{ return (refreshConfig().source || {{}}); }}
      function setRefreshStatus(message) {{ document.getElementById('refresh-status').textContent = String(message || ''); }}
      function normalizeRefPath(refPath) {{ return String(refPath || '').replace(/\\/g, '/'); }}
      function encodeRelativePath(refPath) {{ return normalizeRefPath(refPath).split('/').map(part => encodeURIComponent(part)).join('/'); }}
      function pathToFileUrl(pathText) {{ const normalized = normalizeRefPath(pathText); if (!normalized) return null; if (/^file:/i.test(normalized)) return normalized; if (/^[A-Za-z]:\//.test(normalized)) return 'file:///' + normalized.slice(0, 2) + normalized.slice(2).split('/').map(part => encodeURIComponent(part)).join('/'); if (normalized.startsWith('/')) return 'file://' + normalized.split('/').map((part, index) => index === 0 ? '' : encodeURIComponent(part)).join('/'); return null; }}
      function candidateBaseUrls() {{ const source = refreshSources(); return unique([source.status_root_url, source.status_parent_url, source.status_dir_url, source.output_dir_url, source.project_dir_url]); }}
      function buildCandidateUrls(refPath) {{ const normalized = normalizeRefPath(refPath); if (!normalized) return []; const absoluteUrl = pathToFileUrl(normalized); if (absoluteUrl) return [absoluteUrl]; const encoded = encodeRelativePath(normalized); const trimmed = normalized.startsWith('status/') ? encodeRelativePath(normalized.slice(7)) : ''; const urls = []; candidateBaseUrls().forEach(base => {{ try {{ urls.push(new URL(encoded, base).href); }} catch (_error) {{ }} if (trimmed) {{ try {{ urls.push(new URL(trimmed, base).href); }} catch (_error) {{ }} }}); return unique(urls); }}
      async function fetchJsonUrl(url) {{ const response = await fetch(url, {{ cache: 'no-store' }}); const text = await response.text(); if (response.status && !response.ok) throw new Error(`HTTP ${{response.status}} for ${{url}}`); return JSON.parse(text); }}
      async function fetchJsonFromCandidates(candidates) {{ let lastError = null; for (const candidate of candidates) {{ try {{ return {{ url: candidate, data: await fetchJsonUrl(candidate) }}; }} catch (error) {{ lastError = error; }} }} throw lastError || new Error('No readable local status source was available.'); }}
      function matchesFocus(record, focus, activeIds) {{ const status = String((record || {{}}).status || ''); const recordId = String((record || {{}}).task_id || (record || {{}}).agent_id || ''); if (focus === 'blocked') return status === 'blocked'; if (focus === 'stale') return status === 'stale'; if (focus === 'active') return status === 'in_progress' || status === 'waiting_for_user' || activeIds.has(recordId); return false; }}
      function buildHotspots(agents, activeAgentIds, focus) {{ const filtered = focus ? agents.filter(agent => matchesFocus(agent, focus, activeAgentIds)) : agents; const rollups = {{}}; filtered.forEach(agent => {{ const name = String(agent.agent || 'unknown'); if (!rollups[name]) rollups[name] = {{ agent: name, count: 0, active: 0, cleanup_issues: 0, statuses: {{}}, tasks: [] }}; const rollup = rollups[name]; rollup.count += 1; if (activeAgentIds.has(String(agent.agent_id || ''))) rollup.active += 1; const status = String(agent.status || 'unknown'); rollup.statuses[status] = Number(rollup.statuses[status] || 0) + 1; if (agent.cleanup_status === 'failed' || agent.cleanup_status === 'unknown' || agent.resource_status === 'cleanup_failed' || agent.resource_status === 'unknown') rollup.cleanup_issues += 1; if (agent.task_id && !rollup.tasks.includes(agent.task_id)) rollup.tasks.push(agent.task_id); }}); return Object.values(rollups).sort((a, b) => (b.cleanup_issues - a.cleanup_issues) || (b.active - a.active) || (b.count - a.count) || String(a.agent).localeCompare(String(b.agent))); }}
      async function loadReferencedRecords(runStatus, refKey, idKey) {{ const refs = Array.isArray(runStatus[refKey]) ? runStatus[refKey] : []; const records = []; const warnings = []; const entityName = String(idKey).endsWith('_id') ? String(idKey).slice(0, -3) : String(idKey); for (const item of refs) {{ if (!item || typeof item !== 'object') continue; const entityId = item[idKey]; const refPath = item.path; if (!entityId || !refPath) continue; const candidates = buildCandidateUrls(String(refPath)); if (!candidates.length) {{ warnings.push(`Missing ${{entityName}} file for ${{entityId}}: ${{refPath}}`); continue; }} try {{ const loaded = await fetchJsonFromCandidates(candidates); records.push(loaded.data); }} catch (_error) {{ warnings.push(`Missing ${{entityName}} file for ${{entityId}}: ${{refPath}}`); }} }} return {{ records, warnings }}; }}
      async function buildPayloadFromRunStatus(runStatus, loadedFrom) {{ const focus = (data.meta || {{}}).focus || null; const refresh = refreshConfig(); const activeTaskIds = new Set((runStatus.active_task_ids || []).map(item => String(item))); const activeAgentIds = new Set((runStatus.active_agent_ids || []).map(item => String(item))); const runId = String(runStatus.run_id || '-'); const payload = {{ meta: {{ title: `Status viewer: ${{runId}}`, focus, loaded_from: String(loadedFrom || (data.meta || {{}}).loaded_from || ''), read_only: true, refresh }}, run: {{ run_id: runStatus.run_id, status: runStatus.status, orchestrator: runStatus.orchestrator, layout: runStatus.layout || '-', current_stage: runStatus.current_stage, next_stage: runStatus.next_stage, updated_at: runStatus.updated_at, last_heartbeat_at: runStatus.last_heartbeat_at, waiting_on: runStatus.waiting_on, resume_from_checkpoint: runStatus.resume_from_checkpoint, last_error: runStatus.last_error, task_counts: Object.assign({{}}, runStatus.task_counts || {{}}), active_task_ids: Array.from(activeTaskIds).sort(), active_agent_ids: Array.from(activeAgentIds).sort(), record: sortedRecord(runStatus) }}, tasks: [], agents: [], warnings: [], hotspots: [], panels: {{ blocked: [], stale: [], active: [] }}, graph: {{ nodes: [{{ id: `run:${{runId}}`, type: 'run', label: runId, status: String(runStatus.status || 'unknown'), subtitle: String(runStatus.orchestrator || '-'), column: 0, detail: sortedRecord(runStatus) }}], edges: [] }} }};
        if (runStatus.layout !== 'expanded') {{ const counts = payload.run.task_counts || {{}}; payload.panels.blocked = [{{ task_id: 'run-only', summary: `count=${{counts.blocked || 0}} (details unavailable in run-only layout)`, status: 'blocked' }}]; payload.panels.stale = [{{ task_id: 'run-only', summary: `count=${{counts.stale || 0}} (details unavailable in run-only layout)`, status: 'stale' }}]; payload.panels.active = [{{ task_id: 'run-only', summary: payload.run.active_task_ids.length ? payload.run.active_task_ids.join(', ') : 'none', status: payload.run.active_task_ids.length ? 'in_progress' : 'unknown' }}]; return payload; }}
        const loadedTasks = await loadReferencedRecords(runStatus, 'task_refs', 'task_id');
        const loadedAgents = await loadReferencedRecords(runStatus, 'agent_refs', 'agent_id');
        payload.warnings = loadedTasks.warnings.concat(loadedAgents.warnings);
        const taskCardById = {{}};
        const taskCards = [];
        loadedTasks.records.forEach(task => {{ const taskId = String(task.task_id || ''); const card = {{ task_id: task.task_id, summary: task.summary, status: String(task.status || 'unknown'), assigned_agent_id: task.assigned_agent_id, assigned_executor: task.assigned_executor, resource_status: task.resource_status, result_summary: task.result_summary, error: task.error, resume_note: task.resume_note, record: sortedRecord(task) }}; taskCards.push(card); taskCardById[taskId] = card; payload.graph.nodes.push({{ id: `task:${{taskId}}`, type: 'task', label: taskId, status: String(task.status || 'unknown'), subtitle: String(task.summary || '-'), column: 1, detail: sortedRecord(task) }}); payload.graph.edges.push({{ from: `run:${{runId}}`, to: `task:${{taskId}}`, status: String(task.status || 'unknown') }}); }});
        const agentCards = [];
        loadedAgents.records.forEach(agent => {{ const agentId = String(agent.agent_id || ''); const taskId = String(agent.task_id || ''); const card = {{ agent_id: agent.agent_id, agent: agent.agent, status: String(agent.status || 'unknown'), task_id: agent.task_id, attempt: agent.attempt, cleanup_status: agent.cleanup_status, resource_status: agent.resource_status, result_summary: agent.result_summary, error: agent.error, resource_handles: agent.resource_handles, record: sortedRecord(agent) }}; agentCards.push(card); payload.graph.nodes.push({{ id: `agent:${{agentId}}`, type: 'agent', label: agentId, status: String(agent.status || 'unknown'), subtitle: String(agent.agent || '-'), column: 2, detail: sortedRecord(agent) }}); payload.graph.edges.push({{ from: `task:${{taskId}}`, to: `agent:${{agentId}}`, status: String(agent.status || 'unknown') }}); }});
        Array.from(activeTaskIds).sort().forEach(taskId => {{ if (!taskCardById[taskId]) payload.warnings.push(`Missing task file for active task ${{taskId}}.`); }});
        payload.panels.blocked = taskCards.filter(item => item.status === 'blocked');
        payload.panels.stale = taskCards.filter(item => item.status === 'stale');
        payload.panels.active = Array.from(activeTaskIds).sort().filter(taskId => taskCardById[taskId]).map(taskId => taskCardById[taskId]);
        payload.tasks = focus ? taskCards.filter(item => matchesFocus(item.record, focus, activeTaskIds)) : taskCards;
        payload.agents = focus ? agentCards.filter(item => matchesFocus(item.record, focus, activeAgentIds)) : agentCards;
        if (focus) ['blocked', 'stale', 'active'].forEach(key => {{ payload.panels[key] = payload.panels[key].filter(item => item.record ? matchesFocus(item.record, focus, activeTaskIds) : true); }});
        payload.hotspots = buildHotspots(loadedAgents.records, activeAgentIds, focus);
        return payload;
      }}
      function restoreDetail() {{ const key = String(refreshState.lastDetailKey || `run:${{data.run.run_id}}`); const node = (data.graph.nodes || []).find(item => item.id === key); if (node) {{ showDetail(key, node.detail || {{}}); return; }} showDetail(`run:${{data.run.run_id}}`, data.run.record); }}
      renderHero = function() {{ const run = data.run; document.getElementById('viewer-label').textContent = String((data.meta || {{}}).viewer_label || 'Read-only web export'); document.getElementById('hero-title').textContent = `${{run.run_id}} · ${{run.status}}`; document.getElementById('hero-subtitle').textContent = `Layout=${{run.layout}}. Orchestrator=${{run.orchestrator}}. Loaded from ${{data.meta.loaded_from}}.`; const meta = document.getElementById('hero-meta'); clearNode(meta); [`theme=${{FIXED_THEME}}`, `focus=${{data.meta.focus || 'all'}}`, `waiting_on=${{run.waiting_on ?? '-'}}`, `current_stage=${{run.current_stage ?? '-'}}`, `next_stage=${{run.next_stage ?? '-'}}`].forEach(text => meta.appendChild(el('span', 'pill', text))); const stats = document.getElementById('stats'); clearNode(stats); const counts = run.task_counts || {{}}; [['Tasks', data.tasks.length || Object.values(counts).reduce((a, b) => a + Number(b || 0), 0), `layout=${{run.layout}}`], ['Agents', data.agents.length, run.layout === 'expanded' ? 'expanded detail loaded' : 'run-only layout'], ['Blocked', Number(counts.blocked || 0), 'requires review'], ['Stale', Number(counts.stale || 0), 'resume or reconcile'], ['Active refs', (run.active_task_ids || []).length + (run.active_agent_ids || []).length, 'current pointers'], ['Warnings', (data.warnings || []).length, 'non-fatal missing refs']].forEach(([label, value, sub]) => {{ const card = el('div', 'stat'); card.appendChild(el('div', 'stat-label', String(label))); card.appendChild(el('div', 'stat-value', String(value))); card.appendChild(el('div', 'stat-sub', String(sub))); stats.appendChild(card); }}); }};
      renderItemList = function(targetId, items, builder) {{ const root = document.getElementById(targetId); clearNode(root); if (!items || !items.length) {{ root.appendChild(el('div', 'empty', 'none')); return; }} items.forEach(item => root.appendChild(builder(item))); }};
      renderLegend = function() {{ const legend = document.getElementById('legend'); clearNode(legend); Object.entries(COLORS).forEach(([status, color]) => {{ if (status === 'run') return; const item = el('div', 'legend-item'); const dot = el('span', 'dot'); dot.style.background = color; item.appendChild(dot); item.appendChild(el('span', '', status)); legend.appendChild(item); }}); }};
      function renderRefreshControls() {{ const refresh = refreshConfig(); document.getElementById('refresh-note').textContent = String(refresh.warning || ''); document.getElementById('refresh-warning').textContent = 'Read-only only: this viewer never controls the pipeline and never writes back to status artifacts.'; const select = document.getElementById('refresh-interval'); if (!select.dataset.bound) {{ clearNode(select); const off = document.createElement('option'); off.value = '0'; off.textContent = 'Off'; select.appendChild(off); (refresh.interval_options_seconds || []).forEach(value => {{ const option = document.createElement('option'); option.value = String(value); option.textContent = `${{value}}s`; select.appendChild(option); }}); select.addEventListener('change', event => {{ refreshState.intervalSeconds = Number(event.target.value || 0); restartPolling(); }}); document.getElementById('refresh-now').addEventListener('click', () => refreshFromSource('manual')); select.dataset.bound = 'true'; }} select.value = String(refreshState.intervalSeconds); }}
      function rerenderAll() {{ renderHero(); renderRefreshControls(); renderItemList('blocked-list', data.panels.blocked, taskCard); renderItemList('stale-list', data.panels.stale, taskCard); renderItemList('active-list', data.panels.active, taskCard); renderItemList('hotspots', data.hotspots, hotspotCard); renderItemList('warnings', data.warnings, warningCard); renderLegend(); renderGraph(); restoreDetail(); }}
      function stopPolling() {{ if (refreshState.timerId !== null) {{ window.clearInterval(refreshState.timerId); refreshState.timerId = null; }} }}
      function restartPolling() {{ stopPolling(); refreshState.failureCount = 0; renderRefreshControls(); if (refreshState.intervalSeconds > 0) {{ refreshState.timerId = window.setInterval(() => refreshFromSource('poll'), refreshState.intervalSeconds * 1000); setRefreshStatus(`Auto refresh every ${{refreshState.intervalSeconds}}s.`); }} else {{ setRefreshStatus('Auto refresh is off.'); }} }}
      async function refreshFromSource(reason) {{ if (refreshState.refreshing) return; const source = refreshSources(); const payloadUrl = String((source.payload_url || '')); const runStatusUrl = String((source.run_status_url || '')); if (!payloadUrl && !runStatusUrl) {{ setRefreshStatus('Live refresh unavailable: no original status source was embedded in this viewer.'); return; }} refreshState.refreshing = true; setRefreshStatus(reason === 'manual' ? 'Refreshing now…' : 'Polling original local status artifacts…'); try {{ let nextData; if (payloadUrl) {{ const loaded = await fetchJsonFromCandidates([payloadUrl]); nextData = loaded.data; }} else {{ const loaded = await fetchJsonFromCandidates([runStatusUrl]); nextData = await buildPayloadFromRunStatus(loaded.data, loaded.url); }} replaceData(nextData); refreshState.failureCount = 0; rerenderAll(); setRefreshStatus('Live refresh updated at ' + new Date().toLocaleTimeString() + (refreshState.intervalSeconds > 0 ? ' · next poll in ' + refreshState.intervalSeconds + 's.' : '.')); }} catch (_error) {{ refreshState.failureCount += 1; const maxFailures = Number(refreshConfig().max_failures || 1); if (refreshState.failureCount >= maxFailures) {{ stopPolling(); setRefreshStatus('Live refresh unavailable after ' + refreshState.failureCount + ' failed attempt(s).'); }} else {{ setRefreshStatus('Refresh attempt failed (' + refreshState.failureCount + '/' + maxFailures + '). The viewer stays read-only.'); }} }} finally {{ refreshState.refreshing = false; renderRefreshControls(); }} }}
      rerenderAll();
      restartPolling();
    </script>
  </main>
</body>
</html>
"""


def render_record(title: str, record: dict, preferred_order: list[str]) -> str:
    lines = [title]
    seen: set[str] = set()
    for key in preferred_order:
        if key in record:
            lines.append(line(key, record.get(key)))
            seen.add(key)
    for key in sorted(record):
        if key not in seen:
            lines.append(line(key, record.get(key)))
    return "\n".join(lines)


def parse_visual_selection(
    selection: Optional[str],
) -> Optional[tuple[str, Optional[str]]]:
    if not selection:
        return None

    normalized = selection.strip()
    if not normalized:
        return None

    if ":" not in normalized:
        if normalized == "run":
            return ("run", None)
        raise StatusCliError(
            "Unsupported visual selection. Use 'run', 'run:<run_id>', 'task:<task_id>', or 'agent:<agent_id>'."
        )

    node_type, node_id = normalized.split(":", 1)
    node_type = node_type.strip()
    node_id = node_id.strip()
    if node_type not in {"run", "task", "agent"} or not node_id:
        raise StatusCliError(
            "Unsupported visual selection. Use 'run', 'run:<run_id>', 'task:<task_id>', or 'agent:<agent_id>'."
        )

    return (node_type, node_id)


def render_visual_selected_details(
    run_status: dict, context: StatusContext, selection: str
) -> str:
    parsed = parse_visual_selection(selection)
    if parsed is None:
        return ""

    node_type, node_id = parsed
    if node_type == "run":
        run_id = str(run_status.get("run_id") or "-")
        if node_id and node_id != run_id:
            raise StatusCliError(
                f"Selected run node was not found: {node_id}. Available run: {run_id}."
            )
        return render_run_show(run_status, context)

    if node_type == "task":
        if node_id is None:
            raise StatusCliError("Task selection requires a task ID.")
        path = resolve_entity_path(
            run_status,
            context,
            node_id,
            ref_key="task_refs",
            id_key="task_id",
            entity_dir_name="tasks",
        )
        task = load_json(path)
        return render_record(
            f"Task: {node_id}",
            task,
            [
                "task_id",
                "run_id",
                "summary",
                "status",
                "assigned_agent_id",
                "assigned_executor",
                "resource_class",
                "resource_status",
                "teardown_required",
                "created_at",
                "started_at",
                "updated_at",
                "completed_at",
                "last_heartbeat_at",
                "result_summary",
                "error",
                "resume_note",
                "evidence_refs",
            ],
        )

    if node_id is None:
        raise StatusCliError("Agent selection requires an agent ID.")
    path = resolve_entity_path(
        run_status,
        context,
        node_id,
        ref_key="agent_refs",
        id_key="agent_id",
        entity_dir_name="agents",
    )
    agent = load_json(path)
    return render_record(
        f"Agent: {node_id}",
        agent,
        [
            "agent_id",
            "run_id",
            "agent",
            "status",
            "task_id",
            "attempt",
            "resource_class",
            "resource_status",
            "teardown_required",
            "cleanup_status",
            "resource_handles",
            "created_at",
            "started_at",
            "updated_at",
            "completed_at",
            "last_heartbeat_at",
            "result_summary",
            "error",
            "evidence_refs",
        ],
    )


def resolve_ref_path(ref_path: str, context: StatusContext) -> Optional[Path]:
    ref = Path(ref_path)
    bases = [
        context.status_root,
        context.status_root.parent if context.status_root.name == "status" else None,
        context.status_dir,
        context.output_dir,
        context.project_dir,
    ]
    candidates: list[Optional[Path]] = []
    if ref.is_absolute():
        candidates.append(ref)
    for base in bases:
        if base is None:
            continue
        candidates.append(base / ref)
        if ref.parts and ref.parts[0] == "status":
            candidates.append(base / Path(*ref.parts[1:]))
    return first_existing(candidates)


def resolve_entity_path(
    run_status: dict,
    context: StatusContext,
    entity_id: str,
    ref_key: str,
    id_key: str,
    entity_dir_name: str,
) -> Path:
    refs = run_status.get(ref_key) or []
    if refs:
        for item in refs:
            if (
                isinstance(item, dict)
                and item.get(id_key) == entity_id
                and item.get("path")
            ):
                resolved = resolve_ref_path(str(item["path"]), context)
                if resolved is not None:
                    return resolved
                raise StatusCliError(
                    f"Referenced {entity_dir_name[:-1]} file is missing for {entity_id}: {item['path']}"
                )

    candidates = [
        context.status_root / entity_dir_name / f"{entity_id}.json",
        (context.status_root.parent / entity_dir_name / f"{entity_id}.json")
        if context.status_root.name == "status"
        else None,
        (context.status_dir / entity_dir_name / f"{entity_id}.json")
        if context.status_dir
        else None,
        (context.output_dir / "status" / entity_dir_name / f"{entity_id}.json")
        if context.output_dir
        else None,
        (context.project_dir / "status" / entity_dir_name / f"{entity_id}.json")
        if context.project_dir
        else None,
        (context.project_dir / entity_dir_name / f"{entity_id}.json")
        if context.project_dir
        else None,
    ]
    resolved = first_existing(candidates)
    if resolved is not None:
        return resolved

    layout = run_status.get("layout")
    if layout != "expanded":
        noun = entity_dir_name[:-1].capitalize()
        raise StatusCliError(
            f"{noun} files are not available for this run (layout={layout or 'unknown'})."
        )

    raise StatusCliError(f"Could not find {entity_dir_name[:-1]} file for {entity_id}.")


def command_summary(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    return render_summary(run_status, context)


def command_run_show(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    return render_run_show(run_status, context)


def command_task_show(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    path = resolve_entity_path(
        run_status,
        context,
        args.task_id,
        ref_key="task_refs",
        id_key="task_id",
        entity_dir_name="tasks",
    )
    task = load_json(path)
    return render_record(
        f"Task: {args.task_id}",
        task,
        [
            "task_id",
            "run_id",
            "summary",
            "status",
            "assigned_agent_id",
            "assigned_executor",
            "resource_class",
            "resource_status",
            "teardown_required",
            "created_at",
            "started_at",
            "updated_at",
            "completed_at",
            "last_heartbeat_at",
            "result_summary",
            "error",
            "resume_note",
            "evidence_refs",
        ],
    )


def command_task_list(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    return render_task_list(run_status, context, status_filter=args.status)


def command_agent_show(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    path = resolve_entity_path(
        run_status,
        context,
        args.agent_id,
        ref_key="agent_refs",
        id_key="agent_id",
        entity_dir_name="agents",
    )
    agent = load_json(path)
    return render_record(
        f"Agent: {args.agent_id}",
        agent,
        [
            "agent_id",
            "run_id",
            "agent",
            "status",
            "task_id",
            "attempt",
            "resource_class",
            "resource_status",
            "teardown_required",
            "cleanup_status",
            "resource_handles",
            "created_at",
            "started_at",
            "updated_at",
            "completed_at",
            "last_heartbeat_at",
            "result_summary",
            "error",
            "evidence_refs",
        ],
    )


def command_agent_list(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    return render_agent_list(
        run_status,
        context,
        status_filter=args.status,
        task_id_filter=args.task_id,
    )


def command_visual(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    output = render_visual(run_status, context)
    if not getattr(args, "select", None):
        return output

    details = render_visual_selected_details(run_status, context, args.select)
    return "\n".join(
        [output, "", f"Selected node: {args.select}", "", "NODE DETAILS", details]
    )


def command_dashboard(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    return render_dashboard(run_status, context, focus=args.focus)


def command_web_export(args: argparse.Namespace) -> str:
    context = discover_run_status(args)
    run_status = load_json(context.run_status_path)
    output_path = Path(args.output).expanduser().resolve()

    if not output_path.parent.is_dir():
        raise StatusCliError(
            f"Output directory does not exist for --output: {output_path.parent}"
        )

    output_path.write_text(
        render_web_export(
            run_status,
            context,
            focus=args.focus,
            theme=args.theme,
            refresh_interval=args.refresh_interval,
        ),
        encoding="utf-8",
    )

    return "\n".join(
        [
            "READ-ONLY WEB EXPORT WRITTEN",
            f"Output: {output_path}",
            f"Theme: {args.theme}",
            f"Focus: {args.focus or 'all'}",
            f"Refresh interval: {args.refresh_interval}s",
            f"Loaded from: {context.run_status_path}",
        ]
    )


class LoopbackOnlyStatusServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def open_browser_if_requested(viewer_url: str, enabled: bool) -> str:
    if not enabled:
        return "Browser: not opened automatically; copy Viewer URL into your browser."
    try:
        opened = webbrowser.open(viewer_url, new=2)
    except Exception as exc:  # pragma: no cover - platform-dependent
        return f"Browser: failed to open automatically ({exc}). Copy Viewer URL above."
    if opened:
        return "Browser: opened default browser."
    return "Browser: automatic open was not confirmed; copy Viewer URL above."


def command_web_serve(args: argparse.Namespace) -> str:
    if args.port < 0 or args.port > 65535:
        raise StatusCliError("--port must be between 0 and 65535.")

    context = discover_run_status(args)
    load_json(context.run_status_path)

    refresh_source_overrides = {
        "payload_url": "/api/payload",
        "run_status_url": None,
        "status_root_url": None,
        "status_parent_url": None,
        "status_dir_url": None,
        "output_dir_url": None,
        "project_dir_url": None,
    }
    refresh_warning = (
        "Live refresh is read-only and re-reads local status artifacts through this "
        "loopback-only HTTP viewer."
    )

    def render_html() -> bytes:
        run_status = load_json(context.run_status_path)
        return render_web_export(
            run_status,
            context,
            focus=args.focus,
            theme=args.theme,
            refresh_interval=args.refresh_interval,
            viewer_label="Read-only localhost viewer",
            refresh_warning=refresh_warning,
            refresh_source_overrides=refresh_source_overrides,
        ).encode("utf-8")

    def render_payload_json() -> bytes:
        run_status = load_json(context.run_status_path)
        payload = build_web_payload(
            run_status,
            context,
            focus=args.focus,
            refresh_interval=args.refresh_interval,
            viewer_label="Read-only localhost viewer",
            refresh_warning=refresh_warning,
            refresh_source_overrides=refresh_source_overrides,
        )
        return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    class StatusViewerHandler(BaseHTTPRequestHandler):
        server_version = "status-cli"
        sys_version = ""

        def log_message(self, format: str, *args: object) -> None:
            return None

        def do_GET(self) -> None:
            self._handle_request(include_body=True)

        def do_HEAD(self) -> None:
            self._handle_request(include_body=False)

        def do_POST(self) -> None:
            self._method_not_allowed()

        def do_PUT(self) -> None:
            self._method_not_allowed()

        def do_DELETE(self) -> None:
            self._method_not_allowed()

        def do_PATCH(self) -> None:
            self._method_not_allowed()

        def _method_not_allowed(self) -> None:
            body = b"Method not allowed. This localhost viewer is read-only.\n"
            self.send_response(405)
            self.send_header("Allow", "GET, HEAD")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _handle_request(self, include_body: bool) -> None:
            request_path = urlsplit(self.path).path
            try:
                if request_path in {"/", "/index.html"}:
                    self._send_response(
                        200,
                        "text/html; charset=utf-8",
                        render_html(),
                        include_body=include_body,
                    )
                    return

                if request_path == "/api/payload":
                    self._send_response(
                        200,
                        "application/json; charset=utf-8",
                        render_payload_json(),
                        include_body=include_body,
                    )
                    return
            except StatusCliError as exc:
                body = f"ERROR: {exc}\n".encode("utf-8")
                self._send_response(
                    500,
                    "text/plain; charset=utf-8",
                    body,
                    include_body=include_body,
                )
                return

            body = b"Not found.\n"
            self._send_response(
                404,
                "text/plain; charset=utf-8",
                body,
                include_body=include_body,
            )

        def _send_response(
            self,
            status_code: int,
            content_type: str,
            body: bytes,
            *,
            include_body: bool,
        ) -> None:
            self.send_response(status_code)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if include_body:
                self.wfile.write(body)

    try:
        server = LoopbackOnlyStatusServer((args.host, args.port), StatusViewerHandler)
    except OSError as exc:
        raise StatusCliError(
            f"Failed to bind read-only localhost viewer on {args.host}:{args.port}: {exc}"
        ) from exc

    bound_host, bound_port = server.server_address[:2]
    viewer_url = f"http://{bound_host}:{bound_port}/"
    payload_url = f"{viewer_url}api/payload"
    browser_status = open_browser_if_requested(viewer_url, args.open_browser)
    print(
        "\n".join(
            [
                "READ-ONLY LOCALHOST VIEWER STARTED",
                f"Viewer URL: {viewer_url}",
                f"Payload URL: {payload_url}",
                f"Theme: {args.theme}",
                f"Focus: {args.focus or 'all'}",
                f"Refresh interval: {args.refresh_interval}s",
                f"Loaded from: {context.run_status_path}",
                browser_status,
                "Shutdown: press Ctrl+C to stop and close the loopback socket.",
            ]
        ),
        flush=True,
    )

    stop_reason = "stopped"
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        stop_reason = "keyboard interrupt"
        print("Stopping read-only localhost viewer...", flush=True)
    finally:
        server.server_close()
        print(
            f"Read-only localhost viewer stopped. Loopback socket closed for {viewer_url}",
            flush=True,
        )

    return "\n".join(
        [
            "READ-ONLY LOCALHOST VIEWER STOPPED",
            f"Viewer URL: {viewer_url}",
            f"Stop reason: {stop_reason}",
            "Cleanup: loopback socket closed.",
        ]
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only status CLI for pipeline status artifacts."
    )
    add_path_options(parser)
    subparsers = parser.add_subparsers(dest="command")
    subparsers.required = True

    summary_parser = subparsers.add_parser("summary", help="Show a compact run summary")
    add_path_options(summary_parser)
    summary_parser.set_defaults(handler=command_summary)

    run_parser = subparsers.add_parser("run", help="Run-level commands")
    run_subparsers = run_parser.add_subparsers(dest="run_command")
    run_subparsers.required = True
    run_show_parser = run_subparsers.add_parser("show", help="Show the full run record")
    add_path_options(run_show_parser)
    run_show_parser.set_defaults(handler=command_run_show)

    task_parser = subparsers.add_parser("task", help="Task-level commands")
    task_subparsers = task_parser.add_subparsers(dest="task_command")
    task_subparsers.required = True
    task_show_parser = task_subparsers.add_parser("show", help="Show one task record")
    task_show_parser.add_argument("task_id", help="Task ID to display")
    add_path_options(task_show_parser)
    task_show_parser.set_defaults(handler=command_task_show)
    task_list_parser = task_subparsers.add_parser(
        "list", help="List task records for expanded layout"
    )
    task_list_parser.add_argument("--status", help="Optional task status filter")
    add_path_options(task_list_parser)
    task_list_parser.set_defaults(handler=command_task_list)

    agent_parser = subparsers.add_parser("agent", help="Agent-level commands")
    agent_subparsers = agent_parser.add_subparsers(dest="agent_command")
    agent_subparsers.required = True
    agent_show_parser = agent_subparsers.add_parser(
        "show", help="Show one agent record"
    )
    agent_show_parser.add_argument("agent_id", help="Agent ID to display")
    add_path_options(agent_show_parser)
    agent_show_parser.set_defaults(handler=command_agent_show)
    agent_list_parser = agent_subparsers.add_parser(
        "list", help="List agent records for expanded layout"
    )
    agent_list_parser.add_argument("--status", help="Optional agent status filter")
    agent_list_parser.add_argument("--task-id", help="Optional task ID filter")
    add_path_options(agent_list_parser)
    agent_list_parser.set_defaults(handler=command_agent_list)

    visual_parser = subparsers.add_parser(
        "visual", help="Show a read-only local visual inspection"
    )
    visual_parser.add_argument(
        "--select",
        help="Optional node selection: run, run:<run_id>, task:<task_id>, or agent:<agent_id>",
    )
    add_path_options(visual_parser)
    visual_parser.set_defaults(handler=command_visual)

    dashboard_parser = subparsers.add_parser(
        "dashboard", help="Show a compact run dashboard"
    )
    dashboard_parser.add_argument(
        "--focus",
        choices=FOCUS_CHOICES,
        help="Optional dashboard focus: blocked, stale, or active",
    )
    add_path_options(dashboard_parser)
    dashboard_parser.set_defaults(handler=command_dashboard)

    web_parser = subparsers.add_parser("web", help="Read-only local web export")
    web_subparsers = web_parser.add_subparsers(dest="web_command")
    web_subparsers.required = True
    web_export_parser = web_subparsers.add_parser(
        "export", help="Write a self-contained read-only HTML dashboard"
    )
    web_export_parser.add_argument(
        "--output", required=True, help="Output path for the HTML export"
    )
    web_export_parser.add_argument(
        "--focus",
        choices=FOCUS_CHOICES,
        help="Optional web export focus: blocked, stale, or active",
    )
    web_export_parser.add_argument(
        "--theme",
        choices=WEB_THEME_CHOICES,
        default="auto",
        help="Bounded web export theme: auto, light, or dark",
    )
    web_export_parser.add_argument(
        "--refresh-interval",
        type=int,
        choices=WEB_REFRESH_INTERVAL_CHOICES,
        default=WEB_DEFAULT_REFRESH_INTERVAL,
        help="Bounded live-refresh interval in seconds for the exported viewer",
    )
    add_path_options(web_export_parser)
    web_export_parser.set_defaults(handler=command_web_export)

    web_serve_parser = web_subparsers.add_parser(
        "serve", help="Serve a read-only HTML dashboard over loopback HTTP"
    )
    web_serve_parser.add_argument(
        "--host",
        choices=("127.0.0.1", "localhost"),
        default="127.0.0.1",
        help="Loopback host to bind; external interfaces are not allowed",
    )
    web_serve_parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Loopback TCP port; use 0 to auto-select an available port",
    )
    web_serve_parser.add_argument(
        "--focus",
        choices=FOCUS_CHOICES,
        help="Optional localhost viewer focus: blocked, stale, or active",
    )
    web_serve_parser.add_argument(
        "--theme",
        choices=WEB_THEME_CHOICES,
        default="auto",
        help="Bounded localhost viewer theme: auto, light, or dark",
    )
    web_serve_parser.add_argument(
        "--refresh-interval",
        type=int,
        choices=WEB_REFRESH_INTERVAL_CHOICES,
        default=WEB_DEFAULT_REFRESH_INTERVAL,
        help="Bounded live-refresh interval in seconds for the localhost viewer",
    )
    web_serve_parser.add_argument(
        "--open-browser",
        action="store_true",
        help="Open the localhost viewer in the default browser after startup",
    )
    add_path_options(web_serve_parser)
    web_serve_parser.set_defaults(handler=command_web_serve)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        output = args.handler(args)
    except StatusCliError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
