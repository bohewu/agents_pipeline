#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence


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
        raise StatusCliError(
            f"{entity_dir_name[:-1].capitalize()} files are not available for this run (layout={layout or 'unknown'})."
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

    agent_parser = subparsers.add_parser("agent", help="Agent-level commands")
    agent_subparsers = agent_parser.add_subparsers(dest="agent_command")
    agent_subparsers.required = True
    agent_show_parser = agent_subparsers.add_parser(
        "show", help="Show one agent record"
    )
    agent_show_parser.add_argument("agent_id", help="Agent ID to display")
    add_path_options(agent_show_parser)
    agent_show_parser.set_defaults(handler=command_agent_show)

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
