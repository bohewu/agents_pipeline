#!/usr/bin/env python3
"""Resolve managed leaf roles and run bounded external roles.

Only executor dispatch may write, with explicit opt-in and scoped result checks.
Dispatch does not claim native subagent role selection.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
from pathlib import Path, PureWindowsPath
from typing import Any, Callable


ROOT = Path(__file__).resolve().parent.parent
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
MAX_TASK_BYTES = 8192
MAX_STDOUT_BYTES = 2 * 1024 * 1024
MAX_STDERR_BYTES = 64 * 1024
MAX_RECEIPT_BYTES = 4 * 1024 * 1024
REPO_SCOUT_FIELDS = (
    "entry_points", "key_files", "relevant_patterns",
    "constraints_found", "risk_notes", "open_questions",
)
REPO_SCOUT_SCHEMA = {
    "type": "object",
    "properties": {field: {"type": "array", "items": {"type": "string"}} for field in REPO_SCOUT_FIELDS},
    "required": list(REPO_SCOUT_FIELDS),
    "additionalProperties": False,
}
REVIEWER_FIELDS = ("overall_status", "issues", "required_followups", "optional_notes")
REVIEWER_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_status": {"type": "string", "enum": ["pass", "fail"]},
        **{field: {"type": "array", "items": {"type": "string"}}
          for field in REVIEWER_FIELDS[1:]},
    },
    "required": list(REVIEWER_FIELDS),
    "additionalProperties": False,
}
EXECUTOR_FIELDS = (
    "task_id", "status", "changes", "evidence", "operational_retries_used",
    "repair_attempts_used", "last_failure_signature", "notes", "followups",
)
EXECUTOR_SCHEMA = {
    "type": "object",
    "properties": {
        "task_id": {"type": "string"},
        "status": {"type": "string", "enum": ["done", "blocked", "partial"]},
        **{field: {"type": "array", "items": {"type": "string"}}
          for field in ("changes", "evidence", "followups")},
        "operational_retries_used": {"type": "integer", "minimum": 0},
        "repair_attempts_used": {"type": "integer", "minimum": 0},
        "last_failure_signature": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": list(EXECUTOR_FIELDS),
    "additionalProperties": False,
}


class EvidenceError(Exception):
    pass


class ResolutionConflict(EvidenceError):
    pass


class DirtyWorktreeError(EvidenceError):
    pass


class DispatchFailure(EvidenceError):
    def __init__(
        self, message: str, phase: str, execution_started: str,
        outcome_uncertain: bool, conflicted: bool,
    ):
        super().__init__(message)
        self.phase = phase
        self.execution_started = execution_started
        self.outcome_uncertain = outcome_uncertain
        self.conflicted = conflicted


def _json_command(argv: list[str], accepted_codes: tuple[int, ...] = (0,)) -> dict[str, Any]:
    result = subprocess.run(argv, capture_output=True, text=True, check=False)
    if result.returncode not in accepted_codes:
        raise EvidenceError(result.stderr.strip() or f"Command exited {result.returncode}")
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise EvidenceError("Command did not return JSON") from exc
    if not isinstance(value, dict):
        raise EvidenceError("Command did not return a JSON object")
    return value


def _verify_leaf_source(status: dict[str, Any], role: str) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", role):
        raise EvidenceError("Role must be a bounded managed role name")
    support = Path(status["global_target"]) / "agents-pipeline" / "agents" / f"{role}.md"
    try:
        content = support.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise EvidenceError("Canonical installed role source cannot be read") from exc
    lines = content.splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise EvidenceError("Canonical role frontmatter is missing")
    header = lines[1:lines.index("---", 1)]
    fields = {}
    for line in header:
        key, separator, value = line.partition(":")
        if separator:
            fields[key.strip()] = value.strip().strip('"\'')
    if fields.get("name") != role or fields.get("kind") != "subagent":
        raise EvidenceError("Role is not a registered managed leaf")


def resolve_role(
    workspace: Path, role: str, signals: list[str], task_intent: str = "inspect",
    dispatch_context: str | None = None,
) -> dict[str, Any]:
    workspace = workspace.resolve(strict=True)
    status = _json_command([
        sys.executable, str(ROOT / "tools/agent-profile.py"), "status",
        "--runtime", "codex", "--scope", "workspace",
        "--workspace", str(workspace), "--json",
    ])
    for key, expected in (
        ("configured", True), ("health", "ok"),
        ("profile_eligibility", "eligible"), ("catalog_state", "current"),
        ("configuration_compatibility", "current"),
    ):
        if status.get(key) != expected:
            raise EvidenceError(f"Workspace profile {key} is not {expected!r}")
    if Path(status["workspace"]).resolve(strict=True) != workspace:
        raise EvidenceError("Workspace status refers to another directory")
    _verify_leaf_source(status, role)
    config = (status.get("resolved_configurations") or {}).get(role)
    if not isinstance(config, dict) or config.get("provenance", {}).get("source") != "workspace_profile":
        raise EvidenceError("Saved workspace role binding is unavailable")
    if config.get("model_set", {}).get("id") != "openai":
        raise EvidenceError("External-root proof currently requires the OpenAI model set")
    binding = config.get("role_binding") or {}
    model = binding.get("model")
    if binding.get("role") != role or not isinstance(model, str):
        raise EvidenceError("Saved role binding is invalid")

    role_path = Path(status["roles_dir"]) / f"{role}.toml"
    try:
        role_config = tomllib.loads(role_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        raise EvidenceError("Generated role config cannot be read") from exc
    instructions = role_config.get("developer_instructions")
    if role_config.get("name") != role or role_config.get("model") != model or not isinstance(instructions, str):
        raise EvidenceError("Generated role config differs from saved binding")

    request = {
        "role": role, "mode": "adaptive", "task_intent": task_intent,
        "reasoning_signals": signals, "selector_available": True,
        "resolved_configuration": config,
    }
    if dispatch_context is not None:
        request["dispatch_context"] = dispatch_context
    decision = _json_command([
        "node", str(ROOT / "tools/reasoning-policy.js"), "--input-json",
        json.dumps(request), "--compact",
    ], accepted_codes=(0, 3))
    if decision.get("conflict"):
        raise ResolutionConflict(str(decision.get("conflict_reason") or decision["conflict"]))
    if decision.get("enforcement_status") != "requested":
        raise EvidenceError("Reasoning resolver did not produce a dispatchable request")
    effort = decision.get("dispatch_effort")
    if not isinstance(effort, str):
        raise EvidenceError("Reasoning resolver did not select an effort")
    return {
        "schema_version": 1,
        "status": "ready",
        "surface": "independent_codex_exec_root",
        "role": role,
        "task_intent": task_intent,
        "dispatch_context": dispatch_context,
        "dispatch_supported": (
            (role == "repo-scout" and task_intent == "inspect" and dispatch_context is None)
            or (role == "planner" and task_intent == "design" and dispatch_context is None)
            or (role == "reviewer" and task_intent == "review"
                and dispatch_context == "ad-hoc-review" and decision["effective_class"] == "deep")
            or (role == "executor" and task_intent == "execute" and dispatch_context is None
                and decision["effective_class"] in {"routine", "deliberative", "deep"})
        ),
        "workspace": str(workspace),
        "profile": status["profile"],
        "model_set": config["model_set"],
        "reasoning_projection": config["reasoning_projection"],
        "requested_model": model,
        "model_tier": binding["model_tier"],
        "requested_effort": effort,
        "reasoning_class": decision["effective_class"],
        "enforcement_status": "requested",
        "role_config": str(role_path),
        "role_instructions_sha256": hashlib.sha256(instructions.encode("utf-8")).hexdigest(),
    }


def _plain_trace_path(file: Path, codex_home: Path) -> Path:
    home = codex_home.resolve(strict=True)
    absolute = Path(os.path.abspath(file))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current = current / part
        try:
            entry = current.lstat()
        except OSError as exc:
            raise EvidenceError("Trace path cannot be read") from exc
        if _is_link_or_reparse(entry):
            raise EvidenceError("Trace path cannot contain links or reparse points")
    canonical = absolute.resolve(strict=True)
    try:
        relative = canonical.relative_to(home)
    except ValueError as exc:
        raise EvidenceError("Trace must be within CODEX_HOME") from exc
    if not relative.parts or relative.parts[0] not in {"sessions", "archived_sessions"}:
        raise EvidenceError("Trace must be under Codex sessions")
    if not stat.S_ISREG(canonical.stat().st_mode) or canonical.suffix != ".jsonl":
        raise EvidenceError("Trace must be a regular JSONL file")
    return canonical


def _is_link_or_reparse(entry: os.stat_result) -> bool:
    return stat.S_ISLNK(entry.st_mode) or bool(
        getattr(entry, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def inspect_exec(
    trace_file: Path, thread_id: str, resolution: dict[str, Any], codex_home: Path,
    attempt_id: str | None = None,
) -> dict[str, Any]:
    if not UUID.fullmatch(thread_id):
        raise EvidenceError("Thread ID must be a UUID")
    trace_file = _plain_trace_path(trace_file, codex_home)
    if thread_id.lower() not in trace_file.name.lower():
        raise EvidenceError("Trace filename does not contain the requested thread ID")
    role_config = tomllib.loads(Path(resolution["role_config"]).read_text(encoding="utf-8"))
    instructions = role_config["developer_instructions"]
    digest = hashlib.sha256(instructions.encode("utf-8")).hexdigest()
    if digest != resolution["role_instructions_sha256"]:
        raise EvidenceError("Role instructions changed after resolution")

    session = context = None
    role_instructions_turns: set[str] = set()
    started_turns: list[str] = []
    completed_turns: list[str] = []
    context_count = 0
    matching_attempt_turns: list[str | None] = []
    with trace_file.open(encoding="utf-8") as stream:
        for line in stream:
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise EvidenceError("Trace has malformed JSONL") from exc
            payload = record.get("payload") or {}
            if record.get("type") == "session_meta" and session is None:
                session = payload
            elif record.get("type") == "turn_context":
                context_count += 1
                if context is None:
                    context = payload
            elif record.get("type") == "response_item" and payload.get("role") == "developer":
                if any(
                    item.get("type") == "input_text" and item.get("text") == instructions
                    for item in payload.get("content", []) if isinstance(item, dict)
                ):
                    turn_id = payload.get("internal_chat_message_metadata_passthrough", {}).get("turn_id")
                    if isinstance(turn_id, str):
                        role_instructions_turns.add(turn_id)
            elif record.get("type") == "response_item" and payload.get("role") == "user" and attempt_id:
                marker = f'"attempt_id": "{attempt_id}"'
                count = sum(
                    item.get("text", "").count(marker)
                    for item in payload.get("content", []) if isinstance(item, dict)
                    and item.get("type") == "input_text" and isinstance(item.get("text"), str)
                )
                if count:
                    matching_attempt_turns.extend([
                        payload.get("internal_chat_message_metadata_passthrough", {}).get("turn_id")
                    ] * count)
            elif record.get("type") == "event_msg":
                turn_id = payload.get("turn_id")
                if payload.get("type") == "task_started" and isinstance(turn_id, str):
                    started_turns.append(turn_id)
                elif payload.get("type") == "task_complete" and isinstance(turn_id, str):
                    completed_turns.append(turn_id)
    if not isinstance(session, dict) or not isinstance(context, dict):
        raise EvidenceError("Trace lacks session metadata or turn context")
    observed_model = context.get("model")
    observed_effort = context.get("effort")
    turn_id = context.get("turn_id")
    single_turn = (
        isinstance(turn_id, str) and context_count == 1
        and started_turns == [turn_id] and completed_turns == [turn_id]
    )
    checks = {
        "thread_id": session.get("id") == thread_id.lower(),
        "independent_root": session.get("source") == "exec" and session.get("parent_thread_id") is None and session.get("agent_role") is None,
        "single_turn": single_turn,
        "workspace": session.get("cwd") == resolution["workspace"] and context.get("cwd") == resolution["workspace"],
        "provider": session.get("model_provider") == "openai",
        "model": observed_model == resolution["requested_model"],
        "effort": observed_effort == resolution["requested_effort"],
        "role_instructions": turn_id in role_instructions_turns,
        "approval_never": context.get("approval_policy") == "never",
        "completed": single_turn,
    }
    sandbox = "workspace-write" if resolution["role"] == "executor" else "read-only"
    checks["sandbox_policy"] = context.get("sandbox_policy", {}).get("type") == sandbox
    if attempt_id is not None:
        checks["attempt_id"] = matching_attempt_turns == [turn_id]
    return {
        "schema_version": 1,
        "surface": "independent_codex_exec_root",
        "native_managed_child": False,
        "role": resolution["role"],
        "thread_id": thread_id.lower(),
        "observed_model": observed_model,
        "observed_effort": observed_effort,
        "checks": checks,
        "verification_status": "matched" if all(checks.values()) else "mismatch",
    }


def _task_bytes(file: Path) -> bytes:
    if file.is_symlink() or not file.is_file() or file.stat().st_size > MAX_TASK_BYTES:
        raise EvidenceError("Task must be a regular JSON file of at most 8192 bytes")
    raw = file.read_bytes()
    if len(raw) > MAX_TASK_BYTES:
        raise EvidenceError("Task must be a regular JSON file of at most 8192 bytes")
    return raw


def _read_task(file: Path, role: str = "repo-scout", raw: bytes | None = None) -> dict[str, Any]:
    try:
        task = json.loads((raw if raw is not None else _task_bytes(file)).decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise EvidenceError("Task must contain valid UTF-8 JSON") from exc
    if not isinstance(task, dict):
        raise EvidenceError("Task must be a JSON object")
    if role == "repo-scout":
        if set(task) not in ({"task", "reasoning_signals"}, {"task", "reasoning_signals", "task_intent"}):
            raise EvidenceError("Repo-scout task must contain task and reasoning_signals")
        if task.get("task_intent", "inspect") != "inspect":
            raise EvidenceError("Repo-scout task_intent must be inspect")
        if not isinstance(task["task"], str) or not 1 <= len(task["task"]) <= 4000:
            raise EvidenceError("Task text must contain 1 to 4000 characters")
    elif role == "planner":
        if set(task) != {"problem_spec", "reasoning_signals", "task_intent"} or task["task_intent"] != "design":
            raise EvidenceError("Planner task requires problem_spec, reasoning_signals, and design intent")
        spec = task["problem_spec"]
        if not isinstance(spec, dict) or not {"goal", "scope", "constraints", "acceptance_criteria", "assumptions"} <= set(spec):
            raise EvidenceError("Planner requires a ProblemSpec object")
        if not isinstance(spec["goal"], str) or not spec["goal"].strip():
            raise EvidenceError("ProblemSpec goal is required")
    elif role == "reviewer":
        if set(task) != {"task_intent", "review_kind", "reasoning_signals", "targets", "criteria"}:
            raise EvidenceError("Reviewer task requires intent, kind, signals, targets, and criteria")
        if task["task_intent"] != "review" or task["review_kind"] != "ad_hoc":
            raise EvidenceError("External reviewer supports only ad_hoc review intent")
        if not isinstance(task["targets"], list) or not 1 <= len(task["targets"]) <= 12 or not all(
            isinstance(target, str) and 1 <= len(target) <= 240 for target in task["targets"]
        ):
            raise EvidenceError("Reviewer targets must be 1 to 12 bounded paths")
        if not isinstance(task["criteria"], list) or not 1 <= len(task["criteria"]) <= 8 or not all(
            isinstance(criterion, str) and 1 <= len(criterion) <= 500 for criterion in task["criteria"]
        ):
            raise EvidenceError("Reviewer criteria must be 1 to 8 bounded strings")
    elif role == "executor":
        if set(task) != {"task_id", "task_intent", "reasoning_signals", "task", "allowed_paths", "acceptance_criteria", "verification"}:
            raise EvidenceError("Executor task requires an atomic task, paths, criteria, and verification")
        if task["task_intent"] != "execute" or not isinstance(task["task_id"], str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", task["task_id"]
        ):
            raise EvidenceError("Executor requires execute intent and a bounded task_id")
        if not isinstance(task["task"], str) or not 1 <= len(task["task"]) <= 4000:
            raise EvidenceError("Executor task text must contain 1 to 4000 characters")
        if not isinstance(task["allowed_paths"], list) or not 1 <= len(task["allowed_paths"]) <= 12 or not all(
            isinstance(path, str) and 1 <= len(path) <= 240 for path in task["allowed_paths"]
        ):
            raise EvidenceError("Executor allowed_paths must be 1 to 12 bounded paths")
        if any(path.split("/", 1)[0].casefold() in {".git", ".codex"} for path in task["allowed_paths"]):
            raise EvidenceError("Executor cannot write Git or Codex routing metadata")
        if not isinstance(task["acceptance_criteria"], list) or not 1 <= len(task["acceptance_criteria"]) <= 8 or not all(
            isinstance(criterion, str) and 1 <= len(criterion) <= 500 for criterion in task["acceptance_criteria"]
        ):
            raise EvidenceError("Executor acceptance_criteria must be 1 to 8 bounded strings")
        if not isinstance(task["verification"], list) or len(task["verification"]) > 4 or not all(
            isinstance(check, str) and 1 <= len(check) <= 240 for check in task["verification"]
        ):
            raise EvidenceError("Executor verification must contain at most four bounded commands")
    else:
        raise EvidenceError("External dispatch is unavailable for this role")
    signals = task["reasoning_signals"]
    if not isinstance(signals, list) or len(signals) > 8 or not all(isinstance(s, str) for s in signals):
        raise EvidenceError("reasoning_signals must be an array of at most eight strings")
    return task


def _verify_repo_paths(workspace: Path, targets: list[str], allow_new: bool = False) -> None:
    workspace = workspace.resolve(strict=True)
    for target in targets:
        path = Path(target)
        if ("\\" in target or path.is_absolute() or PureWindowsPath(target).drive
                or any(part in {"", ".", ".."} for part in target.split("/"))):
            raise EvidenceError("Targets must be repo-relative paths without traversal")
        current = workspace
        for index, part in enumerate(path.parts):
            current = current / part
            try:
                entry = current.lstat()
            except OSError as exc:
                if allow_new and index == len(path.parts) - 1 and isinstance(exc, FileNotFoundError):
                    break
                raise EvidenceError(f"Target cannot be read: {target}") from exc
            if _is_link_or_reparse(entry):
                raise EvidenceError("Target paths cannot contain links or reparse points")
            if index < len(path.parts) - 1 and not stat.S_ISDIR(entry.st_mode):
                raise EvidenceError(f"Target parent is not a directory: {target}")
            if index == len(path.parts) - 1 and not stat.S_ISREG(entry.st_mode):
                raise EvidenceError(f"Target is not a regular file: {target}")


def _git_output(workspace: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(workspace), *args], capture_output=True, check=False,
    )
    if result.returncode:
        raise EvidenceError(f"Git preflight failed: {' '.join(args)}")
    return result.stdout


def _clean_worktree_head(workspace: Path) -> str:
    workspace = workspace.resolve(strict=True)
    if Path(os.fsdecode(_git_output(workspace, "rev-parse", "--show-toplevel")).strip()).resolve() != workspace:
        raise EvidenceError("Executor workspace must be the Git worktree root")
    if _git_output(workspace, "status", "--porcelain=v1", "--untracked-files=all", "-z"):
        raise DirtyWorktreeError("Executor requires a clean Git worktree")
    return _git_output(workspace, "rev-parse", "HEAD").decode("ascii").strip()


def _worktree_common_dir(workspace: Path) -> str:
    top_level = Path(os.fsdecode(_git_output(workspace, "rev-parse", "--show-toplevel")).strip())
    if not os.path.samefile(top_level, workspace):
        raise EvidenceError("Executor workspace must be the Git worktree root")
    value = Path(os.fsdecode(_git_output(workspace, "rev-parse", "--git-common-dir")).strip())
    canonical = (workspace / value).resolve(strict=True) if not value.is_absolute() else value.resolve(strict=True)
    return os.path.normcase(str(canonical))


def _account_home() -> Path:
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        try:
            current_process = ctypes.windll.kernel32.GetCurrentProcess
            open_process_token = ctypes.windll.advapi32.OpenProcessToken
            profile_dir = ctypes.windll.userenv.GetUserProfileDirectoryW
            close_handle = ctypes.windll.kernel32.CloseHandle
        except (AttributeError, OSError) as exc:
            raise EvidenceError("OS account profile directory is unavailable") from exc
        current_process.argtypes = ()
        current_process.restype = wintypes.HANDLE
        open_process_token.argtypes = (wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE))
        open_process_token.restype = wintypes.BOOL
        profile_dir.argtypes = (wintypes.HANDLE, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD))
        profile_dir.restype = wintypes.BOOL
        close_handle.argtypes = (wintypes.HANDLE,)
        close_handle.restype = wintypes.BOOL
        token = wintypes.HANDLE()
        if not open_process_token(current_process(), 0x0008, ctypes.byref(token)):
            raise EvidenceError("OS account profile directory is unavailable")
        try:
            size = wintypes.DWORD(0)
            profile_dir(token, None, ctypes.byref(size))
            if not 1 <= size.value <= 32768:
                raise EvidenceError("OS account profile directory is unavailable")
            buffer = ctypes.create_unicode_buffer(size.value)
            if not profile_dir(token, buffer, ctypes.byref(size)):
                raise EvidenceError("OS account profile directory is unavailable")
            home = buffer.value
        finally:
            close_handle(token)
    else:
        import pwd

        try:
            home = pwd.getpwuid(os.getuid()).pw_dir
        except KeyError as exc:
            raise EvidenceError("OS account profile directory is unavailable") from exc
    if not home:
        raise EvidenceError("OS account profile directory is unavailable")
    return Path(home).resolve(strict=True)


def _attempt_state_root() -> Path:
    return _account_home() / ".agents-pipeline" / "external-dispatch"


def _private_directory(path: Path) -> None:
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    entry = path.lstat()
    if _is_link_or_reparse(entry) or not stat.S_ISDIR(entry.st_mode):
        raise EvidenceError("Attempt state directory is not a plain directory")
    if os.name != "nt" and (entry.st_uid != os.getuid() or entry.st_mode & 0o077):
        raise EvidenceError("Attempt state directory is not private")


def _attempt_directory(workspace: Path) -> Path:
    root = _attempt_state_root()
    if root == workspace or workspace in root.parents:
        raise EvidenceError("Attempt state must be outside the executor worktree")
    _private_directory(root.parent)
    _private_directory(root)
    directory = root / hashlib.sha256(os.fsencode(os.path.normcase(str(workspace)))).hexdigest()
    _private_directory(directory)
    return directory


def _sync_directory(directory: Path) -> None:
    if os.name != "nt":
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _read_receipt(path: Path) -> dict[str, Any]:
    entry = path.lstat()
    if (_is_link_or_reparse(entry) or not stat.S_ISREG(entry.st_mode)
            or entry.st_size > MAX_RECEIPT_BYTES or (os.name != "nt" and
            (entry.st_uid != os.getuid() or entry.st_mode & 0o077))):
        raise EvidenceError("Attempt state file is unsafe")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise EvidenceError("Attempt state file is malformed")
    return value


def _write_receipt(path: Path, value: dict[str, Any]) -> None:
    encoded = json.dumps(value, sort_keys=True).encode("utf-8")
    if len(encoded) > MAX_RECEIPT_BYTES:
        raise EvidenceError("Attempt receipt exceeds the bounded limit")
    descriptor, temporary = tempfile.mkstemp(prefix=".receipt-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        if path.exists() or path.is_symlink():
            _read_receipt(path)
        os.replace(temporary, path)
        _sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _create_receipt(path: Path, value: dict[str, Any]) -> bool:
    encoded = json.dumps(value, sort_keys=True).encode("utf-8")
    if len(encoded) > MAX_RECEIPT_BYTES:
        raise EvidenceError("Attempt receipt exceeds the bounded limit")
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    _sync_directory(path.parent)
    return True


class ExecutorAttempt:
    """Durable, fail-closed reservation for cooperating writable callers."""

    def __init__(self, workspace: Path, attempt_id: str, binding: dict[str, str]):
        self.attempt_id = attempt_id.lower()
        self.directory = _attempt_directory(workspace)
        self.receipt_path = self.directory / f"{self.attempt_id}.json"
        self.active_path = self.directory / "active.json"
        identity_path = self.directory / "identity.json"
        identity = {"workspace": os.path.normcase(str(workspace)), "git_common_dir": binding["git_common_dir"]}
        if not _create_receipt(identity_path, identity):
            if _read_receipt(identity_path) != identity:
                raise ResolutionConflict("Worktree identity differs from recorded attempt state")
        self.binding = binding

    def replay(self) -> dict[str, Any] | None:
        if not self.receipt_path.exists() and not self.receipt_path.is_symlink():
            return None
        receipt = _read_receipt(self.receipt_path)
        if receipt.get("attempt_id") != self.attempt_id or receipt.get("binding") != self.binding:
            raise ResolutionConflict("Attempt ID was reused with different inputs")
        result = receipt.get("result")
        if isinstance(result, dict):
            if (receipt.get("state") not in {"verified", "unverified"}
                    or result.get("status") != receipt["state"]
                    or result.get("attempt_id") != self.attempt_id
                    or result.get("role") != "executor"
                    or not isinstance(result.get("evidence"), dict)
                    or not isinstance(result.get("thread_id"), str)):
                raise EvidenceError("Attempt result receipt is incomplete")
            return {**result, "replayed": True}
        if receipt.get("state") not in {"claimed", "started", "uncertain"}:
            raise EvidenceError("Attempt receipt state is incomplete")
        return {
            "schema_version": 1, "surface": "independent_codex_exec_root",
            "role": "executor", "status": receipt["state"],
            "attempt_id": self.attempt_id,
            "replayed": True,
            "execution_started": receipt.get("execution_started", "unknown"),
            "outcome_uncertain": True,
            "process_id": receipt.get("process_id", "unknown"),
            "thread_id": receipt.get("thread_id", "unknown"),
            "changed_paths": receipt.get("changed_paths", []),
            "error": receipt.get("error", ""),
            "note": "Existing attempt; no child was launched by this call",
        }

    def ensure_available(self) -> None:
        if self.active_path.exists() or self.active_path.is_symlink():
            active = _read_receipt(self.active_path)
            raise ResolutionConflict(f"Worktree already reserved by attempt {active.get('attempt_id', 'unknown')}")
        for path in self.directory.iterdir():
            if path.name == "identity.json":
                continue
            if not path.name.endswith(".json") or not UUID.fullmatch(path.stem):
                raise EvidenceError("Attempt state directory contains incomplete state")
            receipt = _read_receipt(path)
            if receipt.get("attempt_id") != path.stem or receipt.get("state") != "verified":
                raise ResolutionConflict("Worktree has an unresolved executor attempt")

    def claim(self) -> None:
        try:
            descriptor = os.open(self.active_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            active = _read_receipt(self.active_path)
            raise ResolutionConflict(f"Worktree already reserved by attempt {active.get('attempt_id', 'unknown')}") from exc
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump({"attempt_id": self.attempt_id}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        _sync_directory(self.directory)
        if self.receipt_path.exists() or self.receipt_path.is_symlink():
            raise ResolutionConflict("Attempt receipt already exists")
        self.record("claimed", "unknown")

    def record(self, status: str, execution_started: str, **details: Any) -> None:
        receipt = {
            "attempt_id": self.attempt_id, "binding": self.binding,
            "state": status, "execution_started": execution_started,
            "updated_at_unix": time.time(), **details,
        }
        _write_receipt(self.receipt_path, receipt)

    def finish(self, result: dict[str, Any]) -> None:
        previous = _read_receipt(self.receipt_path)
        self.record(
            result["status"], "yes", result=result,
            process_id=previous.get("process_id", "unknown"),
            thread_id=result["thread_id"],
            changed_paths=result.get("changed_paths", []),
        )
        if result["status"] == "verified":
            active = _read_receipt(self.active_path)
            if active.get("attempt_id") != self.attempt_id:
                raise EvidenceError("Attempt reservation changed before release")
            self.active_path.unlink()
            _sync_directory(self.directory)


def _changed_paths(workspace: Path, baseline_head: str) -> list[str]:
    tracked = _git_output(workspace, "diff", "--no-renames", "--name-only", "-z", baseline_head)
    staged = _git_output(workspace, "diff", "--cached", "--no-renames", "--name-only", "-z", baseline_head)
    untracked = _git_output(workspace, "ls-files", "--others", "--exclude-standard", "-z")
    return sorted({os.fsdecode(path) for path in (tracked + staged + untracked).split(b"\0") if path})


def _limited_process(
    argv: list[str], prompt: str, workspace: Path, timeout_sec: int, env: dict[str, str],
    on_started: Callable[[int], None] | None = None,
) -> tuple[int, bytes, bytes]:
    process = subprocess.Popen(
        argv, cwd=workspace, env=env, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=os.name != "nt",
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    buffers = [bytearray(), bytearray()]
    overflow = threading.Event()
    cleanup_failed = threading.Event()
    stop_lock = threading.Lock()

    def stop_tree() -> None:
        with stop_lock:
            stopped_tree = False
            if os.name == "nt":
                try:
                    result = subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        capture_output=True, check=False, timeout=10,
                    )
                    stopped_tree = result.returncode == 0
                except (OSError, subprocess.TimeoutExpired):
                    pass
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                    stopped_tree = True
                except ProcessLookupError:
                    stopped_tree = process.poll() is not None
                except OSError:
                    pass
            if not stopped_tree:
                cleanup_failed.set()
                try:
                    process.kill()
                except ProcessLookupError:
                    pass

    if on_started is not None:
        try:
            on_started(process.pid)
        except BaseException as exc:
            stop_tree()
            try:
                process.communicate(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                cleanup_failed.set()
                try:
                    process.kill()
                    process.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
            if cleanup_failed.is_set():
                raise EvidenceError("Codex startup failed; process-tree cleanup unverified") from exc
            raise

    def drain(stream: Any, buffer: bytearray, limit: int) -> None:
        while chunk := stream.read(4096):
            if len(buffer) + len(chunk) > limit:
                overflow.set()
                stop_tree()
                return
            buffer.extend(chunk)

    readers = [
        threading.Thread(target=drain, args=(process.stdout, buffers[0], MAX_STDOUT_BYTES), daemon=True),
        threading.Thread(target=drain, args=(process.stderr, buffers[1], MAX_STDERR_BYTES), daemon=True),
    ]
    for reader in readers:
        reader.start()
    try:
        try:
            assert process.stdin is not None
            process.stdin.write(prompt.encode("utf-8"))
        except BrokenPipeError:
            pass
        finally:
            if process.stdin:
                process.stdin.close()
        process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        stop_tree()
        process.wait()
        if cleanup_failed.is_set():
            raise EvidenceError("Codex execution timed out; process-tree cleanup unverified")
        raise EvidenceError("Codex execution timed out")
    finally:
        for reader in readers:
            reader.join(timeout=2)
        if not any(reader.is_alive() for reader in readers):
            for stream in (process.stdout, process.stderr):
                if stream is not None:
                    stream.close()
    if any(reader.is_alive() for reader in readers):
        raise EvidenceError("Codex output streams remained open")
    if overflow.is_set():
        if cleanup_failed.is_set():
            raise EvidenceError("Codex event output exceeded the bounded limit; process-tree cleanup unverified")
        raise EvidenceError("Codex event output exceeded the bounded limit")
    return process.returncode, bytes(buffers[0]), bytes(buffers[1])


def _parse_events(raw: bytes, role: str = "repo-scout") -> tuple[str, dict[str, Any], dict[str, Any]]:
    thread_id = None
    usage = None
    result = None
    completed = 0
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EvidenceError("Codex emitted malformed JSON events") from exc
        kind = event.get("type")
        if kind == "thread.started":
            if thread_id is not None or not UUID.fullmatch(str(event.get("thread_id", ""))):
                raise EvidenceError("Codex thread identity is missing or ambiguous")
            thread_id = event["thread_id"].lower()
        elif kind == "turn.completed":
            completed += 1
            usage = event.get("usage")
        elif kind in {"turn.failed", "error"}:
            raise EvidenceError("Codex reported a failed turn")
        elif kind == "item.completed":
            item = event.get("item") or {}
            if item.get("type") == "agent_message":
                result = item.get("text")
    if thread_id is None or completed != 1 or not isinstance(result, str):
        raise EvidenceError("Codex did not return one completed turn and a final message")
    try:
        output = json.loads(result)
    except json.JSONDecodeError as exc:
        raise EvidenceError("Codex final message was not JSON") from exc
    if role == "repo-scout":
        valid = isinstance(output, dict) and set(output) == set(REPO_SCOUT_FIELDS) and all(
            isinstance(output[field], list) and all(isinstance(value, str) for value in output[field])
            for field in REPO_SCOUT_FIELDS
        )
    elif role == "reviewer":
        valid = (
            isinstance(output, dict) and set(output) == set(REVIEWER_FIELDS)
            and output["overall_status"] in {"pass", "fail"}
            and all(isinstance(output[field], list) and all(isinstance(value, str) for value in output[field])
                    for field in REVIEWER_FIELDS[1:])
        )
        if valid:
            if output["overall_status"] == "pass":
                valid = not output["required_followups"]
            else:
                valid = bool(output["issues"] and output["required_followups"]) and all(
                    item.startswith(("[artifact]", "[evidence]", "[logic]"))
                    for field in ("issues", "required_followups") for item in output[field]
                )
    elif role == "executor":
        valid = (
            isinstance(output, dict) and set(output) == set(EXECUTOR_FIELDS)
            and isinstance(output["task_id"], str)
            and isinstance(output["status"], str) and output["status"] in {"done", "blocked", "partial"}
            and all(isinstance(output[field], list) and all(isinstance(value, str) for value in output[field])
                    for field in ("changes", "evidence", "followups"))
            and all(type(output[field]) is int and output[field] >= 0
                    for field in ("operational_retries_used", "repair_attempts_used"))
            and isinstance(output["last_failure_signature"], str)
            and isinstance(output["notes"], str)
        )
    else:
        valid = (
            role == "planner" and isinstance(output, dict)
            and {"milestones", "dependencies", "deliverables"} <= set(output)
            and set(output) <= {"protocol_version", "milestones", "dependencies", "deliverables"}
            and all(isinstance(output[field], list) and all(isinstance(value, str) for value in output[field])
                    for field in ("milestones", "deliverables"))
            and isinstance(output["dependencies"], dict)
            and all(isinstance(key, str) and isinstance(values, list)
                    and all(isinstance(value, str) for value in values)
                    for key, values in output["dependencies"].items())
            and ("protocol_version" not in output or (
                isinstance(output["protocol_version"], str)
                and re.fullmatch(r"[0-9]+\.[0-9]+", output["protocol_version"]) is not None
            ))
        )
    if not valid:
        raise EvidenceError(f"Codex final message did not match the {role} result shape")
    return thread_id, usage if isinstance(usage, dict) else {}, output


def _find_trace(codex_home: Path, thread_id: str) -> Path:
    deadline = time.monotonic() + 5
    while True:
        matches = [
            path for root in ("sessions", "archived_sessions")
            for path in (codex_home / root).rglob(f"*{thread_id}.jsonl")
        ]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise EvidenceError("Codex returned ambiguous trace files")
        if time.monotonic() >= deadline:
            raise EvidenceError("Codex session trace was not found")
        time.sleep(0.1)


def _dispatch_role(
    workspace: Path, role: str, task_file: Path, timeout_sec: int, codex_home: Path,
    allow_write: bool, state: dict[str, Any], attempt_id: str | None = None,
) -> dict[str, Any]:
    if not 10 <= timeout_sec <= 300:
        raise EvidenceError("Timeout must be between 10 and 300 seconds")
    if attempt_id is not None:
        workspace = workspace.resolve(strict=True)
    raw_task = _task_bytes(task_file) if attempt_id is not None else None
    task = _read_task(task_file, role, raw_task)
    baseline_head = None
    if role == "reviewer":
        _verify_repo_paths(workspace, task["targets"])
    elif role == "executor":
        if not allow_write:
            raise EvidenceError("Executor dispatch requires explicit --allow-write")
        if attempt_id is None:
            _verify_repo_paths(workspace, task["allowed_paths"], allow_new=True)
            baseline_head = _clean_worktree_head(workspace)
        elif not UUID.fullmatch(attempt_id):
            raise EvidenceError("Attempt ID must be a UUID")
    elif allow_write:
        raise EvidenceError("--allow-write applies only to executor dispatch")
    if attempt_id is not None and role != "executor":
        raise EvidenceError("--attempt-id applies only to writable executor dispatch")
    context = "ad-hoc-review" if role == "reviewer" else None
    resolution = resolve_role(workspace, role, task["reasoning_signals"], task.get("task_intent", "inspect"), context)
    if not resolution["dispatch_supported"]:
        raise EvidenceError("External dispatch is unavailable for this role")
    role_config = tomllib.loads(Path(resolution["role_config"]).read_text(encoding="utf-8"))
    instructions = role_config["developer_instructions"]
    if hashlib.sha256(instructions.encode()).hexdigest() != resolution["role_instructions_sha256"]:
        raise EvidenceError("Role instructions changed after resolution")
    attempt = None
    if attempt_id is not None:
        assert raw_task is not None
        binding = {
            "workspace": os.path.normcase(str(workspace)),
            "git_common_dir": _worktree_common_dir(workspace),
            "baseline_head": _git_output(workspace, "rev-parse", "HEAD").decode("ascii").strip(),
            "task_sha256": hashlib.sha256(raw_task).hexdigest(),
            "role": role,
            "model": resolution["requested_model"],
            "effort": resolution["requested_effort"],
            "role_instructions_sha256": resolution["role_instructions_sha256"],
        }
        attempt = ExecutorAttempt(workspace, attempt_id, binding)
        state["attempt"] = attempt
        replay = attempt.replay()
        if replay is not None:
            return replay
        attempt.ensure_available()
        _verify_repo_paths(workspace, task["allowed_paths"], allow_new=True)
        baseline_head = _clean_worktree_head(workspace)
        if baseline_head != binding["baseline_head"]:
            raise EvidenceError("Worktree HEAD changed during attempt preflight")
        state["baseline_head"] = baseline_head
    executable = shutil.which("codex")
    if not executable:
        raise EvidenceError("Codex executable was not found")
    codex_home = codex_home.resolve(strict=True)
    env = {key: os.environ[key] for key in (
        "HOME", "PATH", "CODEX_HOME", "LANG", "LC_ALL", "USER", "LOGNAME",
        "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
        "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    ) if key in os.environ}
    env["CODEX_HOME"] = str(codex_home)
    if role == "repo-scout":
        output_contract = "Return only the role's required JSON output."
        input_payload = {"task": task["task"]}
    elif role == "planner":
        output_contract = (
            "Return PlanOutline JSON: milestones and deliverables must be arrays of strings; "
            "dependencies must map milestone names to arrays of strings. "
            "Do not use objects as milestone entries."
        )
        input_payload = {"ProblemSpec": task["problem_spec"]}
    elif role == "reviewer":
        output_contract = (
            "Perform only an ad hoc review, not a Pipeline gate or formal assurance. "
            "Inspect the explicit targets. Return only the reviewer role's JSON result."
        )
        input_payload = {"mode": "ad_hoc", "targets": task["targets"], "criteria": task["criteria"]}
    else:
        output_contract = "Execute exactly one atomic task. Return only the executor role's JSON result."
        input_payload = {
            "task_id": task["task_id"], "task_intent": "execute",
            "description": task["task"], "primary_output": task["allowed_paths"][0],
            "allowed_paths": task["allowed_paths"],
            "definition_of_done": task["acceptance_criteria"],
            "verification": task["verification"],
        }
        if attempt is not None:
            input_payload["attempt_id"] = attempt.attempt_id
    write_scope = (
        "Modify only allowed_paths. " if role == "executor" else "Work read-only. "
    )
    prompt = (
        "Perform this bounded managed leaf task. " + write_scope
        + f"Do not commit, push, or delegate. {output_contract}\n"
        + json.dumps(input_payload, ensure_ascii=False)
    )
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="agents-pipeline-external-role-") as temporary:
        sandbox = "workspace-write" if role == "executor" else "read-only"
        argv = [
            executable, "exec", "--json", "--color", "never", "--sandbox", sandbox,
            "--ignore-user-config", "-C", resolution["workspace"],
            "-m", resolution["requested_model"],
            "-c", f'model_reasoning_effort={json.dumps(resolution["requested_effort"])}',
            "-c", 'approval_policy="never"',
            "-c", "agents.enabled=false",
            "-c", f"developer_instructions={json.dumps(instructions)}",
        ]
        if role in {"repo-scout", "reviewer", "executor"}:
            schema = Path(temporary) / f"{role}-schema.json"
            schema.write_text(json.dumps({
                "repo-scout": REPO_SCOUT_SCHEMA,
                "reviewer": REVIEWER_SCHEMA,
                "executor": EXECUTOR_SCHEMA,
            }[role]), encoding="utf-8")
            argv.extend(("--output-schema", str(schema)))
        argv.append("-")
        state["phase"] = "execution"

        def mark_started(process_id: int | None = None) -> None:
            state["execution_started"] = "yes"
            if attempt is not None:
                state["process_id"] = process_id or "unknown"
                attempt.record("started", "yes", process_id=process_id or "unknown")

        if attempt is not None:
            if _task_bytes(task_file) != raw_task:
                raise ResolutionConflict("Task file changed during attempt preflight")
            attempt.claim()
            state["attempt_claimed"] = True
        code, stdout, _stderr = _limited_process(
            argv, prompt, Path(resolution["workspace"]), timeout_sec, env,
            on_started=mark_started,
        )
        state["execution_started"] = "yes"
    state["phase"] = "post_execution"
    changed_paths = []
    head_unchanged = True
    paths_safe = True
    profile_stable = True
    if role == "executor":
        assert baseline_head is not None
        changed_paths = _changed_paths(Path(resolution["workspace"]), baseline_head)
        state["changed_paths"] = changed_paths
        head_unchanged = _git_output(Path(resolution["workspace"]), "rev-parse", "HEAD").decode("ascii").strip() == baseline_head
        try:
            _verify_repo_paths(Path(resolution["workspace"]), task["allowed_paths"], allow_new=True)
        except EvidenceError:
            paths_safe = False
        try:
            after_resolution = resolve_role(
                workspace, role, task["reasoning_signals"], task["task_intent"], context,
            )
            profile_stable = all(after_resolution.get(field) == resolution.get(field) for field in (
                "profile", "model_set", "reasoning_projection", "requested_model", "requested_effort",
                "role_config", "role_instructions_sha256",
            ))
        except (EvidenceError, OSError, KeyError, TypeError, ValueError):
            profile_stable = False
    if code:
        raise EvidenceError(f"Codex execution exited {code}; inspect workspace changes: {changed_paths}")
    thread_id, usage, output = _parse_events(stdout, role)
    if attempt is not None:
        state["thread_id"] = thread_id
    if role == "executor" and output["task_id"] != task["task_id"]:
        raise EvidenceError("Executor result task_id differs from the requested task")
    trace = _find_trace(codex_home, thread_id)
    evidence = inspect_exec(trace, thread_id, resolution, codex_home) if attempt is None else inspect_exec(
        trace, thread_id, resolution, codex_home, attempt.attempt_id,
    )
    result = {
        "schema_version": 1,
        "surface": "independent_codex_exec_root",
        "role": role,
        "status": "verified" if evidence["verification_status"] == "matched" else "unverified",
        "requested_model": resolution["requested_model"],
        "requested_effort": resolution["requested_effort"],
        "observed_model": evidence["observed_model"],
        "observed_effort": evidence["observed_effort"],
        "native_managed_child": False,
        "thread_id": thread_id,
        "usage": usage or "unknown",
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "evidence": evidence["checks"],
        "result": output,
    }
    if role == "reviewer":
        result.update({"review_kind": "ad_hoc", "formal_assurance": False})
    elif role == "executor":
        scope_compliant = head_unchanged and paths_safe and set(changed_paths) <= set(task["allowed_paths"])
        result.update({
            "scope_compliant": scope_compliant,
            "head_unchanged": head_unchanged,
            "changed_paths": changed_paths,
            "profile_stable": profile_stable,
        })
        if not scope_compliant or not profile_stable:
            result["status"] = "unverified"
    if role == "executor":
        result.update({
            "execution_started": "yes",
            "outcome_uncertain": result["status"] != "verified",
        })
    if attempt is not None:
        result["attempt_id"] = attempt.attempt_id
        result["replayed"] = False
        attempt.finish(result)
    return result


def dispatch_role(
    workspace: Path, role: str, task_file: Path, timeout_sec: int, codex_home: Path,
    allow_write: bool = False, attempt_id: str | None = None,
) -> dict[str, Any]:
    state: dict[str, Any] = {"phase": "preflight", "execution_started": "no"}
    try:
        return _dispatch_role(workspace, role, task_file, timeout_sec, codex_home, allow_write, state, attempt_id)
    except (EvidenceError, OSError, KeyError, TypeError, ValueError) as exc:
        if role != "executor":
            raise
        if state.get("attempt_claimed"):
            try:
                state["attempt"].record(
                    "uncertain", state["execution_started"],
                    error=str(exc)[:500], phase=state["phase"],
                    process_id=state.get("process_id", "unknown"),
                    thread_id=state.get("thread_id", "unknown"),
                    changed_paths=state.get("changed_paths", []),
                )
            except (EvidenceError, OSError, ValueError, TypeError):
                pass  # The durable claimed record and reservation remain fail closed.
        phase = state["phase"]
        started = state["execution_started"]
        if phase == "execution" and started == "no":
            started = "unknown"
        message = str(exc)
        if isinstance(exc, DirtyWorktreeError):
            message += "; this invocation did not start a child; existing edits have unknown provenance"
        raise DispatchFailure(
            message, phase, started,
            phase != "preflight" or isinstance(exc, DirtyWorktreeError)
            or state.get("attempt") is not None,
            isinstance(exc, ResolutionConflict),
        ) from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("resolve-role", "inspect-exec", "dispatch-role"):
        command = sub.add_parser(action)
        command.add_argument("--workspace", type=Path, default=Path.cwd())
        command.add_argument("--role", default="repo-scout")
        if action != "dispatch-role":
            command.add_argument("--signal", action="append", default=[])
            command.add_argument("--task-intent")
            command.add_argument("--dispatch-context")
        if action == "inspect-exec":
            command.add_argument("--thread-id", required=True)
            command.add_argument("--trace-file", type=Path, required=True)
            command.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")))
        elif action == "dispatch-role":
            command.add_argument("--task-file", type=Path, required=True)
            command.add_argument("--timeout-sec", type=int, default=120)
            command.add_argument("--allow-write", action="store_true")
            command.add_argument("--attempt-id")
            command.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")))
    args = parser.parse_args(argv)
    try:
        if args.action == "dispatch-role":
            result = dispatch_role(
                args.workspace, args.role, args.task_file, args.timeout_sec,
                args.codex_home, args.allow_write, args.attempt_id,
            )
        else:
            task_intent = args.task_intent or ("inspect" if args.role == "repo-scout" else None)
            if task_intent is None:
                raise EvidenceError("--task-intent is required for this role")
            resolution = resolve_role(args.workspace, args.role, args.signal, task_intent, args.dispatch_context)
            result = resolution if args.action == "resolve-role" else inspect_exec(
                args.trace_file, args.thread_id, resolution, args.codex_home,
            )
        print(json.dumps(result, sort_keys=True))
        if args.action == "resolve-role":
            return 0
        if args.action == "inspect-exec":
            return 0 if result["verification_status"] == "matched" else 3
        return 0 if result["status"] == "verified" else 3
    except (EvidenceError, OSError, KeyError, TypeError, ValueError) as exc:
        conflicted = isinstance(exc, ResolutionConflict) or (
            isinstance(exc, DispatchFailure) and exc.conflicted
        )
        error_result = {
            "schema_version": 1,
            "surface": "independent_codex_exec_root",
            "action": args.action,
            "status": "conflicted" if conflicted else "error",
            "error": str(exc)[:500],
        }
        if isinstance(exc, DispatchFailure):
            error_result.update({
                "phase": exc.phase,
                "execution_started": exc.execution_started,
                "outcome_uncertain": exc.outcome_uncertain,
            })
        if args.action == "dispatch-role" and args.attempt_id is not None and UUID.fullmatch(args.attempt_id):
            error_result["attempt_id"] = args.attempt_id.lower()
        print(json.dumps(error_result, sort_keys=True))
        return 3 if conflicted else 2


if __name__ == "__main__":
    raise SystemExit(main())
